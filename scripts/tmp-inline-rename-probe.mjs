/* global document */
/** 临时探针：行内重命名的真实副作用验收（跑完即删）。 */
import assert from "node:assert/strict"
import {
  apiRequest,
  attachPageDiagnostics,
  createBrowserPage,
  createDiagnostics,
  assertNoPageErrors,
  ensureDocument,
  ensureKnowledgeBase,
  flattenTree,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const TITLE = "InlineRename 原始标题"
const checks = []
const check = (name, ok, detail = "") => {
  checks.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

const treeTitle = async (kbId2) => {
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kbId2)}`, {
    token,
    errorMessage: "读取文档树失败",
  })
  const hit = flattenTree(Array.isArray(tree) ? tree : []).find((node) => node.id === doc.id)
  return hit?.title ?? null
}

const inputState = () =>
  page.evaluate(() => {
    const active = document.activeElement
    const isInline =
      active instanceof HTMLInputElement && active.getAttribute("aria-label") === "重命名"
    return {
      inline: isInline,
      value: isInline ? active.value : null,
      selectedAll: isInline
        ? active.selectionStart === 0 && active.selectionEnd === active.value.length
        : false,
      dialogs: document.querySelectorAll(".el-dialog").length,
    }
  })

await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, {
  title: TITLE,
  content: `# ${TITLE}\n\n行内重命名验收。`,
})

await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })

/* 1. 树视图：菜单「重命名」→ 行内输入，无弹窗 */
await row.hover()
await row.locator("button[title='更多操作']").click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
let s = await inputState()
check("菜单入口：行内 input 出现且无弹窗", s.inline && s.dialogs === 0, JSON.stringify(s))
check("菜单入口：原文本全选", s.selectedAll, `value=${s.value}`)

/* 2. Enter 提交 → 后端真的改名 */
await page.keyboard.type("InlineRename 已改为一")
await page.keyboard.press("Enter")
await page.waitForTimeout(1200)
check(
  "Enter 提交：后端标题已更新",
  (await treeTitle(kb.id)) === "InlineRename 已改为一",
  String(await treeTitle(kb.id)),
)
s = await inputState()
check("Enter 提交：输入框已卸载且不重复收尾", !s.inline && s.dialogs === 0)
check(
  "Enter 提交：树行文本同步",
  (await row.innerText()).includes("InlineRename 已改为一"),
  (await row.innerText()).trim(),
)

/* 3. Esc 取消 → 不落库 */
await row.hover()
await row.locator("button[title='更多操作']").click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(300)
await page.keyboard.type("不该出现")
await page.keyboard.press("Escape")
await page.waitForTimeout(800)
check(
  "Esc 取消：后端标题不变",
  (await treeTitle(kb.id)) === "InlineRename 已改为一",
  String(await treeTitle(kb.id)),
)

/* 4. 空标题提交 → 不发请求 */
await row.hover()
await row.locator("button[title='更多操作']").click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(300)
await page.keyboard.type("   ")
await page.keyboard.press("Enter")
await page.waitForTimeout(800)
check("纯空白提交：后端标题不变", (await treeTitle(kb.id)) === "InlineRename 已改为一")

/* 5. 失焦提交 */
await row.hover()
await row.locator("button[title='更多操作']").click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(300)
await page.keyboard.type("InlineRename 失焦生效")
await page.mouse.click(900, 900)
await page.waitForTimeout(1200)
check(
  "失焦提交：后端标题已更新",
  (await treeTitle(kb.id)) === "InlineRename 失焦生效",
  String(await treeTitle(kb.id)),
)

/* 6. F2 入口 */
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
await row.evaluate((el) => el.focus())
await page.waitForTimeout(300)
await page.keyboard.press("F2")
await page.waitForTimeout(400)
s = await inputState()
check("F2 入口：行内 input 出现且无弹窗", s.inline && s.dialogs === 0, JSON.stringify(s))
await page.keyboard.press("Escape")
await page.waitForTimeout(300)

/* 7. IME 组词期 Enter 不提交（沿用 verify-t8 的 isComposing+keyCode 229 造法） */
await row.evaluate((el) => el.focus())
await page.waitForTimeout(200)
await page.keyboard.press("F2")
await page.waitForTimeout(400)
const imeResult = await page.evaluate(async () => {
  const active = document.activeElement
  const seen = { tag: active?.tagName, aria: active?.getAttribute?.("aria-label") ?? null }
  active.value = "组词中"
  active.dispatchEvent(new Event("input", { bubbles: true }))
  await new Promise((r) => setTimeout(r, 100))
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
  })
  Object.defineProperty(event, "isComposing", { value: true })
  Object.defineProperty(event, "keyCode", { value: 229 })
  active.dispatchEvent(event)
  await new Promise((r) => setTimeout(r, 400))
  seen.stillMounted = document.activeElement === active
  return seen
})
check("IME 组词 Enter：不提交、输入框仍在", imeResult.stillMounted, JSON.stringify(imeResult))
await page.keyboard.press("Escape")
await page.waitForTimeout(300)
const titleAfterIme = await treeTitle(kb.id)
check(
  "IME 组词后取消：后端标题未被改",
  titleAfterIme === "InlineRename 失焦生效",
  `实际=${titleAfterIme}`,
)

/* 8. 「全部文档」平铺视图 */
logStep("probe", "\n" + checks.join("\n"))
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page.locator("[data-tree-switcher-trigger]").first().click()
await page.waitForTimeout(400)
await page.locator("[data-tree-switcher] button", { hasText: "全部文档" }).first().click()
await page.waitForTimeout(600)
const flatCard = page
  .locator("[role='button']")
  .filter({ hasText: await treeTitle(kb.id) })
  .first()
await flatCard.hover()
await flatCard.locator("button[title='更多操作']").click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
s = await inputState()
check("全部文档视图：行内 input 出现且无弹窗", s.inline && s.dialogs === 0, JSON.stringify(s))
await page.keyboard.type("InlineRename 平铺已改")
await page.keyboard.press("Enter")
await page.waitForTimeout(1200)
check(
  "全部文档视图：Enter 提交后端已更新",
  (await treeTitle(kb.id)) === "InlineRename 平铺已改",
  String(await treeTitle(kb.id)),
)

assertNoPageErrors(diagnostics)
logStep("probe", "\n" + checks.join("\n"))
await browser.close()
assert.equal(
  checks.filter((c) => c.startsWith("FAIL")).length,
  0,
  `存在失败项：\n${checks.filter((c) => c.startsWith("FAIL")).join("\n")}`,
)

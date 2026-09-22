/* global document */
/** 临时探针：行内改名收编到 el-input 后的观感与行为验收（跑完即删）。 */
import assert from "node:assert/strict"
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  flattenTree,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const A_TITLE = "InplaceEl A 文档标题很长很长"
const B_TITLE = "InplaceEl B 文档"
const checks = []
const check = (name, ok, detail = "") => {
  checks.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const docA = await ensureDocument(kb.id, token, { title: A_TITLE, content: `# ${A_TITLE}\n\n甲。` })
const docB = await ensureDocument(kb.id, token, { title: B_TITLE, content: `# ${B_TITLE}\n\n乙。` })

const titleOf = async id => {
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, { token })
  return flattenTree(Array.isArray(tree) ? tree : []).find(n => n.id === id)?.title ?? null
}

await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), { waitUntil: "networkidle" })
const rowA = page.locator(`[data-knowledge-node-id="${docA.id}"]`)
const rowB = page.locator(`[data-knowledge-node-id="${docB.id}"]`)
await rowA.waitFor({ state: "visible", timeout: smokeConfig.timeout })

/* 1. treeitem 可及名仍是标题 */
check(
  "treeitem 可及名 = 文档标题",
  (await page.getByRole("treeitem", { name: new RegExp(A_TITLE) }).count()) > 0
)

/* 2. 观感：el-input 无边框、字号行高字重与标题同值、行高不被撑破 */
const rowBefore = await rowA.evaluate(el => el.getBoundingClientRect().height)
await rowA.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(500)
const look = await page.evaluate(otherId => {
  const active = document.activeElement
  const root = active?.closest?.(".el-input")
  const row = root?.closest("[data-knowledge-tree-row]")
  const cs = getComputedStyle(active)
  const rootCs = getComputedStyle(root)
  const other = document.querySelector(`[data-knowledge-node-id="${otherId}"] [data-knowledge-tree-drag-handle] > span`)
  const ocs = getComputedStyle(other)
  return {
    tag: active.tagName,
    ariaLabel: active.getAttribute("aria-label"),
    insideElInput: !!root,
    rootClass: root.className,
    rootBorder: rootCs.borderTopWidth,
    rootBg: rootCs.backgroundColor,
    rootPadding: rootCs.paddingLeft,
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    fontWeight: cs.fontWeight,
    color: cs.color,
    titleFontSize: ocs.fontSize,
    titleLineHeight: ocs.lineHeight,
    titleWeight: ocs.fontWeight,
    selectedAll: active.selectionStart === 0 && active.selectionEnd === active.value.length,
    rowHeight: row.getBoundingClientRect().height,
  }
}, docB.id)
check(
  "观感：aria-label 落到原生 inner 且挂在 el-input 内",
  look.tag === "INPUT" && look.insideElInput && look.ariaLabel === "重命名",
  JSON.stringify({ tag: look.tag, inside: look.insideElInput, aria: look.ariaLabel })
)
check(
  "观感：无盒面（border 0 / padding 0 / 透明底）",
  look.rootBorder === "0px" && look.rootPadding === "0px" && look.rootBg === "rgba(0, 0, 0, 0)",
  JSON.stringify({ border: look.rootBorder, padding: look.rootPadding, bg: look.rootBg })
)
check(
  "观感：字号/行高/字重与标题逐属性同值",
  look.fontSize === look.titleFontSize &&
    look.lineHeight === look.titleLineHeight &&
    look.fontWeight === look.titleWeight,
  JSON.stringify({
    input: `${look.fontSize}/${look.lineHeight}/${look.fontWeight}`,
    title: `${look.titleFontSize}/${look.titleLineHeight}/${look.titleWeight}`,
  })
)
check("观感：行高不被撑破（改名前后同值）", Math.abs(look.rowHeight - rowBefore) < 0.5, `${rowBefore} → ${look.rowHeight}`)
check("交互：挂载即全选原文本", look.selectedAll)

/* 3. Enter 提交 + 还原 */
await page.keyboard.type("InplaceEl 已改名")
await page.keyboard.press("Enter")
await page.waitForTimeout(1500)
const afterEnter = await titleOf(docA.id)
check("Enter 提交：后端已更新", afterEnter === "InplaceEl 已改名", `实际=${afterEnter}`)
const rowRenamed = page.locator(`[data-knowledge-node-id="${docA.id}"]`)
await rowRenamed.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
await page.keyboard.type(A_TITLE)
await page.keyboard.press("Enter")
await page.waitForTimeout(1500)
check("还原：A 标题回到初值", (await titleOf(docA.id)) === A_TITLE)

/* 4. 卸载即收尾（右键另一行抢走编辑位） */
await rowA.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
await page.keyboard.type("InplaceEl 卸载提交")
await rowB.click({ button: "right" })
await page.waitForTimeout(400)
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(1500)
const afterSteal = await titleOf(docA.id)
check("卸载即收尾：草稿被提交而非丢失", afterSteal === "InplaceEl 卸载提交", `实际=${afterSteal}`)
await page.keyboard.press("Escape")
await page.waitForTimeout(400)
const restore2 = page.locator(`[data-knowledge-node-id="${docA.id}"]`)
await restore2.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
await page.keyboard.type(A_TITLE)
await page.keyboard.press("Enter")
await page.waitForTimeout(1500)

/* 5. Esc 取消 + 纯空白不提交 */
await restore2.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
await page.keyboard.type("不该出现")
await page.keyboard.press("Escape")
await page.waitForTimeout(900)
check("Esc 取消：后端不变", (await titleOf(docA.id)) === A_TITLE)
await restore2.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(400)
await page.keyboard.type("   ")
await page.keyboard.press("Enter")
await page.waitForTimeout(900)
check("纯空白 Enter 不提交", (await titleOf(docA.id)) === A_TITLE)

logStep("probe", "\n" + checks.join("\n"))
await browser.close()
const failed = checks.filter(c => c.startsWith("FAIL"))
assert.equal(failed.length, 0, `存在失败项：\n${failed.join("\n")}`)

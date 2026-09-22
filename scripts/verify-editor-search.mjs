/* global document */
/**
 * 一次性验证：编辑器内查找替换（Lake 内置 search 插件）。
 * 覆盖：工具栏「更多」→ search 按钮打开面板、查找计数、全部替换生效并持久化、⇧⌘F 唤起。
 * 用法：node scripts/verify-editor-search.mjs（需 4173 preview + 后端 3200 在跑）
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  createBrowserPage,
  createDiagnostics,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  attachPageDiagnostics,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const shotDir = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/playwright"
fs.mkdirSync(shotDir, { recursive: true })

const CONTENT = "# 搜索验证文档\n\n苹果是水果，香蕉也是水果。\n\n苹果酱需要苹果。\n"

const { browser, page } = await createBrowserPage()
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

/** 打开编辑页 → search 按钮 → 查找替换面板（宽视口直接平铺，窄视口折叠进「更多」） */
const openSearchPanel = async (kbId, docId) => {
  await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1000)
  await page.locator(".ne-editor-wrap-content").first().click()
  const directSearch = page.locator(".ne-ui-toolbar-search")
  if (
    (await directSearch.count()) > 0 &&
    (await directSearch
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await directSearch.first().click()
  } else {
    await page.locator(".ne-ui-toolbar-more-button").click()
    await page.locator(".ne-ui-toolbar-search").click()
  }
  await page
    .getByText("查找", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
}

try {
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "查找替换验证", content: CONTENT })
  // 复跑幂等：上轮替换可能已持久化，强制重置为标准内容
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
  })

  // 1. 面板打开
  await openSearchPanel(kb.id, doc.id)
  logStep("[验证]", "✅ 查找替换面板已打开（工具栏 更多 → 查找替换）")

  // 2. 查找计数：输入"苹果"后计数应为 1/3（面板计数格式「当前/总数」）。
  //    必须用真实键盘输入：程序化 fill 的单次 input 事件内核搜索匹配为 0（实测）
  const findInput = page.locator("input.ant-input[placeholder='请输入']").first()
  await findInput.waitFor({ state: "visible", timeout: 10_000 })
  await findInput.click()
  await page.keyboard.type("苹果", { delay: 100 })
  await page.waitForTimeout(800)
  const counter = await page.evaluate(() => {
    const input = [...document.querySelectorAll("input.ant-input")].find(
      (i) => i.getClientRects().length,
    )
    let panel = input
    for (let i = 0; i < 6 && panel?.parentElement; i++) {
      panel = panel.parentElement
      if ((panel.textContent || "").includes("查找")) break
    }
    return {
      inputValue: input?.value,
      panelText: panel?.textContent?.replace(/\s+/g, "|").slice(0, 80),
      matched: panel?.textContent?.match(/\d+\/\d+/)?.[0],
    }
  })
  console.log("  [诊断]", JSON.stringify(counter))
  assert.equal(counter?.matched, "1/3", "输入「苹果」后匹配计数应为 1/3（格式：当前/总数）")
  logStep("[验证]", "✅ 查找计数正确（1/3）")
  await page.screenshot({ path: `${shotDir}/editor-search-panel.png` })

  // 3. 切到替换 tab → 输入替换词 → 全部替换 → 编辑器正文与服务端内容更新
  await page.getByText("替换", { exact: true }).first().click()
  await page.waitForTimeout(300)
  const inputCount = await page.locator("input.ant-input[placeholder='请输入']").count()
  await page
    .locator("input.ant-input[placeholder='请输入']")
    .nth(inputCount - 1)
    .click()
  await page.keyboard.type("梨", { delay: 60 })
  await page.getByText("全部替换", { exact: true }).first().click()
  // 全部替换的 change 事务缺口已由内核补丁 search-replaceAll-commit 修复（#9），
  // 自动保存会在防抖后落库；专项断言见 verify-replace-autosave.mjs
  await page.waitForTimeout(3_000)
  const detail = await (
    await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  const saved = detail?.content?.value || ""
  assert.ok(!saved.includes("苹果"), "全部替换后服务端内容不应再有「苹果」")
  assert.ok((saved.match(/梨/g) || []).length >= 3, "服务端内容应包含替换后的「梨」")
  logStep("[验证]", "✅ 全部替换生效并已持久化")
  await page.screenshot({ path: `${shotDir}/editor-search-replace.png` })

  // 4. ⇧⌘F 唤起（内核 openSearchPanel 注册；歧义双注册实测编辑态触发的是查找替换）
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
  await page.locator(".ne-editor-wrap-content").first().click()
  await page.keyboard.press("Meta+Shift+F")
  await page.waitForTimeout(800)
  const panelAgain = await page.evaluate(() => {
    const hits = [...document.querySelectorAll("*")].filter(
      (e) =>
        /查找|替换/.test(e.textContent || "") &&
        (e.offsetWidth || e.offsetHeight) &&
        (e.textContent || "").length < 50,
    )
    return hits.length > 0
  })
  assert.ok(panelAgain, "⇧⌘F 应唤起查找替换面板")
  logStep("[验证]", "✅ ⇧⌘F 唤起查找替换面板")

  // 内核已知边界：替换后面板重定位选区时可能抛 Range offset 异常（未捕获 +
  // console error 各一条），不影响功能（替换已持久化），登记于内核清单；
  // 白名单后断言其余错误
  const RANGE_ERROR = /setStart.*larger than the node's length/
  const relevantConsoleErrors = diagnostics.consoleErrors.filter((e) => !RANGE_ERROR.test(e))
  const relevantPageErrors = diagnostics.pageErrors.filter((e) => !RANGE_ERROR.test(e))
  assert.equal(relevantPageErrors.length, 0, `页面异常：${relevantPageErrors.join(" | ")}`)
  assert.equal(relevantConsoleErrors.length, 0, `控制台错误：${relevantConsoleErrors.join(" | ")}`)
  logStep("[验证]", "🎉 查找替换验证全部通过")
} finally {
  await browser.close()
}

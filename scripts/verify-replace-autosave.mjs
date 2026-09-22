/* global document */
/**
 * 验证（#9）：面板「全部替换」应触发 change 驱动的自动保存（无需 ⌘S）。
 * 背景：Lake 结果集 replaceAll 的纯文本路径以底层 replaceText 直接改模型、无 job 提交，
 * 不产生 change；已由内核构建期补丁 search-replaceAll-commit 修复
 * （yuque-editor scripts/patch-doc-umd.cjs，2026-09-20）。
 * 断言：替换后 3.5s 内出现保存请求；服务端内容已更新；无意外报错。
 * 用法：node scripts/verify-replace-autosave.mjs（需 4173 preview + 后端 3200 在跑）
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

const CONTENT = "# 自动保存实证\n\n苹果是水果，香蕉也是水果。\n\n苹果酱需要苹果。\n"

const { browser, page } = await createBrowserPage()
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

const saveRequests = []
page.on("request", req => {
  if (/\/api\/knowledge\/documents\/[A-Za-z0-9_-]+$/.test(req.url()) && ["PATCH", "PUT"].includes(req.method())) {
    saveRequests.push({ at: Date.now(), method: req.method() })
  }
})

const openSearchPanel = async (kbId, docId) => {
  await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1000)
  await page.locator(".ne-editor-wrap-content").first().click()
  // search 项可能直接平铺在工具栏（宽视口）或折叠进「更多」（窄视口），双路径弹性打开
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
  await page.getByText("查找", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 })
}

try {
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "替换自动保存验证", content: CONTENT })
  // 复跑幂等：强制重置为标准内容
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
  })

  await openSearchPanel(kb.id, doc.id)
  const findInput = page.locator("input.ant-input[placeholder='请输入']").first()
  await findInput.click()
  await page.keyboard.type("苹果", { delay: 100 })
  await page.waitForTimeout(800)
  // 计数断言：确保查找结果已就绪（替换依赖面板内已有的匹配集合）
  const counterText = await page.evaluate(() => {
    const panel = document.querySelector(".ne-ui-search-panel")
    return panel?.textContent?.match(/\d+\/\d+/)?.[0] ?? ""
  })
  assert.equal(counterText, "1/3", `输入「苹果」后匹配计数应为 1/3，实际：${counterText}`)
  logStep("[验证]", "✅ 查找计数正确（1/3）")
  await page.waitForTimeout(300)
  // 切换到「替换」tab：等替换 tab 进入选中态后，取面板内第二个输入框（第一个是查找词）
  await page.getByRole("tab", { name: "替换" }).click()
  const replaceTabActive = page.locator(".ne-ui-search-panel [role='tab'][aria-selected='true'][id$='tab-replace']")
  await replaceTabActive.waitFor({ state: "visible", timeout: 5_000 })
  const panelInputs = page.locator(".ne-ui-search-panel input.ant-input")
  await panelInputs.first().waitFor({ state: "visible", timeout: 5_000 })
  await panelInputs.nth(1).click()
  await page.keyboard.type("梨", { delay: 60 })

  // 全部替换后不做任何手动保存，等观察垫片同步（250ms）+ 自动保存防抖（1200ms）+ 请求窗口
  saveRequests.length = 0
  await page.getByText("全部替换", { exact: true }).first().click()
  await page.waitForTimeout(3_500)

  assert.ok(saveRequests.length > 0, "全部替换后应自动触发保存请求（未按 ⌘S）")
  logStep("[验证]", `✅ 全部替换触发了自动保存（${saveRequests.length} 次请求）`)

  const detail = await (
    await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  const saved = detail?.content?.value || ""
  assert.ok(!saved.includes("苹果"), "全部替换后服务端内容不应再有「苹果」")
  assert.ok((saved.match(/梨/g) || []).length >= 3, "服务端内容应包含替换后的「梨」")
  logStep("[验证]", "✅ 替换结果已自动落库")
  await page.screenshot({ path: `${shotDir}/verify-replace-autosave.png` })

  // 内核已知边界：替换后面板重定位选区可能抛 Range offset 异常（白名单，见内核清单 6a）
  const RANGE_ERROR = /setStart.*larger than the node's length/
  const relevantConsoleErrors = diagnostics.consoleErrors.filter(e => !RANGE_ERROR.test(e))
  const relevantPageErrors = diagnostics.pageErrors.filter(e => !RANGE_ERROR.test(e))
  assert.equal(relevantPageErrors.length, 0, `页面异常：${relevantPageErrors.join(" | ")}`)
  assert.equal(relevantConsoleErrors.length, 0, `控制台错误：${relevantConsoleErrors.join(" | ")}`)
  logStep("[验证]", "🎉 替换自动保存验证全部通过")
} finally {
  await browser.close()
}

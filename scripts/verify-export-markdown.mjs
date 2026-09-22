/**
 * 一次性验证：文档导出 Markdown（markdown 保真 + html scheme 转换）。
 * 走树节点「···」菜单 → 导出… → 导出为 Markdown（handleNodeMenuExport 链路）。
 * 用法：node scripts/verify-export-markdown.mjs（需 4173 preview + 后端 3200 在跑）
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import {
  apiRequest,
  createBrowserPage,
  createDiagnostics,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  attachPageDiagnostics,
  assertNoPageErrors,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const shotDir = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/playwright"
fs.mkdirSync(shotDir, { recursive: true })

const MARKDOWN_CONTENT =
  "# 导出验证\n\n**加粗文本** 与 [链接](https://example.com)\n\n- 列表项甲\n- 列表项乙\n"
const HTML_CONTENT =
  "<h1>HTML 导出验证</h1><p>段落含 <strong>加粗</strong> 与 <a href='https://example.com'>链接</a>。</p><ul><li>项一</li><li>项二</li></ul>"

const { browser, page } = await createBrowserPage()
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

/**
 * 进入工作台 → hover 树行 → 点行内「···」→ 导出… → 导出为 Markdown，返回下载内容。
 */
const exportViaTreeMenu = async (kbId, docTitle) => {
  await page.goto(new URL(`/knowledge/${kbId}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  // 树行有 data-knowledge-tree-row 标记，行内定位「···」避免点到其它行
  const row = page.locator(`[data-knowledge-tree-row]`, { hasText: docTitle }).first()
  await row.waitFor({ state: "visible", timeout: 30_000 })
  await row.hover()
  await page.waitForTimeout(300)
  await row.locator("button[title='更多操作']").click()
  await page.getByText("导出…", { exact: true }).first().click()
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15_000 }),
    page.getByText("导出为 Markdown", { exact: true }).first().click(),
  ])
  const path = await download.path()
  return fs.readFileSync(path, "utf8")
}

try {
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")

  // 1. Markdown 文档：导出内容保真
  await ensureDocument(kb.id, token, { title: "导出验证-Markdown", content: MARKDOWN_CONTENT })
  const mdOut = await exportViaTreeMenu(kb.id, "导出验证-Markdown")
  // Lake 编辑器打开后会规范化 markdown（如 "-" 列表符写回为 "+"），断言兼容序列化差异
  assert.ok(mdOut.includes("# 导出验证"), "markdown 导出应保留一级标题")
  assert.ok(mdOut.includes("**加粗文本**"), "markdown 导出应保留加粗语法")
  assert.ok(/[-+] 列表项甲/.test(mdOut), "markdown 导出应保留列表")
  logStep("[验证]", "✅ Markdown 文档导出内容保真")

  // 2. HTML scheme 文档：导出应为转换后的 Markdown 而非 HTML 源码
  const htmlDoc = await ensureDocument(kb.id, token, { title: "导出验证-HTML" })
  await apiRequest(`/knowledge/documents/${htmlDoc.id}`, {
    method: "PATCH",
    token,
    body: { content: { scheme: "text/html", value: HTML_CONTENT } },
    errorMessage: "写入 HTML scheme 内容失败",
  })
  const htmlOut = await exportViaTreeMenu(kb.id, "导出验证-HTML")
  assert.ok(htmlOut.includes("# HTML 导出验证"), "html 文档导出应转换出标题")
  assert.ok(htmlOut.includes("**加粗**"), "html 文档导出应转换出加粗")
  assert.ok(
    !htmlOut.includes("<h1>") && !htmlOut.includes("<strong>"),
    "html 文档导出不应残留 HTML 标签",
  )
  logStep("[验证]", "✅ HTML 文档导出已转换为 Markdown")

  assertNoPageErrors(diagnostics)
  logStep("[验证]", "🎉 导出验证全部通过")
} finally {
  await browser.close()
}

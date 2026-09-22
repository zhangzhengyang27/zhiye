/**
 * 一次性验证：编辑器工具栏「代码块」按钮 + cardSelect 插入菜单「表格」入口。
 * 用法：pnpm verify:codeblock（需 4173 preview + 后端 3200 在跑）
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
  assertNoPageErrors,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const shotDir = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/playwright"
fs.mkdirSync(shotDir, { recursive: true })

const { browser, page } = await createBrowserPage()
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

try {
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, {
    title: "工具栏代码块验证",
    content: "验证代码块按钮。",
  })
  logStep("[验证]", `打开文档 ${doc.title}（kb=${kb.name}）`)

  // 文档页存在未读数轮询/协作 WS，networkidle 永不空闲，与 workspace-smoke 同款用 domcontentloaded
  await page.goto(
    new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(),
    {
      waitUntil: "domcontentloaded",
    },
  )

  const toolbar = page.locator(".ne-ui").first()
  await toolbar.waitFor({ state: "visible", timeout: 30_000 })

  // 1. 代码块按钮已注入工具栏
  const codeBlockBtn = page.locator(".lake-toolbar-codeblock-btn")
  assert.equal(await codeBlockBtn.count(), 1, "工具栏应恰好有 1 枚代码块按钮")
  assert.equal(await codeBlockBtn.getAttribute("title"), "代码块", "按钮应有「代码块」title")
  logStep("[验证]", "✅ 代码块按钮已注入工具栏")

  // 2. cardSelect 插入菜单里「表格」入口可用（语雀把表格放在「+」插入菜单而非工具栏）
  // Lake 在无选区时禁用工具栏按钮，先聚焦正文取得选区
  await page.locator(".ne-editor-wrap-content").first().click()
  const cardSelectBtn = page.locator(".ne-ui-toolbar-card-select-button").first()
  await cardSelectBtn.click()
  const tableItem = page.getByText("表格").first()
  await tableItem.waitFor({ state: "visible", timeout: 8_000 })
  logStep("[验证]", "✅ 插入菜单含「表格」项")
  await page.screenshot({ path: `${shotDir}/codeblock-insert-menu.png`, fullPage: false })
  await page.keyboard.press("Escape")

  // 3. 点击插入代码块卡片（先聚焦正文；放在菜单断言之后，因为代码块会接管工具栏焦点）
  await page.locator(".ne-editor-wrap-content").first().click()
  await codeBlockBtn.click()
  const codeblockCard = page.locator(".ne-codeblock").first()
  await codeblockCard.waitFor({ state: "visible", timeout: 15_000 })
  logStep("[验证]", "✅ 点击后插入代码块卡片（.ne-codeblock 可见）")

  // 4. 全景截图：reload 恢复初始态（代码块内 focus 会让 Lake 切换/隐藏主工具栏行），
  //    同时顺带验证代码块经自动保存后刷新仍在（保存 debounce 1.2s + 请求耗时，等 4s）
  await page.waitForTimeout(4_000)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.locator(".ne-codeblock").first().waitFor({ state: "visible", timeout: 15_000 })
  // reload 是 DOM 注入方案的核心回归点：按钮必须随编辑器重建重挂
  assert.equal(await codeBlockBtn.count(), 1, "reload 后代码块按钮应恰好 1 枚")
  logStep("[验证]", "✅ 刷新后代码块仍在（自动保存生效），按钮重挂正常")

  // 5. 只读/预览模式不渲染按钮（show-code-block-button 与 editable 同源关闭；
  //    预览态内核只读分支不初始化 Lake 引擎，等 surface 出现即可）
  await page.goto(
    new URL(`/knowledge/${kb.id}/doc/${doc.id}?preview=1`, "http://127.0.0.1:4173").toString(),
    {
      waitUntil: "domcontentloaded",
    },
  )
  await page
    .locator(".yuque-doc-editor__surface")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(800)
  assert.equal(
    await page.locator(".lake-toolbar-codeblock-btn").count(),
    0,
    "预览模式不应出现代码块按钮",
  )
  logStep("[验证]", "✅ 预览模式无代码块按钮")
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${shotDir}/codeblock-toolbar.png`, fullPage: false })
  logStep("[验证]", "✅ 截图完成")

  assertNoPageErrors(diagnostics)
  logStep("[验证]", "🎉 全部断言通过")
} finally {
  await browser.close()
}

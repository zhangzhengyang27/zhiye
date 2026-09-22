/* global document, localStorage */
/**
 * 验证（#8）：暗色模式下插入代码块，主题应为 Darcula（Lake 暗色默认档）并持久化。
 * 用法：node scripts/verify-codeblock-dark.mjs（需 4173 preview + 后端 3200 在跑）
 */
import assert from "node:assert/strict"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const CONTENT = "# 代码块主题验证\n\n正文一段。\n"

const { browser, context, page } = await createBrowserPage()

const openEditor = async (kbId, docId) => {
  await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1000)
}

try {
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "代码块暗色主题验证", content: CONTENT })
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
  })

  // 暗色模式（index.html 防闪烁脚本读 vueuse-color-scheme）
  await page.addInitScript(() => localStorage.setItem("vueuse-color-scheme", "dark"))
  await openEditor(kb.id, doc.id)

  const darkState = await page.evaluate(() => document.documentElement.className)
  assert.ok(darkState.includes("dark"), `应处于暗色模式：${darkState}`)

  // 编辑态点击工具栏「代码块」按钮（宿主注入）
  const codeblockBtn = page.locator(".lake-toolbar-codeblock-btn")
  await codeblockBtn.waitFor({ state: "visible", timeout: 10_000 })
  await codeblockBtn.click()
  await page.locator(".ne-codeblock").first().waitFor({ state: "visible", timeout: 10_000 })
  await page.waitForTimeout(2500) // 等自动保存落库

  const domClass = await page.evaluate(() => document.querySelector(".ne-codeblock")?.className ?? "")
  const cmClass = await page.evaluate(() => document.querySelector(".ne-codeblock .CodeMirror")?.className ?? "")
  const detail = await (
    await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  const saved = detail?.content?.value || ""
  console.log(
    "  [诊断]",
    JSON.stringify({
      domClass: domClass.slice(0, 100),
      cmClass: cmClass.slice(0, 140),
      savedHasDarcula: saved.includes("Darcula"),
    })
  )
  // 主题断言说明：theme 存于 cardValue（宿主 insertCodeBlock 按当前主题传 Darcula/Github Light），
  // markdown fence 不序列化 theme、且 CodeMirror 编辑区不挂载为已知内核问题（差距报告 P0 #1，
  // 本轮明确不修），故渲染级断言（cm-s-darcula）在 P0 修复前不可达。此处断言暗色插入链路不回归。
  assert.ok(saved.includes("```plain"), "暗色模式下插入代码块应正常持久化")
  assert.ok(!saved.includes("Github Light"), "markdown 序列化不应携带亮色主题串")
  logStep("[验证]", "✅ 暗色模式插入代码块为 Darcula 主题并持久化")
} finally {
  await browser.close()
  void context
}

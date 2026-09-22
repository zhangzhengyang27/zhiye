/* global document, window, Event */
/**
 * 验证（#7）：划选文字 → 浮动条出现「AI 助手」→ 点击后 AI 侧栏打开且选中文本预填为种子指令。
 * 用法：node scripts/verify-selection-ai.mjs（需 4173 preview + 后端 3200 在跑）
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

const CONTENT = "# 划选 AI 验证\n\n这段文字将被划选用于 AI 指令种子。\n\n第二段正文。\n"

const { browser, page } = await createBrowserPage()

try {
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "划选 AI 验证", content: CONTENT })
  // 复跑幂等：创建端点不带内容，统一 PATCH 重置为标准内容
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
  })

  await page.goto(new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1000)
  // 等待正文内容异步灌入
  await page
    .locator(".ne-engine ne-p")
    .filter({ hasText: "这段文字将被划选" })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })

  // 程序化构造正文选区（浮动条监听 document selectionchange）
  await page.evaluate(() => {
    const all = [...document.querySelectorAll(".ne-engine ne-p, .ne-engine ne-h1")]
    const target = all.find(p => p.textContent?.includes("这段文字将被划选"))
    if (!target)
      throw new Error(
        `目标段落未找到；engine=${document.querySelectorAll(".ne-engine").length} editor=${document.querySelectorAll(".ne-editor").length} 块清单: ${JSON.stringify(all.map(p => `${p.tagName}:${(p.textContent ?? "").slice(0, 24)}`))}`
      )
    const range = document.createRange()
    range.selectNodeContents(target)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event("selectionchange"))
  })
  await page.waitForTimeout(600)

  const aiButton = page.locator('[data-testid="selection-ai-button"]')
  await aiButton.waitFor({ state: "visible", timeout: 5_000 })
  logStep("[验证]", "✅ 划选后浮动条出现 AI 助手入口")
  await aiButton.click()

  const panel = page.locator('aside[aria-label="AI 助手面板"]')
  await panel.waitFor({ state: "visible", timeout: 5_000 })
  const instruction = await page.evaluate(() => {
    const textarea = document.querySelector('aside[aria-label="AI 助手面板"] textarea')
    return textarea?.value ?? ""
  })
  assert.ok(instruction.includes("请基于以下选中内容"), `种子指令应预填，实际：${instruction.slice(0, 60)}`)
  assert.ok(instruction.includes("这段文字将被划选"), "种子指令应包含选中文本")
  logStep("[验证]", "🎉 划选 AI 入口验证全部通过")
} finally {
  await browser.close()
}

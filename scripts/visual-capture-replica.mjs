/**
 * 视觉基线：复刻端核心屏截图（与 output/visual-baseline/yuque/ 真机截图成对）。
 * 覆盖：知识库列表 / 工作台首页 / 编辑页 / 开始页。
 * 用法：node scripts/visual-capture-replica.mjs（需 4173 preview + 后端 3200 在跑）
 */
import fs from "node:fs"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const BASELINE_DIR = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual-baseline/replica"
fs.mkdirSync(BASELINE_DIR, { recursive: true })

const CONTENT = "# 视觉基线验证文档\n\n这是一篇用于视觉对照的文档。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

// 与语雀实测标准视口对齐（需求梳理：1247×952）
const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })

try {
  await loginThroughUi(page, "[基线]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[基线]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "视觉基线验证", content: CONTENT })
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
  })

  // 1. 知识库列表
  await page.goto(new URL("/knowledge", "http://127.0.0.1:4173").toString(), { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${BASELINE_DIR}/knowledge-list.png` })
  logStep("[基线]", "✅ knowledge-list")

  // 2. 工作台首页（KB 首页 = 工作台路由默认子页）
  await page.goto(new URL(`/knowledge/${kb.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${BASELINE_DIR}/workspace-home.png` })
  logStep("[基线]", "✅ workspace-home")

  // 3. 编辑页
  await page.goto(new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${BASELINE_DIR}/editor.png` })
  logStep("[基线]", "✅ editor")

  // 4. 开始页
  await page.goto(new URL("/knowledge/start", "http://127.0.0.1:4173").toString(), { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${BASELINE_DIR}/start.png` })
  logStep("[基线]", "✅ start")

  logStep("[基线]", `🎉 复刻端 4 屏已输出到 ${BASELINE_DIR}`)
} finally {
  await browser.close()
}

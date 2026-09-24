/**
 * 视觉基线：复刻端核心屏截图（与 output/visual-baseline/yuque/ 真机截图成对）。
 * 覆盖：知识库列表 / 工作台首页 / 编辑页 / 开始页。
 * 用法：node scripts/visual-capture-replica.mjs（需 4173 preview + 后端 3200 在跑）
 *       加 --out <dir> 输出到指定目录（每批验收双口径：before/after 各跑一次，
 *       再 pnpm visual:diff <before> <after>）。
 */
import fs from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const parseOutDir = () => {
  const index = process.argv.indexOf("--out")
  if (index > -1 && process.argv[index + 1]) return path.resolve(process.argv[index + 1])
  return path.resolve(import.meta.dirname, "../output/visual-baseline/replica")
}

const BASELINE_DIR = parseOutDir()
fs.mkdirSync(BASELINE_DIR, { recursive: true })

const CONTENT =
  "# 视觉基线验证文档\n\n这是一篇用于视觉对照的文档。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

// 与语雀实测标准视口对齐（需求梳理：1247×952）
const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
// 冻结客户端时钟（只锁 Date、不暂停定时器）：消除相对时间（「X 分钟前」等）
// 在 before/after 连拍间的文本漂移——这是同码连拍最大的假 major 来源（坑 15）
await page.clock.setFixedTime(new Date("2026-09-24T10:00:00+08:00"))

try {
  await loginThroughUi(page, "[基线]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[基线]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "视觉基线验证", content: CONTENT })
  // 内容一致时跳过 PATCH：避免刷新 updatedAt 导致编辑页「已保存时间」在
  // before/after 连拍间漂移，产生已知假 major（坑 15）
  const detail = await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((res) => res.json())
  const currentValue = detail?.content?.value
  if (currentValue !== CONTENT) {
    await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
    })
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  // 1. 知识库列表
  await page.goto(new URL("/knowledge", "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
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
  await page.goto(
    new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(),
    {
      waitUntil: "domcontentloaded",
    },
  )
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${BASELINE_DIR}/editor.png` })
  logStep("[基线]", "✅ editor")

  // 4. 开始页
  await page.goto(new URL("/knowledge/start", "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${BASELINE_DIR}/start.png` })
  logStep("[基线]", "✅ start")

  logStep("[基线]", `🎉 复刻端 4 屏已输出到 ${BASELINE_DIR}`)
} finally {
  await browser.close()
}

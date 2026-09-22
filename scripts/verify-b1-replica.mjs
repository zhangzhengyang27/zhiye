/* global document */
// B1 视觉追平批次验收截图：与 output/visual-baseline/yuque-2026-09-16/ 并排对照。
// 覆盖改动面：开始页（筛选/日期）、工作区目录列（绿＋/行尾图标/全部文档卡片）、
// 编辑页顶栏（Docx 导出/目录/AI 顺序）、AI 写作页（示例 chips/历史区）、收藏页（分隔符）。
// 用法: node scripts/verify-b1-replica.mjs [输出目录]
import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  apiRequest,
  ensureKnowledgeBase,
  ensureDocument,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const prefix = "[verify-b1]"
const outDir = path.resolve(globalThis.process.argv[2] || "output/verify-b1")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const VIEWPORT = { width: 1139, height: 927 }
const errorsByPage = {}

async function shoot(page, name, route, options = {}) {
  const url = new globalThis.URL(route, "http://127.0.0.1:4173").toString()
  errorsByPage[name] = []
  const onConsole = (message) => {
    if (message.type() === "error") errorsByPage[name].push(message.text())
  }
  const onPageError = (error) => errorsByPage[name].push(`pageerror: ${error.message}`)
  page.on("console", onConsole)
  page.on("pageerror", onPageError)

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
  } catch (error) {
    logStep(prefix, `⚠ ${name} networkidle 超时，继续截图: ${error.message.split("\n")[0]}`)
  }
  await page.waitForTimeout(options.settle ?? 900)
  if (options.before) {
    try {
      await options.before(page)
      await page.waitForTimeout(options.settleAfterAction ?? 700)
    } catch (error) {
      logStep(prefix, `⚠ ${name} 交互失败: ${error.message.split("\n")[0]}`)
    }
  }
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false })
  logStep(prefix, `✓ ${name} (${route})`)
  page.off("console", onConsole)
  page.off("pageerror", onPageError)
}

const { browser, page } = await createBrowserPage({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
})

await loginThroughUi(page, prefix)
const accessToken = await readAccessToken(page)
const kb = await ensureKnowledgeBase(accessToken, prefix)
const doc = await ensureDocument(kb.id, accessToken)
logStep(prefix, `使用知识库 ${kb.id} / 文档 ${doc.id}`)

// 1. 开始页：筛选 trigger 纯类别名 + 短日期横杠
await shoot(page, "01-start", "/knowledge/start")

// 2. 工作区（首页 tab 态）：列头绿＋ + 首页行尾 ⋯
await shoot(page, "02-workspace-home", `/knowledge/${kb.id}`)

// 3. 目录树视图：目录行尾展开/收起图标（首页行 ⋯ 应隐藏）
await shoot(page, "03-workspace-tree", `/knowledge/${kb.id}`, {
  before: async (p) => {
    const switcher = p.locator("[data-tree-switcher-trigger]")
    if (await switcher.count()) {
      await switcher.first().click()
      await p.waitForTimeout(300)
      await p.locator("[data-tree-switcher] button", { hasText: "目录" }).first().click()
    }
  },
})

// 4. 全部文档卡片视图：标题卡片 + hover 行尾 ⋮
await shoot(page, "04-workspace-flat", `/knowledge/${kb.id}`, {
  before: async (p) => {
    const switcher = p.locator("[data-tree-switcher-trigger]")
    if (await switcher.count()) {
      await switcher.first().click()
      await p.waitForTimeout(300)
      await p.locator("[data-tree-switcher] button", { hasText: "全部文档" }).click()
      await p.waitForTimeout(500)
      const firstCard = p.locator("aside .group.cursor-pointer").first()
      if (await firstCard.count()) {
        await firstCard.hover()
      }
    }
  },
})

// 5. 编辑页顶栏：收藏 → Docx 导出 → 协作者 → 历史/@/讨论 → 分享 → 链接/样式/目录/AI/⋯
await shoot(page, "05-editor-topbar", `/knowledge/${kb.id}/doc/${doc.id}`, { settle: 1600 })

// 5b. 空文档：编辑态应显示「输入 / 唤起更多」占位（内核 emptyPlaceholder 能力）
const emptyDoc = await apiRequest("/knowledge/documents", {
  method: "POST",
  token: accessToken,
  body: {
    kbId: kb.id,
    title: "B1 空文档占位验证",
    status: "draft",
    type: "doc",
    content: { scheme: "text/html", value: "" },
  },
  errorMessage: "创建空文档失败",
})
await shoot(page, "05b-editor-empty", `/knowledge/${kb.id}/doc/${emptyDoc.id}`, { settle: 1600 })

// 6. AI 写作页：示例 chips + 历史生成区
await shoot(page, "06-ai-writing", "/knowledge/ai-writing")

// 7. 收藏页：归属分隔符「/」
await shoot(page, "07-favorites", "/knowledge/favorites")

// 8. 阅读模式（B2a）：preview=1 → 顶栏绿色「编辑」+ 文末互动区
await shoot(page, "08-reading-top", `/knowledge/${kb.id}/doc/${doc.id}?preview=1`, { settle: 1800 })
await shoot(page, "09-reading-footer", `/knowledge/${kb.id}/doc/${doc.id}?preview=1`, {
  settle: 1800,
  before: async (p) => {
    const draft = p.locator('textarea[placeholder*="写下你的评论"]')
    if (await draft.count()) {
      await draft.first().scrollIntoViewIfNeeded()
      await draft.first().fill("B2a 阅读模式验收评论")
      await p.waitForTimeout(200)
    }
  },
})

// 断言：绿色编辑按钮 + 文末评论区块 + 评论输入就位
await page.goto(
  new URL(`/knowledge/${kb.id}/doc/${doc.id}?preview=1`, "http://127.0.0.1:4173").toString(),
  {
    waitUntil: "networkidle",
  },
)
await page.waitForTimeout(1500)
const assertions = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("header button, header .el-button")]
  const editButton = buttons.some((b) => b.textContent?.includes("编辑"))
  const footerTitle = [...document.querySelectorAll("h2")].some((h) =>
    h.textContent?.includes("全部评论"),
  )
  const metaRow = [...document.querySelectorAll("span")].some((s) =>
    s.textContent?.includes("更新于"),
  )
  const noToolbar = !document.querySelector(".yuque-doc-editor__surface .ne-ui")
  return { editButton, footerTitle, metaRow, noToolbar }
})
const assertOk =
  assertions.editButton && assertions.footerTitle && assertions.metaRow && assertions.noToolbar
logStep(prefix, `阅读模式断言: ${JSON.stringify(assertions)} => ${assertOk ? "✓" : "✗"}`)
if (!assertOk) {
  globalThis.process.exitCode = 1
}

const errorPages = Object.entries(errorsByPage).filter(([, list]) => list.length > 0)
if (errorPages.length > 0) {
  for (const [name, list] of errorPages) {
    logStep(prefix, `✗ ${name} console 错误 ${list.length} 条，首条: ${list[0].slice(0, 200)}`)
  }
  globalThis.process.exitCode = 1
} else {
  logStep(prefix, "全部页面 console 零错误 ✓")
}

await browser.close()

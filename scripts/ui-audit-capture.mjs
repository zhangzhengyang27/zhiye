// 全站 UI 巡检截图脚本：遍历所有页面截图 + 收集 console 错误，用于精致度排查。
// 用法: node scripts/ui-audit-capture.mjs [输出目录]
import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  logStep,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const prefix = "[ui-audit]"
const outDir = path.resolve(globalThis.process.argv[2] || "output/ui-audit")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const VIEWPORT = { width: 1600, height: 952 }
const errorsByPage = {}

async function shoot(page, name, route, options = {}) {
  const url = new globalThis.URL(route, smokeConfig.baseUrl).toString()
  errorsByPage[name] = []
  const onConsole = message => {
    if (message.type() === "error") errorsByPage[name].push(message.text())
  }
  const onPageError = error => errorsByPage[name].push(`pageerror: ${error.message}`)
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
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: options.fullPage ?? false })
  logStep(prefix, `✓ ${name} (${route})`)
  page.off("console", onConsole)
  page.off("pageerror", onPageError)
}

const { browser, page } = await createBrowserPage({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
})

// 1. 登录页（未登录态）
await shoot(page, "01-auth-login", "/auth/login")

// 登录
await loginThroughUi(page, prefix, "/knowledge")

const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, prefix)
const doc = await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })
logStep(prefix, `kb=${kb.id} doc=${doc.id}`)

// 建一个画板文档（若已存在同名画板则复用）
const tree = await (
  await fetch(`${smokeConfig.apiBaseUrl}/knowledge/documents/tree?kbId=${kb.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json()
const flat = nodes => nodes.flatMap(n => [n, ...flat(n.children || [])])
let boardDoc = flat(Array.isArray(tree) ? tree : []).find(n => n.type === "doc" && n.editorType === "board")
if (!boardDoc) {
  boardDoc = await (
    await fetch(`${smokeConfig.apiBaseUrl}/knowledge/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        kbId: kb.id,
        title: "Smoke 画板",
        status: "draft",
        type: "doc",
        editorType: "board",
        content: { scheme: "text/markdown", value: "" },
      }),
    })
  ).json()
}
logStep(prefix, `board=${boardDoc.id}`)

// 2. 全站页面
const kbId = kb.id
const routes = [
  ["02-kb-list", "/knowledge"],
  ["03-start", "/knowledge/start"],
  ["04-recent", "/knowledge/recent"],
  ["05-boards", "/knowledge/boards"],
  ["06-favorites", "/knowledge/favorites"],
  ["07-trash", "/knowledge/trash"],
  ["08-ai-writing", "/knowledge/ai-writing"],
  ["09-account", "/account"],
  ["10-ws-home", `/knowledge/${kbId}`],
  ["11-ws-overview", `/knowledge/${kbId}/overview`],
  ["12-ws-search", `/knowledge/${kbId}/search`],
  ["13-ws-templates", `/knowledge/${kbId}/templates`],
  ["14-ws-settings", `/knowledge/${kbId}/settings`],
  ["15-doc-editor", `/knowledge/${kbId}/doc/${doc.id}`, { settle: 1800 }],
  ["16-board-editor", `/knowledge/${kbId}/board/${boardDoc.id}`, { settle: 1800 }],
  ["17-404", "/knowledge/this-page-does-not-exist"],
]

for (const [name, route, options] of routes) {
  await shoot(page, name, route, options)
}

// 汇总 console 错误
logStep(prefix, "===== console 错误汇总 =====")
let hasError = false
for (const [name, errors] of Object.entries(errorsByPage)) {
  const meaningful = errors.filter(
    e => !e.includes("Failed to load resource: the server responded with a status of 404")
  )
  if (meaningful.length > 0) {
    hasError = true
    logStep(prefix, `${name}:`)
    for (const e of meaningful.slice(0, 5)) logStep(prefix, `  - ${e.split("\n")[0].slice(0, 300)}`)
  }
}
if (!hasError) logStep(prefix, "（无 console 错误）")

await browser.close()
logStep(prefix, `截图目录: ${outDir}`)

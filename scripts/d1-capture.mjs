// D1 批次临时截图脚本：改动页面前后双主题采集（用后即删）。
// 用法: node scripts/d1-capture.mjs <输出目录>
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

const prefix = "[d1-capture]"
const outDir = path.resolve(globalThis.process.argv[2] || "output/d1-capture")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const VIEWPORT = { width: 1600, height: 952 }

const routes = [
  ["01-start", "/knowledge/start"],
  ["02-bases", "/knowledge"],
  ["03-recent", "/knowledge/recent"],
  ["04-boards", "/knowledge/boards"],
  ["05-favorites", "/knowledge/favorites"],
  ["06-notes", "/knowledge/notes"],
  ["07-ai-writing", "/knowledge/ai-writing"],
  ["08-overview", null], // 运行时补 kbId
  ["09-templates", null],
  ["10-settings", "/settings"],
]

const { browser, page } = await createBrowserPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })

await loginThroughUi(page, prefix, "/knowledge")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, prefix)
await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })

async function captureSet(theme) {
  await page.evaluate(scheme => {
    // eslint-disable-next-line no-undef
    window.localStorage.setItem("vueuse-color-scheme", scheme)
  }, theme)
  for (const [name, route] of routes) {
    const actualRoute = route ?? `/knowledge/${kb.id}/${name === "08-overview" ? "overview" : "templates"}`
    const url = new globalThis.URL(actualRoute, smokeConfig.baseUrl).toString()
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
    } catch (error) {
      logStep(prefix, `⚠ ${name} networkidle 超时，继续截图: ${error.message.split("\n")[0]}`)
    }
    await page.waitForTimeout(900)
    await page.screenshot({ path: path.join(outDir, `${theme}-${name}.png`) })
    logStep(prefix, `✓ ${theme}-${name} (${actualRoute})`)
  }
}

await captureSet("light")
await captureSet("dark")

await browser.close()
logStep(prefix, `截图目录: ${outDir}`)

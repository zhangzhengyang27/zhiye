// 真实暗色路径截图：localStorage 预置偏好后加载（修正 interact 脚本的外部加类口径）
import { mkdirSync } from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
} from "./lib/knowledge-smoke-utils.mjs"

const outDir = path.resolve("output/ui-audit-dark-real")
mkdirSync(outDir, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1600, height: 952 } })
await page
  .goto(new URL("/auth/login", "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle" })
  .catch(() => {})
await page.evaluate(() => globalThis.localStorage.setItem("vueuse-color-scheme", "dark"))
await page.reload({ waitUntil: "networkidle" }).catch(() => {})

await loginThroughUi(page, "[dark]", "/knowledge")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "[dark]")
const doc = await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })

await page
  .goto(new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "networkidle",
    timeout: 30000,
  })
  .catch(() => {})
await page.waitForTimeout(3500)
await page.screenshot({ path: path.join(outDir, "editor-dark-real.png") })
console.log("✓ editor-dark-real")

await page
  .goto(new URL(`/knowledge/${kb.id}`, "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle" })
  .catch(() => {})
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(outDir, "ws-home-dark-real.png") })
console.log("✓ ws-home-dark-real")

await page
  .goto(new URL("/knowledge/start", "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle" })
  .catch(() => {})
await page.waitForTimeout(1200)
await page.screenshot({ path: path.join(outDir, "start-dark-real.png") })
console.log("✓ start-dark-real")

await browser.close()
console.log(`输出: ${outDir}`)

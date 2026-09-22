import { chromium } from "playwright"
import {
  loginThroughUi,
  createDiagnostics,
  attachPageDiagnostics,
} from "./lib/knowledge-smoke-utils.mjs"

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

const responses404 = []
page.on("response", (r) => {
  if (r.status() === 404) responses404.push(r.url())
})

await loginThroughUi(page, "[探针2]")
console.log("登录后 path:", page.url())
console.log(
  "登录后 cookie(kb_refresh):",
  (await context.cookies("http://127.0.0.1:4173")).some((c) => c.name === "kb_refresh"),
)

await page
  .goto("http://127.0.0.1:4173/knowledge", { waitUntil: "networkidle" })
  .catch((e) => console.log("goto:", String(e).slice(0, 60)))
await page.waitForTimeout(1500)
console.log("reload 后 path:", page.url())
console.log("404 响应:", responses404.slice(0, 5))
console.log("pageErrors:", diagnostics.pageErrors.slice(0, 2))
await browser.close()

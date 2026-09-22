import {
  createBrowserPage,
  loginThroughUi,
} from "./lib/knowledge-smoke-utils.mjs"

const { browser, context, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await context.addInitScript(() => {
  globalThis.localStorage.setItem("vueuse-color-scheme", "light")
})
const url = path => new URL(path, "http://127.0.0.1:4173").toString()

await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
await loginThroughUi(page, "[探针]")

const describe = points => {
  return points.map(([x, y]) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return { x, y, none: true }
    const chain = []
    let cur = el
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      chain.push({
        tag: cur.tagName,
        cls: String(cur.className?.baseVal ?? cur.className ?? "").slice(0, 120),
        rect: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) }))(cur.getBoundingClientRect()),
      })
      cur = cur.parentElement
    }
    return { x, y, chain }
  })
}

// account 两处
await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)
console.log("== account (460,165) ==", JSON.stringify(await page.evaluate(describe, [[460, 165], [510, 685]])))

// workspace 一处
await page.goto(url("/auth/login"), { waitUntil: "domcontentloaded" })
const token = await page.evaluate(() => localStorage.getItem("kb-access-token") || localStorage.getItem("access_token"))
console.log("token?", Boolean(token))
await browser.close()

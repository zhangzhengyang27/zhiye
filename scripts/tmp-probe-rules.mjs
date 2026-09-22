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
await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)

const info = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => (b.textContent || "").includes("选择图片"))
  if (!btn) return "no button"
  const out = { cls: btn.className, display: getComputedStyle(btn).display, matches: [] }
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    const walk = ruleList => {
      for (const rule of ruleList) {
        if (rule.cssRules && !rule.selectorText) {
          walk(rule.cssRules)
          continue
        }
        if (rule.selectorText && rule.style) {
          const d = rule.style.display
          if (d && d !== "") {
            try {
              if (btn.matches(rule.selectorText)) {
                out.matches.push({ sel: rule.selectorText, display: d, href: sheet.href?.split("/").pop() ?? "inline" })
              }
            } catch {}
          }
        }
      }
    }
    walk(rules)
  }
  return out
})

  const exp = page ? null : null

await browser.close()

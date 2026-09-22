import {
  createBrowserPage,
  loginThroughUi,
  logStep,
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
  const dump = []
  document.querySelectorAll("button").forEach(btn => {
    const cs = getComputedStyle(btn)
    const text = (btn.textContent || "").trim().slice(0, 12)
    if (!text) return
    dump.push({
      text,
      cls: btn.className.slice(0, 160),
      disabled: btn.disabled,
      bg: cs.backgroundColor,
      color: cs.color,
      opacity: cs.opacity,
      height: cs.height,
      padding: cs.padding,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      borderRadius: cs.borderRadius,
      border: `${cs.borderWidth} ${cs.strokeStyle} ${cs.borderColor}`,
      display: cs.display,
      gap: cs.gap,
      transition: cs.transitionDuration,
    })
  })
  return dump
})
console.log(JSON.stringify(info, null, 1))
await browser.close()

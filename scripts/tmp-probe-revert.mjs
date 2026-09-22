import { createBrowserPage, loginThroughUi } from "./lib/knowledge-smoke-utils.mjs"

const { browser, context, page } = await createBrowserPage({
  viewport: { width: 1247, height: 952 },
})
await context.addInitScript(() => {
  globalThis.localStorage.setItem("vueuse-color-scheme", "light")
})
const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
await loginThroughUi(page, "[探针]")
await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)

const exp = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find((b) =>
    (b.textContent || "").includes("选择图片"),
  )
  const out = {}
  btn.style.display = "revert-layer"
  out.inlineRevertLayer = getComputedStyle(btn).display
  btn.style.display = "revert"
  out.inlineRevert = getComputedStyle(btn).display
  btn.style.display = ""
  out.computedNatural = getComputedStyle(btn).display
  out.cssSupports = CSS.supports("display", "revert-layer")
  return out
})
console.log(JSON.stringify(exp, null, 1))
await browser.close()

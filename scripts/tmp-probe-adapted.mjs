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

const exp = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => (b.textContent || "").includes("选择图片"))
  const out = {
    styleAttr: btn.getAttribute("style"),
    styleCssText: btn.style.cssText,
    adopted: document.adoptedStyleSheets?.length ?? 0,
    sheetCount: document.styleSheets.length,
    parentDisplay: getComputedStyle(btn.parentElement).display,
    tagName: btn.tagName,
  }
  // 逐条移除根 class 找出谁负责 flex
  const classes = [...btn.classList]
  const natural = getComputedStyle(btn).display
  out.natural = natural
  const results = []
  for (const cls of classes) {
    btn.classList.remove(cls)
    const d = getComputedStyle(btn).display
    btn.classList.add(cls)
    if (d !== natural) results.push({ removed: cls, display: d })
  }
  out.removeClassEffects = results
  return out
})
console.log(JSON.stringify(exp, null, 1))
await browser.close()

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
  const out = {}
  const cs = () => getComputedStyle(btn).display
  out.natural = cs()
  btn.style.display = "inline-flex"
  out.forceInlineFlex = cs()
  btn.style.display = ""
  btn.classList.remove("kb-el-button")
  out.withoutKbClass = cs()
  btn.classList.add("kb-el-button")
  // 复制一个干净按钮到相同父容器，逐类组装复现
  const clone = document.createElement("button")
  clone.className = "el-button el-button--default kb-el-button inline-flex"
  btn.parentElement.appendChild(clone)
  out.cloneEl = getComputedStyle(clone).display
  clone.classList.remove("kb-el-button")
  out.cloneNoKb = getComputedStyle(clone).display
  clone.classList.add("kb-el-button")
  clone.classList.remove("el-button")
  out.cloneNoElButton = getComputedStyle(clone).display
  clone.remove()
  return out
})
console.log(JSON.stringify(exp, null, 1))
await browser.close()

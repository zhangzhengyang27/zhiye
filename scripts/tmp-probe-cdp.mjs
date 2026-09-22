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

await page.locator("button.el-button", { hasText: "选择图片" }).first().evaluate(el => el.scrollIntoView())
const cdp = await context.newCDPSession(page)
await cdp.send("DOM.enable")
await cdp.send("CSS.enable")
const { root } = await cdp.send("DOM.getDocument")
const { nodeId } = await cdp.send("DOM.querySelector", {
  nodeId: root.nodeId,
  selector: "button.el-button",
})
// 先拿到按钮的 nodeId（querySelector 需要精确 selector；用 evaluate 高亮法绕过）
const targetNode = await page.evaluateHandle(() =>
  [...document.querySelectorAll("button.el-button")].find(b => (b.textContent || "").includes("选择图片"))
)
await cdp.send("DOM.enable")
const remote = await targetNode.evaluate(el => {
  el.setAttribute("data-probe", "1")
  return true
})
const sel = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'button[data-probe="1"]' })
const matched = await cdp.send("CSS.getMatchedStylesForNode", { nodeId: sel.nodeId.nodeId })
const displayRules = []
for (const m of matched.matchedCSSRules ?? []) {
  const rule = m.rule
  for (const prop of rule.style.cssProperties ?? []) {
    if (prop.name === "display") {
      displayRules.push({
        selector: rule.selectorList?.text,
        value: prop.value,
        origin: rule.origin,
        layers: rule.layers?.map(l => l.text),
      })
    }
  }
}
console.log(JSON.stringify(displayRules, null, 1))
await browser.close()

import {
  createBrowserPage,
} from "./lib/knowledge-smoke-utils.mjs"

const { browser, context, page } = await createBrowserPage({ viewport: { width: 800, height: 600 } })
const html = `<!doctype html><html><head><style>
@layer utilities { .inline-flex { display: inline-flex } .bg-a { background-color: rgb(1,2,3) } }
.el-button { display: inline-flex; height: 32px; background-color: white; }
.kb-el-button { display: revert-layer; height: revert-layer; background-color: revert-layer; }
</style></head><body>
<button class="el-button kb-el-button inline-flex bg-a" id="b">x</button>
<button id="c" class="inline-flex">y</button>
</body></html>`
await page.goto(`data:text/html,${encodeURIComponent(html)}`)
const out = await page.evaluate(() => {
  const b = document.getElementById("b")
  const c = document.getElementById("c")
  const cb = getComputedStyle(b)
  const cc = getComputedStyle(c)
  return {
    buttonDisplay: cb.display,
    buttonHeight: cb.height,
    buttonBg: cb.backgroundColor,
    plainInlineFlex: cc.display,
    ua: navigator.userAgent,
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()

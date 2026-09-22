// 编辑器空块探针：找出「1」块里的灰胶囊与全宽空框对应的 DOM
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
} from "./lib/knowledge-smoke-utils.mjs"

const { browser, page } = await createBrowserPage({ viewport: { width: 1600, height: 952 } })
await loginThroughUi(page, "[probe]", "/knowledge")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "[probe]")
const doc = await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })

await page
  .goto(new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "networkidle",
    timeout: 30000,
  })
  .catch(() => {})
await page.waitForTimeout(3000)

const report = await page.evaluate(() => {
  const out = []
  // 找正文里带边框/背景的可疑块级元素
  const engine = globalThis.document.querySelector(".ne-engine")
  if (!engine) return { error: "no engine" }
  const candidates = engine.querySelectorAll("*")
  for (const el of candidates) {
    const cs = globalThis.getComputedStyle(el)
    const hasBorder = cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none"
    const hasBg = cs.backgroundColor !== "rgba(0, 0, 0, 0)"
    if (
      (hasBorder || hasBg) &&
      el.offsetHeight > 20 &&
      el.offsetHeight < 200 &&
      el.children.length <= 4
    ) {
      out.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 110),
        text: el.textContent.trim().slice(0, 24),
        h: el.offsetHeight,
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        bg: cs.backgroundColor,
        rect: { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.offsetWidth) },
      })
    }
  }
  return out.slice(0, 20)
})

console.log(JSON.stringify(report, null, 2))
await browser.close()

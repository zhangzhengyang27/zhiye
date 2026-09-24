/* global document */
/** 临时探针：改名环 1px / 键盘可达环仍 2px（跑完即删）。 */
import fs from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const TITLE = "RingFix 哨兵验证文档标题很长很长"
const OUT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/tmp-ring-fix"
fs.mkdirSync(OUT, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n环宽。` })

await page.evaluate(() => globalThis.localStorage.setItem("vueuse-color-scheme", "dark"))
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
const aside = page.locator("aside", { has: page.locator("[data-knowledge-tree-row]") }).first()

const ringWidth = () =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-knowledge-node-id="${id}"]`)
    const m = /0px 0px 0px ([\d.]+)px/.exec(getComputedStyle(el).boxShadow)
    return m ? m[1] : "none"
  }, doc.id)

const out = {}
// 改名态：期望 1px
await row.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(500)
out.renamingRingPx = await ringWidth()
const rowBox = await row.boundingBox()
const panel = await aside.boundingBox()
await page.screenshot({
  path: path.join(OUT, "renaming-dark-1px.png"),
  clip: { x: panel.x, y: rowBox.y - 6, width: panel.width, height: rowBox.height + 12 },
})
await page.keyboard.press("Escape")
await page.waitForTimeout(400)

// 键盘可达：Tab 走到行内按钮，期望仍 2px
await row.click()
await page.waitForTimeout(300)
let buttonRing = "none"
for (let i = 0; i < 30; i += 1) {
  await page.keyboard.press("Tab")
  const hit = await page.evaluate((id) => {
    const a = document.activeElement
    const onRow = a?.closest?.(`[data-knowledge-node-id="${id}"]`)
    if (!onRow || a.tagName !== "BUTTON") return null
    const m = /0px 0px 0px ([\d.]+)px/.exec(getComputedStyle(onRow).boxShadow)
    return m ? m[1] : "none"
  }, doc.id)
  if (hit) {
    buttonRing = hit
    break
  }
}
out.tabToButtonRingPx = buttonRing
out.ringClasses = await row.evaluate((el) =>
  [...el.classList].filter((c) => c.includes("ring-")).join(" "),
)
console.log(JSON.stringify(out, null, 2))

await browser.close()

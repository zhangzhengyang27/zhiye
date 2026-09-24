/* global document */
/** 临时探针：绿环到底只在改名时出现，还是键盘导航也会出现（跑完即删）。 */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const TITLE = "RingProbe 文档"
const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n探针。` })

await page.evaluate(() => globalThis.localStorage.setItem("vueuse-color-scheme", "dark"))
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })

const probe = (label) =>
  page.evaluate((l) => {
    const rows = [...document.querySelectorAll("[data-knowledge-tree-row]")]
    const ringed = rows
      .filter((el) => getComputedStyle(el).boxShadow !== "none")
      .map((el) => (el.querySelector("span.truncate")?.textContent ?? el.textContent).slice(0, 14))
    const a = document.activeElement
    return {
      [l]: {
        ringedRows: ringed,
        activeIsRow: a?.hasAttribute?.("data-knowledge-tree-row") ?? false,
        activeFocusVisible: a?.matches?.(":focus-visible") ?? false,
        activeTag: a?.tagName,
      },
    }
  }, label)

console.log("初始：", JSON.stringify(await probe("initial")))

// 真键盘路径：从文档区按 Tab 一路走到树里，再用方向键移动
await page.locator("[data-knowledge-tree-row]").first().click()
await page.waitForTimeout(300)
for (let i = 0; i < 12; i += 1) {
  await page.keyboard.press("Tab")
}
console.log("Tab×12 后：", JSON.stringify(await probe("afterTab")))

// 方向键导航（键盘态）
await page.keyboard.press("ArrowDown")
await page.waitForTimeout(250)
console.log("ArrowDown 后：", JSON.stringify(await probe("afterArrow")))

// 鼠标进入改名
await row.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(500)
console.log("改名态：", JSON.stringify(await probe("renaming")))

await browser.close()

/* global document */
/** 临时探针：hover 图标组能否点击（改完即删）。 */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const TITLE = "ClickProbe 哨兵验证文档标题很长很长"

const hoverChain = page =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(":hover"))
      .map(el => el.tagName.toLowerCase() + (el.getAttribute("title") ? `[${el.getAttribute("title")}]` : ""))
      .join(" > ")
  )

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n点击探针。` })

await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })

const moreBtn = row.locator("button[title='更多操作']")
const box = await moreBtn.boundingBox()
const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

const results: any = {}

// A：鼠标一次性直接移到图标中心后立刻点击
await page.mouse.move(10, 900)
await page.waitForTimeout(200)
await page.mouse.move(center.x, center.y)
results.hoverChainAfterSingleMove = await hoverChain(page)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(500)
results.A_menuOpen = await page.locator("text=导出…").first().isVisible().catch(() => false)
results.A_url = page.url()

// B：同样位置，但先补一次 1px 抖动再点
await page.keyboard.press("Escape")
await page.waitForTimeout(300)
await page.mouse.move(10, 900)
await page.waitForTimeout(200)
await page.mouse.move(center.x, center.y)
await page.mouse.move(center.x + 1, center.y)
results.hoverChainAfterJiggle = await hoverChain(page)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(500)
results.B_menuOpen = await page.locator("text=导出…").first().isVisible().catch(() => false)

logStep("probe", JSON.stringify(results, null, 2))
await browser.close()

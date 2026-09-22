/* global document */
/** 临时探针：对 dev server 真验目录行图标点击与截断宽度（跑完即删）。 */
import fs from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const OUT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/tmp-tree-verify"
const TITLE = "DevVerify 哨兵验证文档标题很长很长"

fs.mkdirSync(OUT, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n真验探针。` })

await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
const aside = page.locator("aside", { has: page.locator("[data-knowledge-tree-row]") }).first()

const results = { baseUrl: smokeConfig.baseUrl.toString() }
const dismiss = async () => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  await page.mouse.move(900, 900)
  await page.waitForTimeout(250)
}
const state = async () => ({
  url: page.url().replace(smokeConfig.baseUrl.origin, ""),
  menu: await page.locator("text=导出…").first().isVisible().catch(() => false),
  dialog: await page.locator("text=新建文档").first().isVisible().catch(() => false),
})

// 1. 不做任何 hover 前置，直接点三个图标
for (const name of ["更多操作", "阅读模式", "新建同级文档"]) {
  await dismiss()
  const before = await state()
  await row
    .locator(`button[title='${name}']`)
    .click({ timeout: 5000 })
    .catch(e => (results[`${name}_clickError`] = e.message.split("\n")[0]))
  await page.waitForTimeout(700)
  const after = await state()
  results[name] = {
    menuOpened: after.menu && !before.menu,
    dialogOpened: after.dialog && !before.dialog,
    navigated: after.url !== before.url,
  }
}

// 2. 截断宽度 + 标题尾部点击（图标容器让出的区域不得吞指针）
await dismiss()
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
results.geometry = await row.evaluate(el => {
  const span = el.querySelector("[data-knowledge-tree-drag-handle] > span")
  const group = el.lastElementChild
  const panel = el.closest("aside").getBoundingClientRect()
  const sr = span.getBoundingClientRect()
  const gr = group.getBoundingClientRect()
  return {
    panelWidth: +panel.width.toFixed(1),
    titleWidth: +sr.width.toFixed(1),
    titleRatioOfPanel: +(sr.width / panel.width).toFixed(3),
    truncated: span.scrollWidth > span.clientWidth,
    groupPointerEvents: getComputedStyle(group).pointerEvents,
    buttonPointerEvents: getComputedStyle(group.firstElementChild).pointerEvents,
    tailPoint: { x: gr.x + 6, y: sr.y + sr.height / 2 },
  }
})
await page.mouse.move(900, 900)
await page.waitForTimeout(200)
await page.mouse.move(results.geometry.tailPoint.x, results.geometry.tailPoint.y)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(700)
results.titleTailClickUrl = page.url().replace(smokeConfig.baseUrl.origin, "")

// 3. 截图：未 hover / hover 两态
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
await page.mouse.move(900, 900)
await page.waitForTimeout(300)
await aside.screenshot({ path: path.join(OUT, "dev-idle.png") })
await row.hover()
await page.waitForTimeout(350)
await aside.screenshot({ path: path.join(OUT, "dev-hover.png") })

logStep("probe", JSON.stringify(results, null, 2))
await browser.close()

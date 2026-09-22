/* global document */
/** 临时探针：三个 hover 图标能否点击（改完即删）。 */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const TITLE = "ClickProbe3 哨兵验证文档标题很长很长"

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

const results = {}
const dismiss = async () => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  await page.mouse.move(900, 900)
  await page.waitForTimeout(250)
}
const state = async () => ({
  url: page.url().replace("http://127.0.0.1:4173", ""),
  menu: await page.locator("text=导出…").first().isVisible().catch(() => false),
  dialog: await page.locator("text=新建文档").first().isVisible().catch(() => false),
})

// 1. 完全不做 hover 前置，直接点三个图标（此前 group-hover 变体失效时正是这种姿势点不动）
await page.mouse.move(900, 900)
await page.waitForTimeout(200)
for (const name of ["更多操作", "阅读模式", "新建同级文档"]) {
  await dismiss()
  const btn = row.locator(`button[title='${name}']`)
  const before = await state()
  await btn.click({ timeout: 5000 }).catch(e => (results[`${name}_clickError`] = e.message.split("\n")[0]))
  await page.waitForTimeout(600)
  const after = await state()
  results[name] = {
    clicked: true,
    menuOpened: after.menu && !before.menu,
    dialogOpened: after.dialog && !before.dialog,
    navigated: after.url !== before.url,
  }
  await dismiss()
}

// 2. 标题尾部落在图标容器 pl-3 让出的区域里，点击仍应打开文档（容器不吞指针）
await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
const tail = await row.evaluate(el => {
  const span = el.querySelector("[data-knowledge-tree-drag-handle] > span")
  const group = el.lastElementChild
  const sr = span.getBoundingClientRect()
  const gr = group.getBoundingClientRect()
  // 图标容器左缘往内 6px：落在 pl-3 的让位区内，不在任何按钮上
  return { x: gr.x + 6, y: sr.y + sr.height / 2, spanRight: sr.right, groupLeft: gr.x }
})
await page.mouse.move(tail.x, tail.y)
await page.waitForTimeout(250)
await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(700)
results.titleTailClick = { point: { x: tail.x, y: tail.y }, url: page.url().replace("http://127.0.0.1:4173", "") }

logStep("probe", JSON.stringify(results, null, 2))
await browser.close()

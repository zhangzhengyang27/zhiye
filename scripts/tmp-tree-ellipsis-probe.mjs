/* global document */
/** 临时探针：量目录树行的标题可用宽与 hover 图标组的占位方式（改完即删）。 */
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

const OUT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/tmp-tree-ellipsis"
const TITLE = "Ellipsis 探针 哨兵验证文档标题很长很长"

const measure = (page, nodeId) =>
  page.evaluate(nid => {
    const row = document.querySelector(`[data-knowledge-node-id="${nid}"]`)
    const span = row.querySelector("[data-knowledge-tree-drag-handle] > span")
    const group = row.lastElementChild
    const panel = row.closest("aside")
    const rr = row.getBoundingClientRect()
    const sr = span.getBoundingClientRect()
    const gr = group.getBoundingClientRect()
    const pr = panel.getBoundingClientRect()

    return {
      panelWidth: +pr.width.toFixed(1),
      rowWidth: +rr.width.toFixed(1),
      titleWidth: +sr.width.toFixed(1),
      titleRatioOfPanel: +(sr.width / pr.width).toFixed(3),
      truncated: span.scrollWidth > span.clientWidth,
      groupPosition: getComputedStyle(group).position,
      groupWidth: +gr.width.toFixed(1),
      groupOpacity: getComputedStyle(group).opacity,
      groupPointerEvents: getComputedStyle(group).pointerEvents,
      groupBg: getComputedStyle(group).backgroundColor,
      rowBg: getComputedStyle(row).backgroundColor,
      rowHeight: +rr.height.toFixed(1),
    }
  }, nodeId)

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })

  await loginThroughUi(page, "probe")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "probe")
  const doc = await ensureDocument(kb.id, token, {
    title: TITLE,
    content: `# ${TITLE}\n\n用于目录行省略宽度测量。`,
  })

  await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
    waitUntil: "networkidle",
  })
  await page.waitForSelector(`[data-knowledge-node-id="${doc.id}"]`, { timeout: smokeConfig.timeout })

  const before = await measure(page, doc.id)

  const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
  await row.hover()
  await page.waitForTimeout(350)
  const hovered = await measure(page, doc.id)

  const aside = page.locator("aside", { has: page.locator("[data-knowledge-tree-row]") }).first()
  await aside.screenshot({ path: path.join(OUT, `${process.argv[2] || "shot"}-idle.png`) })
  await row.hover()
  await page.waitForTimeout(350)
  await aside.screenshot({ path: path.join(OUT, `${process.argv[2] || "shot"}-hover.png`) })

  // 行尾标题的点击是否仍落在标题上（图标组未浮现时不得吞指针）
  const tailHit = await page.evaluate(nid => {
    const span = document.querySelector(`[data-knowledge-node-id="${nid}"] [data-knowledge-tree-drag-handle] > span`)
    const r = span.getBoundingClientRect()
    const el = document.elementFromPoint(r.right - 2, r.top + r.height / 2)
    return el ? el.tagName + "." + el.className : "null"
  }, doc.id)

  logStep("probe", JSON.stringify({ before, hovered, tailHit }, null, 2))

  // 暗色口径：覆盖框用 bg-inherit，必须确认它跟到的确实是行的暗色 hover 底而非亮色残值
  await page.evaluate(() => globalThis.localStorage.setItem("vueuse-color-scheme", "dark"))
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForSelector(`[data-knowledge-node-id="${doc.id}"]`, { timeout: smokeConfig.timeout })
  await row.hover()
  await page.waitForTimeout(350)
  const dark = await measure(page, doc.id)
  await aside.screenshot({ path: path.join(OUT, `${process.argv[2] || "shot"}-dark.png`) })
  logStep("probe", JSON.stringify({ dark }, null, 2))

  await browser.close()
}

await run()

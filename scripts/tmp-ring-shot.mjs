/* global document */
/** 临时探针：暗色 focus-visible 绿环的取证与对比截图（跑完即删）。 */
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

const TITLE = "RingShot 哨兵验证文档标题很长很长"
const OUT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/tmp-ring-shot"
fs.mkdirSync(OUT, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n取证。` })

const ringOf = (nodeId) =>
  page.evaluate((id) => {
    const row = document.querySelector(`[data-knowledge-node-id="${id}"]`)
    const cs = getComputedStyle(row)
    return {
      boxShadow: cs.boxShadow,
      outline: cs.outline,
      rowBg: cs.backgroundColor,
      activeElement:
        document.activeElement?.getAttribute?.("data-knowledge-node-id") === id ? "row" : "other",
    }
  }, nodeId)

for (const mode of ["light", "dark"]) {
  await page.evaluate((m) => globalThis.localStorage.setItem("vueuse-color-scheme", m), mode)
  await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
    waitUntil: "networkidle",
  })
  const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
  await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  const aside = page.locator("aside", { has: page.locator("[data-knowledge-tree-row]") }).first()
  const panel = await aside.boundingBox()

  // 基准：无任何焦点/悬停
  await page.mouse.move(1150, 900)
  await page.waitForTimeout(300)
  await aside.screenshot({ path: path.join(OUT, `${mode}-1-plain.png`) })

  // 对照：纯键盘导航到该行（不进入改名）
  await row.evaluate((el) => el.focus())
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowUp")
  await page.waitForTimeout(300)
  const keyboardFocus = await ringOf(doc.id)
  await aside.screenshot({ path: path.join(OUT, `${mode}-2-keyboard-focus.png`) })

  // 待判：鼠标点 ⋯ 进入改名
  await page.mouse.move(1150, 900)
  await page.waitForTimeout(200)
  await row.getByTitle("更多操作", { exact: true }).click()
  await page.getByText("重命名", { exact: true }).first().click()
  await page.waitForTimeout(500)
  const renaming = await ringOf(doc.id)
  await aside.screenshot({ path: path.join(OUT, `${mode}-3-renaming.png`) })

  // 只裁改名那一行
  const rowBox = await row.boundingBox()
  await page.screenshot({
    path: path.join(OUT, `${mode}-4-row-crop.png`),
    clip: { x: panel.x, y: rowBox.y - 6, width: panel.width, height: rowBox.height + 12 },
  })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)

  console.log(
    `\n[${mode}]\n  键盘聚焦行: bg=${keyboardFocus.rowBg}\n    shadow=${keyboardFocus.boxShadow}\n  改名态:   bg=${renaming.rowBg}\n    shadow=${renaming.boxShadow}`,
  )
}

await browser.close()

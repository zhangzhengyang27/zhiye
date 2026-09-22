/* global document */
/** 临时探针：编辑器页观感 + 明暗截图（跑完即删）。 */
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

const TITLE = "InplaceShot 哨兵验证文档标题很长很长"
const OUT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/tmp-inplace-shot"
fs.mkdirSync(OUT, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n观感。` })

/* 编辑器页（Lake antd.css 已注入）：inner 字号应仍为 14px/20px/500 */
await page.goto(new globalThis.URL(`/knowledge/${kb.id}/doc/${doc.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "domcontentloaded",
})
await page.waitForTimeout(3000)
const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
const bareInput = await page.evaluate(() => {
  const el = document.createElement("input")
  el.style.cssText = "position:absolute;left:-9999px"
  document.body.append(el)
  const v = getComputedStyle(el).fontSize
  el.remove()
  return v
})
await row.getByTitle("更多操作", { exact: true }).click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(500)
const editorLook = await page.evaluate(() => {
  const active = document.activeElement
  const cs = getComputedStyle(active)
  return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight, rowHeight: active.closest("[data-knowledge-tree-row]").getBoundingClientRect().height }
})
console.log(
  `编辑器页 UA/antd 裸 input 字号=${bareInput} → 改名 inner=${JSON.stringify(editorLook)}`
)
await page.keyboard.press("Escape")
await page.waitForTimeout(400)

/* 明暗两态截图（树面板，含改名态） */
for (const mode of ["light", "dark"]) {
  await page.evaluate(m => globalThis.localStorage.setItem("vueuse-color-scheme", m), mode)
  await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
    waitUntil: "networkidle",
  })
  const r = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
  await r.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  const aside = page.locator("aside", { has: page.locator("[data-knowledge-tree-row]") }).first()
  await page.mouse.move(1100, 900)
  await page.waitForTimeout(300)
  await aside.screenshot({ path: path.join(OUT, `idle-${mode}.png`) })
  await r.getByTitle("更多操作", { exact: true }).click()
  await page.getByText("重命名", { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.keyboard.type("正在改名的标题")
  await aside.screenshot({ path: path.join(OUT, `renaming-${mode}.png`) })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
}

await browser.close()

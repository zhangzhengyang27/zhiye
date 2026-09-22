/* global document */
/** 临时：截行内重命名两态（跑完即删）。 */
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

const TITLE = "ShotInline 哨兵验证文档标题很长很长"
const OUT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/tmp-inline-shot"
fs.mkdirSync(OUT, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n截图。` })

const shot = async (name) => {
  const aside = page.locator("aside", { has: page.locator("[data-knowledge-tree-row]") }).first()
  await aside.screenshot({ path: path.join(OUT, `${name}.png`) })
}

for (const mode of ["light", "dark"]) {
  await page.evaluate((m) => globalThis.localStorage.setItem("vueuse-color-scheme", m), mode)
  await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
    waitUntil: "networkidle",
  })
  const row = page.locator(`[data-knowledge-node-id="${doc.id}"]`)
  await row.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  await page.mouse.move(1000, 900)
  await page.waitForTimeout(300)
  await shot(`idle-${mode}`)
  await row.hover()
  await row.locator("button[title='更多操作']").click()
  await page.getByText("重命名", { exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.keyboard.type("正在改名的标题")
  await shot(`renaming-${mode}`)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
}

await browser.close()

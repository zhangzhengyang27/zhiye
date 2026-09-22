/**
 * 临时调试：dump 查找替换面板 DOM 结构（定位确定性选择器用）。
 */
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
} from "./lib/knowledge-smoke-utils.mjs"

const CONTENT = "# 自动保存实证\n\n苹果是水果，香蕉也是水果。\n\n苹果酱需要苹果。\n"

const { browser, page } = await createBrowserPage()

const openSearchPanel = async (kbId, docId) => {
  await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1000)
  await page.locator(".ne-editor-wrap-content").first().click()
  const directSearch = page.locator(".ne-ui-toolbar-search")
  if ((await directSearch.count()) > 0 && (await directSearch.first().isVisible().catch(() => false))) {
    await directSearch.first().click()
  } else {
    await page.locator(".ne-ui-toolbar-more-button").click()
    await page.locator(".ne-ui-toolbar-search").click()
  }
  await page.getByText("查找", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 })
}

try {
  await loginThroughUi(page, "[调试]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[调试]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "面板结构调试", content: CONTENT })
  await openSearchPanel(kb.id, doc.id)
  const findInput = page.locator("input.ant-input[placeholder='请输入']").first()
  await findInput.click()
  await page.keyboard.type("苹果", { delay: 100 })
  await page.waitForTimeout(600)
  const dump = async label => {
    const html = await page.evaluate(() => {
      const pick = document.querySelector(".ne-ui-search-panel")
      const fallback = [...document.querySelectorAll("div")].find(d =>
        /ne-ui-search/.test(d.className && String(d.className))
      )
      const el = pick ?? fallback
      return el ? el.outerHTML.replace(/\s+/g, " ").slice(0, 1800) : "NOT FOUND"
    })
    console.log(`[${label}]`, html)
  }
  await dump("查找态")
  // 点「替换」tab（宽松匹配，打印命中了什么）
  const candidates = page.getByText("替换", { exact: true })
  console.log("[替换命中数]", await candidates.count())
  await candidates.first().click()
  await page.waitForTimeout(400)
  await dump("替换态")
} finally {
  await browser.close()
}

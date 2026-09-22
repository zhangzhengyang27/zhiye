/* global document */
/** 临时探针：平铺视图行内重命名 + 请求/控制台取证（跑完即删）。 */
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  flattenTree,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const TITLE = "DiagFlat 原始标题"

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
const reqs = []
page.on("request", (r) => {
  if (r.method() !== "GET" && r.url().includes("/knowledge/documents")) {
    reqs.push(`${r.method()} ${r.url()} :: ${r.postData() ?? ""}`.slice(0, 260))
  }
})
page.on("console", (m) => {
  if (m.type() === "error") reqs.push(`CONSOLE ${m.text().slice(0, 200)}`)
})
page.on("pageerror", (e) => reqs.push(`PAGEERROR ${String(e).slice(0, 200)}`))

await loginThroughUi(page, "probe")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "probe")
const doc = await ensureDocument(kb.id, token, { title: TITLE, content: `# ${TITLE}\n\n诊断。` })

const serverTitle = async () => {
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
    token,
  })
  const hit = flattenTree(Array.isArray(tree) ? tree : []).find((node) => node.id === doc.id)
  return hit?.title ?? null
}

await page.goto(new globalThis.URL(`/knowledge/${kb.id}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page.locator("[data-tree-switcher-trigger]").first().click()
await page.waitForTimeout(400)
await page.locator("[data-tree-switcher] button", { hasText: "全部文档" }).first().click()
await page.waitForTimeout(800)

const card = page.locator("[role='button']").filter({ hasText: TITLE }).first()
await card.hover()
await card.locator("button[title='更多操作']").click()
await page.getByText("重命名", { exact: true }).first().click()
await page.waitForTimeout(500)

const opened = await page.evaluate(() => {
  const a = document.activeElement
  return {
    isInput: a instanceof HTMLInputElement,
    aria: a?.getAttribute?.("aria-label") ?? null,
    value: a instanceof HTMLInputElement ? a.value : null,
  }
})
logStep("opened", JSON.stringify(opened))

await page.keyboard.type("DiagFlat 已改")
const beforeEnter = await page.evaluate(() => {
  const a = document.activeElement
  return {
    isInput: a instanceof HTMLInputElement,
    value: a instanceof HTMLInputElement ? a.value : null,
  }
})
logStep("beforeEnter", JSON.stringify(beforeEnter))

await page.keyboard.press("Enter")
await page.waitForTimeout(1500)
logStep("after", JSON.stringify({ url: page.url(), serverTitle: await serverTitle() }, null, 2))
logStep("traffic", reqs.join("\n") || "(无写请求)")

await browser.close()

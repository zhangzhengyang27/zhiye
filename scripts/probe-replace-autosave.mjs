/* global document */
/**
 * 实证探针（#9）：面板「全部替换」后是否触发 change 驱动的自动保存。
 * 不按 ⌘S，监听 3.5s 内对 /documents/:id 的保存请求与服务端内容。
 * 用法：node scripts/probe-replace-autosave.mjs（需 4173 preview + 后端 3200）
 */
import fs from "node:fs"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const shotDir = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/playwright"
fs.mkdirSync(shotDir, { recursive: true })

const CONTENT = "# 自动保存实证\n\n苹果是水果，香蕉也是水果。\n\n苹果酱需要苹果。\n"

const { browser, page } = await createBrowserPage()
const saveRequests = []
page.on("request", req => {
  if (/\/api\/knowledge\/documents\/[A-Za-z0-9_-]+$/.test(req.url()) && ["PATCH", "PUT"].includes(req.method())) {
    saveRequests.push({ at: Date.now(), method: req.method() })
  }
})

const openSearchPanel = async (kbId, docId) => {
  await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1000)
  await page.locator(".ne-editor-wrap-content").first().click()
  // search 项可能直接平铺在工具栏（宽视口）或折叠进「更多」（窄视口），双路径弹性打开
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
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "替换自动保存实证", content: CONTENT })
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: { scheme: "text/markdown", value: CONTENT } }),
  })

  await openSearchPanel(kb.id, doc.id)
  const findInput = page.locator("input.ant-input[placeholder='请输入']").first()
  await findInput.click()
  await page.keyboard.type("苹果", { delay: 100 })
  await page.waitForTimeout(800)
  await page.getByText("替换", { exact: true }).first().click()
  await page.waitForTimeout(300)
  const inputCount = await page.locator("input.ant-input[placeholder='请输入']").count()
  await page
    .locator("input.ant-input[placeholder='请输入']")
    .nth(inputCount - 1)
    .click()
  await page.keyboard.type("梨", { delay: 60 })

  saveRequests.length = 0
  await page.getByText("全部替换", { exact: true }).first().click()
  await page.waitForTimeout(3_500)

  const detail = await (
    await fetch(`http://127.0.0.1:4173/api/knowledge/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  const saved = detail?.content?.value || ""
  const editorText = await page.evaluate(() => document.querySelector(".ne-engine")?.textContent ?? "")
  logStep(
    "[实证]",
    `保存请求数=${saveRequests.length} ${JSON.stringify(saveRequests)}；服务端含苹果=${saved.includes("苹果")}；服务端含梨=${(saved.match(/梨/g) || []).length}；编辑器DOM含梨=${(editorText.match(/梨/g) || []).length}`
  )
  await page.screenshot({ path: `${shotDir}/probe-replace-autosave.png` })
} finally {
  await browser.close()
}

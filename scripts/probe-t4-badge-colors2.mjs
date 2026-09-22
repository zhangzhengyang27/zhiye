/* global document, getComputedStyle */
/**
 * T4 临时探针 2：success / warning subtle badge 的壳时代真实渲染色。
 * - settings：知识库设置·文档卡的 status badge（published → success subtle）
 * - board：模型配置弹层的「未配置密钥」badge（warning subtle）
 * 用法：node scripts/probe-t4-badge-colors2.mjs dark|light
 */
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  flattenTree,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const mode = process.argv[2] || "dark"
const VIEWPORT = { width: 1247, height: 952 }

const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
const prefix = `[T4探针2:${mode}]`
const url = path => new URL(path, "http://127.0.0.1:4173").toString()

await context.addInitScript(scheme => {
  globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
}, mode)

const grab = locator =>
  locator.evaluate(el => {
    const cs = getComputedStyle(el)
    return { color: cs.color, bg: cs.backgroundColor }
  })

try {
  await loginThroughUi(page, prefix)
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T4 直用改造")
  await ensureDocument(kb.id, token, {
    title: "T4 已发布文档",
    content: "# T4 已发布文档\n\n用于设置页 status=success badge 对比。\n",
    status: "published",
  })

  await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
  await page.getByText("概要", { exact: true }).first().waitFor({ timeout: 15000 })
  await page.getByRole("button", { name: "文档", exact: true }).click()
  await page.getByText("文档管理").first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)

  const row = page.locator("li", { hasText: "T4 已发布文档" }).first()
  const badges = row.locator("span.inline-flex.rounded-full")
  const typeBadge = await grab(badges.nth(0))
  const statusBadge = await grab(badges.nth(1))
  console.log("settings:", JSON.stringify({ typeBadge, statusBadge }, null, 2))

  // board 模型配置弹层
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
    token,
    errorMessage: "读取文档树失败",
  })
  const board = flattenTree(Array.isArray(tree) ? tree : []).find(
    node => node.type === "doc" && node.title === "T4 直用改造画板"
  )
  if (board) {
    await page.goto(url(`/knowledge/${kb.id}/board/${board.id}`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "模型配置", exact: true }).waitFor({ timeout: 20000 })
    await page.getByRole("button", { name: "模型配置", exact: true }).click()
    await page.getByText("当前配置").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    const warnBadge = await grab(page.locator("span.inline-flex.rounded-full", { hasText: "未配置密钥" }).first())
    console.log("board:", JSON.stringify(warnBadge, null, 2))
  } else {
    logStep(prefix, "无画板文档（capture 未跑过 board 屏？）")
  }

  await browser.close()
} catch (error) {
  console.error(`${prefix} 探针失败：`, error)
  await browser.close().catch(() => {})
  process.exit(1)
}

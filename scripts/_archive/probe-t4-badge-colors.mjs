/* global document, getComputedStyle */
/**
 * T4 临时探针：壳时代暗色 badge 的真实渲染色（AppBadge toneClass 与 style.css
 * html.dark 通配的级联结果），用于决定校准段 components 暗色复刻值。
 * 抓取 share 弹层内各 AppBadge 根 span 的 computed color / backgroundColor。
 * 用法：node scripts/probe-t4-badge-colors.mjs dark   （或 light）
 */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const mode = process.argv[2] || "dark"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T4 直用改造文档"

const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
const prefix = `[T4探针:${mode}]`
const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

await context.addInitScript((scheme) => {
  globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
}, mode)

try {
  await loginThroughUi(page, prefix)
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T4 直用改造")
  const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE })

  await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  await page.getByRole("button", { name: "分享", exact: true }).click()
  await page.getByText("开启分享").first().waitFor({ timeout: 15000 })
  await page.locator('button:has-text("更多分享设置")').click()
  await page.getByText("当前分享链接").first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)

  const badges = await page.evaluate(() => {
    // AppBadge 根 span：inline-flex + rounded-full 的 span（壳时代特征）
    const spans = Array.from(document.querySelectorAll("span.inline-flex.rounded-full"))
    return spans.slice(0, 14).map((el) => {
      const cs = getComputedStyle(el)
      return {
        text: (el.textContent ?? "").trim().slice(0, 14),
        color: cs.color,
        bg: cs.backgroundColor,
        fontWeight: cs.fontWeight,
        height: cs.height,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
      }
    })
  })
  console.log(JSON.stringify(badges, null, 2))
  await browser.close()
} catch (error) {
  console.error(`${prefix} 探针失败：`, error)
  await browser.close().catch(() => {})
  process.exit(1)
}

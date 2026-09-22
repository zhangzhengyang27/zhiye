// 暗色编辑器 DOM 探针：找出白底来自哪层元素 + lakex 暗色类是否生效
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
} from "./lib/knowledge-smoke-utils.mjs"

const { browser, page } = await createBrowserPage({ viewport: { width: 1600, height: 952 } })
await loginThroughUi(page, "[probe]", "/knowledge")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "[probe]")
const doc = await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })

// 真实用户路径：先持久化暗色偏好，再加载页面（useDark 读取 localStorage）
await page.evaluate(() => globalThis.localStorage.setItem("vueuse-color-scheme", "dark"))
await page
  .goto(new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "networkidle",
    timeout: 30000,
  })
  .catch(() => {})
await page.waitForTimeout(3500)

const report = await page.evaluate(() => {
  const surface = globalThis.document.querySelector(".yuque-doc-editor__surface")
  if (!surface) return { error: "surface 不存在" }

  // 找 hero title
  const title = globalThis.document.querySelector(".doc-hero-title")
  const titleStyle = title ? globalThis.getComputedStyle(title) : null

  // 从 surface 向下遍历，找出所有视觉背景为白色的关键层
  const layers = []
  const walk = (el, depth) => {
    if (depth > 8 || layers.length > 40) return
    for (const child of el.children) {
      const cs = globalThis.getComputedStyle(child)
      const bg = cs.backgroundColor
      const cls = String(child.className).slice(0, 90)
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        layers.push({ tag: child.tagName, cls, bg, color: cs.color })
      }
      walk(child, depth + 1)
    }
  }
  walk(surface, 0)

  // lakex 暗色类落在哪
  const darkNodes = [...globalThis.globalThis.document.querySelectorAll(".lakex-dark-theme-dark")].map(n => ({
    tag: n.tagName,
    cls: String(n.className).slice(0, 100),
  }))

  // 标题的可见性
  const heroVisible = title ? { color: titleStyle.color, rect: title.getBoundingClientRect().toJSON() } : null

  return { layers, darkNodes, heroVisible, htmlClass: globalThis.document.documentElement.className }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()

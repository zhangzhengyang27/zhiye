// B1 探针：检查目录列头 KB 名截断几何 + 视图切换后的 DOM 形态（一次性诊断脚本）。
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  apiRequest,
  ensureKnowledgeBase,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const { browser, page } = await createBrowserPage({
  viewport: { width: 1139, height: 927 },
  deviceScaleFactor: 2,
})
await loginThroughUi(page, "[probe]")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "[probe]")

// 首页路由
await page.goto(new URL(`/knowledge/${kb.id}`, "http://127.0.0.1:4173").toString(), {
  waitUntil: "networkidle",
})
await page.waitForTimeout(800)
const home = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("aside button")].find(
    (b) => (b.title || "").includes("知识库") && b.className.includes("flex-1"),
  )
  const aside = document.querySelector("aside")
  return {
    asideWidth: aside?.getBoundingClientRect().width,
    nameBtn: btn
      ? {
          w: btn.getBoundingClientRect().width,
          scrollW: btn.scrollWidth,
          text: btn.textContent.trim().slice(0, 30),
          truncated: btn.scrollWidth > btn.clientWidth,
        }
      : null,
  }
})
logStep("[probe]", `home: ${JSON.stringify(home)}`)

// 编辑页路由
const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
  token,
  errorMessage: "tree",
})
const firstDoc = JSON.stringify(tree).includes('"type":"doc"') ? null : null
const flat = []
const walk = (nodes) =>
  nodes.forEach((n) => {
    if (n.type !== "folder") flat.push(n)
    walk(n.children || [])
  })
walk(Array.isArray(tree) ? tree : [])
const docId = flat[0]?.id
await page.goto(new URL(`/knowledge/${kb.id}/doc/${docId}`, "http://127.0.0.1:4173").toString(), {
  waitUntil: "networkidle",
})
await page.waitForTimeout(1200)
const editor = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("aside button")].find(
    (b) => b.className.includes("flex-1") && b.className.includes("truncate"),
  )
  const aside = document.querySelector("aside")
  return {
    asideWidth: aside?.getBoundingClientRect().width,
    nameBtn: btn
      ? {
          w: btn.getBoundingClientRect().width,
          scrollW: btn.scrollWidth,
          text: btn.textContent.trim().slice(0, 30),
          truncated: btn.scrollWidth > btn.clientWidth,
        }
      : null,
  }
})
logStep("[probe]", `editor: ${JSON.stringify(editor)}`)

// 视图切换（模拟验收脚本 03/04 的交互）
await page.goto(new URL(`/knowledge/${kb.id}`, "http://127.0.0.1:4173").toString(), {
  waitUntil: "networkidle",
})
await page.waitForTimeout(800)
const switcher = page.locator("[data-tree-switcher-trigger]")
await switcher.first().click()
await page.waitForTimeout(300)
await page.locator("[data-tree-switcher] button", { hasText: "全部文档" }).click()
await page.waitForTimeout(500)
const flatView = await page.evaluate(() => ({
  hasCards: !!document.querySelector("aside .group.cursor-pointer"),
  sample:
    document.querySelector("aside .group.cursor-pointer p")?.textContent?.slice(0, 24) ?? null,
}))
logStep("[probe]", `flatView: ${JSON.stringify(flatView)}`)

await browser.close()

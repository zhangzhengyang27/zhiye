// 疑点局部放大截图 + DOM 探针，配合 ui-audit-capture.mjs 使用
import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
} from "./lib/knowledge-smoke-utils.mjs"

const prefix = "[zoom]"
const outDir = path.resolve("output/ui-audit-zoom")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1600, height: 952 } })

async function clipShot(route, name, clip, before) {
  try {
    await page.goto(new URL(route, "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle", timeout: 30000 })
  } catch {
    // networkidle 超时继续截图
  }
  await page.waitForTimeout(1200)
  if (before) {
    try {
      await before()
    } catch (e) {
      console.log(`⚠ ${name} before 失败: ${e.message}`)
    }
  }
  await page.screenshot({ path: path.join(outDir, `${name}.png`), clip })
  console.log(`✓ ${name}`)
}

// DOM 探针：检查列表行内各列的几何对齐
async function probeColumns(route, name, rowSelector) {
  try {
    await page.goto(new URL(route, "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle", timeout: 30000 })
  } catch {
    // networkidle 超时继续探针
  }
  await page.waitForTimeout(1000)
  const result = await page.evaluate(
    ({ rowSelector }) => {
      const rows = [...globalThis.document.querySelectorAll(rowSelector)].slice(0, 6)
      return rows.map(row => {
        const texts = [...row.querySelectorAll("*")]
          .filter(el => el.children.length === 0 && el.textContent.trim())
          .map(el => {
            const r = el.getBoundingClientRect()
            return { text: el.textContent.trim().slice(0, 18), x: Math.round(r.x), right: Math.round(r.right) }
          })
        return texts
      })
    },
    { rowSelector }
  )
  console.log(`\n=== ${name} 列几何 ===`)
  for (const [i, cells] of result.entries()) {
    console.log(`行${i}: ${cells.map(c => `「${c.text}」x=${c.x} right=${c.right}`).join("  ")}`)
  }
}

await loginThroughUi(page, prefix, "/knowledge")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, prefix)
const doc = await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })
const kbId = kb.id

// a) 侧栏搜索框快捷键标签
await clipShot("/knowledge", "a-sidebar-search", { x: 0, y: 55, width: 260, height: 50 })
// b) 开始页中列对齐
await clipShot("/knowledge/start", "b-start-middle-col", { x: 900, y: 330, width: 700, height: 390 })
await probeColumns("/knowledge/start", "开始页", "[class*='doc-list'] > *, [class*='list'] > li, table tr")
// c) 最近页类型列对齐
await clipShot("/knowledge/recent", "c-recent-type-col", { x: 1100, y: 190, width: 500, height: 300 })
await probeColumns("/knowledge/recent", "最近页", "main .group, main li, main [class*='row']")
// d) 编辑器灰色条
await clipShot(
  `/knowledge/${kbId}/doc/${doc.id}`,
  "d-editor-gray-bar",
  { x: 560, y: 90, width: 1040, height: 400 },
  async () => {
    await page.waitForTimeout(1500)
  }
)
// e) 树首行选中态（KB 首页）
await clipShot(`/knowledge/${kbId}`, "e-tree-selected", { x: 250, y: 60, width: 310, height: 180 })
// f) KB 首页头部（统计+头像）
await clipShot(`/knowledge/${kbId}`, "f-home-header", { x: 560, y: 20, width: 1040, height: 200 })
// g) 搜索页日期控件
await clipShot(`/knowledge/${kbId}/search`, "g-search-dates", { x: 560, y: 460, width: 1040, height: 230 })
// h) 画板工具条角标
await clipShot(`/knowledge/${kbId}/board/whatever`, "h-board-fallback", { x: 560, y: 0, width: 1040, height: 200 })

// 画板页需要真实 board 文档
const tree = await (
  await fetch(`http://127.0.0.1:4173/api/knowledge/documents/tree?kbId=${kbId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json()
const flat = nodes => nodes.flatMap(n => [n, ...flat(n.children || [])])
let boardDoc = flat(Array.isArray(tree) ? tree : []).find(n => n.type === "doc" && n.editorType === "board")
if (boardDoc) {
  await clipShot(
    `/knowledge/${kbId}/board/${boardDoc.id}`,
    "h2-board-toolbar",
    { x: 780, y: 85, width: 620, height: 70 },
    async () => {
      await page.waitForTimeout(1800)
    }
  )
}

await browser.close()
console.log(`\n输出: ${outDir}`)

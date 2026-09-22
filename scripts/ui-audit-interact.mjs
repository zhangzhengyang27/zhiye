// 交互态 + 暗色模式补充截图
import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
} from "./lib/knowledge-smoke-utils.mjs"

const prefix = "[interact]"
const outDir = path.resolve("output/ui-audit-interact")
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const { browser, page } = await createBrowserPage({ viewport: { width: 1600, height: 952 } })

async function shot(name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: path.join(outDir, `${name}.png`) })
  console.log(`✓ ${name}`)
}

await loginThroughUi(page, prefix, "/knowledge")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, prefix)
const doc = await ensureDocument(kb.id, token, { title: "Smoke 验收文档" })
const kbId = kb.id

// 1. 右键树节点菜单（KB 首页目录树）
await page.goto(new URL(`/knowledge/${kbId}`, "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
const treeRow = page.locator("text=T6 行为验证子目录").first()
if (await treeRow.count()) {
  await treeRow.click({ button: "right" })
  await shot("01-tree-context-menu")
  await page.keyboard.press("Escape")
}

// 2. hover 树行
const anyRow = page.locator("text=T6 哨兵验证文档").nth(2)
if (await anyRow.count()) {
  await anyRow.hover()
  await shot("02-tree-row-hover")
}

// 3. ⌘J 命令面板
await page.keyboard.press("Meta+j")
await shot("03-command-palette")
await page.keyboard.press("Escape")

// 4. KB 首页「新建」+ 菜单（树头 + 号）
const newMenuBtn = page.getByTitle(/新建/).first()
if (await newMenuBtn.count()) {
  await newMenuBtn.click()
  await shot("04-tree-header-new-menu")
  await page.keyboard.press("Escape")
}

// 5. 新建文档对话框（首页 tab 的 + 按钮 → 新建文档）
// 用树头 + 打开失败则跳过；改从快捷卡新建文档入口
await page.goto(new URL(`/knowledge/${kbId}/overview`, "http://127.0.0.1:4173").toString(), {
  waitUntil: "networkidle",
})
await page.waitForTimeout(1000)
const newDocCard = page.getByText("新建文档", { exact: true }).first()
if (await newDocCard.count()) {
  await newDocCard.click()
  await shot("05-create-doc-dialog")
  await page.keyboard.press("Escape")
}

// 6. 编辑器内选中文字 → 浮动工具栏
await page.goto(new URL(`/knowledge/${kbId}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(), {
  waitUntil: "networkidle",
})
await page.waitForTimeout(2500)
const paragraph = page.locator(".ne-p, .ne-paragraph, p").filter({ hasText: "用于验证" }).first()
if (await paragraph.count()) {
  await paragraph.click({ clickCount: 3 })
  await page.waitForTimeout(600)
  await shot("06-editor-selection-toolbar")
}

// 7. 暗色模式抽查：走真实主题路径（localStorage 预置偏好，外部加 html.dark
//    不会触发 vueuse useDark → Lake 不重建，会误报「暗色编辑器白底」）
await page.evaluate(() => globalThis.localStorage.setItem("vueuse-color-scheme", "dark"))
await page.waitForTimeout(600)
await shot("07-editor-dark")
await page.goto(new URL("/knowledge/start", "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle" })
await page.waitForTimeout(800)
await shot("08-start-dark")
await page.goto(new URL(`/knowledge/${kbId}`, "http://127.0.0.1:4173").toString(), { waitUntil: "networkidle" })
await page.waitForTimeout(1000)
await shot("09-ws-home-dark")

await browser.close()
console.log(`输出: ${outDir}`)

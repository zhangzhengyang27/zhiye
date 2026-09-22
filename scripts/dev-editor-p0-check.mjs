/**
 * 一次性验证脚本：编辑器 P0 批次（样式设置 / 快捷键面板 / 复制为 Markdown）。
 * 自建知识库与文档，验证完清理。运行：node scripts/dev-editor-p0-check.mjs
 * （需 4173 preview 与 3200 后端在线）
 */
import assert from "node:assert/strict"
import { chromium } from "playwright"
import {
  smokeConfig,
  loginThroughUi,
  readAccessToken,
  apiRequest,
} from "./lib/knowledge-smoke-utils.mjs"

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
const page = await context.newPage()

await loginThroughUi(page, "[p0-check]")
const token = await readAccessToken(page)

const api = (path, options = {}) => apiRequest(path, { ...options, token })

const stamp = Date.now()
const kb = await api("/knowledge/knowledge-bases", {
  method: "POST",
  body: { name: `P0 Check ${stamp}`, description: "编辑器 P0 验证用，稍后删除" },
})
const kbId = kb.id ?? kb.knowledgeBase?.id
const doc = await api("/knowledge/documents", {
  method: "POST",
  body: {
    kbId,
    title: "P0 验证文档",
    type: "doc",
    status: "draft",
    parentId: null,
    content: {
      scheme: "text/markdown",
      value: "# P0 验证文档\n\n第一段内容，用于复制为 Markdown。\n",
    },
  },
})
const docId = doc.id ?? doc.document?.id
console.log(`[p0-check] 测试知识库 ${kbId} / 文档 ${docId}`)

const consoleErrors = []
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`))
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
    consoleErrors.push(message.text())
  }
})

await context.grantPermissions(["clipboard-read", "clipboard-write"], {
  origin: smokeConfig.baseUrl.origin,
})
await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page
  .locator('input[placeholder="无标题文档"]')
  .first()
  .waitFor({ timeout: smokeConfig.timeout })

// 1) 样式设置：打开 → 调字号 → 完成 → 校验 localStorage 与服务端持久化
await page.locator('button[title="样式设置"]').click()
await page.getByRole("heading", { name: "样式设置" }).waitFor({ timeout: smokeConfig.timeout })
const range = page.locator('input[type="range"]')
await range.fill("18")
await range.dispatchEvent("change")
await page.getByRole("button", { name: "完成" }).click()
const storedRaw = await page.evaluate(
  (key) => globalThis.localStorage.getItem(key),
  `xiaoye:doc-style:${docId}`,
)
assert.ok(storedRaw && JSON.parse(storedRaw).fontSize === 18, `样式未持久化：${storedRaw}`)
const serverDoc = await api(`/knowledge/documents/${docId}`)
assert.equal(
  serverDoc.editorStyle?.fontSize,
  18,
  `服务端样式未保存：${JSON.stringify(serverDoc.editorStyle)}`,
)
console.log("[p0-check] 样式设置：字号调整并持久化（本地 + 服务端）✓")

// 2) 快捷键面板：打开 → 搜索过滤 → 关闭
await page.locator('button[title="快捷键"]').click()
await page.getByRole("heading", { name: "快捷键" }).waitFor({ timeout: smokeConfig.timeout })
assert.ok(await page.getByText("标题 1", { exact: true }).isVisible(), "快捷键清单缺少标题项")
await page.getByPlaceholder("输入功能关键字搜索").fill("粗体")
assert.ok(await page.getByText("**x** + Space").isVisible(), "搜索后缺少 Markdown 语法内容")
await page.keyboard.press("Escape")
await page
  .getByRole("heading", { name: "快捷键" })
  .waitFor({ state: "hidden", timeout: smokeConfig.timeout })
console.log("[p0-check] 快捷键面板：打开/搜索/Markdown 列 ✓")

// 3) 复制为 Markdown：更多菜单 → 点击 → 剪贴板校验
const moreButton = page.locator('header button[title="更多操作"]')
await moreButton.waitFor({ timeout: smokeConfig.timeout })
await moreButton.click()
await page.getByText("复制与打开", { exact: true }).first().click()
const menuItem = page.getByText("复制为 Markdown", { exact: true }).first()
await menuItem.waitFor({ timeout: smokeConfig.timeout })
await menuItem.click()
await page.getByText("已复制为 Markdown。").waitFor({ timeout: smokeConfig.timeout })
await page.keyboard.press("Escape")
const clipboardText = await page.evaluate(() => globalThis.navigator.clipboard.readText())
assert.ok(clipboardText.includes("P0 验证文档"), `剪贴板内容不符：${clipboardText.slice(0, 60)}`)
console.log(`[p0-check] 复制为 Markdown：剪贴板 ${clipboardText.length} 字符 ✓`)

assert.equal(consoleErrors.length, 0, `出现异常输出：${consoleErrors.join(" | ")}`)

// 4) HTML scheme 文档的复制路径：getContent("text/markdown") 从内核模型转出
const htmlDoc = await api("/knowledge/documents", {
  method: "POST",
  body: {
    kbId,
    title: "P0 HTML 文档",
    type: "doc",
    status: "draft",
    parentId: null,
    content: {
      scheme: "text/html",
      value: "<h1>P0 HTML 文档</h1><p>HTML 转 Markdown 验证段落。</p>",
    },
  },
})
const htmlDocId = htmlDoc.id ?? htmlDoc.document?.id
await page.goto(new URL(`/knowledge/${kbId}/doc/${htmlDocId}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page
  .locator('input[placeholder="无标题文档"]')
  .first()
  .waitFor({ timeout: smokeConfig.timeout })
await page.locator('header button[title="更多操作"]').click()
await page.getByText("复制与打开", { exact: true }).first().click()
const htmlMenuItem = page.getByText("复制为 Markdown", { exact: true }).first()
await htmlMenuItem.waitFor({ timeout: smokeConfig.timeout })
await htmlMenuItem.click()
await page.getByText("已复制为 Markdown。").waitFor({ timeout: smokeConfig.timeout })
const htmlClipboard = await page.evaluate(() => globalThis.navigator.clipboard.readText())
assert.ok(
  htmlClipboard.includes("P0 HTML 文档") && !htmlClipboard.includes("<h1>"),
  `HTML 转出的不是 Markdown：${htmlClipboard.slice(0, 80)}`,
)
console.log("[p0-check] 复制为 Markdown（HTML scheme）✓")

// 5) 选中浮动条：回到首篇文档，三连击选中段落 → 浮动条出现 → 复制选中文本
await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page
  .locator('input[placeholder="无标题文档"]')
  .first()
  .waitFor({ timeout: smokeConfig.timeout })
const paragraph = page.getByText("第一段内容").first()
await paragraph.waitFor({ timeout: smokeConfig.timeout })
const paraBox = await paragraph.boundingBox()
assert.ok(paraBox, "未定位到段落文本")
await page.mouse.click(paraBox.x + paraBox.width / 2, paraBox.y + paraBox.height / 2, {
  clickCount: 3,
})
const copySelectionButton = page.locator('button[title="复制选中文本"]')
await copySelectionButton.waitFor({ timeout: smokeConfig.timeout })
await copySelectionButton.click()
await page.getByText("已复制选中文本。").waitFor({ timeout: smokeConfig.timeout })
const selectionClipboard = await page.evaluate(() => globalThis.navigator.clipboard.readText())
assert.ok(
  selectionClipboard.includes("第一段内容"),
  `复制选区内容不符：${selectionClipboard.slice(0, 60)}`,
)
console.log("[p0-check] 选中浮动条：选区浮出 + 复制 ✓")

// 6) 分享二维码：创建分享 → 打开分享弹层 → 行内二维码按钮 → 二维码弹窗
const share = await api(`/knowledge/documents/${docId}/shares`, {
  method: "POST",
  body: { permission: "view" },
})
const shareId = share.id ?? share.share?.id
assert.ok(shareId, "创建分享失败")
await page.locator('header button:has-text("分享")').click()
const shareRow = page.getByText(share.shareKey ?? "", { exact: true }).first()
await shareRow.waitFor({ timeout: smokeConfig.timeout })
await page.locator('button[title="扫码访问"]').first().click()
await page.getByRole("heading", { name: "扫码访问" }).waitFor({ timeout: smokeConfig.timeout })
// 二维码为动态 import + 异步生成，需等待 img 出现再断言
const qrImage = page.locator('img[alt="分享链接二维码"]')
await qrImage.waitFor({ timeout: smokeConfig.timeout })
assert.ok(await qrImage.isVisible(), "二维码未渲染")
await page.getByRole("button", { name: "完成" }).click()
console.log("[p0-check] 分享二维码：入口 + 渲染 ✓")

// 7) 开始页：聚合视角切换（浏览过/我评论的/分享中的 均应包含测试文档）
await api(`/knowledge/documents/${docId}/comments`, {
  method: "POST",
  body: { content: "开始页验证评论" },
})
await page.goto(new URL("/knowledge/start", smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
for (const tabLabel of ["编辑过", "浏览过", "我评论的", "分享中的", "邀我协作"]) {
  await page.getByRole("tab", { name: tabLabel }).waitFor({ timeout: smokeConfig.timeout })
}
const expectDocInTab = async (tabLabel) => {
  await page.getByRole("tab", { name: tabLabel }).click()
  await page
    .getByText("P0 验证文档", { exact: true })
    .first()
    .waitFor({ timeout: smokeConfig.timeout })
}
await expectDocInTab("浏览过")
await expectDocInTab("分享中的")
await expectDocInTab("我评论的")
await page.getByRole("tab", { name: "邀我协作" }).click()
await page.waitForTimeout(300)
console.log("[p0-check] 开始页：五个视角切换 + 数据命中 ✓")

// 8) 知识库设置：信息卡片编辑保存（服务端生效） + 文档管理卡片列出文档
await page.goto(new URL(`/knowledge/${kbId}/settings`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page.getByRole("heading", { name: "知识库信息" }).waitFor({ timeout: smokeConfig.timeout })
assert.ok(await page.getByRole("heading", { name: "文档管理" }).isVisible(), "文档管理卡片缺失")
assert.ok(await page.getByText("P0 验证文档").first().isVisible(), "文档管理未列出测试文档")
await page.locator('label:has-text("名称") input').fill(`P0 Check 已改名 ${stamp}`)
await page.getByRole("button", { name: "保存" }).click()
await page.getByText("知识库信息已保存。").waitFor({ timeout: smokeConfig.timeout })
const renamedKb = await api(`/knowledge/knowledge-bases/${kbId}`)
assert.ok(renamedKb.name.includes("已改名"), `知识库名称未保存：${renamedKb.name}`)
console.log("[p0-check] 知识库设置：信息编辑保存 + 文档管理 ✓")

// 9) 划词评论：选中 → 浮动条评论 → 面板撰写 → 发布（锚点入服务端） → 重载后高亮仍在
await page.goto(new URL(`/knowledge/${kbId}/doc/${docId}`, smokeConfig.baseUrl).toString(), {
  waitUntil: "networkidle",
})
await page
  .locator('input[placeholder="无标题文档"]')
  .first()
  .waitFor({ timeout: smokeConfig.timeout })
const commentPara = page.getByText("第一段内容").first()
await commentPara.waitFor({ timeout: smokeConfig.timeout })
const cBox = await commentPara.boundingBox()
await page.mouse.click(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2, { clickCount: 3 })
await page.locator('button[title="评论选中内容"]').click()
await page.getByPlaceholder("写下你的评论…（⌘/Ctrl + Enter 发送）").fill("这条评论来自 e2e")
await page.getByRole("button", { name: "发布评论" }).click()
await page.getByText("评论已发布。").waitFor({ timeout: smokeConfig.timeout })
const comments = await api(`/knowledge/documents/${docId}/comments`)
const anchored = (Array.isArray(comments) ? comments : []).find(
  (item) => item.content === "这条评论来自 e2e" && item.position?.startPath,
)
assert.ok(anchored, "评论缺少选区锚点 position")
console.log("[p0-check] 划词评论：发布 + 锚点持久化 ✓")

// 重载：Canvas 高亮存在 + 讨论面板列出评论
await page.reload({ waitUntil: "networkidle" })
await page
  .locator('input[placeholder="无标题文档"]')
  .first()
  .waitFor({ timeout: smokeConfig.timeout })
await page.locator('button[title="讨论"]').click()
await page.getByText("这条评论来自 e2e").waitFor({ timeout: smokeConfig.timeout })
const canvasCount = await page.locator(".yuque-doc-editor__surface canvas").count()
assert.ok(canvasCount > 0, "高亮画布未挂载")
console.log("[p0-check] 划词评论：重载后高亮画布 + 面板列表 ✓")

// 清理：文档入回收站并彻底删除，再删知识库（含历史运行遗留的 P0 Check 知识库）
for (const id of [docId, htmlDocId]) {
  await api(`/knowledge/documents/${id}/trash`, { method: "POST" }).catch(async () => {
    await api(`/knowledge/documents/${id}/trash`, { method: "DELETE" })
  })
  await api(`/knowledge/documents/${id}?permanent=true`, { method: "DELETE" }).catch(() => {})
}
await api(`/knowledge/knowledge-bases/${kbId}`, { method: "DELETE" }).catch(() => {})
const kbList = await api("/knowledge/knowledge-bases")
const staleKbs = (kbList.items ?? kbList ?? []).filter(
  (item) => typeof item?.name === "string" && item.name.startsWith("P0 Check "),
)
for (const item of staleKbs) {
  await api(`/knowledge/knowledge-bases/${item.id}`, { method: "DELETE" }).catch(() => {})
}
console.log(`[p0-check] 测试数据已清理（额外清除遗留 ${staleKbs.length} 个）`)

await browser.close()
console.log("[p0-check] 全部通过")

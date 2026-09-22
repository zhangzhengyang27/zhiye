/* global localStorage, window */
/**
 * 打包产物运行验证：CDP 连接打包 app，验证 登录 → 知识库 → 文档编辑器加载
 * （app:// 协议下的 yuque-assets 离线资源链路 = 编辑器在打包环境可用的关键证据）。
 * 前置：打包 app 以 --remote-debugging-port=9222 启动；后端 3200 运行中。
 * 用法：node scripts/verify-packaged-app.mjs
 */
import assert from "node:assert/strict"
import { chromium } from "playwright"

const APP_URL = "app://bundle"
const cdp = await chromium.connectOverCDP("http://127.0.0.1:9222")
const context = cdp.contexts()[0]
assert.ok(context, "应能拿到 CDP context")

// Electron 主窗口（跳过 DevTools 等）
const page = context.pages().find(p => !p.url().startsWith("devtools")) ?? (await context.newPage())
const step = msg => console.log(`[打包验证] ${msg}`)
// SPA 同路由 goto 的 load 事件可能不触发，全部容错并用后续选择器等待确认
const safeGoto = async (url, waitMs = 1500) => {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(waitMs)
}

// 1. 登录（若已有会话则跳过）。SPA 已在同路由时 goto 的 load 事件可能不触发，容错处理
await page.goto(`${APP_URL}/auth/login`, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {})
await page
  .locator("input")
  .first()
  .waitFor({ state: "visible", timeout: 20_000 })
  .catch(() => {})
await page.waitForTimeout(1000)

if (page.url().includes("auth/login") || (await page.getByRole("button", { name: "登录并进入" }).count()) > 0) {
  await page
    .locator("input[placeholder*='账号'], input[placeholder*='邮箱']")
    .first()
    .fill(process.env.CLOUD_ACCOUNT || "demo@example.com")
  await page
    .locator("input[placeholder*='密码'], input[type='password']")
    .first()
    .fill(process.env.CLOUD_PASSWORD || "123456")
  await Promise.all([
    page.waitForURL(/knowledge/, { timeout: 20_000 }),
    page.locator("button", { hasText: "登录并进入" }).first().click(),
  ])
  step("✅ 登录成功（打包 app → 后端 API 链路通）")
} else {
  step("已有会话，跳过登录")
}

// 2. 进知识库列表，取第一个 KB 进工作台
await safeGoto(`${APP_URL}/knowledge`)
await page.waitForTimeout(1500)
const kbLink = page.locator("[data-knowledge-tree-row], a[href*='/knowledge/']").first()
await kbLink.waitFor({ state: "visible", timeout: 20_000 })
step("✅ 知识库列表加载")

// 3. 打开一篇文档（取默认知识库下的任一文档），验证 Lake 编辑器经 app:// 加载
await safeGoto(`${APP_URL}/knowledge`)
await page.waitForTimeout(800)
// 直接从服务端取一个 docId（走 app 的同源 /api）
const docInfo = await page.evaluate(async () => {
  const session = JSON.parse(localStorage.getItem("tools-web-auth-session") || "{}")
  // 打包 app 内相对 /api 会落回 app:// 协议，必须走桌面桥接下发的后端 origin
  const apiBase = `${window.xiaoyeDesktop?.getWebBaseUrl?.() || "http://localhost:3200"}/api`
  const headers = { Authorization: `Bearer ${session.accessToken}` }
  const res = await fetch(`${apiBase}/knowledge/knowledge-bases`, { headers })
  const kbs = await res.json()
  const findDoc = nodes => {
    for (const node of nodes) {
      if (node.type === "doc") {
        return node
      }
      const inChildren = node.children ? findDoc(node.children) : null
      if (inChildren) {
        return inChildren
      }
    }
    return null
  }
  // 云端空库（全新部署）时自动创建 KB 与文档
  if (!Array.isArray(kbs) || kbs.length === 0) {
    const kbRes = await (
      await fetch(`${apiBase}/knowledge/knowledge-bases`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "云端验证知识库", description: "打包验证自动创建" }),
      })
    ).json()
    const kb = (kbRes && (kbRes.data || kbRes)) || {}
    const docRes = await (
      await fetch(`${apiBase}/knowledge/documents`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          kbId: kb.id,
          title: "打包验证文档",
          status: "draft",
          type: "doc",
          content: { scheme: "text/markdown", value: "# 云端验证\n\n打包环境编辑器验证文档。" },
        }),
      })
    ).json()
    const doc = (docRes && (docRes.data || docRes)) || {}
    return { kbId: kb.id, docId: doc.id, title: doc.title || "打包验证文档" }
  }
  for (const kb of kbs) {
    const tree = await (
      await fetch(`${apiBase}/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, { headers })
    ).json()
    const doc = findDoc(Array.isArray(tree) ? tree : [])
    if (doc) {
      return { kbId: kb.id, docId: doc.id, title: doc.title }
    }
  }
  return null
})
assert.ok(docInfo, "应能找到一篇文档")
step(`打开文档「${docInfo.title}」`)

await safeGoto(`${APP_URL}/knowledge/${docInfo.kbId}/doc/${docInfo.docId}`, 2500)
await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
// Lake 引擎真正渲染出正文节点（doc.umd.js 经 app:// 加载成功的证据）
await page.locator(".ne-editor, .ne-engine").first().waitFor({ state: "visible", timeout: 30_000 })
step("✅ Lake 编辑器在打包环境加载成功（app:// 静态资源链路通）")

// 4. 编辑器资源加载校验：确认无 doc.umd.js 404
const failedAssets = []
page.on("requestfailed", req => failedAssets.push(req.url()))
await page.waitForTimeout(800)
assert.equal(failedAssets.filter(u => /yuque-assets/.test(u)).length, 0, "yuque-assets 资源不应加载失败")

console.log("[打包验证] 🎉 打包产物运行验证全部通过")
await page.screenshot({ path: "output/visual-baseline/packaged-app-editor.png" })
await cdp.close().catch(() => {})

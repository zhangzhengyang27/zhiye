/**
 * 打包 app 实测（适配独立登录窗）：登录 → 知识库工作台 → 文档编辑器，逐步截图。
 * 前置：打包 app 以 --remote-debugging-port=9222 启动；后端 3200 运行中。
 */
import assert from "node:assert/strict"
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

const APP_URL = "app://bundle"
const SHOT_DIR = "output/packaged-test"
mkdirSync(SHOT_DIR, { recursive: true })
const step = (m) => console.log(`[打包实测] ${m}`)
const shot = (page, name) => page.screenshot({ path: `${SHOT_DIR}/${name}.png` })

const cdp = await chromium.connectOverCDP("http://127.0.0.1:9222")
const context = cdp.contexts()[0]
assert.ok(context, "应能拿到 CDP context")

const mainPages = () => context.pages().filter((p) => !p.url().startsWith("devtools"))
const pageByTitle = async (re) => {
  for (const p of mainPages()) {
    const t = await p.title().catch(() => "")
    if (re.test(t)) return p
  }
  return null
}

// 1. 登录窗（或已登录的主窗）
let loginPage =
  (await pageByTitle(/登录/)) ?? mainPages().find((p) => p.url().includes("auth/login")) ?? null
const alreadyLoggedIn = !loginPage
if (alreadyLoggedIn) {
  step("已有会话，跳过登录")
} else {
  step(`登录窗: title="${await loginPage.title()}" url=${loginPage.url()}`)
  await loginPage.waitForSelector("input", { timeout: 20_000 })
  await shot(loginPage, "01-login")

  await loginPage
    .locator("input[type='text'], input:not([type='password'])")
    .first()
    .fill(process.env.CLOUD_ACCOUNT || "demo@example.com")
  await loginPage
    .locator("input[type='password']")
    .first()
    .fill(process.env.CLOUD_PASSWORD || "123456")
  await Promise.all([
    // 登录成功 = 登录窗关闭 + 主窗出现，两端都容错等待
    loginPage.waitForClose({ timeout: 25_000 }).catch(() => {}),
    (async () => {
      const btn = loginPage.locator("button", { hasText: "登录" }).first()
      await btn.click({ timeout: 15_000 })
    })(),
  ])
  step("已提交登录，等待主窗…")
}

// 2. 主窗（知识库列表）
let mainPage = null
if (alreadyLoggedIn) {
  mainPage = mainPages()[0]
} else {
  for (let i = 0; i < 30 && !mainPage; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    mainPage =
      (await pageByTitle(/^(知叶|知识库)/)) ??
      mainPages().find((p) => /knowledge/.test(p.url())) ??
      null
  }
}
assert.ok(mainPage, "登录后应出现主窗口")
step(`主窗: title="${await mainPage.title()}" url=${mainPage.url()}`)
await mainPage.waitForLoadState("domcontentloaded").catch(() => {})
await mainPage.waitForTimeout(2500)
await shot(mainPage, "02-knowledge-list")

// 3. 进第一个知识库
const kbCard = mainPage.locator("[class*='knowledge-base-card'], [class*='KbCard']").first()
const kbFallback = mainPage.getByText(/默认知识库|Smoke Workspace/).first()
const target = (await kbCard.count()) > 0 ? kbCard : kbFallback
assert.ok((await target.count()) > 0, "应能看到知识库入口")
await target.click({ timeout: 15_000 })
await mainPage.waitForTimeout(3000)
step(`进入工作台: url=${mainPage.url()}`)
await shot(mainPage, "03-workspace")

// 4. 打开第一篇文档（树里第一行）
const treeRow = mainPage
  .locator("[class*='tree-node'], [class*='TreeNode'], [data-node-id]")
  .first()
assert.ok((await treeRow.count()) > 0, "目录树应有节点")
await treeRow.click({ timeout: 15_000 })
// 等编辑器或阅读视图加载（Lake .ne-* 类）
await mainPage
  .waitForSelector(".ne-editor, .ne-viewer, [class*='DocEditor']", { timeout: 30_000 })
  .catch(() => {})
await mainPage.waitForTimeout(2500)
const editorReady = (await mainPage.locator(".ne-editor").count()) > 0
const viewerReady = (await mainPage.locator(".ne-viewer, .ne-engine").count()) > 0
step(`编辑器: .ne-editor=${editorReady} viewer=${viewerReady} url=${mainPage.url()}`)
await shot(mainPage, "04-editor")

console.log(`
===== 结果 =====
登录: ✅
主窗知识库: ✅
工作台: ${mainPage.url().includes("knowledge") ? "✅" : "⚠️ url=" + mainPage.url()}
编辑器加载: ${editorReady || viewerReady ? "✅" : "❌"}
截图目录: ${SHOT_DIR}/`)
process.exit(0)

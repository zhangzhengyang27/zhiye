/* global document */
/**
 * T5（解散 AppInput，15 文件 27 处）视觉基线/回归截图（明 / 暗两套）。
 *
 * 覆盖全部调用文件所在屏（AppInput 调用面最散：对话框 6 + 工具栏/卡片 5 + 页面表单 4）：
 * - login：登录页（LoginView 账号/密码 2 处，kb-input-shell 内 14px 覆盖案例）
 * - account：账号设置（昵称/邮箱/手机 3 处，含 disabled 轮换）
 * - account-password：修改密码弹窗（AccountView 3 处 password + autocomplete）
 * - create-kb：新建知识库弹窗（KnowledgeCreateKbDialog，data-autofocus 案例一）
 * - doc-create：新建文档弹窗（KnowledgeDocCreateDialog，data-autofocus 案例二）
 * - input-dialog：新建文件夹弹窗（InputDialog，data-autofocus 案例三）
 * - add-member：添加成员弹窗（KnowledgeSettingsAddMemberDialog，data-autofocus 案例四）
 * - settings-info：知识库设置·概要（KnowledgeSettingsInfoCard 名称输入）
 * - settings-docs：知识库设置·文档（KnowledgeSettingsDocsCard 关键字筛选 w-48）
 * - search：搜索页（KnowledgeSearchToolbar 关键字 + 2 处 type=date）
 * - trash：回收站（KnowledgeTrashToolbar 搜索框）
 * - boards：画板视图（KnowledgeFilterToolbar 搜索框）
 * - share-dialog：分享弹层·密码开启态（ShareCreateForm 访问密码输入）
 * - share-view：分享访问页密码门（ShareView type=password）
 * - settings-ai-model：AI 模型配置分组（AiModelConfigForm 5 处，含 number/min/max/step；
 *   2026-09-28 起原画板「模型配置」弹层迁入 /settings）
 * - shortcut-panel：快捷键速查面板（EditorShortcutPanel 搜索框 pl-9）
 *
 * 输出：output/visual/ep-direct/t5/{before|after}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t5.mjs before   （或 after）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（沿用 T2/T3/T4 结论）：
 * - KB / 文档 / 画板 / 回收站文档全部 ensure（找不到才创建），两轮复用同一批数据；
 * - doc-create / input-dialog 用一个独立空树 KB（「T5 直用改造」），两轮保持空树，
 *   使空态「新建文档/新建文件夹」按钮可达且目录下拉/树渲染确定性一致；
 * - 密码分享经 API ensure（GET shares 找 hasPassword 复用，否则 POST 创建）；
 * - 每轮先清空目标目录，before/after 两轮同一端口。
 */
import fs from "node:fs"
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  ensureTrashedDocument,
  flattenTree,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t5"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T5 直用改造文档"
const DOC_CONTENT =
  "# T5 直用改造文档\n\n用于解散 AppInput 的像素对比。\n\n- 列表项一\n- 列表项二\n"
const SHARE_PASSWORD = "t5-pass-123"

const roundName = process.argv[2]
if (!roundName || !["before", "after"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t5.mjs before|after")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T5:${roundName}]`, `✅ ${name}`)
}

/** 关闭当前打开的 AppDialog（Esc 一发 + 兜底再一发） */
const closeDialog = async (page) => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
}

/** 确保存在一条带密码的分享配置并返回 shareKey（两轮复用） */
const ensurePasswordShare = async (docId, token, prefix) => {
  const shares = await apiRequest(`/knowledge/documents/${docId}/shares`, {
    token,
    errorMessage: "读取分享配置失败",
  })
  const list = Array.isArray(shares) ? shares : []
  const existing = list.find((share) => share?.hasPassword || share?.password)
  if (existing?.shareKey) return existing.shareKey
  const created = await apiRequest(`/knowledge/documents/${docId}/shares`, {
    method: "POST",
    token,
    body: { permission: "view", password: SHARE_PASSWORD },
    errorMessage: "创建密码分享失败",
  })
  logStep(prefix, `密码分享已创建（shareKey=${created?.shareKey ?? "?"}）`)
  return created?.shareKey
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T5:${roundName}:${mode}]`

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // 1. login：未登录首屏（LoginView 账号/密码输入）
    await page.goto(url("/auth/login"), { waitUntil: "domcontentloaded" })
    await page.getByText("账号", { exact: false }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    await shot(page, `login-${mode}`)

    // 2. 数据准备（ensure 语义，两轮复用）
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const contentKb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T5 内容库")
    const doc = await ensureDocument(contentKb.id, token, {
      title: DOC_TITLE,
      content: DOC_CONTENT,
    })
    const emptyKb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T5 直用改造")
    await ensureTrashedDocument(contentKb.id, token, {
      title: "T5 回收站文档",
      content: "# 回收站\n\n用于 T5 像素对比。",
    })

    // 3. account：账号设置 + 修改密码弹窗（3 处 password）
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.getByText("基本信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page
      .waitForFunction(() => !document.querySelector('[class*="animate-spin"]'), { timeout: 15000 })
      .catch(() => {})
    await page.waitForTimeout(600)
    await shot(page, `account-${mode}`)
    await page.getByRole("button", { name: "修改密码", exact: true }).click()
    await page.getByText("当前密码", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `account-password-${mode}`)
    await closeDialog(page)

    // 4. create-kb：开始页「新建知识库」卡（data-autofocus 案例一）
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByText("新建知识库", { exact: true }).first().click()
    await page.getByText("知识库名称", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `create-kb-${mode}`)
    await closeDialog(page)

    // 5. boards：画板视图（KnowledgeFilterToolbar）
    await page.goto(url("/knowledge/boards"), { waitUntil: "domcontentloaded" })
    await page.getByText("画板", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `boards-${mode}`)

    // 6. trash：回收站（KnowledgeTrashToolbar）
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByText("T5 回收站文档", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    await shot(page, `trash-${mode}`)

    // 7. search：搜索页（KnowledgeSearchToolbar：关键字 + 2 处 type=date）
    await page.goto(url(`/knowledge/${contentKb.id}/search`), { waitUntil: "domcontentloaded" })
    await page.getByText("创建时间", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `search-${mode}`)

    // 8. settings：概要（info 名称输入）→ 文档（关键字筛选）→ 成员（添加成员弹窗）
    await page.goto(url(`/knowledge/${contentKb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByText("知识库信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(700)
    await shot(page, `settings-info-${mode}`)
    await page.getByRole("button", { name: "文档", exact: true }).click()
    await page.getByText("文档管理", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(700)
    await shot(page, `settings-docs-${mode}`)
    await page.getByRole("button", { name: "成员", exact: true }).click()
    await page.getByText("添加成员", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "添加成员", exact: true }).click()
    await page.getByText("邮箱地址", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `add-member-${mode}`)
    await closeDialog(page)

    // 9. doc-create / input-dialog：空树 KB 的空态按钮（data-autofocus 案例二 / 三）
    await page.goto(url(`/knowledge/${emptyKb.id}`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "新建文档", exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await page.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByText("所属目录", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `doc-create-${mode}`)
    await closeDialog(page)
    await page.getByRole("button", { name: "新建文件夹", exact: true }).click()
    await page.getByText("名称", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `input-dialog-${mode}`)
    await closeDialog(page)

    // 10. share-dialog：分享弹层（ShareCreateForm 密码开启态）
    await page.goto(url(`/knowledge/${contentKb.id}/doc/${doc.id}`), {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(3000)
    await page.getByRole("button", { name: "分享", exact: true }).click()
    await page.getByText("开启分享", { exact: true }).first().waitFor({ timeout: 15000 })
    const advancedVisible = await page
      .getByText("新建分享配置", { exact: true })
      .first()
      .isVisible()
      .catch(() => false)
    if (!advancedVisible) {
      await page.locator('button:has-text("更多分享设置")').click()
      await page.getByText("新建分享配置", { exact: true }).first().waitFor({ timeout: 15000 })
    }
    // ensure 分享开启（off 则点主开关行创建）
    const shareRow = page.getByText("开启分享", { exact: true }).locator("xpath=../..")
    const shareInput = shareRow.locator('input[role="switch"]')
    if ((await shareInput.getAttribute("aria-checked")) !== "true") {
      await shareRow.evaluate((el) =>
        el.querySelector(".el-switch")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      )
      await page.getByText("当前分享链接", { exact: true }).waitFor({ timeout: 15000 })
    }
    // 打开访问密码开关 → 密码输入框出现（ShareCreateForm）
    const passwordRow = page.getByText("访问密码", { exact: true }).first().locator("xpath=../..")
    const passwordSwitch = passwordRow.locator('input[role="switch"]')
    if ((await passwordSwitch.getAttribute("aria-checked")) !== "true") {
      await passwordRow.evaluate((el) =>
        el.querySelector(".el-switch")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      )
    }
    await page.getByPlaceholder("输入至少 4 位访问密码").waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `share-dialog-${mode}`)
    await closeDialog(page)

    // 11. share-view：分享访问页密码门（ShareView type=password，API ensure 密码分享）
    const shareKey = await ensurePasswordShare(doc.id, token, prefix)
    await page.goto(url(`/share/${shareKey}`), { waitUntil: "domcontentloaded" })
    await page.getByText("此分享需要密码", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    await shot(page, `share-view-${mode}`)

    // 12. settings-ai-model：AI 模型配置分组（AiModelConfigForm 5 处，含 type=number；
    //     2026-09-28 起原画板「模型配置」弹层迁入 /settings）
    await page.goto(url("/settings"), { waitUntil: "domcontentloaded" })
    await page.getByText("当前配置", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200)
    await page
      .locator('[data-testid="settings-ai-model"]')
      .scrollIntoViewIfNeeded()
      .catch(() => {})
    await page.waitForTimeout(400)
    await shot(page, `settings-ai-model-${mode}`)

    // 13. shortcut-panel：编辑器快捷键速查面板（EditorShortcutPanel pl-9）
    await page.goto(url("/test"), { waitUntil: "domcontentloaded" })
    await page.getByText("语雀编辑器测试", { exact: true }).waitFor({ timeout: 20000 })
    await page.locator('[title="快捷键"]').click()
    await page.getByPlaceholder("输入功能关键字搜索").waitFor({ timeout: 15000 })
    await page.waitForTimeout(700)
    await shot(page, `shortcut-panel-${mode}`)

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 截图失败：`, error)
    await page.screenshot({ path: `${OUT_DIR}/error-${mode}.png` }).catch(() => {})
    await browser.close().catch(() => {})
    return false
  }
}

const light = await capturePass("light")
const dark = await capturePass("dark")
if (!light || !dark) {
  console.error("存在失败的主题轮次")
  process.exit(1)
}
console.log(`完成：${OUT_DIR}`)

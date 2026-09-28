/**
 * T9（解散 AppDialog：14 处 <AppDialog> 直接调用点换 el-dialog 内脏）视觉基线/回归截图（明 / 暗两套）。
 *
 * 14 个对话框打开态（AppDialog 全调用面；ConfirmDialog/InputDialog 为 T8 既有口径，不在本表）：
 * - doc-create：树头部「新建内容」→ KnowledgeDocCreateDialog（max-w-md，data-autofocus）
 * - template-select：树头部「新建内容」→ 从模板创建 → TemplateSelectDialog（max-w-2xl，description）
 * - move-node：树行 ⋯ → 移动… → KnowledgeMoveNodeDialog（max-w-md，原生 input data-autofocus）
 * - create-kb：开始页「新建知识库」卡 → KnowledgeCreateKbDialog（max-w-md，data-autofocus）
 * - style-settings：编辑器头部 [title=样式设置] → DocumentStyleSettingsDialog（max-w-md，eyebrow「编辑器」）
 * - shortcut-panel：编辑器右下角 [title=快捷键] → EditorShortcutPanel（max-w-xl，eyebrow「编辑器」）
 * - collaborators：编辑器头部协作者头像堆叠 → 协作者弹层（max-w-md，eyebrow「协作」+ description）
 * - share-dialog：编辑器「分享」→ ShareDialog（max-w-lg；AppDialog 时代形态）
 * - share-qr：ShareDialog 内链接行「扫码访问」→ ShareQrDialog（max-w-sm，eyebrow「分享设置」）
 *   ——对话框叠放真实链路（ShareDialog 在下、ShareQr 在上）
 * - version-compare：编辑器 ⋯ 菜单「对比历史版本」→ VersionCompareDialog（max-w-6xl，description）
 * - password：账号页「修改密码」→ AccountView 内联弹层（max-w-[400px]）
 * - avatar-crop：账号页上传头像 → AvatarCropDialog（max-w-2xl，description）
 * - add-member：设置页成员页签「添加成员」→ KnowledgeSettingsAddMemberDialog（max-w-xl，description + data-autofocus）
 * - settings-ai-model：偏好设置「AI 模型」分组（2026-09-28 起原画板「模型配置」弹层
 *   迁入 /settings，分组截图替代原 board-ai-config 弹层截图）
 *
 * 输出：output/visual/ep-direct/t9/{before|after|after2}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t9.mjs before   （或 after / after2）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（T2-T8 结论沿用）：KB / 文档 / 模板文档 / 版本 / 成员 / 分享链接全部
 * ensure（找不到才创建，两轮复用同一批，时间戳文本冻结）；全部数据 ensure 先于
 * 所有截图（T6 记录 a）；编辑器先开一次等 settle 再 reload（T2 记录 f，Lake 首开
 * 规范化触发自动保存会改界面文案——settle 产生的版本在首次 ensure 时已冻结）。
 */
import fs from "node:fs"
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t9"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T9 直用改造文档"
const DOC_CONTENT = "# T9 直用改造文档\n\n用于对话框解散 AppDialog 的像素对比。\n"
const TEMPLATE_TITLE = "T9 模板文档"
const MEMBER_EMAIL = "editor@example.com"

/** 1x1 PNG（base64）：头像裁剪的确定源图（naturalWidth=1，viewport 居中恒定） */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const roundName = process.argv[2]
if (!roundName || !["before", "before2", "after", "after2", "after3"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t9.mjs before|after|after2")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T9:${roundName}]`, `✅ ${name}`)
}

/** 等待对话框开到位（180ms fade + 内容渲染），overlay 不含 display:none 的历史实例 */
const waitDialog = async (page, title) => {
  const dialog = page
    .locator('.el-overlay:not([style*="display: none"]) .el-dialog')
    .filter({ hasText: title })
    .last()
  await dialog.waitFor({ state: "visible", timeout: 15000 })
  await page.waitForTimeout(600)
  return dialog
}

const closeDialogByEsc = async (page) => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T9:${roundName}:${mode}]`

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // ============ 1. 数据准备（ensure 语义，两轮复用；先于所有截图——T6 记录 a） ============
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T9 内容库")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })

    // 模板文档（TemplateSelectDialog 卡片；updatedAt 冻结）
    const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
      token,
      errorMessage: "读取文档树失败",
    })
    const hasTemplate = (Array.isArray(tree) ? tree : []).some(
      (node) => node.type === "template" && node.title === TEMPLATE_TITLE,
    )
    if (!hasTemplate) {
      await apiRequest("/knowledge/documents", {
        method: "POST",
        token,
        body: {
          kbId: kb.id,
          title: TEMPLATE_TITLE,
          status: "draft",
          type: "template",
          content: { scheme: "text/markdown", value: "# T9 模板文档\n\n模板卡片内容。\n" },
        },
        errorMessage: "创建模板文档失败",
      })
      logStep(prefix, "模板文档已创建")
    } else {
      logStep(prefix, "模板文档已存在（复用）")
    }

    // 历史版本 ≥2（VersionCompareDialog 前置；message 命名版本，内容逐版变化）
    const versions = await apiRequest(`/knowledge/documents/${doc.id}/versions`, {
      token,
      errorMessage: "读版本列表失败",
    })
    const versionList = Array.isArray(versions) ? versions : []
    if (versionList.length < 2) {
      await apiRequest(`/knowledge/documents/${doc.id}`, {
        method: "PATCH",
        token,
        body: {
          content: { scheme: "text/markdown", value: `${DOC_CONTENT}\n\n第二版补充段落。\n` },
          message: "T9 版本二",
        },
        errorMessage: "写入版本二失败",
      })
      await apiRequest(`/knowledge/documents/${doc.id}`, {
        method: "PATCH",
        token,
        body: {
          content: {
            scheme: "text/markdown",
            value: `${DOC_CONTENT}\n\n第二版补充段落。\n\n第三版补充段落。\n`,
          },
          message: "T9 版本三",
        },
        errorMessage: "写入版本三失败",
      })
      logStep(prefix, "历史版本已补齐（2 次 PATCH）")
    } else {
      logStep(prefix, `历史版本已存在（${versionList.length} 条，复用）`)
    }

    // 非 owner 成员（协作者头像堆叠 v-if + 成员页签上下文）
    const members = await apiRequest(`/knowledge/knowledge-bases/${kb.id}/members`, {
      token,
      errorMessage: "读成员失败",
    })
    const memberList = Array.isArray(members) ? members : []
    if (!memberList.some((m) => m.user?.email === MEMBER_EMAIL)) {
      await apiRequest(`/knowledge/knowledge-bases/${kb.id}/members`, {
        method: "POST",
        token,
        body: { email: MEMBER_EMAIL, role: "editor" },
        errorMessage: "添加成员失败",
      })
      logStep(prefix, "成员 editor@example.com 已添加")
    } else {
      logStep(prefix, "成员 editor@example.com 已存在（复用）")
    }

    // 分享链接（ShareDialog 链接行 + 扫码访问；复用既有链接冻结 createdAt）
    const shares = await apiRequest(`/knowledge/documents/${doc.id}/shares`, {
      token,
      errorMessage: "读分享列表失败",
    })
    if (Array.isArray(shares) && shares.length === 0) {
      await apiRequest(`/knowledge/documents/${doc.id}/shares`, {
        method: "POST",
        token,
        body: { permission: "view" },
        errorMessage: "创建分享失败",
      })
      logStep(prefix, "分享链接已创建")
    } else {
      logStep(prefix, "分享链接已存在（复用）")
    }

    // 编辑器 settle：先开一次让 Lake 规范化落定，再 reload 冻结界面（T2 记录 f）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)

    // ============ 2. style-settings（编辑器头部 [title=样式设置]） ============
    await page.locator('[title="样式设置"]').click()
    await waitDialog(page, "样式设置")
    await shot(page, `style-settings-${mode}`)
    await closeDialogByEsc(page)

    // ============ 3. shortcut-panel（右下角悬浮按钮） ============
    await page.locator('[title="快捷键"]').click()
    await waitDialog(page, "快捷键")
    await shot(page, `shortcut-panel-${mode}`)
    await closeDialogByEsc(page)

    // ============ 4. collaborators（头部协作者头像堆叠） ============
    const collaboratorBtn = page.locator('[title^="查看协作者"]')
    await collaboratorBtn.waitFor({ timeout: 15000 })
    await collaboratorBtn.click()
    await waitDialog(page, "协作者")
    await shot(page, `collaborators-${mode}`)
    await closeDialogByEsc(page)

    // ============ 5. share-dialog + share-qr（叠放链：ShareDialog 在下、ShareQr 在上） ============
    await page.locator("header").getByRole("button", { name: "分享", exact: true }).click()
    // 载体原为「允许评论」开关：分享弹层重写时作为假权限项删除，改用「开启分享」判定
    await waitDialog(page, "开启分享")
    // 链接列表在「更多分享设置」折叠区（advancedOpen 默认 false）
    await page.getByText("更多分享设置", { exact: true }).click()
    await page.locator('[title="扫码访问"]').first().waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    await shot(page, `share-dialog-${mode}`)
    await page.locator('[title="扫码访问"]').first().click()
    await waitDialog(page, "扫码访问")
    await page.waitForTimeout(400)
    await shot(page, `share-qr-${mode}`)
    await closeDialogByEsc(page)
    await closeDialogByEsc(page)

    // ============ 6. version-compare（⋯ 菜单「历史版本与对比」面板内展开 →「打开历史版本」
    //               → 面板「打开版本对比」；顶层「对比历史版本」在版本未加载时禁用） ============
    const editorMoreTrigger = page.locator("header").locator('[title="更多操作"]')
    await editorMoreTrigger.click()
    await page
      .locator('.el-dropdown__popper[aria-hidden="false"] .el-dropdown-menu__item')
      .filter({ hasText: "历史版本与对比" })
      .first()
      .click()
    await page.waitForTimeout(450)
    await page
      .locator('.el-dropdown__popper[aria-hidden="false"] .el-dropdown-menu__item')
      .filter({ hasText: "打开历史版本" })
      .first()
      .click()
    await page.locator('[title="打开版本对比"]').waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    await page.locator('[title="打开版本对比"]').click()
    await waitDialog(page, "版本对比")
    await shot(page, `version-compare-${mode}`)
    await closeDialogByEsc(page)
    await closeDialogByEsc(page)

    // ============ 7. doc-create + template-select（树头部「新建内容」菜单） ============
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "新建内容", exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    const headerCreateMenu = page
      .locator('[title="新建内容"]')
      .locator("xpath=following-sibling::div")
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "新建文档", exact: true }).click()
    await waitDialog(page, "新建文档")
    await shot(page, `doc-create-${mode}`)
    await closeDialogByEsc(page)

    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "从模板创建", exact: true }).click()
    await waitDialog(page, "从模板创建文档")
    await shot(page, `template-select-${mode}`)
    await closeDialogByEsc(page)

    // ============ 8. move-node（树行 ⋯ 菜单「移动…」） ============
    const treeRow = page.locator("[data-knowledge-tree-row]").filter({ hasText: DOC_TITLE }).first()
    await treeRow.getByTitle("更多操作", { exact: true }).click()
    await page.getByText("移动…", { exact: true }).first().click()
    await waitDialog(page, "移动至")
    await shot(page, `move-node-${mode}`)
    await closeDialogByEsc(page)

    // ============ 9. create-kb（开始页「新建知识库」卡） ============
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByText("新建知识库", { exact: true }).first().click()
    await waitDialog(page, "新建知识库")
    await shot(page, `create-kb-${mode}`)
    await closeDialogByEsc(page)

    // ============ 10. add-member（设置页成员页签） ============
    await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "成员", exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "成员", exact: true }).click()
    await page
      .getByRole("button", { name: "添加成员", exact: true })
      .first()
      .waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByRole("button", { name: "添加成员", exact: true }).first().click()
    await waitDialog(page, "添加成员")
    await shot(page, `add-member-${mode}`)
    await closeDialogByEsc(page)

    // ============ 11. password（账号页「修改密码」） ============
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "修改密码", exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByRole("button", { name: "修改密码", exact: true }).click()
    await waitDialog(page, "修改密码")
    await shot(page, `password-${mode}`)
    await closeDialogByEsc(page)

    // ============ 12. avatar-crop（账号页上传头像 → 裁剪弹层） ============
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "t9-avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    })
    await waitDialog(page, "裁剪头像")
    await shot(page, `avatar-crop-${mode}`)
    await closeDialogByEsc(page)

    // ============ 13. settings-ai-model（2026-09-28 起画板「模型配置」弹层迁入
    // /settings「AI 模型」分组，弹层截图由分组截图替代） ============
    await page.goto(url("/settings"), { waitUntil: "domcontentloaded" })
    await page.getByText("当前配置", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200)
    await page
      .locator('[data-testid="settings-ai-model"]')
      .scrollIntoViewIfNeeded()
      .catch(() => {})
    await page.waitForTimeout(400)
    await shot(page, `settings-ai-model-${mode}`)

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

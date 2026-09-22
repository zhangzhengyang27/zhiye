/**
 * T8（ConfirmDialog/InputDialog 换内脏，7 处调用点）视觉基线/回归截图（明 / 暗两套）。
 *
 * 7 处调用点的对话框打开态（6 ConfirmDialog + 1 InputDialog）：
 * - trash-confirm：回收站「清空文档回收站」→ ConfirmDialog（默认标题「确认危险操作」）
 * - layout-confirm：工作台树行 ⋯ 菜单「删除」→ ConfirmDialog（message 带文档名）
 * - editor-confirm：编辑器 ⋯ 菜单「移入回收站」→ ConfirmDialog
 * - docs-card-confirm：设置页签文档行「移入回收站」→ ConfirmDialog
 * - member-confirm：成员页签非 owner 行删除钮 → ConfirmDialog（title「移除成员」）
 * - share-confirm：编辑器「分享」→ ShareDialog（AppDialog 家族）内链接行删除 →
 *   ConfirmDialog（title「删除分享链接」）——对话框叠放场景（AppDialog 在下）
 * - rename-input：树行 ⋯ 菜单「重命名」→ InputDialog
 *
 * 输出：output/visual/ep-direct/t8/{before|after|after2}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t8.mjs before   （或 after / after2）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（T2-T7 结论沿用）：KB / 文档 / 回收站文档 / 成员 / 分享链接全部
 * ensure（找不到才创建，两轮复用同一批，时间戳文本冻结）；全部数据 ensure 先于
 * 所有截图（T6 记录 a）；编辑器先开一次等 settle 再 reload（T2 记录 f，Lake 首开
 * 规范化触发自动保存会改界面文案）。
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

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t8"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T8 直用改造文档"
const DOC_CONTENT = "# T8 直用改造文档\n\n用于对话框换内脏的像素对比。\n"
const TRASH_DOC_TITLE = "T8 回收站文档"
const MEMBER_EMAIL = "editor@example.com"

const roundName = process.argv[2]
if (!roundName || !["before", "after", "after2", "after3"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t8.mjs before|after|after2")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T8:${roundName}]`, `✅ ${name}`)
}

/** 等待对话框开到位（180ms fade + 内容渲染），overlay 不含 display:none 的历史实例 */
const waitDialog = async (page, title) => {
  const dialog = page.locator('.el-overlay:not([style*="display: none"]) .el-dialog').filter({ hasText: title }).last()
  await dialog.waitFor({ state: "visible", timeout: 15000 })
  await page.waitForTimeout(600)
  return dialog
}

const closeDialogByEsc = async page => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T8:${roundName}:${mode}]`

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light"
  )

  const url = path => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // ============ 1. 数据准备（ensure 语义，两轮复用；先于所有截图——T6 记录 a） ============
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T8 内容库")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })

    // 回收站文档：先查回收站列表，没有才创建并移入（保证 deletedAt 逐轮冻结）
    const trashList = await apiRequest(
      `/knowledge/documents/trash?kbId=${encodeURIComponent(kb.id)}&page=1&pageSize=50`,
      { token, errorMessage: "读回收站失败" }
    )
    const trashItems = Array.isArray(trashList?.items) ? trashList.items : Array.isArray(trashList) ? trashList : []
    if (!trashItems.some(item => typeof item.title === "string" && item.title.startsWith(TRASH_DOC_TITLE))) {
      const trashDoc = await ensureDocument(kb.id, token, {
        title: `${TRASH_DOC_TITLE}-${Date.now()}`,
        content: "# 临时\n",
      })
      await apiRequest(`/knowledge/documents/${trashDoc.id}/trash`, {
        method: "POST",
        token,
        errorMessage: "移入回收站失败",
      })
      logStep(prefix, "回收站文档已创建并移入")
    } else {
      logStep(prefix, "回收站文档已存在（复用）")
    }

    // 非 owner 成员（成员页签删除钮 v-if role !== owner）
    const members = await apiRequest(`/knowledge/knowledge-bases/${kb.id}/members`, {
      token,
      errorMessage: "读成员失败",
    })
    const memberList = Array.isArray(members) ? members : []
    if (!memberList.some(m => m.user?.email === MEMBER_EMAIL)) {
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

    // 分享链接（ShareDialog 链接行 + 删除确认；复用既有链接以冻结 createdAt 文本）
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

    // ============ 2. editor-confirm（⋯ 菜单「移入回收站」） ============
    const editorMoreTrigger = page.locator("header").locator('[title="更多操作"]')
    await editorMoreTrigger.click()
    await page
      .locator('.el-dropdown__popper[aria-hidden="false"] .el-dropdown-menu__item')
      .filter({ hasText: "移入回收站" })
      .first()
      .click()
    await waitDialog(page, "确认将当前文档移入回收站吗？")
    await shot(page, `editor-confirm-${mode}`)
    await closeDialogByEsc(page)

    // ============ 3. share-confirm（「分享」按钮 → ShareDialog 内链接行删除） ============
    await page.locator("header").getByRole("button", { name: "分享", exact: true }).click()
    await waitDialog(page, "允许评论")
    // 链接列表在「更多分享设置」折叠区（advancedOpen 默认 false）
    await page.getByText("更多分享设置", { exact: true }).click()
    await page.locator(".el-dialog button.text-error").first().waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    await page.locator(".el-dialog button.text-error").first().click()
    await waitDialog(page, "删除分享链接")
    await shot(page, `share-confirm-${mode}`)
    await closeDialogByEsc(page)
    await closeDialogByEsc(page)

    // ============ 4. rename-input（树行 ⋯ 菜单「重命名」→ InputDialog） ============
    const treeRow = page.locator("[data-knowledge-tree-row]").filter({ hasText: DOC_TITLE }).first()
    await treeRow.getByTitle("更多操作", { exact: true }).click()
    await page.getByText("重命名", { exact: true }).first().click()
    await waitDialog(page, "重命名")
    await shot(page, `rename-input-${mode}`)
    await closeDialogByEsc(page)

    // ============ 5. layout-confirm（树行 ⋯ 菜单「删除」） ============
    await treeRow.getByTitle("更多操作", { exact: true }).click()
    await page.getByText("删除", { exact: true }).first().click()
    await waitDialog(page, `确认将「${DOC_TITLE}」移入回收站吗？`)
    await shot(page, `layout-confirm-${mode}`)
    await closeDialogByEsc(page)

    // ============ 6. trash-confirm（回收站「清空文档回收站」） ============
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "清空文档回收站" }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await page.getByRole("button", { name: "清空文档回收站" }).click()
    await waitDialog(page, "确认清空文档回收站吗？")
    await shot(page, `trash-confirm-${mode}`)
    await closeDialogByEsc(page)

    // ============ 7. docs-card-confirm（文档页签文档行「移入回收站」） ============
    await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByText("知识库信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "文档", exact: true }).click()
    await page.locator('[title="移入回收站"]').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.locator('[title="移入回收站"]').first().click()
    await waitDialog(page, "确认将「")
    await shot(page, `docs-card-confirm-${mode}`)
    await closeDialogByEsc(page)

    // ============ 8. member-confirm（成员页签非 owner 行删除钮） ============
    await page.getByRole("button", { name: "成员", exact: true }).click()
    await page.locator("article").filter({ hasText: MEMBER_EMAIL }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.locator("article").filter({ hasText: MEMBER_EMAIL }).locator("button.text-error").first().click()
    await waitDialog(page, "移除成员")
    await shot(page, `member-confirm-${mode}`)
    await closeDialogByEsc(page)

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

/* global MouseEvent, document */
/**
 * T4（解散 AppBadge / AppCard / AppTabs / AppShell）视觉基线/回归截图（明 / 暗两套）。
 *
 * 覆盖四件全部调用文件所在屏（AppBadge 9 文件 14 处 / AppCard 1 文件 2 处 /
 * AppTabs 1 处 / AppShell 2 处；BoardAiPanel:152 的 badge 依赖 AI 生成结果
 * （resultKind 运行时才有值），静态不可达，已记档——其映射与 AiModelConfigForm
 * 的 badge 完全同构，后者由 settings-ai-model 屏覆盖）：
 * - share：分享弹层（ShareLinksList 1 + ShareLinkRow 4 + ShareStatsGrid 1 = 6 处
 *   代码调用点、渲染 11+ 个 badge 实例（StatsGrid v-for），覆盖 neutral soft /
 *   neutral subtle / success subtle / warning subtle 全部变体）
 * - settings-ai-model：AI 模型配置分组（AiModelConfigForm 2 处 el-card + 1 处 badge
 *   warning subtle；2026-09-28 起原画板「模型配置」弹层迁入 /settings）
 * - versions：历史版本面板（DocumentVersionsPanel 2 + DocumentVersionRow 1 处 badge）
 * - settings-docs：知识库设置·文档（KnowledgeSettingsDocsCard 2 处 badge，含 published success）
 * - info：文档信息面板（DocumentInfoQuickActionsCard 1 处 badge，调用方 className 覆盖案例）
 * - trash：回收站（KnowledgeTrashTabs，AppTabs 唯一调用点）
 * - account：账号设置页（AccountView，AppShell 调用点）
 * - test：编辑器测试页（EditorTest，AppShell 调用点）
 *
 * 输出：output/visual/ep-direct/t4/{before|after}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t4.mjs before   （或 after）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（沿用 T2/T3 结论）：
 * - 文档 / 回收站文档 / 分享配置全部 ensure（找不到才创建），两轮复用同一批数据；
 * - 分享开关按 ensure 语义置 on（第一轮创建分享配置，第二轮直接复用渲染）；
 * - 版本行首开 settle-reload（Lake 规范化自动保存落定后再截）；
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

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t4"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T4 直用改造文档"
const PUBLISHED_DOC_TITLE = "T4 已发布文档"
const DOC_CONTENT =
  "# T4 直用改造文档\n\n用于解散 AppBadge / AppCard / AppTabs / AppShell 的像素对比。\n\n- 列表项一\n- 列表项二\n"
const PUBLISHED_CONTENT = "# T4 已发布文档\n\n用于设置页 status=success badge 对比。\n"

const roundName = process.argv[2]
if (!roundName || !["before", "after"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t4.mjs before|after")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T4:${roundName}]`, `✅ ${name}`)
}

/** 帧稳定截图：info 面板徽标偶发合成瞬态（两轮 after 间也差 775 major 的实测），
 *  截两帧比对，不一致则等待重截（最多 5 次） */
const shotStable = async (page, name) => {
  const path = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path })
  for (let i = 0; i < 5; i += 1) {
    await page.waitForTimeout(450)
    const next = `${path}.next.png`
    await page.screenshot({ path: next })
    const fs1 = fs.readFileSync(path)
    const fs2 = fs.readFileSync(next)
    if (fs1.equals(fs2)) {
      fs.unlinkSync(next)
      break
    }
    fs.renameSync(next, path)
    logStep(`[T4:${roundName}]`, `⚠️ ${name} 帧不稳定，已重截（第 ${i + 1} 次）`)
  }
  logStep(`[T4:${roundName}]`, `✅ ${name}（稳定帧）`)
}

/** 分享弹层：等加载 → 展开高级设置 → ensure 主分享开关 on（创建分享配置） */
const openShareDialogWithLink = async (page) => {
  await page.getByRole("button", { name: "分享", exact: true }).click()
  await page.getByText("开启分享").first().waitFor({ timeout: 15000 })

  // 展开高级设置（ShareStatsGrid / ShareLinksList 在高级区内）
  const advancedVisible = await page
    .getByText("新建分享配置")
    .first()
    .isVisible()
    .catch(() => false)
  if (!advancedVisible) {
    await page.locator('button:has-text("更多分享设置")').click()
    await page.getByText("新建分享配置").first().waitFor({ timeout: 15000 })
  }

  // ensure 分享开启（shareOn = 存在分享配置；off 则点主开关行创建）
  // 行结构：div.flex > (div.min-w-0 > p「开启分享」) + el-switch，文本父再多包一层；
  // 弹层内容超高时开关可能落在视口外，用 DOM 级点击绕过 actionability 检查
  const shareRow = page.getByText("开启分享", { exact: true }).locator("xpath=../..")
  const shareInput = shareRow.locator('input[role="switch"]')
  if ((await shareInput.getAttribute("aria-checked")) !== "true") {
    await shareRow.evaluate((el) =>
      el.querySelector(".el-switch")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    )
    await page.getByText("当前分享链接", { exact: true }).waitFor({ timeout: 15000 })
  }
  await page.getByText("当前分享链接", { exact: true }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T4:${roundName}:${mode}]`

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // 1. 数据准备（ensure 语义，两轮复用）
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T4 直用改造")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })
    const publishedDoc = await ensureDocument(kb.id, token, {
      title: PUBLISHED_DOC_TITLE,
      content: PUBLISHED_CONTENT,
      status: "published",
    })
    logStep(
      `[T4:${roundName}]`,
      `published 文档状态：${publishedDoc.status ?? "（接口未回传，按树内标题复用）"}`,
    )
    await ensureTrashedDocument(kb.id, token, {
      title: "T4 回收站文档",
      content: "# 回收站\n\n用于 T4 AppTabs 像素对比。",
    })

    // 数据预热：把「首开规范化自动保存」「首次创建分享」两件一次性事件提前到
    // 数据准备阶段，保证正式屏（share/versions）两轮的版本数与页面状态对称——
    // 否则 versions 屏的「共 N 条」badge 会因轮间 ±1 版本漂移产生数据性像素差
    // （实测：before 轮首次创建分享发生在 share 屏 → before/after 版本数 5/4）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3500)
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    await openShareDialogWithLink(page)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(800)

    // 2. share：分享弹层（8 处 badge：neutral soft/subtle + success subtle + warning subtle）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await openShareDialogWithLink(page)
    await shot(page, `share-${mode}`)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)

    // 3. versions：历史版本面板（3 处 badge）
    await page.locator('[title="历史版本"]').click()
    await page.getByText("支持回滚与对比").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200)
    await shot(page, `versions-${mode}`)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)

    // 4. info：文档信息面板（badge + 调用方 className 覆盖案例）
    //    面板展开后固定在右侧并遮挡工具栏，截完不关、直接 goto 下一屏；
    //    面板/徽标进场合成有逐轮瞬态（实测两轮 after 间也差 775 major），多等一拍
    await page.locator('[title="大纲"]').click()
    await page.getByText("快捷操作").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1800)
    await shotStable(page, `info-${mode}`)

    // 5. settings-docs：知识库设置·文档（2 处 badge，published → success）
    await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByText("概要", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "文档", exact: true }).click()
    await page.getByText("文档管理").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `settings-docs-${mode}`)

    // 6. trash：回收站（AppTabs 唯一调用点）
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByText("T4 回收站文档", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    await shot(page, `trash-${mode}`)

    // 7. settings-ai-model：AI 模型配置分组（2 处 el-card + 1 处 badge warning subtle；
    //    2026-09-28 起原画板「模型配置」弹层迁入 /settings）
    await page.goto(url("/settings"), { waitUntil: "domcontentloaded" })
    await page.getByText("当前配置").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200)
    await page
      .locator('[data-testid="settings-ai-model"]')
      .scrollIntoViewIfNeeded()
      .catch(() => {})
    await page.waitForTimeout(400)
    await shot(page, `settings-ai-model-${mode}`)

    // 8. account：账号设置页（AppShell 调用点）
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.getByText("基本信息", { exact: true }).first().waitFor({ timeout: 15000 })
    // 保存按钮可能短暂进入 loading（spinner 旋转逐帧变化是截图噪声源），等其落定
    await page
      .waitForFunction(
        () => {
          const busy = document.querySelector('[class*="animate-spin"]')
          return !busy
        },
        { timeout: 15000 },
      )
      .catch(() => {})
    await page.waitForTimeout(600)
    await shot(page, `account-${mode}`)

    // 9. test：编辑器测试页（AppShell 调用点，Lake 编辑器固定内容）
    await page.goto(url("/test"), { waitUntil: "domcontentloaded" })
    await page.getByText("语雀编辑器测试").waitFor({ timeout: 20000 })
    await page.waitForTimeout(2500)
    await shot(page, `test-${mode}`)

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 截图失败：`, error)
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

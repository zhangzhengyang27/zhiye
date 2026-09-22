/**
 * EP 迁移前视觉基线补充截图（明 / 暗两套）。
 *
 * 覆盖：登录页 / 账户设置 / 工作区（树 + 文档列表）/ 编辑页 /
 *       移动节点弹窗 / 新建知识库弹窗，共 6 屏 × 2 主题。
 * 输出：output/visual/ep-migration/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-ep-baseline.mjs（需 4173 preview + 后端 3200 在跑）
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
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const OUT_DIR = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-migration"
const VIEWPORT = { width: 1247, height: 952 }
const CONTENT =
  "# EP 迁移基线文档\n\n用于 Element Plus 迁移前后的像素对比。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

// 每次运行先清空输出目录：基线对比不允许残留上一轮的旧 PNG（新混旧无法区分）
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep("[EP基线]", `✅ ${name}`)
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[EP基线:${mode}]`
  const failures = []

  // 首屏内联脚本读 localStorage（key: vueuse-color-scheme）决定 <html> 是否带 .dark；
  // 亮色显式写 light，避免跟随系统 prefers-color-scheme 造成不确定性。
  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light"
  )

  const url = path => new URL(path, smokeConfig.baseUrl).toString()

  try {
    // 1. 登录页（未登录态直接访问，fresh context 无会话）
    await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    await shot(page, `login-${mode}`)

    // 2. 登录并准备基线知识库 / 文档
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace 编辑器工具栏验证")
    const doc = await ensureDocument(kb.id, token, { title: "EP 迁移基线验证", content: CONTENT })
    await apiRequest(`/knowledge/documents/${doc.id}`, {
      method: "PATCH",
      token,
      body: { content: { scheme: "text/markdown", value: CONTENT } },
      errorMessage: "写入基线文档内容失败",
    })

    // 3. 账户设置
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    await shot(page, `account-${mode}`)

    // 4. 工作区（树 + 文档列表视图 = KB 首页）
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1800)
    await shot(page, `workspace-${mode}`)

    // 5. 编辑页
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
    await page.waitForTimeout(1500)
    await shot(page, `editor-${mode}`)

    // 6. 移动节点弹窗：树行右键 → 菜单「移动...」→ KnowledgeMoveNodeDialog
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    try {
      let row = page.locator(`#knowledge-tree-node-${doc.id}`)
      if (!(await row.isVisible().catch(() => false))) {
        // 文档行不可见（折叠等）时退化为第一行可见树节点，弹窗形态一致
        row = page.locator("[data-knowledge-tree-row]").first()
      }
      await row.click({ button: "right" })
      await page.getByRole("menuitem", { name: "移动..." }).click()
      await page.locator('[role="dialog"]').filter({ hasText: "移动至" }).waitFor({ state: "visible", timeout: 10_000 })
      await page.waitForTimeout(800)
      await shot(page, `move-dialog-${mode}`)
      await page.keyboard.press("Escape")
    } catch (error) {
      failures.push(`move-dialog-${mode}: ${error.message}`)
      logStep(prefix, `⚠️ 移动节点弹窗触发失败：${error.message}`)
    }

    // 7. 新建知识库弹窗：侧栏「+」→「创建知识库」→ KnowledgeCreateKbDialog
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1200)
    try {
      await page.locator(".kb-sidebar button[title='新建']").click()
      await page.getByRole("button", { name: "创建知识库" }).click()
      await page
        .locator('[role="dialog"]')
        .filter({ hasText: "新建知识库" })
        .waitFor({ state: "visible", timeout: 10_000 })
      await page.waitForTimeout(800)
      await shot(page, `create-kb-dialog-${mode}`)
      await page.keyboard.press("Escape")
    } catch (error) {
      failures.push(`create-kb-dialog-${mode}: ${error.message}`)
      logStep(prefix, `⚠️ 新建知识库弹窗触发失败：${error.message}`)
    }
  } finally {
    await browser.close()
  }

  return failures
}

const allFailures = []
for (const mode of ["light", "dark"]) {
  allFailures.push(...(await capturePass(mode)))
}

if (allFailures.length > 0) {
  logStep("[EP基线]", `❌ ${allFailures.length} 项失败：\n- ${allFailures.join("\n- ")}`)
  process.exit(1)
}

logStep("[EP基线]", `🎉 明暗两套共 12 屏已输出到 ${OUT_DIR}`)

/**
 * Task 3.1 专项：AppDialog 换底 el-dialog 后的弹窗截图（明/暗两套）。
 *
 * 与 visual-capture-ep-baseline.mjs 的第 6/7 步同流程（移动节点弹窗 + 新建知识库
 * 弹窗），但只输出这两屏到 task-3.1/after/，不清空基线目录（基线 PNG 不能动）。
 * 用法：node scripts/visual-capture-task-3.1.mjs（需 4173 preview + 后端 3200 在跑）
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

const OUT_DIR =
  process.env.TASK31_OUT_DIR || "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-migration/task-3.1/after"
const VIEWPORT = { width: 1247, height: 952 }
const CONTENT =
  "# EP 迁移基线文档\n\n用于 Element Plus 迁移前后的像素对比。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep("[Task3.1]", `✅ ${name}`)
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[Task3.1:${mode}]`
  const failures = []

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light"
  )

  const url = path => new URL(path, smokeConfig.baseUrl).toString()

  try {
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

    // 1. 移动节点弹窗
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    try {
      let row = page.locator(`#knowledge-tree-node-${doc.id}`)
      if (!(await row.isVisible().catch(() => false))) {
        row = page.locator("[data-knowledge-tree-row]").first()
      }
      await row.click({ button: "right" })
      await page.getByRole("menuitem", { name: "移动..." }).click()
      await page.locator('[role="dialog"]').filter({ hasText: "移动至" }).waitFor({ state: "visible", timeout: 10_000 })
      await page.waitForTimeout(800)
      await shot(page, `move-dialog-${mode}`)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
    } catch (error) {
      failures.push(`move-dialog-${mode}: ${error.message}`)
      logStep(prefix, `⚠️ 移动节点弹窗触发失败：${error.message}`)
    }

    // 2. 新建知识库弹窗
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
  logStep("[Task3.1]", `❌ ${allFailures.length} 项失败：\n- ${allFailures.join("\n- ")}`)
  process.exit(1)
}

logStep("[Task3.1]", `🎉 明暗两套共 4 屏已输出到 ${OUT_DIR}`)

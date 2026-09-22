/**
 * Task 3.3 专项：AppDropdownMenu 换底 el-dropdown 的像素对比截图（明/暗两套）。
 *
 * 与 Task 3.1 的 visual-capture-task-3.1.mjs 同思路：同一脚本分别跑在「迁移前
 * （自绘 floating-ui 版）」与「迁移后（EP 版）」构建上，产出同场景同命名的
 * before/after 截图对，供 visual-pixdiff.mjs 做双口径对比。场景：
 *  1. start-closed-*：开始页「类型」筛选触发器闭态（clip 裁剪到按钮区域）；
 *  2. start-open-*：开始页「类型」筛选菜单展开（菜单面板元素截图）；
 *  3. editor-open-*：编辑器「更多操作」菜单展开（分组/分组标题/子菜单父项）；
 *  4. editor-submenu-*：「复制与打开」子菜单展开态。
 *
 * 开态场景先铺一层 z-400 的纯色遮罩（压住列表数据、垫平圆角四角的页面背景），
 * 再对菜单面板元素截图——面板两版分别落在自绘 div[role=menu] 与 .el-popper 上，
 * 元素截图只取面板盒，排除背景数据漂移噪声。
 *
 * 用法：node scripts/visual-capture-task-3.3.mjs（需 4173 preview + 后端 3200 在跑）
 * 环境变量 TASK33_OUT_DIR 可覆盖输出目录（before/after 各跑一轮）。
 */
import fs from "node:fs"
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const OUT_DIR =
  process.env.TASK33_OUT_DIR ||
  "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-migration/task-3.3/after"
const VIEWPORT = { width: 1247, height: 952 }
const CONTENT =
  "# EP 迁移基线文档\n\n用于 AppDropdownMenu 换底前后的像素对比。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

/** 菜单展开后等动画（EP el-zoom-in-top ~0.3s；自绘版无动画，等待幂等）与定位稳定 */
const settleMenu = async (page) => {
  await page.waitForTimeout(600)
}

/** 开态元素截图的去噪：把 #app 整体 visibility:hidden（页面内容与数据漂移全部隐去，
    菜单 teleport 在 body 下不受影响、布局照旧），面板盒四角露出的是 body 底色，明暗
    两轮都确定。菜单面板自绘版是 div[role=menu]，EP 版是 .el-popper。 */
const panelWithHiddenApp = async (page) => {
  await page.evaluate(() => {
    const app = globalThis.document.getElementById("app")
    if (app) {
      app.style.visibility = "hidden"
    }
  })

  const panel = page.locator(".kb-el-dropdown-popper").first()
  if (await panel.isVisible().catch(() => false)) {
    return panel
  }

  return page.locator("div[role='menu']").first()
}

const restoreApp = async (page) => {
  await page.evaluate(() => {
    const app = globalThis.document.getElementById("app")
    if (app) {
      app.style.visibility = ""
    }
  })
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[Task3.3:${mode}]`
  const failures = []

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  const url = (path) => new URL(path, smokeConfig.baseUrl).toString()

  try {
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace 编辑器工具栏验证")
    const doc = await ensureDocument(kb.id, token, { title: "EP 迁移基线验证", content: CONTENT })

    // 1/2. 开始页：闭态触发器 + 类型筛选菜单展开
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    try {
      const typeTrigger = page.getByRole("button", { name: /类型:/ })
      await typeTrigger.waitFor({ state: "visible", timeout: 10_000 })
      const box = await typeTrigger.boundingBox()
      if (!box) throw new Error("筛选触发器不可定位")
      // 闭态：裁剪到类型触发器按钮附近（行内布局 + 周边留白），页头区域无数据漂移
      await page.screenshot({
        path: `${OUT_DIR}/start-closed-${mode}.png`,
        clip: {
          x: Math.max(0, box.x - 12),
          y: Math.max(0, box.y - 10),
          width: Math.min(VIEWPORT.width - Math.max(0, box.x - 12), 360),
          height: 44,
        },
      })
      logStep("[Task3.3]", `✅ start-closed-${mode}`)

      await typeTrigger.click()
      await page.locator("[role='menu']").first().waitFor({ state: "visible", timeout: 5000 })
      await settleMenu(page)
      const panel = await panelWithHiddenApp(page)
      await panel.screenshot({ path: `${OUT_DIR}/start-open-${mode}.png` })
      logStep("[Task3.3]", `✅ start-open-${mode}`)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
    } catch (error) {
      failures.push(`start-${mode}: ${error.message}`)
      logStep(prefix, `⚠️ 开始页菜单截图失败：${error.message}`)
    }

    // 3/4. 编辑器：更多操作菜单展开 + 子菜单展开
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    try {
      // 文档树的行内 hover 按钮也叫「更多操作」，用 header 限定到编辑器顶栏触发器
      const moreTrigger = page.locator("header").first().getByRole("button", { name: "更多操作" })
      await moreTrigger.waitFor({ state: "visible", timeout: 15_000 })
      await moreTrigger.click()
      await page.locator("[role='menu']").first().waitFor({ state: "visible", timeout: 5000 })
      await settleMenu(page)
      const panel = await panelWithHiddenApp(page)
      await panel.screenshot({ path: `${OUT_DIR}/editor-open-${mode}.png` })
      logStep("[Task3.3]", `✅ editor-open-${mode}`)

      await page.getByRole("menuitem", { name: "复制与打开" }).first().click()
      await page
        .getByRole("menuitem", { name: "复制标题链接" })
        .first()
        .waitFor({ state: "visible", timeout: 5000 })
      await settleMenu(page)
      const panel2 = await panelWithHiddenApp(page)
      await panel2.screenshot({ path: `${OUT_DIR}/editor-submenu-${mode}.png` })
      logStep("[Task3.3]", `✅ editor-submenu-${mode}`)
      await restoreApp(page)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
    } catch (error) {
      failures.push(`editor-${mode}: ${error.message}`)
      logStep(prefix, `⚠️ 编辑器菜单截图失败：${error.message}`)
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
  logStep("[Task3.3]", `❌ ${allFailures.length} 项失败：\n- ${allFailures.join("\n- ")}`)
  process.exit(1)
}

logStep("[Task3.3]", `🎉 明暗两套共 8 屏已输出到 ${OUT_DIR}`)

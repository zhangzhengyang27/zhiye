/**
 * T2（解散 AppCheckbox 试点）视觉基线/回归截图（明 / 暗两套）。
 *
 * 覆盖 AppCheckbox 全部 3 个调用文件所在屏：
 * - 登录页（LoginView：2 处带 label 文案的 checkbox）
 * - 回收站（KnowledgeTrashDocRow：行内裸 checkbox）
 * - 文档版本面板（DocumentVersionRow：行内裸 checkbox，mt-1）
 *
 * 输出：output/visual/ep-direct/t2/{before|after}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t2.mjs before   （或 after）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（实测踩坑，before/after 两轮必须同构）：
 * - 文档用 ensure（按标题找不到才创建），两轮复用同一份文档：版本行的 createdAt
 *   时间文本与回收站行的 deletedAt 时间文本是逐轮重建无法对齐的噪声源（分钟位
 *   不同即像素差），复用后归零；首轮打开若触发 Lake 规范化自动保存，settle-reload
 *   让截图发生在保存落定之后，第二轮打开内容已幂等、不会再变；
 * - 面板 overlay 带 backdrop-blur，截图前等 ≥1.5s 让合成稳定；
 * - before/after 两轮必须在同一端口拍；
 * - 每轮先清空目标目录，防止新旧 PNG 混排。
 */
import fs from "node:fs"
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  ensureTrashedDocument,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t2"
const VIEWPORT = { width: 1247, height: 952 }
const CONTENT =
  "# T2 版本基线文档\n\n用于解散 AppCheckbox 的像素对比。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

const roundName = process.argv[2]
if (!roundName || !["before", "after"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t2.mjs before|after")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T2:${roundName}]`, `✅ ${name}`)
}

/** 打开版本面板并等版本行渲染（DocumentVersionRow 特有文案） */
const openVersionsPanel = async (page) => {
  await page.locator('[title="历史版本"]').click()
  await page.getByText("支持回滚与对比").first().waitFor({ timeout: 15000 })
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T2:${roundName}:${mode}]`

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // 1. 登录页（未登录态直接访问，fresh context 无会话）
    await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    await shot(page, `login-${mode}`)

    // 2. 准备数据：ensure 语义（找不到才建），两轮复用同一份文档与回收站文档
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T2 校准试点")
    const doc = await ensureDocument(kb.id, token, { title: "T2 校准试点文档", content: CONTENT })
    await ensureTrashedDocument(kb.id, token, {
      title: "T2 回收站校准文档",
      content: "# 回收站\n\n用于 T2 回收站 checkbox 像素对比。",
    })

    // 3. 回收站
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByText("T2 回收站校准文档", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await shot(page, `trash-${mode}`)

    // 4. 版本面板：首开可能触发规范化自动保存 → 刷新后二开，数据稳定再截
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await openVersionsPanel(page)
    await page.waitForTimeout(800)
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await openVersionsPanel(page)
    await page.waitForTimeout(1500)
    await shot(page, `versions-${mode}`)

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

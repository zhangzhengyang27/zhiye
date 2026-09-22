/**
 * T7（解散 AppDropdownMenu，2 文件 4 处）视觉基线/回归截图（明 / 暗两套）。
 *
 * dropdown 是「弹层组件」：收起态 + 展开态全覆盖，子菜单展开态是视觉重点：
 * - start：开始页（KnowledgeStartView 3 个筛选：类型/归属/创建者——收起 + 各自展开态）
 * - editor-menu：编辑器「更多操作」⋯（KnowledgeDocEditorView）——收起 + 展开 +
 *   5 个子菜单各自展开（打开右侧面板/历史版本与对比/复制与打开/所在空间/导出与打印，
 *   面板内展开缩进二级形态）。文档仅 1 个版本：「对比历史版本」呈禁用态（顺带覆盖
 *   禁用项视觉）。
 *
 * 输出：output/visual/ep-direct/t7/{before|after}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t7.mjs before   （或 after / after2）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（沿用 T2-T6 结论）：KB / 文档全部 ensure（找不到才创建），两轮复用
 * 同一批数据；文档不做版本追加（保持「对比历史版本」禁用态稳定）；全部数据 ensure
 * 先于所有截图（T6 记录 a：截图顺序数据漂移会造出大面积假 major）；编辑器先开一次
 * 等 settle 再 reload（T2 记录 f：Lake 编辑器首次打开原始 markdown 会规范化内容并
 * 触发自动保存，isDirty/pendingSaveRequest 会改菜单项文案）。
 */
import fs from "node:fs"
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t7"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T7 直用改造文档"
const DOC_CONTENT = "# T7 直用改造文档\n\n用于解散 AppDropdownMenu 的像素对比。\n"

const roundName = process.argv[2]
if (!roundName || !["before", "after", "after2"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t7.mjs before|after|after2")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T7:${roundName}]`, `✅ ${name}`)
}

/** 等待当前打开的 dropdown 弹层出现（aria-hidden=false 收窄；动画 settle 由调用方控制） */
const waitDropdownPopper = (page) =>
  page
    .locator('.el-dropdown__popper[aria-hidden="false"]')
    .waitFor({ state: "visible", timeout: 10000 })

const closeDropdown = async (page) => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T7:${roundName}:${mode}]`

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // 1. 数据准备（ensure 语义，两轮复用；先于所有截图——T6 记录 a）
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const contentKb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T7 内容库")
    const doc = await ensureDocument(contentKb.id, token, {
      title: DOC_TITLE,
      content: DOC_CONTENT,
    })

    // 2. start：开始页 3 个筛选（收起 + 各自展开）
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("文档", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `start-${mode}`)

    const filterTriggers = [
      { name: "type", locator: page.getByRole("button", { name: /^类型: / }) },
      { name: "kb", locator: page.getByRole("button", { name: /^归属：/ }) },
      { name: "creator", locator: page.getByRole("button", { name: /^创建者：/ }) },
    ]
    for (const trigger of filterTriggers) {
      await trigger.locator.click()
      await waitDropdownPopper(page)
      await page.waitForTimeout(450)
      await shot(page, `start-${trigger.name}-expanded-${mode}`)
      await closeDropdown(page)
    }

    // 3. editor：更多操作菜单（收起 + 展开 + 5 个子菜单各自展开）
    //    先开一次等 settle 再 reload：Lake 编辑器首开原始 markdown 触发自动保存，
    //    isDirty/pendingSaveRequest 会改菜单项文案（T2 记录 f）
    await page.goto(url(`/knowledge/${contentKb.id}/doc/${doc.id}`), {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(3000)
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    // ⚠️ 树行 hover 按钮同名（更多操作），必须以编辑器 header 容器收窄
    const editorMoreTrigger = page.locator("header").locator('[title="更多操作"]')
    await editorMoreTrigger.click()
    await waitDropdownPopper(page)
    await page.waitForTimeout(450)
    await shot(page, `editor-menu-expanded-${mode}`)
    await closeDropdown(page)

    // 5 个子菜单逐个展开（面板内缩进二级形态）；每次重新打开菜单后展开一个父项
    const subMenuParents = [
      { name: "sub-panels", label: /打开右侧面板|切换右侧面板/ },
      { name: "sub-versions", label: "历史版本与对比" },
      { name: "sub-copy", label: "复制与打开" },
      { name: "sub-space", label: "所在空间" },
      { name: "sub-export", label: "导出与打印" },
    ]
    for (const parent of subMenuParents) {
      await editorMoreTrigger.click()
      await waitDropdownPopper(page)
      await page.waitForTimeout(450)
      await page
        .locator('.el-dropdown__popper[aria-hidden="false"] .el-dropdown-menu__item')
        .filter({ hasText: parent.label })
        .first()
        .click()
      await page.waitForTimeout(450)
      await shot(page, `editor-menu-${parent.name}-${mode}`)
      await closeDropdown(page)
    }

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

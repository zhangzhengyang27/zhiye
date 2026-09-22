/**
 * T3（解散 AppSwitch / AppRadioGroup / AppTextarea）视觉基线/回归截图（明 / 暗两套）。
 *
 * 覆盖三个组件全部 5 个调用文件所在屏：
 * - share：文档编辑器「分享」弹层（ShareDialog 3 处 switch + ShareCreateForm 的
 *   list 变体 radio、带图标 switch、segmented 变体 radio）
 * - style：文档编辑器「样式设置」弹层（DocumentStyleSettingsDialog segmented，w-full）
 * - board：画板编辑器 AI 面板（BoardAiPanel 的 AppTextarea + segmented 变体 radio）
 * - createkb：开始页「新建知识库」弹层（KnowledgeCreateKbDialog 的 AppTextarea）
 *
 * 输出：output/visual/ep-direct/t3/{before|after}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t3.mjs before   （或 after）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（沿用 T2 结论）：
 * - KB / 文档 / 画板全部 ensure（找不到才创建），两轮复用同一批数据；
 * - 「允许评论」开关状态按 ensure 语义置 on（localStorage 记忆使两轮终态一致）；
 *   分享主开关保持 off（off 会让开启分享走创建 API，链接噪声大，且 on 态配色
 *   已由「允许评论」覆盖）；
 * - 每轮先清空目标目录，防止新旧 PNG 混排；before/after 两轮同一端口。
 */
import fs from "node:fs"
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  flattenTree,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t3"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T3 直用改造文档"
const BOARD_TITLE = "T3 直用改造画板"
const DOC_CONTENT =
  "# T3 直用改造文档\n\n用于解散 AppSwitch / AppRadioGroup / AppTextarea 的像素对比。\n\n- 列表项一\n- 列表项二\n"

const roundName = process.argv[2]
if (!roundName || !["before", "after"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t3.mjs before|after")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T3:${roundName}]`, `✅ ${name}`)
}

/** ensure 画板文档：type=doc + editorType=board + excalidraw 空场景（与 UI 新建画板同构） */
const ensureBoardDocument = async (kbId, token, title) => {
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kbId)}`, {
    token,
    errorMessage: "读取文档树失败",
  })
  const existed = flattenTree(Array.isArray(tree) ? tree : []).find(node => node.type === "doc" && node.title === title)
  if (existed) {
    return existed
  }

  return apiRequest("/knowledge/documents", {
    method: "POST",
    token,
    body: {
      kbId,
      title,
      type: "doc",
      editorType: "board",
      status: "draft",
      parentId: null,
      content: {
        scheme: "application/vnd.excalidraw+json",
        value: {
          type: "excalidraw",
          version: 2,
          source: "xiaoye",
          elements: [],
          appState: { viewBackgroundColor: "#fcfbf8", zoom: { value: 1 } },
          files: {},
        },
      },
    },
    errorMessage: "创建画板文档失败",
  })
}

/** 分享弹层：等加载 → 「允许评论」ensure on（覆盖 switch 选中态）→ 展开高级设置 */
const openShareDialogFully = async page => {
  await page.getByRole("button", { name: "分享", exact: true }).click()
  await page.getByText("开启分享").first().waitFor({ timeout: 15000 })

  const commentRow = page.getByText("允许评论", { exact: true }).locator("xpath=..")
  const commentInput = commentRow.locator('input[role="switch"]')
  if ((await commentInput.getAttribute("aria-checked")) !== "true") {
    await commentRow.locator("xpath=./*[last()]").click()
    await page.waitForTimeout(400)
  }
  if ((await commentInput.getAttribute("aria-checked")) !== "true") {
    throw new Error("允许评论开关未能置为开")
  }

  await page.locator('button:has-text("更多分享设置")').click()
  await page.getByText("新建分享配置").first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(900)
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T3:${roundName}:${mode}]`

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light"
  )

  const url = path => new URL(path, "http://127.0.0.1:4173").toString()

  try {
    // 1. 数据准备（ensure 语义，两轮复用）
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T3 直用改造")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })
    const board = await ensureBoardDocument(kb.id, token, BOARD_TITLE)

    // 2. share：分享弹层（switch 开/关两态 + list radio + 带图标 switch + segmented）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await openShareDialogFully(page)
    await shot(page, `share-${mode}`)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)

    // 3. style：样式设置弹层（segmented，w-full）
    await page.locator('button[title="样式设置"]').click()
    await page.getByText("正文字号").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `style-${mode}`)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)

    // 4. board：画板编辑器 AI 面板（textarea + segmented）
    await page.goto(url(`/knowledge/${kb.id}/board/${board.id}`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "AI 生成", exact: true }).waitFor({ timeout: 20000 })
    await page.getByRole("button", { name: "AI 生成", exact: true }).click()
    await page.getByText("需求描述").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1500)
    await shot(page, `board-${mode}`)

    // 5. createkb：开始页新建知识库弹层（textarea）
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByText("新建知识库", { exact: true }).first().click()
    await page.getByText("知识库名称").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `createkb-${mode}`)

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

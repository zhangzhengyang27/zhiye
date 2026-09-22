/**
 * T6（解散 AppSelect，8 文件 10 处）视觉基线/回归截图（明 / 暗两套）。
 *
 * select 是「弹层组件」：每个调用点至少一张默认态 + 一张展开态（popper 是视觉重点）。
 * 覆盖全部调用文件所在屏：
 * - boards：画板视图（KnowledgeFilterToolbar，「全部知识库」哨兵 + min-w-45/transition duration-200 覆盖）
 * - trash：回收站（KnowledgeTrashToolbar，全仓唯一 @change，min-w-45 覆盖）
 * - search：搜索页（KnowledgeSearchToolbar 状态筛选，h-8 rounded-xl px-2 py-1 text-xs 覆盖案例）
 * - settings-members：设置·成员卡（KnowledgeSettingsMembersCard 角色选择，editor 成员行）
 * - add-member：添加成员弹窗（KnowledgeSettingsAddMemberDialog 角色选择 w-full bg-surface）
 * - doc-create：新建文档弹层（KnowledgeDocCreateDialog 所属目录——空值哨兵唯一用户，
 *   默认态必须覆盖「根目录」回显；弹层内含真实子目录时展开态展示目录项）
 * - version-compare：版本对比弹层（VersionCompareDialog 版本 1/版本 2 双 select，
 *   初始预选最新两版 + placeholder 分支）
 * - board-config：模型配置弹层（BoardAiConfigForm 服务商 + DeepSeek 模型 2 处 bg-surface）
 *
 * 输出：output/visual/ep-direct/t6/{before|after}/{page}-{light|dark}.png
 * 用法：node scripts/visual-capture-t6.mjs before   （或 after）
 * 前置：4173 preview（serve dist 快照）+ 后端 3200 在跑。
 *
 * 数据确定性（沿用 T2-T5 结论）：KB / 文档 / 画板 / 回收站文档 / 成员全部 ensure
 * （找不到才创建），两轮复用同一批数据；版本对比依赖文档已有 ≥2 版本（不足时
 * PUT 更新一次内容补齐，两轮不再变化）；doc-create 经目录树头部「新建内容」菜单
 * 打开（侧栏菜单有同名项，须以菜单容器收窄）。
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

const ROOT = "/Users/xiaoye/Desktop/AI/知识库/xiaoye/output/visual/ep-direct/t6"
const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T6 直用改造文档"
const DOC_CONTENT =
  "# T6 直用改造文档\n\n用于解散 AppSelect 的像素对比。\n\n- 列表项一\n- 列表项二\n"

const roundName = process.argv[2]
if (!roundName || !["before", "after", "after2"].includes(roundName)) {
  console.error("用法：node scripts/visual-capture-t6.mjs before|after")
  process.exit(1)
}

const OUT_DIR = `${ROOT}/${roundName}`
fs.rmSync(OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  logStep(`[T6:${roundName}]`, `✅ ${name}`)
}

/** 关闭当前打开的 AppDialog（Esc 一发 + 兜底再一发） */
const closeDialog = async (page) => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)
}

/**
 * 展开一个 select 触发器并等待 popper 出现（弹出动画 settle 后截图由调用方完成）。
 * scope：收窄选择器范围的 locator（默认整页第一个 .el-select）。
 */
const openSelect = async (page, scope) => {
  const select = scope ?? page.locator(".el-select").first()
  await select.locator(".el-select__wrapper").click()
  // EP 关闭后的 popper 仍挂载在 DOM（persistent），必须以 aria-hidden=false 收窄当前弹层
  await page
    .locator('.el-select__popper[aria-hidden="false"]')
    .waitFor({ state: "visible", timeout: 10000 })
  await page.waitForTimeout(450)
}

/** 关闭展开的 select popper（Esc 只关弹层，EP 捕获语义；随后由调用方关弹窗/切屏） */
const closeSelect = async (page) => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(350)
}

/** 确保文档有 ≥2 个历史版本（版本对比弹层前置；不足时更新一次内容补版本） */
const ensureTwoVersions = async (docId, token, prefix) => {
  const versions = await apiRequest(`/knowledge/documents/${docId}/versions`, {
    token,
    errorMessage: "读取版本列表失败",
  })
  const list = Array.isArray(versions) ? versions : []
  if (list.length >= 2) {
    logStep(prefix, `文档已有 ${list.length} 个版本，复用`)
    return
  }
  await apiRequest(`/knowledge/documents/${docId}`, {
    method: "PATCH",
    token,
    body: {
      content: { scheme: "text/markdown", value: `${DOC_CONTENT}\n\n- 追加行（补版本）\n` },
      message: "T6 补版本",
    },
    errorMessage: "更新文档补版本失败",
  })
  logStep(prefix, "已更新文档内容补足版本")
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T6:${roundName}:${mode}]`

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
    const contentKb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T6 内容库")
    const doc = await ensureDocument(contentKb.id, token, {
      title: DOC_TITLE,
      content: DOC_CONTENT,
    })
    await ensureTrashedDocument(contentKb.id, token, {
      title: "T6 回收站文档",
      content: "# 回收站\n\n用于 T6 AppSelect 像素对比。",
    })
    await ensureTwoVersions(doc.id, token, prefix)

    // 确保画板文档存在（board-config 屏 + 树节点/画板卡数据两轮对称；
    // ⚠️ 必须 be 在所有截图之前 ensure：before 首轮树里没有画板会造成
    // 「截图顺序数据漂移」，before/after 树内容不同 → pixdiff 大面积假 major）
    const findBoard = async () => {
      const tree = await apiRequest(
        `/knowledge/documents/tree?kbId=${encodeURIComponent(contentKb.id)}`,
        {
          token,
          errorMessage: "读取文档树失败",
        },
      )
      return flattenTree(Array.isArray(tree) ? tree : []).find(
        (node) => node.type === "doc" && node.title === "T6 直用改造画板",
      )
    }
    let board = await findBoard()
    if (!board) {
      await apiRequest("/knowledge/documents", {
        method: "POST",
        token,
        body: {
          kbId: contentKb.id,
          title: "T6 直用改造画板",
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
      board = await findBoard()
    }

    // 确保有一个非 owner 成员（MembersCard 只对非 owner 渲染角色选择）
    await apiRequest(`/knowledge/knowledge-bases/${contentKb.id}/members`, {
      method: "POST",
      token,
      body: { email: "editor@example.com", role: "reader" },
      errorMessage: "",
    }).catch(() => logStep(prefix, "成员已存在（跳过添加）"))

    // 2. boards：画板视图（FilterToolbar select）
    await page.goto(url("/knowledge/boards"), { waitUntil: "domcontentloaded" })
    await page.getByText("画板", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `boards-${mode}`)
    await openSelect(page)
    await shot(page, `boards-expanded-${mode}`)
    await closeSelect(page)

    // 3. trash：回收站（TrashToolbar select）
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByText("T6 回收站文档", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    await shot(page, `trash-${mode}`)
    await openSelect(page)
    await shot(page, `trash-expanded-${mode}`)
    await closeSelect(page)

    // 4. search：搜索页（SearchToolbar 状态筛选 select）
    await page.goto(url(`/knowledge/${contentKb.id}/search`), { waitUntil: "domcontentloaded" })
    await page.getByText("创建时间", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await shot(page, `search-${mode}`)
    await openSelect(page)
    await shot(page, `search-expanded-${mode}`)
    await closeSelect(page)

    // 5. settings-members：设置·成员卡（MembersCard 角色选择）
    await page.goto(url(`/knowledge/${contentKb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "设置", exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "设置", exact: true }).click()
    await page.getByText("知识库信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "成员", exact: true }).click()
    await page.getByText("添加成员", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.locator(".el-select").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(700)
    await shot(page, `settings-members-${mode}`)
    await openSelect(page)
    await shot(page, `settings-members-expanded-${mode}`)
    await closeSelect(page)

    // 6. add-member：添加成员弹窗（AddMemberDialog 角色选择）
    //    ⚠️ 弹窗后面成员卡也有 .el-select（DOM 序在前），必须以弹窗容器收窄
    await page.getByRole("button", { name: "添加成员", exact: true }).click()
    await page.getByText("邮箱地址", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `add-member-${mode}`)
    await openSelect(
      page,
      page.locator(".el-dialog").filter({ hasText: "邮箱地址" }).locator(".el-select"),
    )
    await shot(page, `add-member-expanded-${mode}`)
    await closeSelect(page)
    await closeDialog(page)

    // 7. doc-create：新建文档弹层（DocCreateDialog 所属目录——哨兵唯一用户，根目录回显）
    //    ⚠️ 侧栏头部菜单也有同名项，必须以 [title=新建内容] 的兄弟菜单容器收窄
    const headerCreateMenu = page
      .locator('[title="新建内容"]')
      .locator("xpath=following-sibling::div")
    await page.getByRole("button", { name: "新建内容", exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByText("所属目录", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await shot(page, `doc-create-${mode}`)
    // ⚠️ 弹窗后面（设置页）成员卡也有 .el-select（DOM 序在前），必须以弹窗容器收窄
    await openSelect(
      page,
      page.locator(".el-dialog").filter({ hasText: "所属目录" }).locator(".el-select"),
    )
    await shot(page, `doc-create-expanded-${mode}`)
    await closeSelect(page)
    await closeDialog(page)

    // 8. version-compare：版本对比弹层（VersionCompareDialog 双 select，预选最新两版）
    await page.goto(url(`/knowledge/${contentKb.id}/doc/${doc.id}`), {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(3500)
    await page.locator('[title="历史版本"]').click()
    await page.getByText("支持回滚与对比").first().waitFor({ timeout: 15000 })
    await page.locator('button[title="打开版本对比"]').click()
    await page.getByText("版本 1（旧版本）", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await shot(page, `version-compare-${mode}`)
    const compareSelects = page.locator(".el-select")
    await openSelect(page, compareSelects.nth(0))
    await shot(page, `version-compare-expanded-v1-${mode}`)
    await closeSelect(page)
    await openSelect(page, compareSelects.nth(1))
    await shot(page, `version-compare-expanded-v2-${mode}`)
    await closeSelect(page)
    await closeDialog(page)

    // 9. board-config：模型配置弹层（BoardAiConfigForm 服务商 + 模型 2 处 select；
    //    画板已在数据准备阶段 ensure）
    await page.goto(url(`/knowledge/${contentKb.id}/board/${board?.id ?? ""}`), {
      waitUntil: "domcontentloaded",
    })
    await page.getByRole("button", { name: "模型配置", exact: true }).waitFor({ timeout: 30000 })
    await page.getByRole("button", { name: "模型配置", exact: true }).click()
    await page.getByText("当前配置", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200)
    await shot(page, `board-config-${mode}`)
    const configSelects = page.locator(".el-select")
    await openSelect(page, configSelects.nth(0))
    await shot(page, `board-config-expanded-provider-${mode}`)
    await closeSelect(page)
    const modelVisible = await configSelects
      .nth(1)
      .isVisible()
      .catch(() => false)
    if (modelVisible) {
      await openSelect(page, configSelects.nth(1))
      await shot(page, `board-config-expanded-model-${mode}`)
      await closeSelect(page)
    } else {
      logStep(prefix, "模型 select 未渲染（provider 非 deepseek），跳过模型展开态")
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

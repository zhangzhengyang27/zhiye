/* global document, getComputedStyle, HTMLInputElement, KeyboardEvent */
/**
 * T9（解散 AppDialog：14 处 <AppDialog> 直接调用点 + ConfirmDialog/InputDialog 同步收敛）验证。
 *
 * S. 静态哨兵（源码级，先于浏览器）：AppDialog.vue 已删除、全仓 0 处 <AppDialog；
 *    16 个换内脏组件的 el-dialog 全部 v-bind="*.elDialogBindings"（chrome 复合类
 *    kb-dialog / kb-dialog-overlay 只从 bindings 下发，组件模板零手写——T8 评审待办①
 *    的失败模式消除）；dialog-stack 不再导出 isDialogTopMost（最后消费者 AppDialog
 *    已解散，hasOpenDialog 仍被 DocumentVersionsPanel/DocumentInfoPanel 消费）。
 * 0. CSS bundle 结构性损坏哨兵（复制自 verify-t5/t6/t7/t8，每轮最先跑）。
 * A. 全对话框 chrome 抽样逐属性（复用 T8 断言口径）：.el-dialog.kb-dialog 面板
 *    chrome（30px 圆角 / 1px kb-border / surface 底 / 0_32px_72px 阴影 / overflow
 *    hidden）+ 头部带（flex 起始对齐 / 20px 28px / border-line-soft / surface-soft）
 *    + 正文带（24px 28px）+ 尾部带（16px 28px）+ 标题 22px/600/-0.03em + 遮罩
 *    blur(10px) + Task 3.1 底色 + z 400 + aria-label（:title 喂 EP role=dialog）。
 * B. 覆盖契约：widthClass 七档逐档 computed 宽度（max-w-sm 384 / md 448 / lg 512 /
 *    xl 576 / 2xl 672 / 6xl 1152 / [400px] 400）+ eyebrow 角标（编辑器/分享设置/
 *    协作/AI 模型）+ description（KbDialogHeader 共享片段）+ closeOnOverlay=false /
 *    showCloseButton=false 场景（盘点 = 0 处，无场景，记档不适用）。
 * C. 行为收编（T1 清单，T9 内脏下复验）：
 *    - data-autofocus 全场景（4 处）：move-node 原生 input / doc-create、create-kb、
 *      add-member 的 el-input（宏任务聚焦晚于 EP 容器聚焦）；password 弹层无标记 →
 *      回落首可聚焦（头部关闭钮，基线同款兜底）；
 *    - IME 组词 Esc 不关（document 级 + input 级，普通 Esc 随后可关）；
 *    - 遮罩点击：面板内不关、面板外关闭（closeOnOverlay 默认 true）；
 *    - 焦点还原到触发元素（style-settings Esc 关闭后回 [title=样式设置]）；
 *    - Tab 循环抽样：连 Tab 后焦点始终在对话框内（EP 内建 focus-trap）；
 *    - 真实叠放链：ShareDialog（下）→ ShareQrDialog（上）：滚动锁全程锁定、Esc 只关
 *      栈顶、二次 Esc 关下层并解锁（T9 起两层同走 use-dialog-behavior，跨家族计数
 *      成为防御性冗余——本链同时复验该语义）；
 *    - destroy-on-close：关闭转场后对话框从 DOM 卸载。
 *
 * 用法：node scripts/verify-t9.mjs（需 4173 preview + 后端 3200）
 * 退出码：全过为 0，任一失败为 1。
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

const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T9 直用改造文档"
const DOC_CONTENT = "# T9 直用改造文档\n\n用于对话框解散 AppDialog 的行为验证。\n"
const MEMBER_EMAIL = "editor@example.com"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T9验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

// ============ S. 静态哨兵（源码级） ============
const checkStaticSentinels = () => {
  const read = path => {
    try {
      return fs.readFileSync(`src/renderer/src/${path}`, "utf8")
    } catch {
      return null
    }
  }

  check("S1 AppDialog.vue 已删除", read("components/common/AppDialog.vue") === null)

  let appDialogTags = 0
  const walk = dir => {
    for (const entry of fs.readdirSync(`src/renderer/src/${dir}`, { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
        continue
      }
      if (!/\.(vue|ts)$/.test(entry.name)) continue
      if ((read(rel) ?? "").includes("<AppDialog")) appDialogTags += 1
    }
  }
  walk("components")
  walk("views")
  check("S2 全仓 0 处 <AppDialog 标签", appDialogTags === 0, `命中 ${appDialogTags} 处`)

  const migrated = [
    "components/auth/AvatarCropDialog.vue",
    "components/version/VersionCompareDialog.vue",
    "components/knowledge/KnowledgeMoveNodeDialog.vue",
    "components/knowledge/KnowledgeCreateKbDialog.vue",
    "components/knowledge/KnowledgeDocCreateDialog.vue",
    "components/knowledge/TemplateSelectDialog.vue",
    "components/editor/DocumentStyleSettingsDialog.vue",
    "components/share/ShareQrDialog.vue",
    "components/editor/EditorShortcutPanel.vue",
    "components/knowledge/settings/KnowledgeSettingsAddMemberDialog.vue",
    "components/share/ShareDialog.vue",
    "views/auth/AccountView.vue",
    "views/knowledge/KnowledgeBoardEditorView.vue",
    "views/knowledge/KnowledgeDocEditorView.vue",
    "components/common/ConfirmDialog.vue",
    "components/common/InputDialog.vue",
  ]
  const missingBinding = migrated.filter(src => {
    const code = read(src) ?? ""
    return !code.includes(".elDialogBindings") || !code.includes("KbDialogHeader")
  })
  check(
    "S3 16 个换内脏组件：v-bind elDialogBindings + KbDialogHeader 头部片段全接入",
    missingBinding.length === 0,
    missingBinding.length ? `缺接入：${missingBinding.join(", ")}` : `${migrated.length} 个组件全过`
  )
  const handWritten = migrated.filter(src => /class="[^"]*kb-dialog/.test(read(src) ?? ""))
  check(
    "S4 组件模板零手写 kb-dialog（chrome 复合类只从 bindings 下发，T8 评审待办①）",
    handWritten.length === 0,
    handWritten.length ? `手写命中：${handWritten.join(", ")}` : "16 个组件模板均无复合类字面量"
  )

  const stackSrc = read("composables/dialog-stack.ts") ?? ""
  check(
    "S5 dialog-stack 收窄：isDialogTopMost 导出已删（AppDialog 解散后无消费者）、hasOpenDialog 保留",
    !stackSrc.includes("isDialogTopMost") && stackSrc.includes("hasOpenDialog")
  )
  const consumers = ["components/version/DocumentVersionsPanel.vue", "components/editor/DocumentInfoPanel.vue"]
  const lostConsumer = consumers.filter(src => !(read(src) ?? "").includes("hasOpenDialog"))
  check("S6 hasOpenDialog 面板消费者仍在位（DocumentVersionsPanel / DocumentInfoPanel）", lostConsumer.length === 0)
}

// ============ 0. CSS bundle 哨兵（沿用 T8 口径） ============
const reportBundleClues = () => {
  const flags = [
    [
      "--el-color-primary: var(--kb-brand)",
      "element-plus-bridge.css 的 html:root 桥接（变量死亡 → 查 bridge.css / calibration.css 注释意外终止）",
    ],
    [".h-9{", 'Tailwind utilities（缺失 → 查 style.css 的 @import "tailwindcss" 是否被吞、层序是否塌）'],
    ["@layer theme", "Tailwind 层序声明（缺失 → style.css 首部被吞）"],
    [
      ".el-input.el-input{width:revert-layer",
      "校准 el-input 根中和段（缺失 → 查 calibration.css 中和段前注释是否意外终止）",
    ],
    [".el-dialog.kb-dialog{margin:revert-layer", "校准 el-dialog 中和段（缺失 → 查该段前注释是否意外终止）"],
    [
      ".el-dialog.kb-dialog{width:100%",
      "校准 el-dialog components 段（缺失 → 查 components 层 el-dialog 小节是否被吞）",
    ],
    [".el-overlay.kb-dialog-overlay", "校准 el-dialog 遮罩段（缺失 → 查 components 层 el-dialog 小节是否被吞）"],
  ]
  const files = fs.readdirSync("dist/assets").filter(f => f.startsWith("index-") && f.endsWith(".css"))
  for (const file of files) {
    const css = fs.readFileSync(`dist/assets/${file}`, "utf8")
    for (const [flag, hint] of flags) {
      if (!css.includes(flag)) {
        logStep("[T9验证]", `定位线索：dist/assets/${file} 缺少标志「${flag}」→ ${hint}`)
      }
    }
  }
}

const checkCssBundleSentinels = async (page, prefix) => {
  const sentry = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const tokens = ["--kb-muted-bg", "--kb-brand", "--kb-text"].map(name => [name, cs.getPropertyValue(name)])
    let bridgePrimary = null
    let h9Found = false
    let sheetCount = 0
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      sheetCount += 1
      const walk = list => {
        for (const rule of list) {
          if (rule.cssRules && rule.cssRules.length && rule.selectorText === undefined) {
            walk(rule.cssRules)
            continue
          }
          if (!rule.selectorText || !rule.style) continue
          const sel = rule.selectorText
          if (
            bridgePrimary === null &&
            sel === "html:root" &&
            rule.style.getPropertyValue("--el-color-primary").includes("var(--kb-brand)")
          ) {
            bridgePrimary = rule.style.getPropertyValue("--el-color-primary")
          }
          if (!h9Found && sel.split(",").some(s => s.trim() === ".h-9") && rule.style.getPropertyValue("height")) {
            h9Found = true
          }
        }
      }
      walk(rules)
    }
    return { tokens, bridgePrimary, h9Found, sheetCount }
  })

  const dead = sentry.tokens.filter(([, value]) => !value)
  const okTokens = dead.length === 0
  const okBridge = Boolean(sentry.bridgePrimary)
  const okUtilities = sentry.h9Found
  const ok = okTokens && okBridge && okUtilities
  check(
    `${prefix} 哨兵① 关键 token 挂载（--kb-muted-bg/--kb-brand/--kb-text 非空，tokens.css 未被吞）`,
    okTokens,
    dead.length ? `空值：${dead.map(([n]) => n).join(",")}` : sentry.tokens.map(([n, v]) => `${n}=${v}`).join(" ")
  )
  check(
    `${prefix} 哨兵② bridge 生效（CSSOM 存在 html:root 且 --el-color-primary 有值）`,
    okBridge,
    okBridge ? `primary=${sentry.bridgePrimary}` : `sheets=${sentry.sheetCount}，未见 html:root 规则`
  )
  check(
    `${prefix} 哨兵③ Tailwind utilities 存活（CSSOM 存在 .h-9 规则）`,
    okUtilities,
    okUtilities ? "height=calc(var(--spacing) * 9)" : "未见 .h-9 规则"
  )
  if (!ok) {
    check(`${prefix} CSS bundle 结构性损坏（哨兵组未全过，后续视觉断言不可信）`, false, "见上方失败哨兵与下方定位线索")
    reportBundleClues()
  }
  return ok
}

const computedOf = (locator, props) =>
  locator.evaluate((el, names) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(names.map(n => [n, cs.getPropertyValue(n)]))
  }, props)

const tokenRgb = (page, token) =>
  page.evaluate(t => {
    const probe = document.createElement("div")
    probe.style.backgroundColor = `var(${t})`
    probe.style.display = "none"
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, token)

/** 当前可见对话框（排除 display:none 的历史 overlay 空壳） */
const visibleDialog = page => page.locator('.el-overlay:not([style*="display: none"]) .el-dialog').last()

const openDialogByTrigger = async (page, open, waitText) => {
  await open()
  const dialog = visibleDialog(page)
  await dialog.waitFor({ state: "visible", timeout: 15000 })
  if (waitText) {
    await dialog.getByText(waitText, { exact: false }).first().waitFor({ timeout: 15000 })
  }
  await page.waitForTimeout(600)
  return dialog
}

const closeByEsc = async page => {
  await page.keyboard.press("Escape")
  await page.waitForTimeout(600)
}

/** 派发组词 Esc（isComposing + keyCode 229；selector 为空 = document 级） */
const dispatchComposingEsc = (page, selector) =>
  page.evaluate(sel => {
    const target = sel ? document.querySelector(sel) : document
    if (!target) throw new Error(`IME 探针目标不存在：${sel}`)
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, "isComposing", { value: true })
    Object.defineProperty(event, "keyCode", { value: 229 })
    target.dispatchEvent(event)
  }, selector)

/** 对话框 chrome 逐属性（A 组口径，复用 verify-t8；editorPage 标记 antd.css 承重页） */
const checkDialogChrome = async (page, prefix, dialog, tag, dark, colors, editorPage) => {
  const rootStyles = await computedOf(dialog, [
    "border-radius",
    "background-color",
    "border-top-color",
    "border-top-width",
    "box-shadow",
    "overflow",
  ])
  check(
    `${prefix} ${tag} 面板 chrome：30px 圆角 / 1px kb-border / surface 底 / 大阴影 / overflow hidden`,
    rootStyles["border-radius"] === "30px" &&
      rootStyles["background-color"] === colors.surface &&
      rootStyles["border-top-width"] === "1px" &&
      rootStyles["border-top-color"] === colors.border &&
      rootStyles["box-shadow"].includes("rgba(15, 23, 42, 0.18)") &&
      rootStyles.overflow === "hidden",
    JSON.stringify(rootStyles)
  )

  const header = dialog.locator(".el-dialog__header")
  const headerStyles = await computedOf(header, [
    "display",
    "align-items",
    "justify-content",
    "gap",
    "padding",
    "border-bottom-color",
    "border-bottom-width",
    "background-color",
  ])
  check(
    `${prefix} ${tag} 头部带：flex 起始对齐 / 20px 28px 内边距 / border-line-soft 下边 / surface-soft 底`,
    headerStyles.display === "flex" &&
      headerStyles["align-items"] === "flex-start" &&
      headerStyles["justify-content"] === "space-between" &&
      headerStyles.gap === "16px" &&
      headerStyles.padding === "20px 28px" &&
      headerStyles["border-bottom-width"] === "1px" &&
      headerStyles["border-bottom-color"] === colors.borderSoft &&
      headerStyles["background-color"] === colors.surfaceSoft,
    JSON.stringify(headerStyles)
  )

  // 编辑器 / 画板页的 h3 被懒注入的 Lake antd.css 承重（unlayered `h1..h6
  // { font-weight:500; color:rgba(0,0,0,0.85) }` 压过 utilities 层的
  // font-semibold / text-ink——AGENTS.md 坑 13 同族既有事实，AppDialog 时代同链路
  // 同渲染，pixdiff 干净对（style-settings 屏）逐像素一致佐证，非 T9 引入）；
  // 暗色 h3 有 text-ink 类 → style.css html.dark .text-ink-*（!important）接管为
  // 0.88 白（T2 暗坑①链路）。非编辑器页按 utilities 层 600 / ink 断言。
  const title = dialog.locator("h3").first()
  const titleStyles = await computedOf(title, ["font-size", "font-weight", "letter-spacing", "color"])
  const expectedWeight = editorPage ? "500" : "600"
  const expectedTitleColor = dark ? "rgba(255, 255, 255, 0.88)" : editorPage ? "rgba(0, 0, 0, 0.85)" : colors.ink
  check(
    `${prefix} ${tag} 标题：22px / ${expectedWeight}${editorPage ? "（antd.css 承重链路，基线同款）" : ""} / -0.03em / ${dark ? "0.88 白" : editorPage ? "antd.css 0.85 黑" : "ink"}`,
    titleStyles["font-size"] === "22px" &&
      titleStyles["font-weight"] === expectedWeight &&
      parseFloat(titleStyles["letter-spacing"]) === -0.66 &&
      titleStyles.color === expectedTitleColor,
    JSON.stringify(titleStyles)
  )

  const body = dialog.locator(".el-dialog__body")
  const bodyStyles = await computedOf(body, ["padding", "color", "font-size"])
  const bodyBase = await page.evaluate(() => ({
    color: getComputedStyle(document.body).color,
    fontSize: getComputedStyle(document.body).fontSize,
  }))
  check(
    `${prefix} ${tag} 正文带：24px 28px 内边距、色号/字号贯通继承链`,
    bodyStyles.padding === "24px 28px" &&
      bodyStyles.color === bodyBase.color &&
      bodyStyles["font-size"] === bodyBase.fontSize,
    JSON.stringify({ bodyStyles, bodyBase })
  )

  const overlay = page.locator('.el-overlay:not([style*="display: none"])').last()
  const overlayStyles = await computedOf(overlay, ["background-color", "backdrop-filter", "z-index"])
  const expectedMask = dark ? "rgba(0, 0, 0, 0.6)" : "rgba(15, 23, 42, 0.24)"
  check(
    `${prefix} ${tag} 遮罩：Task 3.1 校准底色 + backdrop blur(10px) + z 400（bindings.zIndex 钉值）`,
    overlayStyles["background-color"] === expectedMask &&
      overlayStyles["backdrop-filter"].includes("blur(10px)") &&
      overlayStyles["z-index"] === "400",
    JSON.stringify(overlayStyles)
  )
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T9验证:${mode}]`
  const url = path => new URL(path, "http://127.0.0.1:4173").toString()
  const dark = mode === "dark"

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    dark ? "dark" : "light"
  )

  try {
    // ============ 数据准备（ensure 语义，与 visual-capture-t9 同源） ============
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T9 内容库")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })

    const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, { token })
    const flat = nodes => (Array.isArray(nodes) ? nodes : []).flatMap(node => [node, ...flat(node.children ?? [])])
    if (!flat(tree).some(node => node.type === "template" && node.title === "T9 模板文档")) {
      await apiRequest("/knowledge/documents", {
        method: "POST",
        token,
        body: {
          kbId: kb.id,
          title: "T9 模板文档",
          status: "draft",
          type: "template",
          content: { scheme: "text/markdown", value: "# T9 模板文档\n\n模板卡片内容。\n" },
        },
      })
    }

    const versions = await apiRequest(`/knowledge/documents/${doc.id}/versions`, { token })
    if (!Array.isArray(versions) || versions.length < 2) {
      await apiRequest(`/knowledge/documents/${doc.id}`, {
        method: "PATCH",
        token,
        body: {
          content: { scheme: "text/markdown", value: `${DOC_CONTENT}\n\n第二版补充段落。\n` },
          message: "T9 版本二",
        },
      })
      await apiRequest(`/knowledge/documents/${doc.id}`, {
        method: "PATCH",
        token,
        body: {
          content: { scheme: "text/markdown", value: `${DOC_CONTENT}\n\n第二版补充段落。\n\n第三版补充段落。\n` },
          message: "T9 版本三",
        },
      })
    }

    const members = await apiRequest(`/knowledge/knowledge-bases/${kb.id}/members`, { token })
    if (!Array.isArray(members) || !members.some(m => m.user?.email === MEMBER_EMAIL)) {
      await apiRequest(`/knowledge/knowledge-bases/${kb.id}/members`, {
        method: "POST",
        token,
        body: { email: MEMBER_EMAIL, role: "editor" },
      })
    }

    const shares = await apiRequest(`/knowledge/documents/${doc.id}/shares`, { token })
    if (!Array.isArray(shares) || shares.length === 0) {
      await apiRequest(`/knowledge/documents/${doc.id}/shares`, {
        method: "POST",
        token,
        body: { permission: "view" },
      })
    }

    // ============ 1. 编辑器页（settle-reload 冻结界面） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)

    await checkCssBundleSentinels(page, prefix)

    const surfaceRgb = await tokenRgb(page, "--kb-surface-bg")
    const surfaceSoftRgb = await tokenRgb(page, "--kb-surface-soft-bg")
    const borderRgb = await tokenRgb(page, "--kb-border")
    const borderSoftRgb = await tokenRgb(page, "--kb-border-soft")
    const inkRgb = await tokenRgb(page, "--kb-text")
    const colors = {
      surface: surfaceRgb,
      surfaceSoft: surfaceSoftRgb,
      border: borderRgb,
      borderSoft: borderSoftRgb,
      ink: inkRgb,
    }

    // ===== A/B/C：style-settings（eyebrow「编辑器」+ max-w-md chrome 主载体） =====
    const styleTrigger = page.locator('[title="样式设置"]')
    const styleDialog = await openDialogByTrigger(page, () => styleTrigger.click())
    const styleRootCls = (await styleDialog.getAttribute("class")) ?? ""
    check(
      `${prefix} A1 面板根：el-dialog 原生根 + bindings 下发的 kb-dialog + 宽度档落根（max-w-md）`,
      styleRootCls.includes("el-dialog") && styleRootCls.includes("kb-dialog") && styleRootCls.includes("max-w-md"),
      styleRootCls.slice(0, 90)
    )
    const styleWidth = await computedOf(styleDialog, ["width"])
    check(`${prefix} B1 widthClass=md：computed width 448px`, styleWidth.width === "448px", styleWidth.width)
    // EP 的 role="dialog"/aria-label 落在 .el-overlay-dialog（滚动容器，dialog.vue
    // createElementVNode 层），不在 .el-dialog 上——aria-label 由 :title 喂给该元素
    const ariaLabel = await styleDialog.locator("xpath=..").getAttribute("aria-label")
    check(
      `${prefix} A2 aria-label：:title 喂 EP role=dialog（.el-overlay-dialog 层，样式设置）`,
      ariaLabel === "样式设置",
      String(ariaLabel)
    )
    await checkDialogChrome(page, prefix, styleDialog, "A3 style-settings", dark, colors, true)
    const eyebrowChip = styleDialog.locator(".el-dialog__header").getByText("编辑器", { exact: true })
    check(`${prefix} B2 eyebrow 角标（KbDialogHeader 共享片段）：「编辑器」chip 渲染`, await eyebrowChip.isVisible())

    // C：遮罩点击（面板内不关 / 面板外关闭）+ 焦点还原 + destroy-on-close
    await styleDialog.locator(".el-dialog__body").first().locator("p").first().click()
    await page.waitForTimeout(400)
    check(`${prefix} C1a 遮罩点击（面板内）：点击对话框正文不关闭`, await styleDialog.isVisible())
    await page.mouse.click(60, 476)
    await page.waitForTimeout(600)
    const styleClosedByOverlay = await page.evaluate(
      () =>
        ![...document.querySelectorAll(".el-dialog")].some(
          el => el.className.includes("kb-dialog") && el.offsetParent !== null
        )
    )
    check(`${prefix} C1b 遮罩点击（面板外）：closeOnOverlay 默认 true → 关闭`, styleClosedByOverlay)
    const styleGone = await page.evaluate(
      () => ![...document.querySelectorAll(".el-dialog")].some(el => el.textContent?.includes("样式设置"))
    )
    check(`${prefix} C2 destroy-on-close：关闭转场后对话框从 DOM 卸载（基线 v-if 语义）`, styleGone)

    // C：焦点还原（重开一轮，Esc 关闭后焦点回触发按钮）
    await styleTrigger.click()
    await visibleDialog(page).waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    await closeByEsc(page)
    const styleFocusRestored = await page.evaluate(
      btn => document.activeElement === btn,
      await styleTrigger.elementHandle()
    )
    check(`${prefix} C3 焦点还原：Esc 关闭后 activeElement 回到触发按钮（EP stopTrap）`, styleFocusRestored)

    // C：Tab 循环抽样（连 Tab 后焦点始终在对话框内）
    await styleTrigger.click()
    const styleDialog2 = visibleDialog(page)
    await styleDialog2.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    let escaped = false
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("Tab")
      await page.waitForTimeout(120)
      const inside = await page.evaluate(() => {
        const active = document.activeElement
        return !!active && !!active.closest(".el-dialog")
      })
      if (!inside) {
        escaped = true
        break
      }
    }
    check(`${prefix} C4 Tab 循环抽样：连续 14 次 Tab 焦点不出对话框（EP 内建 focus-trap）`, !escaped)
    let shiftEscaped = false
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press("Shift+Tab")
      await page.waitForTimeout(120)
      const inside = await page.evaluate(() => {
        const active = document.activeElement
        return !!active && !!active.closest(".el-dialog")
      })
      if (!inside) {
        shiftEscaped = true
        break
      }
    }
    check(`${prefix} C5 shift+Tab 反向循环抽样：焦点不出对话框`, !shiftEscaped)
    await closeByEsc(page)

    // ===== C：version-compare（max-w-6xl + description；经历史版本面板真实链路） =====
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
    const compareBtn = page.locator('[title="打开版本对比"]')
    await compareBtn.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    await compareBtn.click()
    const compareDialog = visibleDialog(page)
    await compareDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const compareCls = (await compareDialog.getAttribute("class")) ?? ""
    const compareWidth = await computedOf(compareDialog, ["width"])
    check(
      `${prefix} B3 widthClass=6xl：kb-dialog + max-w-6xl 落根、computed width 1152px`,
      compareCls.includes("kb-dialog") && compareCls.includes("max-w-6xl") && compareWidth.width === "1152px",
      `${compareCls.slice(0, 60)} ${compareWidth.width}`
    )
    check(
      `${prefix} B4 description（KbDialogHeader）：版本对比弹层渲染描述文案`,
      await compareDialog.getByText("选择两个历史版本并查看内容差异。").isVisible()
    )
    await closeByEsc(page)
    await closeByEsc(page)

    // ===== C：data-autofocus（move-node 原生 input）+ IME Esc（document 级） =====
    const treeRow = page.locator("[data-knowledge-tree-row]").filter({ hasText: DOC_TITLE }).first()
    const moveTrigger = treeRow.getByTitle("更多操作", { exact: true })
    await moveTrigger.click()
    await page.getByText("移动...", { exact: true }).first().click()
    const moveDialog = visibleDialog(page)
    await moveDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const moveAutofocus = await page.evaluate(() => {
      const active = document.activeElement
      return (
        active instanceof HTMLInputElement &&
        active.hasAttribute("data-autofocus") &&
        active.offsetWidth > 0 &&
        !!active.closest(".el-dialog")
      )
    })
    check(`${prefix} C6 data-autofocus（move-node 原生 input）：宏任务聚焦晚于 EP 容器聚焦`, moveAutofocus)
    const moveCls = (await moveDialog.getAttribute("class")) ?? ""
    const moveWidth = await computedOf(moveDialog, ["width"])
    check(
      `${prefix} B5 widthClass=md（move-node）：computed width 448px`,
      moveCls.includes("max-w-md") && moveWidth.width === "448px",
      moveWidth.width
    )
    await dispatchComposingEsc(page, null)
    await page.waitForTimeout(500)
    check(`${prefix} C7 IME 组词 Esc（document 级，isComposing+229）：对话框不关闭`, await moveDialog.isVisible())
    await dispatchComposingEsc(page, ".el-dialog input[data-autofocus]")
    await page.waitForTimeout(500)
    check(`${prefix} C8 IME 组词 Esc（input 冒泡路径）：对话框不关闭`, await moveDialog.isVisible())
    await closeByEsc(page)
    const moveClosed = await page.evaluate(
      () =>
        ![...document.querySelectorAll(".el-dialog")].some(
          el => el.className.includes("kb-dialog") && el.offsetParent !== null
        )
    )
    check(
      `${prefix} C9 普通 Esc 可关（守卫不过度拦截）：move-node 对话框关闭`,
      moveClosed,
      "焦点还原不在本弹层断言：触发链是树行 ⋯ 菜单（菜单项点击后触发钮焦点已随菜单卸载），机制由 C3（style-settings 稳定触发钮）覆盖"
    )

    // ===== C：doc-create / create-kb / add-member 的 data-autofocus（el-input 3 处） =====
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await page
      .locator('[title="新建内容"]')
      .locator("xpath=following-sibling::div")
      .getByRole("button", { name: "新建文档", exact: true })
      .click()
    const docCreateDialog = visibleDialog(page)
    await docCreateDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const docCreateAutofocus = await page.evaluate(
      () =>
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.hasAttribute("data-autofocus") &&
        document.activeElement.type !== "hidden"
    )
    check(`${prefix} C10 data-autofocus（doc-create el-input）：焦点落名称输入原生 input`, docCreateAutofocus)
    const docCreateWidth = await computedOf(docCreateDialog, ["width"])
    check(`${prefix} B6 widthClass=md（doc-create）：computed width 448px`, docCreateWidth.width === "448px")
    await closeByEsc(page)

    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByText("新建知识库", { exact: true }).first().click()
    const createKbDialog = visibleDialog(page)
    await createKbDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const createKbAutofocus = await page.evaluate(
      () => document.activeElement instanceof HTMLInputElement && document.activeElement.hasAttribute("data-autofocus")
    )
    check(`${prefix} C11 data-autofocus（create-kb el-input）：焦点落名称输入原生 input`, createKbAutofocus)
    await dispatchComposingEsc(page, ".el-dialog input[data-autofocus]")
    await page.waitForTimeout(500)
    check(`${prefix} C12 IME 组词 Esc（create-kb input 级）：对话框不关闭`, await createKbDialog.isVisible())
    await closeByEsc(page)

    await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "成员", exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "成员", exact: true }).click()
    await page.getByRole("button", { name: "添加成员", exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByRole("button", { name: "添加成员", exact: true }).first().click()
    const addMemberDialog = visibleDialog(page)
    await addMemberDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const addMemberAutofocus = await page.evaluate(
      () => document.activeElement instanceof HTMLInputElement && document.activeElement.hasAttribute("data-autofocus")
    )
    check(`${prefix} C13 data-autofocus（add-member el-input）：焦点落邮箱输入原生 input`, addMemberAutofocus)
    const addMemberWidth = await computedOf(addMemberDialog, ["width"])
    check(`${prefix} B7 widthClass=xl：computed width 576px`, addMemberWidth.width === "576px")
    check(
      `${prefix} B8 description（KbDialogHeader）：添加成员弹层渲染邀请说明`,
      await addMemberDialog.getByText("通过邮箱邀请成员加入当前知识库").isVisible()
    )
    await closeByEsc(page)

    // ===== C：真实叠放链（ShareDialog 下 → ShareQrDialog 上）：滚动锁 + Esc 只关栈顶 =====
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    const overflowBefore = await page.evaluate(() => document.body.style.overflow)
    await page.locator("header").getByRole("button", { name: "分享", exact: true }).click()
    const shareDialog = visibleDialog(page)
    await shareDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(800)
    const shareOpenState = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      epLock: document.body.classList.contains("el-popup-parent--hidden"),
    }))
    check(
      `${prefix} C14 开 ShareDialog：body 上锁（use-dialog-behavior 计数）+ EP lock-scroll 未启用`,
      overflowBefore !== "hidden" && shareOpenState.overflow === "hidden" && !shareOpenState.epLock,
      JSON.stringify(shareOpenState)
    )
    const shareWidth = await computedOf(shareDialog, ["width"])
    check(`${prefix} B9 widthClass=lg（ShareDialog）：computed width 512px`, shareWidth.width === "512px")
    await page.getByText("更多分享设置", { exact: true }).click()
    const qrTrigger = page.locator('[title="扫码访问"]').first()
    await qrTrigger.waitFor({ state: "visible", timeout: 15000 })
    await qrTrigger.click()
    const qrDialog = visibleDialog(page)
    await qrDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(800)
    const qrCls = (await qrDialog.getAttribute("class")) ?? ""
    const qrWidth = await computedOf(qrDialog, ["width"])
    check(
      `${prefix} B10 widthClass=sm（ShareQrDialog）：computed width 384px`,
      qrCls.includes("max-w-sm") && qrWidth.width === "384px",
      qrWidth.width
    )
    const stackedState = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      visibleDialogs: [...document.querySelectorAll(".el-dialog")].filter(el => el.offsetParent !== null).length,
      qrEyebrow: [...document.querySelectorAll(".el-dialog")]
        .find(el => el.textContent?.includes("扫码访问"))
        ?.textContent?.includes("分享设置"),
    }))
    check(
      `${prefix} C15 真实叠放链：两层 .el-dialog 可见（Share 在下、QR 在上）+ body 仍锁 + QR eyebrow「分享设置」`,
      stackedState.visibleDialogs === 2 && stackedState.overflow === "hidden" && qrEyebrowSafe(stackedState.qrEyebrow),
      JSON.stringify(stackedState)
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    const afterFirstEsc = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      visibleDialogs: [...document.querySelectorAll(".el-dialog")].filter(el => el.offsetParent !== null).length,
      shareOpen: [...document.querySelectorAll(".el-dialog")].some(
        el => el.textContent?.includes("允许评论") && el.offsetParent !== null
      ),
    }))
    check(
      `${prefix} C16 叠放 Esc 只关栈顶：ShareQrDialog 关、ShareDialog 仍在、body 仍锁`,
      afterFirstEsc.visibleDialogs === 1 && afterFirstEsc.shareOpen && afterFirstEsc.overflow === "hidden",
      JSON.stringify(afterFirstEsc)
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    const afterSecondEsc = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      visibleDialogs: [...document.querySelectorAll(".el-dialog")].filter(el => el.offsetParent !== null).length,
    }))
    check(
      `${prefix} C17 关闭最后一个对话框：body 解锁（use-dialog-behavior 计数收尾）`,
      afterSecondEsc.overflow !== "hidden" && afterSecondEsc.visibleDialogs === 0,
      JSON.stringify(afterSecondEsc)
    )

    // ===== C：password（AccountView 内联 el-dialog，无 data-autofocus → 回落关闭钮） =====
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "修改密码", exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await page.getByRole("button", { name: "修改密码", exact: true }).click()
    const passwordDialog = visibleDialog(page)
    await passwordDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const passwordCls = (await passwordDialog.getAttribute("class")) ?? ""
    const passwordWidth = await computedOf(passwordDialog, ["width"])
    check(
      `${prefix} B11 widthClass=[400px]：computed width 400px`,
      passwordCls.includes("max-w-[400px]") && passwordWidth.width === "400px",
      passwordWidth.width
    )
    const fallbackFocus = await page.evaluate(() => {
      const dialogEl = [...document.querySelectorAll(".el-dialog")].find(el => el.offsetParent !== null)
      return document.activeElement === dialogEl?.querySelector("button")
    })
    check(`${prefix} C18 无标记对话框：打开后焦点回落首个可聚焦元素（头部关闭钮，基线同款兜底）`, fallbackFocus)
    await closeByEsc(page)

    // ===== B：template-select / board-ai-config（2xl 档 + eyebrow/description） =====
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "新建内容", exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await page
      .locator('[title="新建内容"]')
      .locator("xpath=following-sibling::div")
      .getByRole("button", { name: "从模板创建", exact: true })
      .click()
    const templateDialog = visibleDialog(page)
    await templateDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const templateWidth = await computedOf(templateDialog, ["width"])
    check(
      `${prefix} B12 widthClass=2xl（template-select）：computed width 672px + description 渲染`,
      templateWidth.width === "672px" &&
        (await templateDialog.getByText("选择一个模板并生成新的文档副本。").isVisible()),
      templateWidth.width
    )
    await closeByEsc(page)

    // ===== B：board-ai-config（2xl 档 + eyebrow「AI 模型」+ 动态 description） =====
    const findBoard = async () => {
      const boardTree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, { token })
      return flat(boardTree).find(node => node.type === "doc" && node.title === "T9 直用改造画板")
    }
    let board = await findBoard()
    if (!board) {
      await apiRequest("/knowledge/documents", {
        method: "POST",
        token,
        body: {
          kbId: kb.id,
          title: "T9 直用改造画板",
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
      })
      board = await findBoard()
    }
    await page.goto(url(`/knowledge/${kb.id}/board/${board?.id ?? ""}`), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "模型配置", exact: true }).waitFor({ timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.getByRole("button", { name: "模型配置", exact: true }).click()
    const boardDialog = visibleDialog(page)
    await boardDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const boardWidth = await computedOf(boardDialog, ["width"])
    const boardDescriptionOk = await boardDialog.getByText("用于当前账号在本浏览器内发起画板 AI 生成").isVisible()
    const boardEyebrowOk = await boardDialog
      .locator(".el-dialog__header")
      .getByText("AI 模型", { exact: true })
      .isVisible()
    check(
      `${prefix} B13 widthClass=2xl（board-ai-config）：computed width 672px + eyebrow「AI 模型」+ 动态 description`,
      boardWidth.width === "672px" && boardDescriptionOk && boardEyebrowOk,
      boardWidth.width
    )
    await closeByEsc(page)

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
    await page.screenshot({ path: `output/visual/ep-direct/t9/verify-error-${mode}.png` }).catch(() => {})
    await browser.close().catch(() => {})
    return false
  }
}

const qrEyebrowSafe = v => v === true

checkStaticSentinels()

const light = await capturePass("light")
const dark = await capturePass("dark")
const failed = results.filter(r => !r.ok)
console.log(`\n断言 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length > 0) {
  for (const f of failed) console.error(`❌ ${f.name} — ${f.detail}`)
}
if (!light || !dark || failed.length > 0) process.exit(1)
console.log("T9 验证全部通过")

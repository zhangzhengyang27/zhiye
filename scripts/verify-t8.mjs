/* global document, getComputedStyle, HTMLInputElement, KeyboardEvent */
/**
 * T8（对话框行为 composable + ConfirmDialog/InputDialog 换内脏，7 处调用点）验证。
 *
 * 三组断言（明暗各一轮，沿用 T2-T7 的 A/B/C 模式）：
 * A. 校准默认观感（calibration.css el-dialog 段）：.el-dialog.kb-dialog 面板 chrome
 *    （400px 限宽 / 8px 圆角 / 1px kb-border / surface 底 / --kb-modal-shadow 三层阴影 /
 *    overflow hidden）；头部带（20px 28px 内边距、border-line-soft 下边、
 *    surface-soft 底、flex 起始对齐）；正文带（24px 28px）；尾部带（16px 28px、
 *    上边分隔）；标题 22px/600/-0.03em（暗色走 style.css 的 html.dark .text-ink 链路
 *    0.88 白）；遮罩 backdrop blur(10px) + Task 3.1 校准底色（亮 0.24 石板 /
 *    暗 0.6 黑）+ z 400（Z_DIALOG prop 钉值）。
 * B. 覆盖/对外契约：默认标题（danger 无 title → 「确认危险操作」）、confirm/cancel
 *    文案透传、danger message text-error、footer 双按钮（AppButton 壳保留）、
 *    widthClass → max-w-[400px] 落 .el-dialog 根、defaultValue 预填与
 *    空值禁用确定、close-on-click-modal/close-on-press-escape（基线 closeOnOverlay
 *    默认 true）、data-autofocus 落原生 input（T5 过渡期契约）。
 * C. 行为收编逐条（T1 清单）：
 *    - 滚动锁计数：ShareDialog（AppDialog 家族）开 → 本家族 ConfirmDialog 叠开 →
 *      关 ConfirmDialog，body 仍锁（栈非空不解锁，跨家族协同）→ 关 ShareDialog
 *      解锁；全程 body 无 el-popup-parent--hidden（EP lock-scroll 已关）；
 *    - data-autofocus 宏任务聚焦：新建文档对话框打开后焦点落原生 input（区分 EP
 *      容器聚焦）；无标记 ConfirmDialog 回落首可聚焦（头部关闭钮居首）；
 *    - IME 组词 Esc 不关：isComposing/keyCode 229 的 Esc（document 级与 input 级）
 *      均不关闭对话框，普通 Esc 随后可关（守卫不过度拦截）；
 *    - 叠放 Esc 只关栈顶：ShareDialog + ConfirmDialog 叠放，一次 Esc 只关
 *      ConfirmDialog，ShareDialog 仍在；第二次 Esc 关 ShareDialog（EP 原生栈顶 +
 *      dialog-stack 维护正确）；
 *    - 遮罩点击 per closeOnOverlay：点面板外（遮罩）关闭、点面板内不关；
 *    - 焦点还原到触发元素：Esc 关闭后 activeElement 回到触发按钮；
 *    - Tab 循环（EP 内建 focus-trap 接管自建 trap 的差异核对）：close → 取消 →
 *      确定 → 循环回 close；shift+Tab 反向循环（差异记档见计划文档 T8 节）；
 *    - destroy-on-close：关闭转场后 .el-dialog.kb-dialog 从 DOM 卸载（基线 v-if
 *      状态重置语义）。
 *
 * 0. CSS bundle 结构性损坏哨兵（复制自 verify-t5/t6/t7，每轮最先跑）+ T8 段落
 *    存活标志（dist 产物 grep 定位线索）。
 *
 * 受控 loading（确认不关窗、父组件异步完成后关闭）为破坏性/时序敏感链路，不在本
 * 脚本断言，由 smoke:periphery 的分享删除流程覆盖。
 *
 * 用法：node scripts/verify-t8.mjs（需 4173 preview + 后端 3200）
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
const DOC_TITLE = "T8 直用改造文档"
const DOC_CONTENT = "# T8 直用改造文档\n\n用于对话框换内脏的行为验证。\n"
const TRASH_DOC_TITLE = "T8 回收站文档"
const MEMBER_EMAIL = "editor@example.com"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T8验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/** 哨兵失败时的定位线索：grep dist 产物中的存活标志 */
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
    [".el-dialog.kb-dialog{margin:revert-layer", "校准 el-dialog 中和段（T8，缺失 → 查 T8 段前注释是否意外终止）"],
    [".el-dialog.kb-dialog{width:100%", "校准 el-dialog components 段（T8，缺失 → 查 components 层 T8 小节是否被吞）"],
    [".el-overlay.kb-dialog-overlay", "校准 el-dialog 遮罩段（T8，缺失 → 查 components 层 T8 小节是否被吞）"],
  ]
  const files = fs.readdirSync("dist/assets").filter(f => f.startsWith("index-") && f.endsWith(".css"))
  for (const file of files) {
    const css = fs.readFileSync(`dist/assets/${file}`, "utf8")
    for (const [flag, hint] of flags) {
      if (!css.includes(flag)) {
        logStep("[T8验证]", `定位线索：dist/assets/${file} 缺少标志「${flag}」→ ${hint}`)
      }
    }
  }
}

/** 哨兵断言本体（运行时 CSSOM + computed，每轮最先执行） */
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

const openTrashConfirm = async page => {
  await page.getByRole("button", { name: "清空文档回收站" }).click()
  const dialog = visibleDialog(page)
  await dialog.waitFor({ state: "visible", timeout: 15000 })
  await page.waitForTimeout(600)
  return dialog
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

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T8验证:${mode}]`
  const url = path => new URL(path, "http://127.0.0.1:4173").toString()
  const dark = mode === "dark"

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    dark ? "dark" : "light"
  )

  try {
    // ============ 数据准备（ensure 语义，与 visual-capture-t8 同源） ============
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T8 内容库")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })

    const trashList = await apiRequest(
      `/knowledge/documents/trash?kbId=${encodeURIComponent(kb.id)}&page=1&pageSize=50`,
      { token, errorMessage: "读回收站失败" }
    )
    const trashItems = Array.isArray(trashList?.items) ? trashList.items : []
    if (!trashItems.some(item => typeof item.title === "string" && item.title.startsWith(TRASH_DOC_TITLE))) {
      const trashDoc = await ensureDocument(kb.id, token, {
        title: `${TRASH_DOC_TITLE}-${Date.now()}`,
        content: "# 临时\n",
      })
      await apiRequest(`/knowledge/documents/${trashDoc.id}/trash`, { method: "POST", token })
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

    // ============ 0. 哨兵 + A/B/C 主战场：回收站清空确认 ============
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "清空文档回收站" }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(900)
    await checkCssBundleSentinels(page, prefix)

    const surfaceRgb = await tokenRgb(page, "--kb-surface-bg")
    const surfaceSoftRgb = await tokenRgb(page, "--kb-surface-soft-bg")
    const borderRgb = await tokenRgb(page, "--kb-border")
    const borderSoftRgb = await tokenRgb(page, "--kb-border-soft")
    const inkRgb = await tokenRgb(page, "--kb-text")
    const errorRgb = await tokenRgb(page, "--kb-error")

    // ===== A：默认态（chrome / 头尾带 / 遮罩） =====
    const dialog = await openTrashConfirm(page)
    const rootCls = (await dialog.getAttribute("class")) ?? ""
    check(
      `${prefix} A1 面板根：el-dialog 原生根 + kb-dialog 校准目标 + widthClass 落根（max-w-[400px]）`,
      rootCls.includes("el-dialog") && rootCls.includes("kb-dialog") && rootCls.includes("max-w-[400px]"),
      rootCls.slice(0, 90)
    )
    const rootStyles = await computedOf(dialog, [
      "width",
      "border-radius",
      "background-color",
      "border-top-color",
      "border-top-width",
      "box-shadow",
      "overflow",
    ])
    check(
      `${prefix} A2 面板 chrome：400px 限宽 / 8px 圆角 / 1px kb-border / surface 底 / 三层黑阴影 / overflow hidden`,
      rootStyles.width === "400px" &&
        rootStyles["border-radius"] === "8px" &&
        rootStyles["background-color"] === surfaceRgb &&
        rootStyles["border-top-width"] === "1px" &&
        rootStyles["border-top-color"] === borderRgb &&
        (rootStyles["box-shadow"].match(/rgba\(/g) || []).length === 3 &&
        rootStyles["box-shadow"].includes("rgba(0, 0, 0") &&
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
      `${prefix} A3 头部带：flex 起始对齐 / 20px 28px 内边距 / border-line-soft 下边 / surface-soft 底`,
      headerStyles.display === "flex" &&
        headerStyles["align-items"] === "flex-start" &&
        headerStyles["justify-content"] === "space-between" &&
        headerStyles.gap === "16px" &&
        headerStyles.padding === "20px 28px" &&
        headerStyles["border-bottom-width"] === "1px" &&
        headerStyles["border-bottom-color"] === borderSoftRgb &&
        headerStyles["background-color"] === surfaceSoftRgb,
      JSON.stringify(headerStyles)
    )

    const title = dialog.locator("h3").first()
    const titleStyles = await computedOf(title, ["font-size", "font-weight", "letter-spacing", "color"])
    const expectedTitleColor = dark ? "rgb(226, 226, 226)" : inkRgb
    check(
      `${prefix} A4 标题：22px / 600 / -0.03em / ${dark ? "暗色 ink 档 #e2e2e2（html.dark .text-ink 走 token）" : "ink"}`,
      titleStyles["font-size"] === "22px" &&
        titleStyles["font-weight"] === "600" &&
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
      `${prefix} A5 正文带：24px 28px 内边距、色号/字号贯通继承链（revert 后 inherit，与 body 同值）`,
      bodyStyles.padding === "24px 28px" &&
        bodyStyles.color === bodyBase.color &&
        bodyStyles["font-size"] === bodyBase.fontSize,
      JSON.stringify({ bodyStyles, bodyBase })
    )
    const message = dialog.locator("p").first()
    const messageColor = await message.evaluate(el => getComputedStyle(el).color)
    // 暗色如实差异（基线同款，pixdiff trash-confirm-dark 精确 0 差佐证）：style.css 的
    // html.dark p { color: inherit }（unlayered）压过 utilities 层的 text-error，
    // 消息继承 body 色 0.88 白——AppDialog 时代同链路，非 T8 引入
    const expectedMessage = dark ? bodyBase.color : errorRgb
    check(
      `${prefix} A6 danger message：${dark ? "暗色被 html.dark p inherit 链接管（body 0.88 白，基线同款）" : "text-error"}`,
      messageColor === expectedMessage,
      messageColor
    )

    const footer = dialog.locator(".el-dialog__footer")
    const footerStyles = await computedOf(footer, [
      "padding",
      "border-top-color",
      "border-top-width",
      "background-color",
    ])
    check(
      `${prefix} A7 尾部带：16px 28px 内边距 / border-line-soft 上边 / surface-soft 底`,
      footerStyles.padding === "16px 28px" &&
        footerStyles["border-top-width"] === "1px" &&
        footerStyles["border-top-color"] === borderSoftRgb &&
        footerStyles["background-color"] === surfaceSoftRgb,
      JSON.stringify(footerStyles)
    )

    const overlay = page.locator('.el-overlay:not([style*="display: none"])').last()
    const overlayStyles = await computedOf(overlay, ["background-color", "backdrop-filter", "z-index"])
    const expectedMask = dark ? "rgba(0, 0, 0, 0.6)" : "rgba(15, 23, 42, 0.24)"
    check(
      `${prefix} A8 遮罩：Task 3.1 校准底色（${dark ? "0.6 黑" : "0.24 石板"}）+ backdrop blur(10px) + z 400（Z_DIALOG）`,
      overlayStyles["background-color"] === expectedMask &&
        overlayStyles["backdrop-filter"].includes("blur(10px)") &&
        overlayStyles["z-index"] === "400",
      JSON.stringify(overlayStyles)
    )
    const epLockOff = await page.evaluate(
      () => !document.body.classList.contains("el-popup-parent--hidden") && document.body.style.overflow === "hidden"
    )
    check(
      `${prefix} A9 滚动锁：EP lock-scroll 已关（无 el-popup-parent--hidden）+ 自建锁生效（body overflow hidden）`,
      epLockOff
    )

    // ===== B：对外契约（默认标题 / 文案透传 / footer 插槽） =====
    const titleText = await title.textContent()
    check(
      `${prefix} B1 默认标题：danger 无 title → 「确认危险操作」（壳 dialogTitle 契约）`,
      titleText === "确认危险操作",
      titleText
    )
    const footerButtons = footer.locator("button")
    const footerTexts = await footerButtons.evaluateAll(els => els.map(el => el.textContent?.trim()))
    const closeBtn = dialog.locator("button").first()
    const closeIsFirst = await closeBtn.evaluate(el => !!el.querySelector("svg"))
    check(
      `${prefix} B2 footer 插槽：AppButton 双按钮（取消 / confirm-text 删除）+ 头部关闭钮（svg 字形）居首`,
      footerTexts.join("|") === "取消|删除" && closeIsFirst,
      `${footerTexts.join("|")} closeSvg=${closeIsFirst}`
    )

    // ===== C：行为收编（trash-confirm 为载体） =====
    // C1 无标记回落首可聚焦（data-autofocus 缺省路径）
    const fallbackFocus = await page.evaluate(() => {
      const dialogEl = [...document.querySelectorAll(".el-dialog")].find(el => el.className.includes("kb-dialog"))
      const active = document.activeElement
      const firstBtn = dialogEl?.querySelector("button")
      return active === firstBtn
    })
    check(`${prefix} C1 无标记对话框：打开后焦点回落首个可聚焦元素（头部关闭钮，AppDialog 同款兜底）`, fallbackFocus)

    // C2 遮罩点击：面板内不关、面板外（遮罩）关闭
    await message.click()
    await page.waitForTimeout(400)
    const stillOpenAfterInsideClick = await dialog.isVisible()
    check(`${prefix} C2a 遮罩点击（面板内）：点击消息文案不关闭`, stillOpenAfterInsideClick)
    await page.mouse.click(60, 476)
    await page.waitForTimeout(500)
    const closedByOverlay = await page.evaluate(
      () =>
        ![...document.querySelectorAll(".el-dialog")].some(
          el => el.className.includes("kb-dialog") && el.offsetParent !== null
        )
    )
    check(`${prefix} C2b 遮罩点击（面板外）：closeOnOverlay=true → 点遮罩关闭`, closedByOverlay)

    // C3 焦点还原到触发元素 + Tab 循环 + IME 守卫（重开一轮做完再关）
    const clearBtn = page.getByRole("button", { name: "清空文档回收站" })
    await clearBtn.focus()
    const dialog2 = await openTrashConfirm(page)
    await page.keyboard.press("Tab")
    await page.waitForTimeout(200)
    const tab1 = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press("Tab")
    await page.waitForTimeout(200)
    const tab2 = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press("Tab")
    await page.waitForTimeout(200)
    const tab3 = await page.evaluate(() => {
      const active = document.activeElement
      const dialogEl = [...document.querySelectorAll(".el-dialog")].find(el => el.className.includes("kb-dialog"))
      return dialogEl?.querySelector("button") === active ? "close-wrapped" : (active?.textContent?.trim() ?? "")
    })
    check(
      `${prefix} C3 Tab 循环（EP 内建 trap）：close → 取消 → 确定 → 循环回 close`,
      tab1 === "取消" && tab2 === "删除" && tab3 === "close-wrapped",
      `${tab1} → ${tab2} → ${tab3}`
    )
    await page.keyboard.press("Shift+Tab")
    await page.waitForTimeout(200)
    const shiftTab1 = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press("Shift+Tab")
    await page.waitForTimeout(200)
    const shiftTab2 = await page.evaluate(() => document.activeElement?.textContent?.trim())
    check(
      `${prefix} C4 shift+Tab 反向循环：close → 确定 → 取消`,
      shiftTab1 === "删除" && shiftTab2 === "取消",
      `${shiftTab1} → ${shiftTab2}`
    )

    await dispatchComposingEsc(page, null)
    await page.waitForTimeout(500)
    const stillOpenAfterImeEsc = await dialog2.isVisible()
    check(`${prefix} C5 IME 组词 Esc（document 级，isComposing+229）：对话框不关闭`, stillOpenAfterImeEsc)
    await dispatchComposingEsc(page, ".el-dialog.kb-dialog p")
    await page.waitForTimeout(500)
    const stillOpenAfterImeEscInner = await dialog2.isVisible()
    check(`${prefix} C6 IME 组词 Esc（内部元素冒泡路径）：对话框不关闭`, stillOpenAfterImeEscInner)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    const focusRestored = await page.evaluate(btn => document.activeElement === btn, await clearBtn.elementHandle())
    check(`${prefix} C7 普通 Esc 可关（守卫不过度拦截）+ 焦点还原到触发元素`, focusRestored)

    // C8 destroy-on-close：关闭转场后对话框内容卸载
    const dialogGone = await page.evaluate(
      () => ![...document.querySelectorAll(".el-dialog")].some(el => el.className.includes("kb-dialog"))
    )
    check(`${prefix} C8 destroy-on-close：关闭转场后 .el-dialog.kb-dialog 从 DOM 卸载（基线 v-if 语义）`, dialogGone)

    // ============ B/C：新建文档弹窗（data-autofocus / defaultValue / IME input 级） ============
    // 载体原为树行「重命名」的 InputDialog；重命名改为行内编辑后该壳已删除，
    // 同一组 el-dialog 契约改挂 KnowledgeDocCreateDialog（同样带 data-autofocus 与预填）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await page
      .locator('[title="新建内容"]')
      .locator("xpath=following-sibling::div")
      .getByRole("button", { name: "新建文档", exact: true })
      .click()
    const createDialog = visibleDialog(page)
    await createDialog.waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const createInput = page.locator(".el-dialog input[data-autofocus]").first()
    const autofocusOk = await page.evaluate(() => {
      const active = document.activeElement
      return (
        active instanceof HTMLInputElement && active.hasAttribute("data-autofocus") && !!active.closest(".el-input")
      )
    })
    check(`${prefix} C9 data-autofocus（DocCreate）：宏任务聚焦晚于 EP 容器聚焦，落原生 input`, autofocusOk)
    const prefill = (await createInput.inputValue()) ?? ""
    check(`${prefix} B3 defaultValue 预填：输入框初始值为新建默认标题`, prefill === "新建文档", prefill)
    const createConfirmBtn = page.locator(".el-dialog").getByRole("button", { name: "新建", exact: true })
    await createInput.fill("")
    await page.waitForTimeout(200)
    const disabledWhenEmpty = await createConfirmBtn.isDisabled()
    await createInput.fill("  ")
    await page.waitForTimeout(200)
    const disabledWhenBlank = await createConfirmBtn.isDisabled()
    check(
      `${prefix} B4 空值禁用新建：清空 / 纯空白均 disabled（trim 契约保真）`,
      disabledWhenEmpty && disabledWhenBlank,
      `empty=${disabledWhenEmpty} blank=${disabledWhenBlank}`
    )
    await dispatchComposingEsc(page, ".el-dialog input[data-autofocus]")
    await page.waitForTimeout(500)
    const createStillOpen = await createDialog.isVisible()
    check(`${prefix} C10 IME 组词 Esc（input 级）：对话框不关闭`, createStillOpen)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)

    // ============ C：滚动锁计数 + 叠放 Esc 只关栈顶（ShareDialog × ConfirmDialog 跨家族） ============
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
      `${prefix} C11 开 ShareDialog（AppDialog 家族）：body 上锁 + EP 机制未启用`,
      overflowBefore !== "hidden" && shareOpenState.overflow === "hidden" && !shareOpenState.epLock,
      JSON.stringify(shareOpenState)
    )
    await page.getByText("更多分享设置", { exact: true }).click()
    await page.locator(".el-dialog button.text-error").first().waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(400)
    await page.locator(".el-dialog button.text-error").first().click()
    await visibleDialog(page).waitFor({ state: "visible", timeout: 15000 })
    await page.waitForTimeout(600)
    const stackedState = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      // T9 起全部对话框（含 ShareDialog）都带 kb-dialog，改数可见 .el-dialog
      visibleDialogs: [...document.querySelectorAll(".el-dialog")].filter(el => el.offsetParent !== null).length,
    }))
    check(
      `${prefix} C12 叠开本家族 ConfirmDialog：body 保持锁定（两层可见，计数协同）`,
      stackedState.overflow === "hidden" && stackedState.visibleDialogs === 2,
      JSON.stringify(stackedState)
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    const afterFirstEsc = await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      visibleDialogs: [...document.querySelectorAll(".el-dialog")].filter(el => el.offsetParent !== null).length,
      shareOpen: [...document.querySelectorAll(".el-dialog")].some(
        el => el.textContent?.includes("开启分享") && el.offsetParent !== null
      ),
    }))
    check(
      `${prefix} C13 叠放 Esc 只关栈顶：ConfirmDialog 关、ShareDialog 仍在、body 仍锁（栈空判定拦截提前解锁）`,
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
      `${prefix} C14 关闭最后一个对话框：body 解锁（对话框计数收尾）`,
      afterSecondEsc.overflow !== "hidden" && afterSecondEsc.visibleDialogs === 0,
      JSON.stringify(afterSecondEsc)
    )

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
    await page.screenshot({ path: `output/visual/ep-direct/t8/verify-error-${mode}.png` }).catch(() => {})
    await browser.close().catch(() => {})
    return false
  }
}

const light = await capturePass("light")
const dark = await capturePass("dark")
const failed = results.filter(r => !r.ok)
console.log(`\n断言 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length > 0) {
  for (const f of failed) console.error(`❌ ${f.name} — ${f.detail}`)
}
/**
 * 断言数下限（ratchet，取 2026-09-19 实测值留余量——部分脚本的 check 数会随数据态分支浮动）。脚本中途抛异常会让后续 check 静默不执行，
 * 汇总却只写「失败 0 项」——低于本下限即判为本轮盲跑，按失败退出。
 * 2026-09-19 加护栏后修掉四例陈旧载体（t3 switch 载体、t4 缺自建 published 文档
 * 与「目录」入口、t7「类型」触发器、t9「移动…」省略号错配），各下限按修好后实测值留余量重钉。
 */
const MIN_CHECKS = 55
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`
  )
}
if (!light || !dark || failed.length > 0 || passAborted || results.length < MIN_CHECKS) process.exit(1)
console.log("T8 验证全部通过")

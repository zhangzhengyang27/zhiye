/* global document, getComputedStyle, window */
/**
 * T7（解散 AppDropdownMenu，2 文件 4 处）行为与契约验证。
 *
 * 断言逐条对照基线行为清单（AppDropdownMenu 壳 → T7 验收表，见计划文档 T7 节），
 * A/B/C 模式沿用 T2-T6（明暗各一轮）：
 * A. 起始页 3 筛选（纯文本条目直用 el-dropdown）：触发器继承链回退；popper 几何
 *    （z 500/144 地板/12px 圆角/4px 内边距/surface 底/elevated 阴影/无箭头）；
 *    条目基线观感（14px/500/secondary/8px 10px 内边距/8px 圆角/muted hover）+ 暗色
 *    --kb-text-on-fill；键盘 EP 默认（ArrowDown 开+焦点落首项、roving 循环、Enter 触发自动关）
 *    与记档差异（ArrowUp 不再开菜单；鼠标打开后 ArrowDown 焦点不动）；Esc 截停
 *    （开：只关菜单+归还触发器焦点+冒泡监听收不到；关：Esc 照常冒泡）。
 * B. 编辑器「更多操作」（EditorMoreMenu 业务件）：popper 同几何 + kb-editor-more-menu-
 *    popper 命中；分组标题不可聚焦不可点、分隔线数量；父子菜单面板内展开（aria-expanded
 *    切换、外层保活、可多组同开无互斥、重开重置）；子项缩进 32px/13px/tertiary（暗
 *    0.6 白）；禁用项跳过+点击吞掉+quaternary 字；危险项 error 色（暗走 token 换档）；
 *    方向键进出二级；Enter 触发子项（菜单关+触发器焦点+onSelect 副作用=信息面板开）；
 *    打开后聚焦首项（收编清单 b）+鼠标打开后方向键可用；Tab 关菜单。
 * C. 结构手法级：composable Esc 截停的冒泡阻断（AppDialog 文档级监听收不到）、
 *    展开状态重开重置、hide-on-click=false 下的显式收口顺序（关菜单→焦点→onSelect）。
 *
 * 0. CSS bundle 结构性损坏哨兵（复制自 verify-t5/t6，每轮最先跑）：token 挂载 /
 *    bridge html:root / Tailwind utilities 三哨兵 + dist 定位线索（含 T7 的
 *    el-dropdown 中和段与 z 钉标志）。
 *
 * 用法：node scripts/verify-t7.mjs（需 4173 preview + 后端 3200）
 * 退出码：全过为 0，任一失败为 1。
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

const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T7 直用改造文档"
const DOC_CONTENT = "# T7 直用改造文档\n\n用于解散 AppDropdownMenu 的行为断言。\n"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T7验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/**
 * 哨兵失败时的定位线索：grep dist 产物中的存活标志（同 verify-t5/t6，
 * el-dropdown 中和段与 z 钉标志为本任务追加）。
 */
const reportBundleClues = () => {
  const flags = [
    [
      "--el-color-primary: var(--kb-brand)",
      "element-plus-bridge.css 的 html:root 桥接（变量死亡 → 查 bridge.css / calibration.css 注释意外终止）",
    ],
    [
      ".h-9{",
      'Tailwind utilities（缺失 → 查 style.css 的 @import "tailwindcss" 是否被吞、层序是否塌）',
    ],
    ["@layer theme", "Tailwind 层序声明（缺失 → style.css 首部被吞）"],
    [
      ".el-select.el-select{display:revert-layer",
      "校准 el-select 根中和段（缺失 → 查 calibration.css el-select 段前注释是否意外终止）",
    ],
    [
      ".el-dropdown.el-dropdown{color:revert-layer",
      "校准 el-dropdown 触发器根中和段（缺失 → 查 calibration.css el-dropdown 段前注释是否意外终止）",
    ],
    [
      ".el-dropdown__popper{z-index:var(--kb-z-popper)!important}",
      "校准层 el-dropdown popper z 钉（缺失 → 查 calibration.css 第 3 节 z 钉段）",
    ],
    ["--kb-z-popper", "popper z 档 token（缺失 → 查 tokens.css 是否被吞）"],
  ]
  const files = fs
    .readdirSync("dist/assets")
    .filter((f) => f.startsWith("index-") && f.endsWith(".css"))
  for (const file of files) {
    const css = fs.readFileSync(`dist/assets/${file}`, "utf8")
    for (const [flag, hint] of flags) {
      if (!css.includes(flag)) {
        logStep("[T7验证]", `定位线索：dist/assets/${file} 缺少标志「${flag}」→ ${hint}`)
      }
    }
  }
}

/** 哨兵断言本体（运行时 CSSOM + computed，每轮最先执行；本体与 verify-t5/t6 一致） */
const checkCssBundleSentinels = async (page, prefix) => {
  const sentry = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const tokens = ["--kb-muted-bg", "--kb-brand", "--kb-text", "--kb-z-popper"].map((name) => [
      name,
      cs.getPropertyValue(name),
    ])
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
      const walk = (list) => {
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
          if (
            !h9Found &&
            sel.split(",").some((s) => s.trim() === ".h-9") &&
            rule.style.getPropertyValue("height")
          ) {
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
    `${prefix} 哨兵① 关键 token 挂载（--kb-muted-bg/--kb-brand/--kb-text/--kb-z-popper 非空）`,
    okTokens,
    dead.length
      ? `空值：${dead.map(([n]) => n).join(",")}`
      : sentry.tokens.map(([n, v]) => `${n}=${v}`).join(" "),
  )
  check(
    `${prefix} 哨兵② bridge 生效（CSSOM 存在 html:root 且 --el-color-primary 有值）`,
    okBridge,
    okBridge
      ? `primary=${sentry.bridgePrimary}`
      : `sheets=${sentry.sheetCount}，未见 html:root 规则`,
  )
  check(
    `${prefix} 哨兵③ Tailwind utilities 存活（CSSOM 存在 .h-9 规则）`,
    okUtilities,
    okUtilities ? "height=calc(var(--spacing) * 9)" : "未见 .h-9 规则",
  )
  if (!ok) {
    check(
      `${prefix} CSS bundle 结构性损坏（哨兵组未全过，后续视觉断言不可信）`,
      false,
      "见上方失败哨兵与下方定位线索",
    )
    reportBundleClues()
  }
  return ok
}

/** 计算样式便捷读取 */
const computedOf = (locator, props) =>
  locator.evaluate((el, names) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]))
  }, props)

/** token 颜色换算成 rgb 口径（借助临时隐藏元素） */
const tokenRgb = (page, token) =>
  page.evaluate((t) => {
    const probe = document.createElement("div")
    probe.style.backgroundColor = `var(${t})`
    probe.style.display = "none"
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, token)

/** token 阴影换算成 computed 口径 */
const tokenShadow = (page, token) =>
  page.evaluate((t) => {
    const probe = document.createElement("div")
    probe.style.boxShadow = `var(${t})`
    probe.style.display = "none"
    document.body.appendChild(probe)
    const shadow = getComputedStyle(probe).boxShadow
    probe.remove()
    return shadow
  }, token)

/** 当前打开的 dropdown popper（aria-hidden=false 收窄；EP 关闭后 persistent 弹层仍在 DOM） */
const openPopper = (page) => page.locator('.el-dropdown__popper[aria-hidden="false"]').first()

/** 注册冒泡阶段 Esc 侦测（AppDialog 的 document 冒泡 keydown 同机制代理） */
const armBubbleEscProbe = (page) =>
  page.evaluate(() => {
    window.__t7EscBubble = 0
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") window.__t7EscBubble += 1
    })
  })

const bubbleEscCount = (page) => page.evaluate(() => window.__t7EscBubble)

/** activeElement 的速查描述（li/按钮/body） */
const activeElementInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el) return { kind: "none" }
    if (el.classList.contains("el-dropdown-menu__item")) {
      return { kind: "menuitem", text: (el.textContent ?? "").trim().slice(0, 20) }
    }
    return { kind: el.tagName.toLowerCase(), text: (el.textContent ?? "").trim().slice(0, 20) }
  })

/** popper 面板几何断言（起始页与编辑器菜单共用全局校准段） */
const checkPopperGeometry = async (page, prefix, popper) => {
  const styles = await computedOf(popper, [
    "z-index",
    "min-width",
    "padding",
    "border-radius",
    "background-color",
    "box-shadow",
    "border-top-color",
    "font-size",
    "line-height",
  ])
  const surfaceRgb = await tokenRgb(page, "--kb-surface-bg")
  const elevatedShadow = await tokenShadow(page, "--kb-elevated-shadow")
  const borderRgb = await tokenRgb(page, "--kb-border")
  check(
    `${prefix} popper 几何：z 500/144 地板/4px 内边距/12px 圆角/surface 底/elevated 阴影/kb-border 描边（壳非 scoped 块迁移）`,
    styles["z-index"] === "500" &&
      parseFloat(styles["min-width"]) >= 144 &&
      styles.padding === "4px" &&
      parseFloat(styles["border-radius"]) === 12 &&
      styles["background-color"] === surfaceRgb &&
      styles["box-shadow"] === elevatedShadow &&
      styles["border-top-color"] === borderRgb,
    JSON.stringify(styles),
  )
  // 字号行高回退 = 继承 body（壳 line-height:inherit 同语义；起始页 body 1.6 → 22.4、
  // 编辑器页 1.5715 → 22.001，逐页对照 body 计算值）
  const bodyFont = await page.evaluate(() => {
    const cs = getComputedStyle(document.body)
    return { fontSize: cs.fontSize, lineHeight: cs.lineHeight }
  })
  check(
    `${prefix} popper 字号行高回退继承（EP 12px/20px tooltip 尺寸已中和，与 body 继承链一致）`,
    styles["font-size"] === bodyFont.fontSize && styles["line-height"] === bodyFont.lineHeight,
    `popper=${styles["font-size"]}/${styles["line-height"]} body=${bodyFont.fontSize}/${bodyFont.lineHeight}`,
  )
  const arrowCount = await popper.locator(".el-popper__arrow").count()
  check(
    `${prefix} 弹层小箭头不渲染（show-arrow=false 直传；display:none 兜底）`,
    arrowCount === 0,
    `count=${arrowCount}`,
  )
  // 面板封顶（壳组件级 max-height 逐调用点透传，T7 评审补缺口）：EP 经 addUnit 原样
  // 落到 el-scrollbar__wrap 内联样式，952 视口下 min(510px, calc(80vh - 10px)) 解析为 510px
  const wrapMax = await popper
    .locator(".el-scrollbar__wrap")
    .first()
    .evaluate((el) => getComputedStyle(el).maxHeight)
  check(
    `${prefix} 面板封顶：wrap max-height 510px（壳 min(510px, 80vh-10px) 等价表达式）`,
    wrapMax === "510px",
    wrapMax,
  )
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T7验证:${mode}]`
  const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )

  try {
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T7 内容库")
    // 刻意不做版本追加：编辑器菜单「对比历史版本」需保持禁用态（禁用项断言依赖）
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })

    // ============ 0. CSS bundle 结构性损坏哨兵（最先跑，见文件头说明） ============
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.locator(".el-dropdown").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await checkCssBundleSentinels(page, prefix)
    await armBubbleEscProbe(page)

    // ============ A：起始页 3 筛选（纯文本条目直用 el-dropdown） ============
    const dropdownRoots = await page.locator(".el-dropdown").count()
    check(
      `${prefix} 调用面结构：开始页 3 个 el-dropdown 触发器根在位`,
      dropdownRoots === 3,
      `count=${dropdownRoots}`,
    )

    // 触发器文案现为纯「类型」（早期形态是「类型: 当前值」），故按前缀匹配
    const typeTrigger = page.getByRole("button", { name: /^类型/ })
    const typeDropdownRoot = typeTrigger.locator(
      "xpath=ancestor::div[contains(@class,'el-dropdown')][1]",
    )
    const parentStyles = await typeDropdownRoot.evaluate((el) => {
      const cs = getComputedStyle(el.parentElement)
      return { color: cs.color, fontSize: cs.fontSize, lineHeight: cs.lineHeight }
    })
    const rootStyles = await computedOf(typeDropdownRoot, ["color", "font-size", "line-height"])
    check(
      `${prefix} 触发器继承链：EP 根 color/font-size/line-height 已回退继承（壳 .kb-el-dropdown 同款）`,
      rootStyles.color === parentStyles.color &&
        rootStyles["font-size"] === parentStyles.fontSize &&
        rootStyles["line-height"] === parentStyles.lineHeight,
      `root=${JSON.stringify(rootStyles)} parent=${JSON.stringify(parentStyles)}`,
    )

    // —— 键盘 EP 默认：ArrowDown 开 + 焦点落首项 + roving 循环 + Enter 触发自动关
    await typeTrigger.focus()
    await page.keyboard.press("ArrowDown")
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(300)
    let active = await activeElementInfo(page)
    check(
      `${prefix} 键盘开（EP 默认）：ArrowDown 打开且焦点直接落首项 li（T1 实测口径）`,
      active.kind === "menuitem" && active.text === "全部",
      JSON.stringify(active),
    )
    await page.keyboard.press("ArrowDown")
    active = await activeElementInfo(page)
    check(
      `${prefix} roving：ArrowDown 移动到下一项（文档）`,
      active.kind === "menuitem" && active.text === "文档",
      JSON.stringify(active),
    )
    await page.keyboard.press("ArrowUp")
    active = await activeElementInfo(page)
    check(
      `${prefix} roving：ArrowUp 移回上一项（全部）`,
      active.kind === "menuitem" && active.text === "全部",
      JSON.stringify(active),
    )

    // 条目基线观感（测未聚焦的第二项：聚焦项会被 style.css 全局 :focus-visible 以
    // border-radius 4px 命中——壳时代同链路，属基线行为，另在键盘断言中体现）
    const secondItem = openPopper(page).locator(".el-dropdown-menu__item").nth(1)
    const mutedRgb = await tokenRgb(page, "--kb-muted-bg")
    const expectedItemColor =
      mode === "dark"
        ? await tokenRgb(page, "--kb-text-on-fill")
        : await tokenRgb(page, "--kb-text-secondary")
    const itemStyles = await computedOf(secondItem, [
      "font-size",
      "line-height",
      "font-weight",
      "padding",
      "border-radius",
      "color",
      "cursor",
      "display",
    ])
    check(
      `${prefix} 条目基线观感：14px/20px 行盒/500 字重/8px 10px 内边距/8px 圆角/secondary 字/block（壳 ITEM_BTN_CLASS 等价展开）`,
      itemStyles["font-size"] === "14px" &&
        itemStyles["line-height"] === "20px" &&
        itemStyles["font-weight"] === "500" &&
        itemStyles.padding === "8px 10px" &&
        parseFloat(itemStyles["border-radius"]) === 8 &&
        itemStyles.color === expectedItemColor &&
        itemStyles.cursor === "pointer" &&
        itemStyles.display === "block",
      JSON.stringify(itemStyles),
    )

    // 焦点态条目：style.css 全局 :focus-visible（unlayered）把圆角压回 4px、环由校准
    // 层 box-shadow 承担——壳时代 li 同链路（全局规则壳时代同样命中），基线行为逐条一致
    const focusedItemStyles = await computedOf(
      openPopper(page).locator(".el-dropdown-menu__item").first(),
      ["border-radius", "outline", "box-shadow"],
    )
    const brandRgb = await tokenRgb(page, "--kb-brand")
    check(
      `${prefix} 焦点态条目：全局 :focus-visible 圆角 4px（基线既有链路）+ 校准层 ring-2 ring-brand 焦点环`,
      parseFloat(focusedItemStyles["border-radius"]) === 4 &&
        focusedItemStyles["box-shadow"].includes(brandRgb),
      JSON.stringify(focusedItemStyles),
    )

    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(450)
    const typeLabelAfterEnter = await typeTrigger.textContent()
    check(
      `${prefix} Enter 触发并自动关（EP hide-on-click 默认）：菜单关闭 + 触发器文案不变`,
      (await openPopper(page).count()) === 0 && (typeLabelAfterEnter ?? "").trim() === "类型",
      (typeLabelAfterEnter ?? "").trim(),
    )
    // 覆盖收缩记档：原断言另查了「v-model 生效（类型: 文档）」——依赖触发器回显所选值。
    // 现产品形态里触发器是静态「类型 ▾」（@command 只写 selectedType，无选中态类绑定），
    // 该回显不存在，故此处只断言键盘触发与自动关；筛选生效改由列表结果断言覆盖。

    // 复位为「全部」（键盘重开 → 首项即全部 → Enter）
    await typeTrigger.focus()
    await page.keyboard.press("ArrowDown")
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(250)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(400)

    // —— 记档差异（EP 默认）：ArrowUp 不再开菜单（EP 默认 triggerKeys 无 ArrowUp，壳有）
    await typeTrigger.focus()
    await page.keyboard.press("ArrowUp")
    await page.waitForTimeout(400)
    const arrowUpOpened = await openPopper(page).count()
    check(
      `${prefix} 记档差异（EP 默认）：ArrowUp 不再开菜单（EP 默认 triggerKeys，壳有 ArrowUp——T1 收编清单接受默认）`,
      arrowUpOpened === 0,
      `popper=${arrowUpOpened}`,
    )

    // —— 鼠标打开后键盘导航（实测记档）：T1 探针的「isUsingKeyboard=false 链路下
    //      ArrowDown 焦点不动」在本仓未复现——EP handleShowTooltip 开层即聚焦 ul，
    //      ul 上的 ArrowDown 经 roving onKeydown 落到首项（与基线「鼠标打开后方向键
    //      可用」同向，基线更优行为白赚）
    await typeTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(300)
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(200)
    active = await activeElementInfo(page)
    check(
      `${prefix} 鼠标打开后方向键可用（基线自建菜单行为；T1 探针的焦点不动未在本仓复现，记档）`,
      active.kind === "menuitem" && active.text === "全部",
      JSON.stringify(active),
    )

    // —— 条目 hover：muted 底（亮色断言；暗色由 token 换档自动一致）
    await secondItem.hover()
    await page.waitForTimeout(250)
    const hoverBg = await secondItem.evaluate((el) => getComputedStyle(el).backgroundColor)
    check(`${prefix} 条目 hover：muted 底（基线 hover:bg-muted）`, hoverBg === mutedRgb, hoverBg)

    // —— Esc 截停（收编清单 a）：开 → 只关菜单 + 归还触发器焦点 + 冒泡监听收不到
    const beforeBubble = await bubbleEscCount(page)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(450)
    const triggerFocused = await page.evaluate(
      (el) => document.activeElement === el,
      await typeTrigger.elementHandle(),
    )
    const afterBubble = await bubbleEscCount(page)
    check(
      `${prefix} Esc 截停·开：菜单关闭 + 触发器焦点归还（基线 resolveTrigger 语义）`,
      (await openPopper(page).count()) === 0 && triggerFocused,
      `triggerFocused=${triggerFocused}`,
    )
    check(
      `${prefix} Esc 截停·开：捕获阶段 stopPropagation 生效——document 冒泡监听（AppDialog 同机制）收不到该次 Esc`,
      afterBubble === beforeBubble,
      `bubble ${beforeBubble}→${afterBubble}`,
    )

    // —— Esc 关闭态不拦截：Esc 照常冒泡（AppDialog 关闭链路依赖）
    await page.keyboard.press("Escape")
    await page.waitForTimeout(300)
    const closedBubble = await bubbleEscCount(page)
    check(
      `${prefix} Esc 截停·关：菜单关闭态不拦截，Esc 照常冒泡（AppDialog Esc 链路不受影响）`,
      closedBubble === afterBubble + 1,
      `bubble ${afterBubble}→${closedBubble}`,
    )

    // —— popper 几何（type 筛选展开态复用）
    await typeTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(300)
    await checkPopperGeometry(page, `${prefix} 起始页`, openPopper(page))
    await page.keyboard.press("Escape")
    await page.waitForTimeout(350)

    // 暗色条目字色（style.css html.dark .text-ink-secondary 通配的复刻链路）
    if (mode === "dark") {
      await typeTrigger.click()
      await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
      await page.waitForTimeout(300)
      const darkItemColor = await openPopper(page)
        .locator(".el-dropdown-menu__item")
        .first()
        .evaluate((el) => getComputedStyle(el).color)
      check(
        `${prefix} 暗色条目字色 = --kb-text-on-fill（批 18 起由 token 供给，原 .75 白字面量）`,
        darkItemColor === (await tokenRgb(page, "--kb-text-on-fill")),
        darkItemColor,
      )
      await page.keyboard.press("Escape")
      await page.waitForTimeout(350)
    }

    // ============ B：编辑器「更多操作」菜单（EditorMoreMenu 业务件） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    // 先开一次等 settle 再 reload（Lake 编辑器首开规范化内容触发自动保存，会改菜单项文案）
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)

    const moreTrigger = page.locator("header").locator('[title="更多操作"]')
    await moreTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(350)
    const editorPopper = openPopper(page)
    check(
      `${prefix} 编辑器菜单：popper-class=kb-editor-more-menu-popper 命中（业务件透传块的作用域）`,
      (await page
        .locator('.el-dropdown__popper.kb-editor-more-menu-popper[aria-hidden="false"]')
        .count()) === 1,
    )
    await checkPopperGeometry(page, `${prefix} 编辑器`, editorPopper)

    // —— 收编清单 b：鼠标打开后聚焦首项，方向键即刻可用
    active = await activeElementInfo(page)
    check(
      `${prefix} 打开后聚焦首项（收编清单 b，编辑器菜单专属）：焦点落首个可聚焦项`,
      active.kind === "menuitem",
      JSON.stringify(active),
    )
    const firstFocusText = active.text
    await page.keyboard.press("ArrowDown")
    active = await activeElementInfo(page)
    check(
      `${prefix} 鼠标打开后方向键可用（基线自建菜单行为，EP 默认不移动焦点由 composable 补齐）`,
      active.kind === "menuitem" && active.text !== firstFocusText,
      `${firstFocusText} → ${active.text}`,
    )

    // —— 结构：分组标题/分隔线/父子菜单计数与 aria 初态
    const structure = await editorPopper.evaluate(() => {
      const root = document.querySelector('.el-dropdown__popper[aria-hidden="false"]')
      const labels = [...root.querySelectorAll("li[role='presentation']")]
      const separators = [...root.querySelectorAll("li[role='separator']")]
      const items = [...root.querySelectorAll(".el-dropdown-menu__item")]
      const parents = items.filter((li) => li.hasAttribute("aria-expanded"))
      return {
        labels: labels.map((li) => (li.textContent ?? "").trim()),
        labelFocusable: labels.filter((li) => li.tabIndex >= 0).length,
        separators: separators.length,
        items: items.length,
        parents: parents.length,
      }
    })
    check(
      `${prefix} 结构：6 组标题（5 常驻 + canEdit 文档管理）/5 条分隔线/12 个条目 li/5 个子菜单父项`,
      structure.labels.length === 6 &&
        structure.labels[0] === "状态与同步" &&
        structure.labels[5] === "文档管理" &&
        structure.separators === 5 &&
        structure.items === 12 &&
        structure.parents === 5,
      JSON.stringify(structure),
    )
    // fix/ep-leftovers（有意行为变更，T7 遗留风险 #2 修复）：壳时代模板 v-if/v-else-if
    // 配对断裂已修正——收起态只渲染真实条目（5 父项 + 7 普通项 = 12），不再有幻影 li。
    // 修复前 17 = 12 + 5 幻影（幻影每条 38px、可聚焦、点击静默关菜单；面板总高
    // 854.69px → 664.69px，-190px），pixdiff 差异记档 output/visual/ep-direct/
    // ep-leftovers-pixdiff/t7-before-vs-after.json（差异全部落在菜单 popper 区内，
    // 起始页 8 屏对照 0 差）。
    const phantomProbe = await editorPopper.evaluate(() => {
      const root = document.querySelector('.el-dropdown__popper[aria-hidden="false"]')
      const items = [...root.querySelectorAll(".el-dropdown-menu__item")]
      const parents = items.filter((li) => li.hasAttribute("aria-expanded"))
      const parentTexts = new Set(parents.map((li) => (li.textContent ?? "").trim()))
      const phantoms = items.filter((li) => {
        if (li.hasAttribute("aria-expanded")) return false
        const text = (li.textContent ?? "").trim()
        return text !== "" && parentTexts.has(text)
      })
      return {
        items: items.length,
        parents: parents.length,
        phantoms: phantoms.map((li) => (li.textContent ?? "").trim().slice(0, 20)),
        emptyItems: items.filter((li) => (li.textContent ?? "").trim() === "").length,
      }
    })
    check(
      `${prefix} 无幻影：收起态条目数 = 父项(5) + 普通项(7) = 12，无父项重复行（幻影）且无空 li`,
      phantomProbe.items === phantomProbe.parents + 7 &&
        phantomProbe.phantoms.length === 0 &&
        phantomProbe.emptyItems === 0,
      JSON.stringify(phantomProbe),
    )
    // —— 无幻影·roving 全程：ArrowDown 走完整圈（12 步回环），不经过空位/父项重复行
    const walkStart = await activeElementInfo(page)
    const walkTexts = [walkStart.text ?? ""]
    for (let i = 0; i < 11; i += 1) {
      await page.keyboard.press("ArrowDown")
      await page.waitForTimeout(120)
      walkTexts.push((await activeElementInfo(page)).text ?? "")
    }
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(120)
    const walkBack = await activeElementInfo(page)
    // 父项标签按「同一父项的互斥文案组」断言各出现一次（面板父项文案随面板开合切换）
    const parentLabelGroups = [
      ["打开右侧面板", "切换右侧面板"],
      ["历史版本与对比"],
      ["复制与打开"],
      ["所在空间"],
      ["导出与打印"],
    ]
    check(
      `${prefix} 无幻影·roving 全程：ArrowDown 12 步全为真实条目（无空位，父项各出现一次）且回环到起点`,
      walkTexts.every((t) => t.length > 0) &&
        new Set(walkTexts).size === 12 &&
        parentLabelGroups.every(
          (alts) => walkTexts.filter((t) => alts.some((a) => t.startsWith(a))).length === 1,
        ) &&
        walkBack.kind === "menuitem" &&
        walkBack.text === walkStart.text,
      JSON.stringify(walkTexts),
    )
    check(
      `${prefix} 分组标题不可聚焦（普通 li，不进 roving 收集，方向键自动跳过）`,
      structure.labelFocusable === 0,
      `focusable=${structure.labelFocusable}`,
    )
    // 分组标题点击无效果（菜单不关、无命令）
    await editorPopper.locator("li[role='presentation']").first().click()
    await page.waitForTimeout(300)
    check(
      `${prefix} 分组标题不可点：点击标题菜单不关闭（基线 label li 行为）`,
      (await openPopper(page).count()) === 1,
    )

    // —— 子菜单面板内展开：点击父项展开缩进二级、外层保活（T1 判定的核心形态）
    const versionsParent = editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: "历史版本与对比" })
      .first()
    await versionsParent.click()
    await page.waitForTimeout(350)
    const expandedState = await versionsParent.getAttribute("aria-expanded")
    const childCount = await editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: "打开历史版本" })
      .count()
    check(
      `${prefix} 面板内展开：父项点击展开缩进二级（aria-expanded=true）且外层菜单保活（嵌套 el-dropdown 浮层方案被 T1 否决的形态）`,
      expandedState === "true" && childCount === 1 && (await openPopper(page).count()) === 1,
      `aria=${expandedState} child=${childCount}`,
    )

    // —— 无互斥（基线 expandedParents Set 语义）：再展开「复制与打开」，前者保持
    const copyParent = editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: "复制与打开" })
      .first()
    await copyParent.click()
    await page.waitForTimeout(350)
    const versionsStillOpen = await versionsParent.getAttribute("aria-expanded")
    const copyOpen = await copyParent.getAttribute("aria-expanded")
    check(
      `${prefix} 面板内展开·无互斥：多组可同时展开（expandedParents Set 语义）`,
      versionsStillOpen === "true" && copyOpen === "true",
      `versions=${versionsStillOpen} copy=${copyOpen}`,
    )

    // —— 二级条目度量：缩进 32px（pl-8）；字号 14px 与字色为编辑器页 antd.css 既有
    //      交互（button 的 font-size/color:inherit 压过 text-[13px]/text-ink-tertiary
    //      utility，文字走继承链——壳文件头记档的「两页本来就不同」，亮=body 色 0.85 黑，
    //      暗=html.dark .text-ink-tertiary !important 胜出 0.6 白），pixdiff 0 差佐证
    const versionsChild = editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: "打开历史版本" })
      .first()
    const childStyles = await computedOf(versionsChild.locator("button"), [
      "padding-left",
      "font-size",
      "color",
    ])
    const bodyColor = await page.evaluate(() => getComputedStyle(document.body).color)
    // 暗色三级字色自 2026-09-19 批 7 起单源于 --kb-text-tertiary（#a5a5a5），不再写 rgba 字面量
    const expectedChildColor = mode === "dark" ? "rgb(165, 165, 165)" : bodyColor
    check(
      `${prefix} 二级条目：缩进 32px（pl-8）+ antd.css 继承链字号/字色（基线两页差异的编辑器页口径）`,
      childStyles["padding-left"] === "32px" &&
        childStyles["font-size"] === "14px" &&
        childStyles.color === expectedChildColor,
      JSON.stringify(childStyles),
    )

    // —— 禁用项（对比历史版本，文档仅 1 版本）：is-disabled + 点击吞掉；字色为
    //      编辑器页 antd.css 既有交互（button color:inherit 压过 text-ink-quaternary
    //      utility，亮=body 色，暗=html.dark .text-ink-quaternary !important 0.45 白，
    //      壳时代同链路）
    const disabledChild = editorPopper
      .locator(".el-dropdown-menu__item.is-disabled")
      .filter({ hasText: "对比历史版本" })
    const disabledCount = await disabledChild.count()
    const disabledColor = disabledCount
      ? await computedOf(disabledChild.first().locator("button"), ["color"])
      : { color: "missing" }
    await disabledChild.first().evaluate((el) => el.querySelector("button")?.click())
    await page.waitForTimeout(300)
    check(
      `${prefix} 禁用项：is-disabled 呈现 + antd.css 继承链字色 + 点击吞掉（菜单不关、回调不触发）`,
      disabledCount === 1 &&
        disabledColor.color ===
          (mode === "dark"
            ? "rgb(132, 132, 132)"
            : await page.evaluate(() => getComputedStyle(document.body).color)) &&
        (await openPopper(page).count()) === 1,
      `count=${disabledCount} color=${disabledColor.color}`,
    )

    // —— roving 跳过禁用项：从「打开历史版本」ArrowDown 应落到「复制与打开」
    //      （roving 键盘处理要求事件 target 即 li 本身，必须聚焦 li 而非内层 button）
    await versionsChild.focus()
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(200)
    active = await activeElementInfo(page)
    check(
      `${prefix} roving 跳过禁用项：打开历史版本 → 复制与打开（对比历史版本被跳过）`,
      active.kind === "menuitem" && active.text.startsWith("复制与打开"),
      JSON.stringify(active),
    )

    // —— 方向键进出二级：父项 ArrowDown 进首个子项、子项 ArrowUp 回父项
    await versionsParent.focus()
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(200)
    active = await activeElementInfo(page)
    const intoChild = active.kind === "menuitem" && active.text.startsWith("打开历史版本")
    await page.keyboard.press("ArrowUp")
    await page.waitForTimeout(200)
    active = await activeElementInfo(page)
    check(
      `${prefix} 方向键进出二级：父项 ArrowDown 进首子项、ArrowUp 回父项（roving 线性序承担，收编清单 c）`,
      intoChild && active.kind === "menuitem" && active.text.startsWith("历史版本与对比"),
      `into=${intoChild} back=${JSON.stringify(active)}`,
    )

    // —— Enter 触发父项 = 仅切换展开（不关菜单不触发 onSelect）
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)
    const collapsedByEnter = await versionsParent.getAttribute("aria-expanded")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)
    const expandedByEnter = await versionsParent.getAttribute("aria-expanded")
    check(
      `${prefix} 父项 Enter：仅切换展开（收起→再展开），菜单保持打开`,
      collapsedByEnter === "false" &&
        expandedByEnter === "true" &&
        (await openPopper(page).count()) === 1,
      `toggle=${collapsedByEnter}→${expandedByEnter}`,
    )

    // —— 重开重置（visible-change(true) 清空 expandedParents）
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    await moreTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(350)
    const expandedAfterReopen = await editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: "历史版本与对比" })
      .first()
      .getAttribute("aria-expanded")
    check(
      `${prefix} 重开重置：重新打开后所有子菜单收起（壳 visible-change(true) 重置语义）`,
      expandedAfterReopen === "false",
      `aria=${expandedAfterReopen}`,
    )

    // —— 收口顺序断言（hide-on-click=false 显式收口）：Enter 子项 → 关菜单 + 触发器
    //      焦点 + onSelect 副作用（打开文档信息 → 大纲按钮出现选中底色）
    const panelsParent = editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: /打开右侧面板|切换右侧面板/ })
      .first()
    await panelsParent.click()
    await page.waitForTimeout(300)
    const infoChild = editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: /打开文档信息|关闭文档信息/ })
      .first()
    await infoChild.locator("button").focus()
    await page.keyboard.press("Enter")
    await page.waitForTimeout(500)
    const outlineActivated = await page
      .locator('header [title="目录"]')
      .evaluate((el) => el.className.includes("bg-brand-faint"))
    const focusBackOnTrigger = await page.evaluate(
      (el) => document.activeElement === el,
      await moreTrigger.elementHandle(),
    )
    check(
      `${prefix} 子项 Enter 收口：菜单关闭 + 触发器焦点归还 + onSelect 执行（文档信息面板打开）`,
      (await openPopper(page).count()) === 0 && outlineActivated && focusBackOnTrigger,
      `panel=${outlineActivated} focus=${focusBackOnTrigger}`,
    )
    // 复位：信息面板（fixed 右缘覆盖 header 右侧按钮）经其遮罩点击关闭
    await page.mouse.click(80, 500)
    await page.waitForTimeout(400)
    const outlineRestored = await page
      .locator('header [title="目录"]')
      .evaluate((el) => !el.className.includes("bg-brand-faint"))
    check(
      `${prefix} 复位：文档信息面板经遮罩关闭（大纲按钮选中底色消失）`,
      outlineRestored,
      `restored=${outlineRestored}`,
    )

    // —— 危险项配色（color:"error" 走调用方类）：error 字 + hover error-bg
    //      （上一段子项 Enter 已把菜单收口，先重开）
    await moreTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(350)
    const dangerBtn = editorPopper
      .locator(".el-dropdown-menu__item")
      .filter({ hasText: "移入回收站" })
      .locator("button")
    const dangerColor = await computedOf(dangerBtn, ["color"])
    await dangerBtn.evaluate((el) => el.scrollIntoView({ block: "nearest" }))
    await dangerBtn.hover()
    await page.waitForTimeout(250)
    const dangerHoverBg = await dangerBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
    const errorBgRgb = await tokenRgb(page, "--kb-error-bg")
    check(
      `${prefix} 危险项：hover error-bg（基线 itemColorClass error 分支）+ 字色走 antd.css 继承链（button color:inherit 压过 text-error，暗 0.88 白——基线同链路）`,
      dangerColor.color === (await page.evaluate(() => getComputedStyle(document.body).color)) &&
        dangerHoverBg === errorBgRgb,
      `color=${dangerColor.color} hover=${dangerHoverBg}`,
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // —— Esc 截停 + Tab 关菜单（编辑器菜单共用 composable）
    await moreTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(350)
    const bubbleBefore = await bubbleEscCount(page)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const editorTriggerFocused = await page.evaluate(
      (el) => document.activeElement === el,
      await moreTrigger.elementHandle(),
    )
    check(
      `${prefix} Esc 截停（编辑器菜单）：关闭 + 触发器焦点归还 + 冒泡监听收不到（不关下层对话框的机制证明）`,
      (await openPopper(page).count()) === 0 &&
        editorTriggerFocused &&
        (await bubbleEscCount(page)) === bubbleBefore,
      `focus=${editorTriggerFocused}`,
    )
    await moreTrigger.click()
    await openPopper(page).waitFor({ state: "visible", timeout: 8000 })
    await page.waitForTimeout(350)
    await page.keyboard.press("Tab")
    await page.waitForTimeout(400)
    check(
      `${prefix} Tab 关菜单（基线「Tab 移出即关」，不阻断焦点自然移动）`,
      (await openPopper(page).count()) === 0,
    )

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
    await page
      .screenshot({ path: `output/visual/ep-direct/t7/verify-error-${mode}.png` })
      .catch(() => {})
    await browser.close().catch(() => {})
    return false
  }
}

const light = await capturePass("light")
const dark = await capturePass("dark")
const failed = results.filter((r) => !r.ok)
console.log(`\n断言 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length > 0) {
  for (const f of failed) console.error(`❌ ${f.name} — ${f.detail}`)
}
/**
 * 断言数下限（ratchet，取 2026-09-19 实测值留余量——部分脚本的 check 数会随数据态分支浮动）。脚本中途抛异常会让后续 check 静默不执行，
 * 汇总却只写「失败 0 项」——低于本下限即判为本轮盲跑，按失败退出。
 * 下限为 2026-09-19 修好陈旧载体后的实测值留余量（t4 曾静默只跑 13 条、t7 只跑 8 条）。
 */
const MIN_CHECKS = 85
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`,
  )
}
if (!light || !dark || failed.length > 0 || passAborted || results.length < MIN_CHECKS)
  process.exit(1)
console.log("T7 验证全部通过")

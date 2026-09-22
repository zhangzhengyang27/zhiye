/* global document, getComputedStyle, HTMLInputElement */
/**
 * T5（解散 AppInput，15 文件 27 处）行为与契约验证。
 *
 * 三组断言（明暗各一轮，沿用 T2/T3/T4 的 A/B/C 模式）：
 * A. 校准默认观感：直用 el-input 后计算样式与原壳逐属性一致——零覆盖输入框
 *    （settings 概要名称）36px 高/10px 圆角/13px 字号/muted 底/1px kb-border 描边；
 *    wrapper 幽灵化（透明/无描边/零内边距）；inner 贯通（height 100%/行高 normal/
 *    caret brand）；聚焦描边 brand（utilities 层 :focus-within，壳 scoped 规则的
 *    接班）；禁用态灰底 + quaternary 字（is-disabled 运行时探针）；
 *    inner 字色随根 --kb-text（暗 #e2e2e2 与亮 #262626 同链路；批 17 删掉 style.css 的
 *    html.dark input 通配后不再有两套）+ placeholder 0.35 白。
 * B. 覆盖契约探针：真实覆盖案例（trash 搜索框 h-8/pl-8——壳时代 twMerge
 *    'px-3 pl-8'='px-3 pl-8' 的右侧 12px 保留真值）+ 运行时 utilities（h-7/
 *    text-[14px]/rounded-[8px] 均为源码出现过的 utility）压过 components 兜底；
 *    4 处对话框 data-autofocus 落在原生 input 上（EP attrs 透传，T9 前过渡契约；
 *    InputDialog 随「重命名改行内编辑」删除后剩 create-kb/doc-create/add-member 3 处）；
 *    maxlength/autocomplete/min/max/step/type 直传原生。
 * C. 行为：v-model 输入（创建按钮 disabled→enabled）、password/type 落原生、
 *    3 处对话框打开后焦点落输入框（壳 onMounted 聚焦职责交还 AppDialog 宏任务，
 *    过渡期契约重点）、点击根 padding 盲区聚焦（utils/el-input-focus.ts 委托）、
 *    行内重命名 input（零弹窗/全选/空白不提交/提交后树行更新）、
 *    命令面板键盘路径不回归（自建 input 不受全局委托/校准影响）。
 *
 * 0. CSS bundle 结构性损坏哨兵（T5 评审 M1，每轮最先跑）：CSS 源文件里注释
 *    被意外终止（如注释正文出现星号紧连斜杠的序列）会静默吞掉后续规则且构建
 *    零报错（T5 实测：根中和段失踪，token/Tailwind utilities/桥接全部或部分
 *    死亡）。三条哨兵在所有视觉断言之前执行——① 关键 --kb-* token 在 html 上
 *    有值（tokens.css 未被吞）；② CSSOM 中存在 bridge 的 html:root 规则且
 *    --el-color-primary 有值（桥接未死）；③ 至少一条 utilities 类（.h-9）在
 *    CSSOM 中（Tailwind 层序未塌）。任一失败报「CSS bundle 结构性损坏」，
 *    并在 Node 侧 grep dist 产物给出缺失标志定位线索。
 *
 * 用法：node scripts/verify-t5.mjs（需 4173 preview + 后端 3200）
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
const DOC_TITLE = "T5 直用改造文档"
const DOC_CONTENT = "# T5 直用改造文档\n\n用于解散 AppInput 的行为断言。\n"
// 行内重命名会真的改标题，用专用载体文档，避免污染 DOC_TITLE 那批共享断言；
// 一轮跑完把标题改回，下一轮 ensure 命中同名文档不重复创建
const RENAME_TITLE = "T5 行内重命名载体"
const RENAME_CONTENT = "# T5 行内重命名载体\n\n用于行内重命名的行为断言。\n"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T5验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/**
 * 哨兵失败时的定位线索：grep dist 产物中的三个存活标志（bridge 变量、
 * Tailwind utilities、@layer theme 声明）。产物缺失哪个标志，就先去对应
 * 源文件查注释意外终止（校准/桥接文件头注释被截断会把后续规则吞进选择器）。
 */
const reportBundleClues = () => {
  const flags = [
    [
      "--el-color-primary: var(--kb-brand)",
      "element-plus-bridge.css 的 html:root 桥接（变量死亡 → 查 bridge.css / calibration.css 注释意外终止）",
    ],
    [".h-9{", 'Tailwind utilities（缺失 → 查 style.css 的 @import "tailwindcss" 是否被吞、层序是否塌）'],
    ["@layer theme", "Tailwind 层序声明（缺失 → style.css 首部被吞）"],
    [".el-input.el-input{width:revert-layer", "校准根中和段（缺失 → 查 calibration.css 中和段前注释是否意外终止）"],
  ]
  const files = fs.readdirSync("dist/assets").filter(f => f.startsWith("index-") && f.endsWith(".css"))
  for (const file of files) {
    const css = fs.readFileSync(`dist/assets/${file}`, "utf8")
    for (const [flag, hint] of flags) {
      if (!css.includes(flag)) {
        logStep("[T5验证]", `定位线索：dist/assets/${file} 缺少标志「${flag}」→ ${hint}`)
      }
    }
  }
}

/** 哨兵断言本体（运行时 CSSOM + computed，每轮最先执行） */
const checkCssBundleSentinels = async (page, prefix) => {
  const sentry = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const tokens = ["--kb-muted-bg", "--kb-brand", "--kb-text"].map(name => [name, cs.getPropertyValue(name)])
    // 遍历 CSSOM（含 @layer 递归）找 bridge 的 html:root 规则与 .h-9 utility。
    // bridge 判据收紧（T5 评审）：必须 selector === "html:root"（bridge.css 专属写法，
    // EP 自家只有 :root）且 --el-color-primary 为桥接形态 var(--kb-brand)——否则
    // bridge 被吞时 EP 的 :root 工厂值（#409eff）会造成假阳性。
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

/** 计算样式便捷读取 */
const computedOf = (locator, props) =>
  locator.evaluate((el, names) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(names.map(n => [n, cs.getPropertyValue(n)]))
  }, props)

/** token 颜色换算成 rgb 口径（借助临时隐藏元素） */
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

/** 焦点断言：activeElement 是带 data-autofocus 的原生 input */
const assertAutofocusFocus = async (page, prefix, label) => {
  const ok = await page.evaluate(() => {
    const active = document.activeElement
    return active instanceof HTMLInputElement && active.hasAttribute("data-autofocus") && !!active.closest(".el-input")
  })
  check(`${prefix} ${label}：打开后焦点落 data-autofocus 原生 input（过渡期契约）`, ok)
  return ok
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T5验证:${mode}]`
  const url = path => new URL(path, "http://127.0.0.1:4173").toString()

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light"
  )

  try {
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T5 内容库")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })
    await ensureDocument(kb.id, token, { title: RENAME_TITLE, content: RENAME_CONTENT })

    // ============ 0. CSS bundle 结构性损坏哨兵（最先跑，见文件头说明） ============
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.getByPlaceholder("搜索文档标题或知识库名称").waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await checkCssBundleSentinels(page, prefix)

    // ============ A/B：trash 屏（真实覆盖案例 + 幽灵化 + 暗色链路） ============
    const trashRoot = page
      .locator(".el-input")
      .filter({ has: page.getByPlaceholder("搜索文档标题或知识库名称") })
      .first()
    const rootCls = (await trashRoot.getAttribute("class")) ?? ""
    check(
      `${prefix} 根：EP 原生根（el-input）+ 调用方 class（h-8 pl-8 text-kb-sm）落根`,
      rootCls.includes("el-input") && rootCls.includes("pl-8"),
      rootCls.slice(0, 70)
    )
    const mutedRgb = await tokenRgb(page, "--kb-muted-bg")
    const borderRgb = await tokenRgb(page, "--kb-border")
    const inkRgb = await tokenRgb(page, "--kb-text")
    const rootStyles = await computedOf(trashRoot, [
      "height",
      "padding",
      "border-radius",
      "font-size",
      "background-color",
      "border-top-color",
      "border-top-width",
      "color",
      "display",
    ])
    check(
      `${prefix} 覆盖案例真值：h-8→32px、pl-8 左 32px + 壳 px-3 右 12px（twMerge 部分覆盖语义）、text-kb-sm→13px`,
      rootStyles.height === "32px" && rootStyles.padding === "0px 12px 0px 32px" && rootStyles["font-size"] === "13px",
      JSON.stringify(rootStyles)
    )
    check(
      `${prefix} 默认兜底：muted 底 + 10px 圆角 + 1px kb-border 描边 + ink 字（components 段）`,
      rootStyles["background-color"] === mutedRgb &&
        parseFloat(rootStyles["border-radius"]) === 10 &&
        rootStyles["border-top-width"] === "1px" &&
        rootStyles["border-top-color"] === borderRgb &&
        rootStyles.color === inkRgb,
      JSON.stringify(rootStyles)
    )
    check(`${prefix} EP 根 inline-flex 保留（零声明复用）`, rootStyles.display === "inline-flex", rootStyles.display)

    // wrapper/inner 幽灵化（结构手法级）
    const wrapper = trashRoot.locator(".el-input__wrapper").first()
    const inner = trashRoot.locator("input").first()
    const wrapperStyles = await computedOf(wrapper, [
      "padding",
      "background-color",
      "box-shadow",
      "border-radius",
      "height",
    ])
    const innerStyles = await computedOf(inner, ["height", "line-height", "font-size", "caret-color", "color"])
    check(
      `${prefix} wrapper 幽灵化：零内边距/透明底/无描边/圆角 0`,
      wrapperStyles.padding === "0px" &&
        wrapperStyles["background-color"] === "rgba(0, 0, 0, 0)" &&
        wrapperStyles["box-shadow"] === "none" &&
        parseFloat(wrapperStyles["border-radius"]) === 0,
      JSON.stringify(wrapperStyles)
    )
    // inner 字色 = 根的最终生效色（`.el-input` 默认档 color: var(--kb-text)）。
    // 暗色原先是 style.css html.dark input 通配的 0.88 白，该通配于批 17 删除后
    // 两套主题同走 token 档（暗 #e2e2e2 / 亮 #262626），断言反而分得清档位
    const expectedInnerColor = await tokenRgb(page, "--kb-text")
    check(
      `${prefix} inner 贯通：height 100%、行高 normal、字号随根、caret brand、字色随根 --kb-text`,
      innerStyles.height === wrapperStyles.height &&
        innerStyles["line-height"] === "normal" &&
        innerStyles["font-size"] === "13px" &&
        innerStyles["caret-color"] === (await tokenRgb(page, "--kb-brand")) &&
        innerStyles.color === expectedInnerColor,
      JSON.stringify(innerStyles)
    )
    const placeholderColor = await inner.evaluate(el => getComputedStyle(el, "::placeholder").color)
    const expectedPlaceholder =
      mode === "dark" ? "rgba(255, 255, 255, 0.35)" : await tokenRgb(page, "--kb-text-quaternary")
    check(
      `${prefix} placeholder：${mode === "dark" ? "0.35 白（.dark input::placeholder 链路）" : "quaternary（EP 桥接同壳零声明）"}`,
      placeholderColor === expectedPlaceholder,
      placeholderColor
    )

    // 聚焦描边（utilities 层 :focus-within，壳 scoped 规则的接班）
    await inner.focus()
    await page.waitForTimeout(300)
    const focusBorder = await trashRoot.evaluate(el => getComputedStyle(el).borderTopColor)
    const brandRgb = await tokenRgb(page, "--kb-brand")
    check(
      `${prefix} 聚焦描边：root border 变 brand（utilities 层 :focus-within）`,
      focusBorder === brandRgb,
      focusBorder
    )
    await inner.blur()
    await page.waitForTimeout(150)

    // 禁用态探针（运行时挂 is-disabled，壳口径：灰底 + quaternary 字）
    await trashRoot.evaluate(el => el.classList.add("is-disabled"))
    // 根上有 150ms background-color 过渡（壳 transition 基线），等过渡完成再读终值
    await page.waitForTimeout(300)
    const grey200Rgb = await tokenRgb(page, "--kb-grey-200")
    const quaternaryRgb = await tokenRgb(page, "--kb-text-quaternary")
    const disabledRoot = await computedOf(trashRoot, ["background-color"])
    const disabledInner = await computedOf(inner, ["color", "-webkit-text-fill-color"])
    // 禁用字 = quaternary（两套同档）：暗色原先被 html.dark input 通配抬成 0.88 白，
    // 通配于批 17 删除后回到校准层 is-disabled 的 quaternary 复刻档；
    // text-fill currentcolor 跟随最终生效色（壳时代既认共存，AppInput 文件头原记档）
    const expectedDisabledColor = quaternaryRgb
    check(
      `${prefix} 禁用态：根灰底 grey-200 + inner quaternary + text-fill 跟随`,
      disabledRoot["background-color"] === grey200Rgb && disabledInner.color === expectedDisabledColor,
      JSON.stringify({ disabledRoot, disabledInner })
    )
    await trashRoot.evaluate(el => el.classList.remove("is-disabled"))

    // 覆盖契约运行时探针：h-7 / text-[14px] / rounded-[8px]（源码出现过的 utility）
    await trashRoot.evaluate(el => {
      el.classList.remove("h-8", "text-kb-sm")
      el.classList.add("h-7", "text-[14px]", "rounded-[8px]")
    })
    const probed = await computedOf(trashRoot, ["height", "font-size", "border-radius"])
    await trashRoot.evaluate(el => {
      el.classList.remove("h-7", "text-[14px]", "rounded-[8px]")
      el.classList.add("h-8", "text-kb-sm")
    })
    check(
      `${prefix} 覆盖契约探针：h-7/text-[14px]/rounded-[8px] → 28px/14px/8px（EP 14px 字号与 components 兜底被 utilities 压过）`,
      probed.height === "28px" && probed["font-size"] === "14px" && parseFloat(probed["border-radius"]) === 8,
      JSON.stringify(probed)
    )

    // 行为：点击根 padding 盲区聚焦（el-input-focus.ts 委托；pl-8 图标带在 wrapper 盒外）
    const rootRect = await trashRoot.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
    await page.mouse.click(rootRect.x + 6, rootRect.y + rootRect.h / 2)
    await page.waitForTimeout(150)
    const focusAfterRootClick = await page.evaluate(() => {
      const active = document.activeElement
      return active instanceof HTMLInputElement && !!active.closest(".el-input")
    })
    check(`${prefix} 行为：点击根 padding 盲区聚焦输入框（壳 handleRootClick 的委托接班）`, focusAfterRootClick)

    // ============ C：4 处对话框焦点过渡契约 + data-autofocus + maxlength ============
    // 1. 新建知识库（start 页功能卡）
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await page.getByText("新建知识库", { exact: true }).first().click()
    await page.getByText("知识库名称", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const createKbInput = page.locator(".el-dialog input[data-autofocus]").first()
    check(
      `${prefix} create-kb：data-autofocus 落原生 input + maxlength=50 透传`,
      (await createKbInput.count()) === 1 && (await createKbInput.getAttribute("maxlength")) === "50",
      `maxlength=${await createKbInput.getAttribute("maxlength")}`
    )
    await assertAutofocusFocus(page, prefix, "create-kb")
    // v-model：输入后「确定」按钮从 disabled 变 enabled
    const createKbConfirm = page.locator(".el-dialog").getByRole("button", { name: "创建", exact: true })
    const disabledBefore = await createKbConfirm.isDisabled()
    await createKbInput.fill("T5 行为验证知识库")
    await page.waitForTimeout(200)
    const disabledAfter = await createKbConfirm.isDisabled()
    check(`${prefix} create-kb v-model：输入驱动确定按钮 disabled→enabled`, disabledBefore && !disabledAfter)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // 2. 新建文档（工作台目录树头部「新建内容」菜单）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    // ⚠️ 侧栏头部菜单也有同名项（DOM 序在前），以 [title=新建内容] 的兄弟菜单容器收窄
    const headerCreateMenu = page.locator('[title="新建内容"]').locator("xpath=following-sibling::div")
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByText("所属目录", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const docCreateInput = page.locator(".el-dialog input[data-autofocus]").first()
    check(
      `${prefix} doc-create：data-autofocus 落原生 input + maxlength=80 透传`,
      (await docCreateInput.count()) === 1 && (await docCreateInput.getAttribute("maxlength")) === "80",
      `maxlength=${await docCreateInput.getAttribute("maxlength")}`
    )
    await assertAutofocusFocus(page, prefix, "doc-create")
    const docCreateConfirm = page.locator(".el-dialog").getByRole("button", { name: "新建", exact: true })
    await docCreateInput.fill("")
    await page.waitForTimeout(200)
    const docDisabledBefore = await docCreateConfirm.isDisabled()
    await docCreateInput.fill("T5 行为验证文档")
    await page.waitForTimeout(200)
    const docDisabledAfter = await docCreateConfirm.isDisabled()
    check(
      `${prefix} doc-create v-model：清空后新建按钮 disabled、输入后 enabled（预填 defaultValue 语义保真）`,
      docDisabledBefore && !docDisabledAfter
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // 3. 行内重命名（对齐语雀：不开弹窗，就地改标题。原生 input 而非 el-input，
    //    契约点 = 挂载即全选原文本 / 纯空白不提交 / Enter 提交后刷新树；
    //    走专用载体文档 RENAME_TITLE，收尾在 finally 里改回，异常也不留脏标题）
    const carrier = title => page.locator("[data-knowledge-tree-row]").filter({ hasText: title }).first()
    const startInlineRename = async rowLocator => {
      await rowLocator.getByTitle("更多操作", { exact: true }).click()
      await page.getByText("重命名", { exact: true }).first().click()
      await page.waitForTimeout(400)
    }
    const RENAMED_TITLE = "T5 行内改名"
    try {
      await startInlineRename(carrier(RENAME_TITLE))
      const inlineState = await page.evaluate(() => {
        const active = document.activeElement
        return {
          inline: active instanceof HTMLInputElement && active.getAttribute("aria-label") === "重命名",
          selectedAll:
            active instanceof HTMLInputElement &&
            active.selectionStart === 0 &&
            active.selectionEnd === active.value.length,
          dialogs: document.querySelectorAll(".el-dialog").length,
        }
      })
      check(
        `${prefix} 行内重命名：零弹窗、行内 input 接管焦点且原文本全选`,
        inlineState.inline && inlineState.selectedAll && inlineState.dialogs === 0,
        JSON.stringify(inlineState)
      )
      await page.keyboard.type("   ")
      await page.keyboard.press("Enter")
      await page.waitForTimeout(800)
      check(`${prefix} 行内重命名：纯空白 Enter 不提交，树行仍为载体原标题`, (await carrier(RENAME_TITLE).count()) > 0)
      await startInlineRename(carrier(RENAME_TITLE))
      await page.keyboard.type(RENAMED_TITLE)
      await page.keyboard.press("Enter")
      await page.waitForTimeout(1500)
      check(`${prefix} 行内重命名：Enter 提交后刷新树，树行文本更新`, (await carrier(RENAMED_TITLE).count()) > 0)
    } finally {
      const dirty = carrier(RENAMED_TITLE)
      if (await dirty.count()) {
        await startInlineRename(dirty)
        await page.keyboard.type(RENAME_TITLE)
        await page.keyboard.press("Enter")
        await page.waitForTimeout(1500)
      }
    }

    // 4. 添加成员（设置·成员页签；type=email）
    await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByText("知识库信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "成员", exact: true }).click()
    await page.getByText("添加成员", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "添加成员", exact: true }).click()
    await page.getByText("邮箱地址", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const memberInput = page.locator(".el-dialog input[data-autofocus]").first()
    check(
      `${prefix} add-member：data-autofocus 落原生 input + type=email 透传`,
      (await memberInput.count()) === 1 && (await memberInput.getAttribute("type")) === "email",
      `type=${await memberInput.getAttribute("type")}`
    )
    await assertAutofocusFocus(page, prefix, "add-member")
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // 默认尺寸真值：设置页签的名称输入（零覆盖类；信息卡在「设置」页签而非概要）
    await page.getByRole("button", { name: "设置", exact: true }).click()
    await page.getByText("知识库信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    const plainRoot = page.locator(".el-input").first()
    const plainStyles = await computedOf(plainRoot, ["height", "border-radius", "font-size", "background-color"])
    check(
      `${prefix} 零覆盖默认态：36px 高 / 10px 圆角 / 13px 字号 / muted 底（壳 h-9 px-3 rounded-10 基线）`,
      plainStyles.height === "36px" &&
        parseFloat(plainStyles["border-radius"]) === 10 &&
        plainStyles["font-size"] === "13px" &&
        plainStyles["background-color"] === mutedRgb,
      JSON.stringify(plainStyles)
    )

    // ============ C：password/type 直传（account 修改密码弹窗） ============
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.getByText("基本信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "修改密码", exact: true }).click()
    await page.getByText("当前密码", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const passwordInputs = page.locator('.el-dialog input[type="password"]')
    const passwordCount = await passwordInputs.count()
    const autocompleteAttrs = await passwordInputs.evaluateAll(els => els.map(el => el.getAttribute("autocomplete")))
    check(
      `${prefix} account 密码弹窗：3 个 type=password 原生 input + autocomplete 直传`,
      passwordCount === 3 && autocompleteAttrs[0] === "current-password" && autocompleteAttrs[1] === "new-password",
      JSON.stringify(autocompleteAttrs)
    )
    // 无 data-autofocus 的对话框：AppDialog 回落「首个可聚焦元素」——面板 DOM 序里
    // 头部的图标关闭钮在最前（壳时代同款行为，非 T5 变更），断言兜底链路仍生效
    const fallbackFocused = await page.evaluate(() => {
      const dialog = document.querySelector(".el-dialog")
      const active = document.activeElement
      if (!dialog || !active) return false
      const sel =
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      const [firstFocusable] = [...dialog.querySelectorAll(sel)].filter(n => n.offsetWidth > 0 || n.offsetHeight > 0)
      return active === firstFocusable
    })
    check(
      `${prefix} account 密码弹窗：无标记时焦点回落首个可聚焦元素（AppDialog 兜底链路不变，头部关闭钮居首）`,
      fallbackFocused
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // ============ C：number/min/max/step 直传（board 模型配置） ============
    const tree = await import("./lib/knowledge-smoke-utils.mjs").then(m =>
      m.apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
        token,
        errorMessage: "读树失败",
      })
    )
    const flatten = nodes => {
      const out = []
      const walk = list => {
        for (const node of list ?? []) {
          out.push(node)
          if (node.children?.length) walk(node.children)
        }
      }
      walk(nodes)
      return out
    }
    const board = flatten(Array.isArray(tree) ? tree : []).find(node => node.title === "T5 直用改造画板")
    if (board) {
      await page.goto(url(`/knowledge/${kb.id}/board/${board.id}`), { waitUntil: "domcontentloaded" })
      await page.getByRole("button", { name: "模型配置", exact: true }).waitFor({ timeout: 30000 })
      await page.getByRole("button", { name: "模型配置", exact: true }).click()
      await page.getByText("当前配置", { exact: true }).first().waitFor({ timeout: 15000 })
      await page.waitForTimeout(600)
      const apiKeyInput = page.locator('.el-dialog input[type="password"]').first()
      const timeoutInput = page.locator('.el-dialog input[type="number"]').first()
      check(
        `${prefix} board 配置：API Key type=password + 超时 type=number（min/max/step attrs 直传原生）`,
        (await apiKeyInput.count()) === 1 &&
          (await timeoutInput.getAttribute("min")) === "5000" &&
          (await timeoutInput.getAttribute("max")) === "120000" &&
          (await timeoutInput.getAttribute("step")) === "1000",
        `min=${await timeoutInput.getAttribute("min")} step=${await timeoutInput.getAttribute("step")}`
      )
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
    }

    // ============ C：命令面板键盘路径不回归（自建 input，不受全局委托/校准影响） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2000)
    const aside = page.locator("aside").first()
    await aside.getByRole("button", { name: /搜索/ }).first().click()
    const paletteInput = page.locator('input[placeholder*="搜索"]').first()
    await paletteInput.waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const paletteFocused = await page.evaluate(() => document.activeElement instanceof HTMLInputElement)
    await paletteInput.fill("T5")
    await page.waitForTimeout(400)
    const paletteRows = await page.evaluate(
      () => document.querySelectorAll('[class*="palette"] li, [role="listbox"] li').length
    )
    await page.keyboard.press("ArrowDown")
    await page.waitForTimeout(200)
    await page.keyboard.press("ArrowUp")
    await page.waitForTimeout(200)
    check(
      `${prefix} 命令面板：打开即聚焦自建 input + 输入过滤 + 方向键往返不回归`,
      paletteFocused && paletteRows >= 0,
      `rows=${paletteRows}`
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(300)

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
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
const MIN_CHECKS = 50
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`
  )
}
if (!light || !dark || failed.length > 0 || passAborted || results.length < MIN_CHECKS) process.exit(1)
console.log("T5 验证全部通过")

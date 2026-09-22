/* global document, getComputedStyle */
/**
 * T3（解散 AppSwitch / AppRadioGroup / AppTextarea）行为与契约验证。
 *
 * 三组断言（明暗各一轮，沿用 T2 的 A/B/C 模式）：
 * A. 校准默认观感：直用 el-switch / el-radio-group+el-radio / el-segmented /
 *    el-input type=textarea 后，计算样式与原壳逐属性一致；
 * B. 覆盖契约探针：给根临时挂 utilities 类（h-7 / font-bold / text-[14px]，
 *    均为源码出现过的 utility），断言 EP 出厂 unlayered 值（32px 高 / 500 字重 /
 *    14px 字号 / 32px min-height）被中和、utilities 能赢；
 * C. 行为：switch 点击/空格/回车开合与 v-model、radio 点击选中互斥与原生方向键、
 *    segmented 切换（选中项与摘要文本联动）、textarea 输入 + rows/maxlength 落原生。
 *
 * 用法：node scripts/verify-t3.mjs（需 4173 preview + 后端 3200）
 * 退出码：全过为 0，任一失败为 1。
 */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T3 直用改造文档"
const DOC_CONTENT = "# T3 直用改造文档\n\n用于解散三个适配壳的行为断言。\n"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T3验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/** 计算样式便捷读取 */
const computedOf = (locator, props) =>
  locator.evaluate((el, names) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]))
  }, props)

/** token 颜色换算成 rgb 口径（借助临时隐藏元素） */
const tokenRgb = (page, token = "--kb-brand") =>
  page.evaluate((t) => {
    const probe = document.createElement("div")
    probe.style.backgroundColor = `var(${t})`
    probe.style.display = "none"
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, token)

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T3验证:${mode}]`
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
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T3 直用改造")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })
    const brandRgb = await tokenRgb(page)

    // ============ A/B/C-1：share 弹层（switch + list radio + segmented） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await page.getByRole("button", { name: "分享", exact: true }).click()
    await page.getByText("开启分享").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(400)

    // ---- el-switch：EP 原生 DOM 形态 + 校准观感 ----
    // 载体：ShareCreateForm 的「访问密码」开关（emit 本地态，不打接口）。
    // 原载体「允许评论」开关已于 2026-09-19 分享弹层重写中作为假权限开关删除。
    await page.locator('button:has-text("更多分享设置")').click()
    await page.getByText("新建分享配置").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(400)
    const shareSwitchRow = page
      .getByText("访问密码", { exact: true })
      .locator("xpath=ancestor::label[1]")
    const commentSwitch = shareSwitchRow.locator(".el-switch").first()
    const switchRootClass = await commentSwitch.getAttribute("class")
    check(
      `${prefix} switch：EP 原生根（div.el-switch 本体 + role=switch input 在根内）`,
      (switchRootClass ?? "").includes("el-switch") &&
        (await commentSwitch.locator('input[role="switch"]').count()) === 1,
      switchRootClass ?? "",
    )
    const switchCore = commentSwitch.locator(".el-switch__core")
    const coreStyles = await computedOf(switchCore, [
      "width",
      "height",
      "border-radius",
      "border-top-width",
      "border-top-style",
      "background-color",
      "transition-duration",
    ])
    const borderInputRgb = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.backgroundColor = "var(--kb-border-input)"
      probe.style.display = "none"
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    check(
      `${prefix} switch 轨道：44×24 无描边药丸（非 EP 40×20 + 1px border）`,
      coreStyles.width === "44px" &&
        coreStyles.height === "24px" &&
        coreStyles["border-top-width"] === "0px" &&
        parseFloat(coreStyles["border-radius"]) >= 12,
      JSON.stringify(coreStyles),
    )
    check(
      `${prefix} switch 轨道：off 底 = --kb-border-input（非 EP 出厂 off 色）`,
      coreStyles["background-color"] === borderInputRgb,
      coreStyles["background-color"],
    )
    const actionStyles = await computedOf(commentSwitch.locator(".el-switch__action"), [
      "width",
      "height",
      "left",
      "background-color",
      "box-shadow",
    ])
    check(
      `${prefix} switch 滑块：20×20 白色 + 双影 + left 2px（非 EP 16px/left 1px）`,
      actionStyles.width === "20px" &&
        actionStyles.height === "20px" &&
        actionStyles.left === "2px" &&
        actionStyles["background-color"] === "rgb(255, 255, 255)" &&
        actionStyles["box-shadow"] !== "none",
      JSON.stringify(actionStyles),
    )

    // 覆盖契约探针：h-7 压过 EP 出厂 height:32px 与 components auto
    await commentSwitch.evaluate((el) => el.classList.add("h-7"))
    const switchProbed = await computedOf(commentSwitch, ["height"])
    await commentSwitch.evaluate((el) => el.classList.remove("h-7"))
    check(
      `${prefix} switch 覆盖契约：h-7 → 28px（EP 32px 已中和，utilities 赢）`,
      switchProbed.height === "28px",
      switchProbed.height,
    )

    // 行为：点击开合
    await commentSwitch.click()
    await page.waitForTimeout(250)
    const onAfterClick =
      (await shareSwitchRow.locator('input[role="switch"]').getAttribute("aria-checked")) === "true"
    const onCoreBg = await computedOf(switchCore, ["background-color"])
    check(
      `${prefix} switch 行为：点击开 → aria-checked + 底色 brand`,
      onAfterClick && onCoreBg["background-color"] === brandRgb,
      `${onAfterClick} ${onCoreBg["background-color"]}`,
    )
    await commentSwitch.click()
    await page.waitForTimeout(250)
    const offAfterClick =
      (await shareSwitchRow.locator('input[role="switch"]').getAttribute("aria-checked")) ===
      "false"
    check(`${prefix} switch 行为：再点关`, offAfterClick)

    // 行为：空格（壳时代契约：role=switch input 无原生空格激活，keydown 补齐）
    const commentInput = shareSwitchRow.locator('input[role="switch"]')
    await commentInput.focus()
    await page.keyboard.press("Space")
    await page.waitForTimeout(200)
    const onAfterSpace = (await commentInput.getAttribute("aria-checked")) === "true"
    await page.keyboard.press("Space")
    await page.waitForTimeout(200)
    const offAfterSpace = (await commentInput.getAttribute("aria-checked")) === "false"
    check(
      `${prefix} switch 行为：Space 开→关（keydown 契约补齐）`,
      onAfterSpace && offAfterSpace,
      `${onAfterSpace} → ${offAfterSpace}`,
    )

    // 行为：回车（EP 原生 withKeys(enter)）
    await commentInput.focus()
    await page.keyboard.press("Enter")
    await page.waitForTimeout(200)
    const onAfterEnter = (await commentInput.getAttribute("aria-checked")) === "true"
    await page.keyboard.press("Enter")
    await page.waitForTimeout(200)
    const offAfterEnter = (await commentInput.getAttribute("aria-checked")) === "false"
    check(
      `${prefix} switch 行为：Enter 开→关（EP 原生）`,
      onAfterEnter && offAfterEnter,
      `${onAfterEnter} → ${offAfterEnter}`,
    )

    // ---- el-radio-group / el-radio（list 变体）：校准观感 ----
    // 折叠区在 switch 段已被展开，这里先收起再走原有的「点开→等新建分享配置」路径
    await page.locator('button:has-text("更多分享设置")').click()
    await page.waitForTimeout(400)
    await page.locator('button:has-text("更多分享设置")').click()
    await page.getByText("新建分享配置").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)

    const permGroup = page.locator(".el-radio-group").first()
    const groupStyles = await computedOf(permGroup, [
      "display",
      "flex-direction",
      "align-items",
      "gap",
    ])
    check(
      `${prefix} radio 组：flex 行向 + items-center + gap-5（水平两档调用点）`,
      groupStyles.display === "flex" &&
        groupStyles["flex-direction"] === "row" &&
        groupStyles["align-items"] === "center" &&
        groupStyles.gap === "20px",
      JSON.stringify(groupStyles),
    )
    const viewRadio = permGroup.locator(".el-radio", { hasText: "可查看" })
    const editRadioForProbe = permGroup.locator(".el-radio", { hasText: "可编辑" })
    const radioStyles = await computedOf(viewRadio, [
      "height",
      "margin-right",
      "font-weight",
      "white-space",
      "align-items",
    ])
    check(
      `${prefix} radio 根：内容撑高/无右距/字重 400/可换行/顶对齐（非 EP 32px/30px/500/nowrap/center）`,
      radioStyles.height !== "32px" &&
        radioStyles["margin-right"] === "0px" &&
        radioStyles["font-weight"] === "400" &&
        radioStyles["white-space"] === "normal" &&
        radioStyles["align-items"] === "flex-start",
      JSON.stringify(radioStyles),
    )
    // 「可编辑」初始未选中：圆点取其常态底色（「可查看」初始选中，底应为透明）
    const radioInner = editRadioForProbe.locator(".el-radio__inner")
    const innerStyles = await computedOf(radioInner, [
      "width",
      "height",
      "border-radius",
      "border-top-width",
      "background-color",
    ])
    const surfaceRgb = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.backgroundColor = "var(--kb-surface-bg)"
      probe.style.display = "none"
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    check(
      `${prefix} radio 圆点：18×18 圆形 surface 底 1px 描边（非 EP 14px 方）`,
      innerStyles.width === "18px" &&
        innerStyles.height === "18px" &&
        parseFloat(innerStyles["border-radius"]) >= 9 &&
        innerStyles["border-top-width"] === "1px" &&
        innerStyles["background-color"] === surfaceRgb,
      JSON.stringify(innerStyles),
    )
    const checkedViewInnerBg = await computedOf(viewRadio.locator(".el-radio__inner"), [
      "background-color",
    ])
    check(
      `${prefix} radio 选中圆点常态底：透明（初始选中「可查看」）`,
      checkedViewInnerBg["background-color"] === "rgba(0, 0, 0, 0)",
      checkedViewInnerBg["background-color"],
    )
    const radioLabel = viewRadio.locator(".el-radio__label")
    const labelStyles = await computedOf(radioLabel, ["padding-left", "min-width"])
    check(
      `${prefix} radio label：padding 清零（间距在项根 gap 10px）`,
      labelStyles["padding-left"] === "0px",
      JSON.stringify(labelStyles),
    )
    const radioGap = await computedOf(viewRadio, ["gap"])
    check(`${prefix} radio 项根 gap 10px（基线 gap-2.5）`, radioGap.gap === "10px", radioGap.gap)

    // 覆盖契约探针：h-7 压过 EP 32px；font-bold 压过 EP 500 与 components 400
    await viewRadio.evaluate((el) => el.classList.add("h-7", "font-bold"))
    const radioProbed = await computedOf(viewRadio, ["height", "font-weight"])
    await viewRadio.evaluate((el) => el.classList.remove("h-7", "font-bold"))
    check(
      `${prefix} radio 覆盖契约：h-7/font-bold → 28px/700`,
      radioProbed.height === "28px" && radioProbed["font-weight"] === "700",
      JSON.stringify(radioProbed),
    )

    // 行为：点击选中互斥 + 摘要联动
    const editRadio = permGroup.locator(".el-radio", { hasText: "可编辑" })
    await editRadio.click()
    await page.waitForTimeout(300)
    const editChecked = await editRadio.locator("input.el-radio__original").isChecked()
    const viewChecked = await viewRadio.locator("input.el-radio__original").isChecked()
    check(
      `${prefix} radio 行为：点「可编辑」→ 选中且「可查看」互斥取消`,
      editChecked && !viewChecked,
      `${viewChecked} → ${editChecked}`,
    )
    const checkedInnerStyles = await computedOf(editRadio.locator(".el-radio__inner"), [
      "background-color",
      "border-top-color",
    ])
    check(
      `${prefix} radio 选中观感：透明底 + brand 描边（EP 原生是实心圆，已接管）`,
      checkedInnerStyles["background-color"] === "rgba(0, 0, 0, 0)" &&
        checkedInnerStyles["border-top-color"] === brandRgb,
      JSON.stringify(checkedInnerStyles),
    )
    const dotStyles = await editRadio.locator(".el-radio__inner").evaluate((el) => {
      const cs = getComputedStyle(el, "::after")
      return { width: cs.width, height: cs.height, backgroundColor: cs.backgroundColor }
    })
    check(
      `${prefix} radio 选中内点：8×8 brand（非 EP 4px 白点）`,
      dotStyles.width === "8px" &&
        dotStyles.height === "8px" &&
        dotStyles.backgroundColor === brandRgb,
      JSON.stringify(dotStyles),
    )
    const summary = await page.locator("text=/可编辑 · 无密码/").first().textContent()
    check(
      `${prefix} radio 联动：配置摘要变「可编辑 · 无密码 · …」`,
      Boolean(summary),
      summary?.trim() ?? "",
    )

    // 行为：原生方向键导航（EP 原生四方向；与基线「仅本方向」差异已记档）
    await editRadio.locator("input.el-radio__original").focus()
    await page.keyboard.press("ArrowLeft")
    await page.waitForTimeout(300)
    const viewCheckedAfterArrow = await viewRadio.locator("input.el-radio__original").isChecked()
    check(`${prefix} radio 行为：ArrowLeft 原生移动即选中（EP 默认）`, viewCheckedAfterArrow)
    await editRadio.click()
    await page.waitForTimeout(200)

    // ---- el-segmented：校准观感（share 弹层唯一 segmented = 有效期组） ----
    const expirySeg = page.locator(".el-segmented", { hasText: "永久有效" }).first()
    const segRootStyles = await computedOf(expirySeg, [
      "background-color",
      "border-radius",
      "padding",
      "min-height",
    ])
    const mutedRgb = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.backgroundColor = "var(--kb-muted-bg)"
      probe.style.display = "none"
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    check(
      `${prefix} segmented 根：muted 药丸 p-1 无 min-height（非 EP fill 底/2px/8px 圆角/32px）`,
      segRootStyles["background-color"] === mutedRgb &&
        parseFloat(segRootStyles["border-radius"]) >= 12 &&
        segRootStyles.padding === "4px" &&
        segRootStyles["min-height"] === "0px",
      JSON.stringify(segRootStyles),
    )
    const neverItem = expirySeg.locator(".el-segmented__item", { hasText: "永久有效" })
    const dayItem = expirySeg.locator(".el-segmented__item", { hasText: "7 天" })
    const segItemStyles = await computedOf(dayItem, ["flex", "padding", "border-radius", "color"])
    const tertiaryRgb = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.backgroundColor = "var(--kb-text-tertiary)"
      probe.style.display = "none"
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    check(
      `${prefix} segmented 项：内容自适应 + 6px 14px 内边距 + 药丸 + tertiary 字（非 EP flex:1/0 11px/6px 圆角）`,
      segItemStyles.flex.startsWith("0 0 auto") &&
        segItemStyles.padding === "6px 14px" &&
        parseFloat(segItemStyles["border-radius"]) >= 12 &&
        segItemStyles.color === tertiaryRgb,
      JSON.stringify(segItemStyles),
    )
    const segLabel = await computedOf(dayItem.locator(".el-segmented__item-label"), ["line-height"])
    check(
      `${prefix} segmented 项文案：行高 22px（基线 text-sm 行盒）`,
      segLabel["line-height"] === "22px",
      segLabel["line-height"],
    )
    const highlight = expirySeg.locator(".el-segmented__item-selected")
    const highlightStyles = await computedOf(highlight, [
      "background-color",
      "border-radius",
      "transition-duration",
    ])
    check(
      `${prefix} segmented 高亮块：surface 药丸 + 瞬时切换（非 EP primary 底/0.3s 滑动）`,
      highlightStyles["background-color"] === surfaceRgb &&
        parseFloat(highlightStyles["border-radius"]) >= 12 &&
        highlightStyles["transition-duration"] === "0s",
      JSON.stringify(highlightStyles),
    )

    // 覆盖契约探针：h-7 压过 EP min-height:32px（根高 28 < 32 若未中和会被撑回 32）
    await expirySeg.evaluate((el) => el.classList.add("h-7"))
    const segProbed = await computedOf(expirySeg, ["height"])
    await expirySeg.evaluate((el) => el.classList.remove("h-7"))
    check(
      `${prefix} segmented 覆盖契约：h-7 → 28px（EP min-height 32px 已中和）`,
      segProbed.height === "28px",
      segProbed.height,
    )

    // 行为：切换选中 + 摘要联动
    await dayItem.click()
    await page.waitForTimeout(300)
    const dayChecked = await dayItem.locator('input[type="radio"]').isChecked()
    const neverChecked = await neverItem.locator('input[type="radio"]').isChecked()
    const summaryAfterDay = await page.locator("text=/可编辑 · 无密码 · 7 天/").first().count()
    check(
      `${prefix} segmented 行为：点「7 天」→ 选中互斥 + 摘要联动`,
      dayChecked && !neverChecked && summaryAfterDay === 1,
      `day=${dayChecked} never=${neverChecked}`,
    )
    const selectedLabelColor = await computedOf(dayItem, ["color"])
    check(
      `${prefix} segmented 选中文字：text-ink 档`,
      selectedLabelColor.color === "rgb(38, 38, 38)" || selectedLabelColor.color !== tertiaryRgb,
      selectedLabelColor.color,
    )

    await page.keyboard.press("Escape")
    await page.waitForTimeout(500)

    // ============ A/B/C-2：新建知识库弹层（el-input type=textarea） ============
    await page.goto(url("/knowledge/start"), { waitUntil: "domcontentloaded" })
    await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByText("新建知识库", { exact: true }).first().click()
    await page.getByText("知识库名称").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)

    const kbTextarea = page.locator(".el-textarea").first()
    const taRootStyles = await computedOf(kbTextarea, ["font-size", "vertical-align"])
    check(
      `${prefix} textarea 根：13px 字号 + baseline 对齐（非 EP 14px/bottom）`,
      taRootStyles["font-size"] === "13px" && taRootStyles["vertical-align"] === "baseline",
      JSON.stringify(taRootStyles),
    )
    const taInner = kbTextarea.locator(".el-textarea__inner")
    const taInnerStyles = await computedOf(taInner, [
      "padding-top",
      "background-color",
      "border-radius",
      "box-shadow",
      "resize",
      "line-height",
      "caret-color",
    ])
    check(
      `${prefix} textarea inner：幽灵化（无 padding/底/圆角/阴影/手柄）+ 行高继承 20px + brand 光标`,
      taInnerStyles["padding-top"] === "0px" &&
        taInnerStyles["background-color"] === "rgba(0, 0, 0, 0)" &&
        taInnerStyles["border-radius"] === "0px" &&
        taInnerStyles["box-shadow"] === "none" &&
        taInnerStyles.resize === "none" &&
        taInnerStyles["line-height"] === "20px" &&
        taInnerStyles["caret-color"] === brandRgb,
      JSON.stringify(taInnerStyles),
    )
    const innerColorFollowsRoot = await kbTextarea.evaluate((el) => {
      const inner = el.querySelector(".el-textarea__inner")
      return getComputedStyle(inner).color === getComputedStyle(el).color
    })
    check(
      `${prefix} textarea 暗色契约：inner 字色强制跟随根（inherit !important）`,
      innerColorFollowsRoot,
    )
    const nativeAttrs = await taInner.evaluate((el) => ({
      rows: el.getAttribute("rows"),
      maxlength: el.getAttribute("maxlength"),
    }))
    check(
      `${prefix} textarea 原生属性：rows=3 与 maxlength=200 透传到原生元素`,
      nativeAttrs.rows === "3" && nativeAttrs.maxlength === "200",
      JSON.stringify(nativeAttrs),
    )
    // 盒面契约：五个调用点曾各画一套（圆角 10/12/16、底色三种、聚焦 border vs
    // ring-4），现收成校准默认档——断言 computed 盒面而非 class 字面量
    const mutedBgRgb = await tokenRgb(page, "--kb-muted-bg")
    const kbBorderRgb = await tokenRgb(page, "--kb-border")
    const taRootBox = await computedOf(kbTextarea, [
      "border-top-width",
      "border-top-style",
      "border-top-color",
      "border-radius",
      "background-color",
      "padding-top",
      "padding-left",
      "resize",
      "overflow",
    ])
    check(
      `${prefix} textarea 根盒面：校准默认（1px kb-border / 10px 圆角 / muted 底 / 8×12 padding）+ 调用方 resize-none overflow-hidden 落根`,
      taRootBox["border-top-width"] === "1px" &&
        taRootBox["border-top-style"] === "solid" &&
        taRootBox["border-top-color"] === kbBorderRgb &&
        taRootBox["border-radius"] === "10px" &&
        taRootBox["background-color"] === mutedBgRgb &&
        taRootBox["padding-top"] === "8px" &&
        taRootBox["padding-left"] === "12px" &&
        taRootBox.resize === "none" &&
        taRootBox.overflow === "hidden",
      JSON.stringify(taRootBox),
    )
    await taInner.focus()
    // transition: border-color 150ms——computed 读到的是插值，须等动画落定
    await page.waitForTimeout(250)
    const focusBorder = await computedOf(kbTextarea, ["border-top-color"])
    await taInner.blur()
    check(
      `${prefix} textarea 聚焦：根 :focus-within 描边转 brand（inner 是幽灵面，焦点判定在根）`,
      focusBorder["border-top-color"] === brandRgb,
      focusBorder["border-top-color"],
    )
    const rootClasses = await kbTextarea.evaluate((el) => el.className)
    check(
      `${prefix} textarea 模板级探针：调用方 class（w-full/resize-none/leading-5）落根且不再自带盒面`,
      rootClasses.includes("el-textarea") &&
        rootClasses.includes("w-full") &&
        rootClasses.includes("resize-none") &&
        !/rounded-/.test(rootClasses),
      rootClasses.slice(0, 80),
    )

    // 覆盖契约探针：text-[14px]（源码出现过的 arbitrary utility）压过 EP 14px 与 components 13px
    await kbTextarea.evaluate((el) => el.classList.add("text-[14px]"))
    const taProbed = await computedOf(kbTextarea, ["font-size"])
    await kbTextarea.evaluate((el) => el.classList.remove("text-[14px]"))
    check(
      `${prefix} textarea 覆盖契约：text-[14px] → 14px`,
      taProbed["font-size"] === "14px",
      taProbed["font-size"],
    )

    // 行为：输入 → v-model 落到原生 textarea
    await taInner.fill("用于 T3 验证的描述")
    await page.waitForTimeout(200)
    const typedValue = await taInner.inputValue()
    check(
      `${prefix} textarea 行为：输入联动 v-model`,
      typedValue === "用于 T3 验证的描述",
      typedValue,
    )
    await taInner.fill("")

    await page.keyboard.press("Escape")
    await page.waitForTimeout(500)

    // ============ A/C-3：样式设置弹层（segmented w-full 模板探针 + 切换） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await page.locator('button[title="样式设置"]').click()
    await page.getByText("正文字号").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)

    const styleSeg = page.locator(".el-segmented").first()
    const segWidth = await styleSeg.evaluate((el) => {
      const parent = el.parentElement
      return { seg: el.getBoundingClientRect().width, parent: parent.getBoundingClientRect().width }
    })
    check(
      `${prefix} style segmented 模板探针：调用方 w-full 落根并撑满（ utilities 赢过 EP inline-flex 内容宽）`,
      Math.abs(segWidth.seg - segWidth.parent) < 2 && segWidth.seg > 100,
      JSON.stringify(segWidth),
    )
    const relaxItem = styleSeg.locator(".el-segmented__item", { hasText: "宽松" })
    const defaultItem = styleSeg.locator(".el-segmented__item", { hasText: "常规" })
    await relaxItem.click()
    await page.waitForTimeout(300)
    const relaxSelected = (await relaxItem.getAttribute("class")).includes("is-selected")
    const defaultSelected = (await defaultItem.getAttribute("class")).includes("is-selected")
    check(
      `${prefix} style segmented 行为：点「宽松」→ 选中迁移（互斥）`,
      relaxSelected && !defaultSelected,
    )
    await defaultItem.click()
    await page.waitForTimeout(200)

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
const failed = results.filter((r) => !r.ok)
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
const MIN_CHECKS = 60
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`,
  )
}
if (!light || !dark || failed.length > 0 || passAborted || results.length < MIN_CHECKS)
  process.exit(1)
console.log("T3 验证全部通过")

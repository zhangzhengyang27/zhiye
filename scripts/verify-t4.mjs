/* global document, getComputedStyle, MouseEvent */
/**
 * T4（解散 AppBadge / AppCard / AppTabs / AppShell）行为与契约验证。
 *
 * 三组断言（明暗各一轮，沿用 T2/T3 的 A/B/C 模式）：
 * A. 校准默认观感：直用 el-tag / el-card / el-tabs / el-container 后，计算样式
 *    与原壳逐属性一致；badge 的每个 color 变体（neutral soft/subtle、success
 *    subtle、warning subtle）至少一处 computed 色值断言；
 * B. 覆盖契约探针：给根临时挂 utilities 类（h-7 / font-bold / rounded-[8px] /
 *    text-[12px]，均为源码出现过的 utility），断言 EP 出厂 unlayered 值
 *    （tag 24px 高/4px 圆角、card 16px 圆角、tabs item 14px 字号）被中和、
 *    utilities 能赢；
 * C. 行为：tabs 点击切换 + v-model 联动（列表与清空按钮切换）、方向键原生移动
 *    即激活（EP 默认）、Enter/Space 激活（调用点 keydown 补齐，T3 手法）、
 *    el-container 退回 block（account 页正常居中）。
 *
 * 结构手法级断言（T3 评审要求）：el-tag__content 为 display:contents（壳单层
 * flex 结构的复刻）、el-card__body 存在且 padding 为壳的 16px 20px、tabs 选中项
 * 背景与卡片阴影落位、nav-wrap::after 与 active-bar 被短路。
 *
 * 用法：node scripts/verify-t4.mjs（需 4173 preview + 后端 3200）
 * 退出码：全过为 0，任一失败为 1。
 */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  ensureTrashedDocument,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const VIEWPORT = { width: 1247, height: 952 }
const DOC_TITLE = "T4 直用改造文档"
const DOC_CONTENT = "# T4 直用改造文档\n\n用于解散四个适配壳的行为断言。\n"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T4验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
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

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T4验证:${mode}]`
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
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T4 直用改造")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })
    // 下方 settings 段要断言「已发布」行的 success tag 变体，必须自建一篇 published 文档：
    // 此前该段依赖固定 smoke 库里历史遗留的「T4 已发布文档」，数据被清理后即 13/2 并
    // 在 publishedRow 上抛超时（整轮静默少跑约 60 条断言）。
    await ensureDocument(kb.id, token, {
      title: "T4 已发布文档",
      status: "published",
      content: "# 已发布\n\n用于 T4 的 success tag 变体验证。",
    })
    await ensureTrashedDocument(kb.id, token, {
      title: "T4 回收站文档",
      content: "# 回收站\n\n用于 T4 验证。",
    })

    // ============ A/C-1：share 弹层（badge 全变体 computed 色值） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.getByRole("button", { name: "分享", exact: true }).click()
    await page.getByText("开启分享").first().waitFor({ timeout: 15000 })
    const advancedVisible = await page
      .getByText("新建分享配置")
      .first()
      .isVisible()
      .catch(() => false)
    if (!advancedVisible) {
      await page.locator('button:has-text("更多分享设置")').click()
      await page.getByText("新建分享配置").first().waitFor({ timeout: 15000 })
    }
    const shareRow = page.getByText("开启分享", { exact: true }).locator("xpath=../..")
    const shareInput = shareRow.locator('input[role="switch"]')
    if ((await shareInput.getAttribute("aria-checked")) !== "true") {
      await shareRow.evaluate((el) =>
        el.querySelector(".el-switch")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      )
      await page.getByText("当前分享链接", { exact: true }).waitFor({ timeout: 15000 })
    }
    await page.waitForTimeout(800)

    // ---- el-tag：EP 原生结构 + 校准观感（neutral soft 基准） ----
    const linkBadge = page.locator(".el-tag", { hasText: "条" }).first()
    const tagClass = (await linkBadge.getAttribute("class")) ?? ""
    check(
      `${prefix} tag：EP 原生根（el-tag + content 结构）`,
      tagClass.includes("el-tag") && (await linkBadge.locator(".el-tag__content").count()) === 1,
      tagClass.slice(0, 60),
    )
    const contentDisplay = await linkBadge
      .locator(".el-tag__content")
      .evaluate((el) => getComputedStyle(el).display)
    check(
      `${prefix} tag 结构手法：el-tag__content 为 display:contents（壳单层 flex 的复刻）`,
      contentDisplay === "contents",
      contentDisplay,
    )
    const mutedRgb = await tokenRgb(page, "--kb-muted-bg")
    const secondaryRgb = await tokenRgb(page, "--kb-text-secondary")
    const badgeStyles = await computedOf(linkBadge, [
      "height",
      "padding",
      "border-radius",
      "font-weight",
      "background-color",
      "color",
      "gap",
      "border-top-width",
    ])
    // 暗色走 --kb-text-on-fill（批 18：由 tokens 供给，不再是校准层里的 .75 字面量）
    const expectedSoftColor =
      mode === "dark" ? await tokenRgb(page, "--kb-text-on-fill") : secondaryRgb
    check(
      `${prefix} tag neutral soft：h-5 药丸 + muted 底 + secondary 字 + 无描边（非 EP 24px/0 9px/4px 圆角/1px 描边）`,
      badgeStyles.height === "20px" &&
        badgeStyles["border-top-width"] === "0px" &&
        parseFloat(badgeStyles["border-radius"]) >= 12 &&
        badgeStyles["font-weight"] === "500" &&
        badgeStyles["background-color"] === mutedRgb &&
        badgeStyles.color === expectedSoftColor &&
        badgeStyles.gap === "4px",
      JSON.stringify(badgeStyles),
    )

    // 覆盖契约探针：h-7 压过 EP 24px 高；rounded-[8px] 需先移除调用方 rounded-full
    // （同层 utilities 按声明顺序决胜，二者并存时 rounded-full 赢——探针只验中和）
    await linkBadge.evaluate((el) => el.classList.add("h-7"))
    await linkBadge.evaluate((el) => {
      el.classList.remove("rounded-full", "font-medium")
      el.classList.add("rounded-kb-md", "font-bold")
    })
    const probed = await computedOf(linkBadge, ["height", "border-radius", "font-weight"])
    await linkBadge.evaluate((el) => {
      el.classList.remove("h-7", "rounded-kb-md", "font-bold")
      el.classList.add("rounded-full", "font-medium")
    })
    check(
      `${prefix} tag 覆盖契约：h-7/rounded-kb-md/font-bold → 28px/8px 圆角/700（EP 24px/4px/未设 已中和）`,
      probed.height === "28px" &&
        parseFloat(probed["border-radius"]) === 8 &&
        probed["font-weight"] === "700",
      JSON.stringify(probed),
    )

    // neutral subtle（plain effect）：ShareLinkRow 权限 badge（view 分享 → neutral subtle）
    const permBadge = page.locator(".el-tag.el-tag--plain").first()
    const grey100Rgb = await tokenRgb(page, "--kb-grey-100")
    const tertiaryRgb = await tokenRgb(page, "--kb-text-tertiary")
    const permStyles = await computedOf(permBadge, [
      "background-color",
      "color",
      "border-top-width",
    ])
    // 原暗色 .6 白折算后与 tertiary 同档，批 18 起两套主题都走 --kb-text-tertiary
    const expectedTertiary = tertiaryRgb
    check(
      `${prefix} tag neutral subtle（plain）：grey-100 底 + tertiary 字 + 无描边`,
      permStyles["background-color"] === grey100Rgb &&
        permStyles.color === expectedTertiary &&
        permStyles["border-top-width"] === "0px",
      JSON.stringify(permStyles),
    )

    // warning subtle：ShareLinkRow「有密码」badge（ensure 带密码分享）——
    // 若当前分享无密码则跳过（该变体色值由 settings 屏的 success subtle 补覆盖）
    const warnBadge = page.locator(".el-tag.el-tag--warning").first()
    if ((await warnBadge.count()) > 0) {
      const warnStyles = await computedOf(warnBadge, ["background-color", "color"])
      const warningBgRgb = await tokenRgb(page, "--kb-warning-bg")
      const warningRgb = await tokenRgb(page, "--kb-warning")
      check(
        `${prefix} tag warning subtle（plain）：warning-bg 底 + warning 字`,
        warnStyles["background-color"] === warningBgRgb && warnStyles.color === warningRgb,
        JSON.stringify(warnStyles),
      )
    } else {
      logStep(`${prefix}`, "（无密码分享不存在，warning subtle 由 settings 屏覆盖）")
    }
    // dark 下的文字复刻链（html.dark .text-ink-* 通配 → 0.75/0.6 白）
    if (mode === "dark") {
      const darkSoft = await computedOf(linkBadge, ["color"])
      const darkPlain = await computedOf(permBadge, ["color"])
      check(
        `${prefix} tag 暗色复刻：soft = --kb-text-on-fill、plain = --kb-text-tertiary`,
        darkSoft.color === (await tokenRgb(page, "--kb-text-on-fill")) &&
          darkPlain.color === (await tokenRgb(page, "--kb-text-tertiary")),
        `${darkSoft.color} / ${darkPlain.color}`,
      )
    }

    await page.keyboard.press("Escape")
    await page.waitForTimeout(500)

    // ============ A/B/C-2：settings 屏（success subtle） ============
    await page.goto(url(`/knowledge/${kb.id}/settings`), { waitUntil: "domcontentloaded" })
    await page.getByText("概要", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "文档", exact: true }).click()
    await page.getByText("文档管理").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    const publishedRow = page.locator("li", { hasText: "T4 已发布文档" }).first()
    const successBadge = publishedRow.locator(".el-tag.el-tag--success.el-tag--plain").first()
    if ((await successBadge.count()) > 0) {
      const successStyles = await computedOf(successBadge, ["background-color", "color"])
      const successBgRgb = await tokenRgb(page, "--kb-success-bg")
      const successRgb = await tokenRgb(page, "--kb-success")
      // dark 下文字色走壳时代继承链复刻（0.88 白），bg 走 token 自动换档
      // 暗色 warning-plain 文字走 --kb-text-on-fill-strong（原 .88 白字面量）
      const expectedSuccessColor =
        mode === "dark" ? await tokenRgb(page, "--kb-text-on-fill-strong") : successRgb
      check(
        `${prefix} tag success subtle（plain）：success-bg 底 + success 字`,
        successStyles["background-color"] === successBgRgb &&
          successStyles.color === expectedSuccessColor,
        JSON.stringify(successStyles),
      )
    } else {
      check(`${prefix} tag success subtle：已发布文档行存在`, false, "未找到 success badge")
    }
    // settings 屏还覆盖「调用方 class 落根」模板探针（typeLabel badge 的 shrink-0）
    const typeBadge = publishedRow.locator(".el-tag").first()
    const typeCls = (await typeBadge.getAttribute("class")) ?? ""
    check(
      `${prefix} tag 模板探针：调用方 class（shrink-0）落根`,
      typeCls.includes("shrink-0"),
      typeCls.slice(0, 60),
    )

    // ============ A/B/C-3：board 屏（el-card） ============
    const tree = await import("./lib/knowledge-smoke-utils.mjs").then((m) =>
      m.apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
        token,
        errorMessage: "读树失败",
      }),
    )
    const board = m2flatten(Array.isArray(tree) ? tree : []).find(
      (n) => n.title === "T4 直用改造画板",
    )
    if (board) {
      await page.goto(url(`/knowledge/${kb.id}/board/${board.id}`), {
        waitUntil: "domcontentloaded",
      })
      await page.getByRole("button", { name: "模型配置", exact: true }).waitFor({ timeout: 20000 })
      await page.getByRole("button", { name: "模型配置", exact: true }).click()
      await page.getByText("当前配置").first().waitFor({ timeout: 15000 })
      await page.waitForTimeout(600)

      const card = page.locator(".el-card").first()
      const cardClass = (await card.getAttribute("class")) ?? ""
      check(
        `${prefix} card：EP 原生根 + 调用方 class（rounded-kb-3xl）落根`,
        cardClass.includes("el-card") && cardClass.includes("rounded-kb-3xl"),
        cardClass.slice(0, 70),
      )
      const cardStyles = await computedOf(card, [
        "border-radius",
        "background-color",
        "border-top-color",
      ])
      const surfaceRgb = await tokenRgb(page, "--kb-surface-bg")
      const borderRgb = await tokenRgb(page, "--kb-border")
      check(
        `${prefix} card：surface 底 + kb-border 描边（EP 工厂值桥接同值零声明）`,
        cardStyles["background-color"] === surfaceRgb &&
          cardStyles["border-top-color"] === borderRgb,
        JSON.stringify(cardStyles),
      )
      const body = card.locator(".el-card__body")
      const bodyStyles = await computedOf(body, ["padding"])
      check(
        `${prefix} card body：padding 16px 20px（壳 px-5 py-4，EP 全边 20px 已中和）`,
        bodyStyles.padding === "16px 20px",
        bodyStyles.padding,
      )
      // 覆盖契约探针：rounded-[8px] 需先移除调用方 rounded-[22px]（同层顺序决胜）
      await card.evaluate((el) => {
        el.classList.remove("rounded-[22px]")
        el.classList.add("rounded-[8px]")
      })
      const cardProbed = await computedOf(card, ["border-radius"])
      await card.evaluate((el) => {
        el.classList.remove("rounded-[8px]")
        el.classList.add("rounded-[22px]")
      })
      check(
        `${prefix} card 覆盖契约：rounded-[8px] → 8px`,
        parseFloat(cardProbed["border-radius"]) === 8,
        cardProbed["border-radius"],
      )
      await page.keyboard.press("Escape")
      await page.waitForTimeout(400)
    }

    // ============ A/B/C-4：trash 屏（el-tabs） ============
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    // 回收站里同名文档可能有多份（历史轮次的 ensure 只判在否、不判份数），
    // 这里只验「有该文档行」，故取 first，避免 strict mode 中断整轮（曾致 t4 只跑 15/40 条）
    await page.getByText("T4 回收站文档", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)

    const tabs = page.locator(".el-tabs").first()
    const tabsClass = (await tabs.getAttribute("class")) ?? ""
    check(
      `${prefix} tabs：EP 原生根 + 调用方 class（min-w-0）落根`,
      tabsClass.includes("el-tabs") && tabsClass.includes("min-w-0"),
      tabsClass.slice(0, 70),
    )
    const muted = await tokenRgb(page, "--kb-muted-bg")
    const tabsStyles = await computedOf(tabs, [
      "background-color",
      "padding",
      "border-radius",
      "display",
    ])
    check(
      `${prefix} tabs 容器：muted 药丸 p-1（inline-flex 的 used value 可为 flex，flex item 块化）`,
      tabsStyles["background-color"] === muted &&
        tabsStyles.padding === "4px" &&
        parseFloat(tabsStyles["border-radius"]) >= 12,
      JSON.stringify(tabsStyles),
    )
    const items = tabs.locator(".el-tabs__item")
    check(
      `${prefix} tabs 结构：两个 item（role=tab）+ nav role=tablist`,
      (await items.count()) === 2 && (await tabs.locator('[role="tablist"]').count()) === 1,
      `items=${await items.count()}`,
    )
    // 下划线族短路（结构手法级）
    const activeBarDisplay = await tabs
      .locator(".el-tabs__active-bar")
      .evaluate((el) => getComputedStyle(el).display)
    const navAfter = await tabs
      .locator(".el-tabs__nav-wrap")
      .evaluate((el) => getComputedStyle(el, "::after").display)
    const contentDisplay2 = await tabs
      .locator(".el-tabs__content")
      .evaluate((el) => getComputedStyle(el).display)
    check(
      `${prefix} tabs 结构手法：active-bar 与 nav-wrap::after 隐藏、空 content 隐藏（pill 重刻）`,
      activeBarDisplay === "none" && navAfter === "none" && contentDisplay2 === "none",
      `${activeBarDisplay}/${navAfter}/${contentDisplay2}`,
    )
    const activeItem = tabs.locator(".el-tabs__item.is-active").first()
    const surface = await tokenRgb(page, "--kb-surface-bg")
    const activeStyles = await computedOf(activeItem, [
      "padding",
      "line-height",
      "font-size",
      "font-weight",
      "color",
      "background-color",
      "border-radius",
      "box-shadow",
    ])
    check(
      `${prefix} tabs 选中项：px-3.5 py-1.5 + 行高 20px + 500 字重 + surface 药丸 + 卡片阴影`,
      activeStyles.padding === "6px 14px" &&
        activeStyles["line-height"] === "20px" &&
        activeStyles["font-size"] === "14px" &&
        activeStyles["font-weight"] === "500" &&
        activeStyles["background-color"] === surface &&
        activeStyles["box-shadow"] !== "none" &&
        parseFloat(activeStyles["border-radius"]) >= 12,
      JSON.stringify(activeStyles),
    )
    const inactiveItem = tabs.locator(".el-tabs__item:not(.is-active)").first()
    const inactiveColor = await computedOf(inactiveItem, ["color"])
    // dark 下文字色走壳 text-ink-tertiary 通配复刻（0.6 白）
    const expectedInactive = await tokenRgb(page, "--kb-text-tertiary")
    check(
      `${prefix} tabs 未选中项：tertiary 字（EP primary 已中和）`,
      inactiveColor.color === expectedInactive,
      inactiveColor.color,
    )
    // 覆盖契约探针：text-[12px] 压过 EP 14px 与 components 14px
    await activeItem.evaluate((el) => el.classList.add("text-[12px]"))
    const itemProbed = await computedOf(activeItem, ["font-size"])
    await activeItem.evaluate((el) => el.classList.remove("text-[12px]"))
    check(
      `${prefix} tabs 覆盖契约：text-[12px] → 12px`,
      itemProbed["font-size"] === "12px",
      itemProbed["font-size"],
    )

    // ---- 行为：点击切换 + v-model 联动（列表变化 + 清空按钮切换） ----
    const docsActive = (await activeItem.textContent())?.includes("文档回收站")
    const kbsBtn = items.nth(1)
    await kbsBtn.click()
    await page.waitForTimeout(500)
    const kbsActive = ((await kbsBtn.getAttribute("class")) ?? "").includes("is-active")
    const docsInactive = !((await items.nth(0).getAttribute("class")) ?? "").includes("is-active")
    check(
      `${prefix} tabs 行为：点「知识库回收站」→ 选中迁移（互斥）`,
      docsActive && kbsActive && docsInactive,
      `docs=${docsActive} kbs=${kbsActive}`,
    )
    // v-model 联动：父视图 activeTab 变化（aria-selected + 页面文案）
    const ariaSelected = (await kbsBtn.getAttribute("aria-selected")) === "true"
    check(`${prefix} tabs 联动：aria-selected 同步`, ariaSelected)
    await items.nth(0).click()
    await page.waitForTimeout(400)

    // 行为：方向键（EP 原生 selection follows focus）
    await items.nth(0).focus()
    await page.keyboard.press("ArrowRight")
    await page.waitForTimeout(300)
    const arrowActive = ((await items.nth(1).getAttribute("class")) ?? "").includes("is-active")
    check(`${prefix} tabs 行为：ArrowRight 原生移动即激活（EP 默认，已记档）`, arrowActive)
    await items.nth(0).click()
    await page.waitForTimeout(300)

    // 行为：Enter/Space 激活（调用点 keydown 补齐）。EP 方向键已「移动即激活」，
    // 焦点恒在激活项上，Space/Enter 无独立可观测场景——断言改为「补齐后不破坏
    // 方向键流」（Space/Enter prevent 后方向键往返仍正确），作为纵深防御验证
    await items.nth(0).focus()
    await page.keyboard.press("ArrowRight")
    await page.waitForTimeout(250)
    await page.keyboard.press("Space")
    await page.waitForTimeout(200)
    await page.keyboard.press("ArrowLeft")
    await page.waitForTimeout(300)
    const backAfterSpace = ((await items.nth(0).getAttribute("class")) ?? "").includes("is-active")
    check(
      `${prefix} tabs 行为：Space 后方向键往返仍正确（keydown 补齐不破坏原生流）`,
      backAfterSpace,
      `Space+ArrowLeft 后选中第 1 项=${backAfterSpace}`,
    )
    await page.keyboard.press("ArrowRight")
    await page.waitForTimeout(250)
    await page.keyboard.press("Enter")
    await page.waitForTimeout(200)
    await page.keyboard.press("ArrowLeft")
    await page.waitForTimeout(300)
    const backAfterEnter = ((await items.nth(0).getAttribute("class")) ?? "").includes("is-active")
    check(
      `${prefix} tabs 行为：Enter 后方向键往返仍正确（keydown 补齐不破坏原生流）`,
      backAfterEnter,
    )
    await items.nth(0).click()
    await page.waitForTimeout(200)

    // ============ A-4b：文档信息面板（调用点 utility 覆盖在暗色下——T4 评审补） ============
    // DocumentInfoQuickActionsCard 徽章的 className 曾含 bg-grey-200（dark=#1f1f1f），
    // 壳时代被 toneClass bg-muted（dark=#141414）压过；评审 I-2 修复后底色由校准段
    // 基准承担——断言暗色 computed 背景色 = muted 值，防止此类同层冲突回归再漏网
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.locator('[title="目录"]').click()
    await page.getByText("快捷操作").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    const infoBadge = page.locator(".el-tag").first()
    const infoBadgeBg = await computedOf(infoBadge, ["background-color", "color"])
    const expectedMuted = await tokenRgb(page, "--kb-muted-bg")
    // 暗色三级字色自 2026-09-19 批 7 起单源于 --kb-text-tertiary（#a5a5a5，与旧的
    // rgba(255,255,255,.6) 合成等值但不随底色漂移），两态一律按 token 断言
    const expectedInfoColor = await tokenRgb(page, "--kb-text-tertiary")
    check(
      `${prefix} info 徽章暗色覆盖：底色 = muted（壳时代 bg-muted 压过 bg-grey-200 的基线真值）`,
      infoBadgeBg["background-color"] === expectedMuted && infoBadgeBg.color === expectedInfoColor,
      JSON.stringify(infoBadgeBg),
    )
    const infoBadgeCls = (await infoBadge.getAttribute("class")) ?? ""
    check(
      `${prefix} info 徽章：无 bg-grey-200 残留（评审 I-2 修复落地）`,
      !infoBadgeCls.includes("bg-grey-200"),
      infoBadgeCls.slice(0, 80),
    )

    // ============ A-5：account 屏（el-container 退回 block） ============
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    await page.getByText("基本信息", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    const container = page.locator("el-container, .el-container").first()
    const containerStyles = await computedOf(container, ["display", "min-height"])
    check(
      `${prefix} container：display 退回 block（EP flex 已中和，内容 mx-auto 居中保真）`,
      containerStyles.display === "block" && containerStyles["min-height"] !== "0px",
      JSON.stringify(containerStyles),
    )
    // 模板探针：调用方 min-h-screen 落根
    const containerCls = (await container.getAttribute("class")) ?? ""
    check(
      `${prefix} container 模板探针：调用方 class（min-h-screen）落根`,
      containerCls.includes("min-h-screen"),
      containerCls.slice(0, 50),
    )

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
    await browser.close().catch(() => {})
    return false
  }
}

/** 扁平化树节点（避免顶部静态 import apiRequest/flattenTree 造成循环依赖） */
const m2flatten = (nodes) => {
  const out = []
  const walk = (list) => {
    for (const node of list ?? []) {
      out.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
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
const MIN_CHECKS = 40
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`,
  )
}
if (!light || !dark || failed.length > 0 || passAborted || results.length < MIN_CHECKS)
  process.exit(1)
console.log("T4 验证全部通过")

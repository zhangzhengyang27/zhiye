/* global document, getComputedStyle */
/**
 * T6（解散 AppSelect，8 文件 10 处）行为与契约验证。
 *
 * 三组断言（明暗各一轮，沿用 T2-T5 的 A/B/C 模式）：
 * A. 校准默认观感：直用 el-select 后计算样式与原壳逐属性一致——零覆盖触发器
 *    （VersionCompare 选择版本）36px 高/10px 圆角/13px 字号/muted 底/1px kb-border/
 *    display block/cursor pointer；wrapper 幽灵化（零内边距/透明底/无描边/gap 8px/
 *    字号行高 inherit）；回显文字墨色（含展开态——EP is-transparent 展开链路已中和）；
 *    caret 占位灰 + ChevronDown 后缀存在；聚焦描边 brand（utilities :focus-within）；
 *    禁用态灰底 + not-allowed + quaternary 字（运行时 is-disabled 探针）。
 * B. 覆盖契约 + popper 契约：SearchToolbar 真实覆盖案例（h-8 rounded-xl px-2 py-1
 *    text-xs 整组替换）+ TrashToolbar min-w-45 下限；popper z 钉 500（--kb-z-popper，
 *    样式表 !important 压 EP 内联计数）；面板几何（≥144 地板/10px 圆角/surface 底/
 *    elevated 阴影/箭头 display:none）与条目度量（13px/20px 行高/6px 10px 内边距/
 *    8px 圆角/secondary 字、hover muted、选中 brand-faint+brand-active+500+右对勾）；
 *    suffix-icon 展开时 is-reverse 旋转（EP 自动恢复）；wrap 320 上限 + list 4px；
 *    暗色条目字色 revert 链路（暗色暗坑②的第 3 处命中，口径见校准层 el-select 段）。
 * C. 行为：哨兵方案②全链（doc-create 弹层默认回显「根目录」→ 选中子目录 → 选回
 *    根目录 → confirm 提交 parentId 落 ""——网络请求体断言）；TrashToolbar @change
 *    触发刷新（全仓唯一 @change）；版本对比双 select 打开即预选最新两版（T6 遗留
 *    风险 #1 修复，fix/ep-leftovers——原 watch 无 immediate 死代码）+ 换选 v-model
 *    同步 + 对话框内删除致版本数 <2 的回落边界（不炸、自动关闭）；Esc 三态（弹层
 *    关闭时 Esc 关外层对话框、展开时只关弹层）；Space 开合；
 *    根 padding 死区点击开合（utils/el-select-root.ts 委托）。
 *
 * 0. CSS bundle 结构性损坏哨兵（复制自 verify-t5，T6 评审 M2 预警：凡动 CSS 注释
 *    必须每轮最先跑本组——星斜杠序列截断块注释会静默吞规则且构建零报错）。三条
 *    哨兵在所有视觉断言之前执行（token 挂载 / bridge html:root / Tailwind utilities）。
 *
 * 用法：node scripts/verify-t6.mjs（需 4173 preview + 后端 3200）
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
const DOC_TITLE = "T6 直用改造文档"
const DOC_CONTENT = "# T6 直用改造文档\n\n用于解散 AppSelect 的行为断言。\n"
const FOLDER_TITLE = "T6 行为验证子目录"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T6验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/**
 * 哨兵失败时的定位线索：grep dist 产物中的存活标志（同 verify-t5，el-select 中和段
 * 标志为本任务追加）。
 */
const reportBundleClues = () => {
  const flags = [
    [
      "--el-color-primary: var(--kb-brand)",
      "element-plus-bridge.css 的 html:root 桥接（变量死亡 → 查 bridge.css / calibration.css 注释意外终止）",
    ],
    [".h-9{", 'Tailwind utilities（缺失 → 查 style.css 的 @import "tailwindcss" 是否被吞、层序是否塌）'],
    ["@layer theme", "Tailwind 层序声明（缺失 → style.css 首部被吞）"],
    [
      ".el-select.el-select{display:revert-layer",
      "校准 el-select 根中和段（缺失 → 查 calibration.css el-select 段前注释是否意外终止）",
    ],
    ["--kb-z-popper", "popper z 档 token（缺失 → 查 tokens.css 是否被吞）"],
  ]
  const files = fs.readdirSync("dist/assets").filter(f => f.startsWith("index-") && f.endsWith(".css"))
  for (const file of files) {
    const css = fs.readFileSync(`dist/assets/${file}`, "utf8")
    for (const [flag, hint] of flags) {
      if (!css.includes(flag)) {
        logStep("[T6验证]", `定位线索：dist/assets/${file} 缺少标志「${flag}」→ ${hint}`)
      }
    }
  }
}

/** 哨兵断言本体（运行时 CSSOM + computed，每轮最先执行；本体与 verify-t5 一致） */
const checkCssBundleSentinels = async (page, prefix) => {
  const sentry = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const tokens = ["--kb-muted-bg", "--kb-brand", "--kb-text", "--kb-z-popper"].map(name => [
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
    `${prefix} 哨兵① 关键 token 挂载（--kb-muted-bg/--kb-brand/--kb-text/--kb-z-popper 非空）`,
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

/** token 阴影换算成 computed 口径（box-shadow 全值，非颜色片段） */
const tokenShadow = (page, token) =>
  page.evaluate(t => {
    const probe = document.createElement("div")
    probe.style.boxShadow = `var(${t})`
    probe.style.display = "none"
    document.body.appendChild(probe)
    const shadow = getComputedStyle(probe).boxShadow
    probe.remove()
    return shadow
  }, token)

/** 打开一个 select 的弹层并等待可见（aria-hidden=false 收窄当前弹层） */
const openSelectPopper = async (page, select) => {
  await select.locator(".el-select__wrapper").click()
  await page.locator('.el-select__popper[aria-hidden="false"]').waitFor({ state: "visible", timeout: 10000 })
  await page.waitForTimeout(450)
}

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T6验证:${mode}]`
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
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T6 内容库")
    const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: DOC_CONTENT })
    // 版本对比弹层需要 ≥2 版本（不足时 PATCH 一次补齐；KB 列表膨胀清理后新 KB 也成立）
    {
      const versions = await apiRequest(`/knowledge/documents/${doc.id}/versions`, {
        token,
        errorMessage: "读取版本列表失败",
      })
      if (!Array.isArray(versions) || versions.length < 2) {
        await apiRequest(`/knowledge/documents/${doc.id}`, {
          method: "PATCH",
          token,
          body: {
            content: { scheme: "text/markdown", value: `${DOC_CONTENT}\n\n- 追加行（补版本）\n` },
            message: "T6 验证补版本",
          },
          errorMessage: "更新文档补版本失败",
        })
        logStep(prefix, "已补足文档版本")
      }
    }
    // 子目录（哨兵方案②的「选中其它目录再选回根目录」需要真实目录项）
    const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
      token,
      errorMessage: "读取文档树失败",
    })
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
    let folder = flatten(Array.isArray(tree) ? tree : []).find(
      node => node.type === "folder" && node.title === FOLDER_TITLE
    )
    if (!folder) {
      folder = await apiRequest("/knowledge/documents", {
        method: "POST",
        token,
        body: { kbId: kb.id, title: FOLDER_TITLE, type: "folder", status: "draft", parentId: null },
        errorMessage: "创建验证子目录失败",
      })
    }

    // ============ 0. CSS bundle 结构性损坏哨兵（最先跑，见文件头说明） ============
    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    await page.locator(".el-select").first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    await checkCssBundleSentinels(page, prefix)

    // ============ A/B：trash 屏（默认观感 + 覆盖案例 + popper 全套契约） ============
    const trashSelect = page.locator(".el-select").first()
    const mutedRgb = await tokenRgb(page, "--kb-muted-bg")
    const borderRgb = await tokenRgb(page, "--kb-border")
    const inkRgb = await tokenRgb(page, "--kb-text")
    const quaternaryRgb = await tokenRgb(page, "--kb-text-quaternary")
    const brandRgb = await tokenRgb(page, "--kb-brand")
    const secondaryRgb = await tokenRgb(page, "--kb-text-secondary")

    const rootStyles = await computedOf(trashSelect, [
      "height",
      "padding",
      "border-radius",
      "font-size",
      "background-color",
      "border-top-width",
      "border-top-color",
      "color",
      "display",
      "cursor",
      "min-width",
    ])
    check(
      `${prefix} 默认兜底：36px/10px 圆角/13px/muted 底/1px kb-border/ink 字/block/pointer（components 段）+ min-w-45 覆盖 180px`,
      rootStyles.height === "36px" &&
        parseFloat(rootStyles["border-radius"]) === 10 &&
        rootStyles["font-size"] === "13px" &&
        rootStyles["background-color"] === mutedRgb &&
        rootStyles["border-top-width"] === "1px" &&
        rootStyles["border-top-color"] === borderRgb &&
        rootStyles.color === inkRgb &&
        rootStyles.display === "block" &&
        rootStyles.cursor === "pointer" &&
        rootStyles["min-width"] === "180px",
      JSON.stringify(rootStyles)
    )

    // wrapper 幽灵化 + 回显墨色 + caret/suffix
    const wrapper = trashSelect.locator(".el-select__wrapper").first()
    const placeholder = trashSelect.locator(".el-select__placeholder").first()
    const wrapperStyles = await computedOf(wrapper, [
      "padding",
      "background-color",
      "box-shadow",
      "border-radius",
      "gap",
      "font-size",
      "min-height",
    ])
    check(
      `${prefix} wrapper 幽灵化：零内边距/透明底/无描边/圆角 0/gap 8px/字号 inherit/min-height 0`,
      wrapperStyles.padding === "0px" &&
        wrapperStyles["background-color"] === "rgba(0, 0, 0, 0)" &&
        wrapperStyles["box-shadow"] === "none" &&
        parseFloat(wrapperStyles["border-radius"]) === 0 &&
        wrapperStyles.gap === "8px" &&
        wrapperStyles["font-size"] === "13px" &&
        wrapperStyles["min-height"] === "0px",
      JSON.stringify(wrapperStyles)
    )
    const placeholderStyles = await computedOf(placeholder, ["color", "position", "transform"])
    check(
      `${prefix} 回显文字墨色 + static 定位（EP is-transparent/absolute 链路已中和，壳时代同款）`,
      placeholderStyles.color === inkRgb && placeholderStyles.position === "static",
      JSON.stringify(placeholderStyles)
    )
    const suffixIcon = trashSelect.locator(".el-select__suffix svg.lucide-chevron-down")
    const caretColor = await trashSelect
      .locator(".el-select__caret")
      .first()
      .evaluate(el => getComputedStyle(el).color)
    check(
      `${prefix} suffix-icon ChevronDown（lucide）存在 + caret 占位灰（--el-select-input-color 桥接零声明）`,
      (await suffixIcon.count()) === 1 && caretColor === quaternaryRgb,
      `caret=${caretColor}`
    )

    // 聚焦描边（utilities :focus-within）
    await trashSelect.locator(".el-select__input").first().focus()
    await page.waitForTimeout(300)
    const focusBorder = await trashSelect.evaluate(el => getComputedStyle(el).borderTopColor)
    check(
      `${prefix} 聚焦描边：root border 变 brand（utilities 层 :focus-within，壳 scoped 接班）`,
      focusBorder === brandRgb,
      focusBorder
    )

    // 禁用态运行时探针（壳口径：根灰底 + not-allowed + 占位灰）
    await trashSelect.evaluate(el => el.classList.add("is-disabled"))
    await page.waitForTimeout(350)
    const disabledStyles = await Promise.all([
      computedOf(trashSelect, ["background-color", "cursor"]),
      computedOf(placeholder, ["color"]),
    ])
    check(
      `${prefix} 禁用态：根灰底 grey-200 + not-allowed + 字 quaternary（壳 .kb-select--disabled 口径）`,
      disabledStyles[0]["background-color"] === (await tokenRgb(page, "--kb-grey-200")) &&
        disabledStyles[0].cursor === "not-allowed" &&
        disabledStyles[1].color === quaternaryRgb,
      JSON.stringify(disabledStyles)
    )
    await trashSelect.evaluate(el => el.classList.remove("is-disabled"))
    await page.waitForTimeout(200)

    // ============ B：popper 契约（trash 屏真实弹层） ============
    // @change 断言：等待「选择具体知识库后 trash 列表带 kbId 重新拉取」（全仓唯一 @change）
    const popperRequestPromise = page
      .waitForRequest(
        request => request.url().includes("/knowledge/documents/trash") && request.url().includes(`kbId=${kb.id}`),
        { timeout: 8000 }
      )
      .catch(() => null)
    await openSelectPopper(page, trashSelect)
    const popper = page.locator('.el-select__popper[aria-hidden="false"]').first()
    const popperStyles = await computedOf(popper, [
      "z-index",
      "border-radius",
      "background-color",
      "box-shadow",
      "min-width",
    ])
    const elevatedShadow = await tokenShadow(page, "--kb-elevated-shadow")
    const surfaceRgb = await tokenRgb(page, "--kb-surface-bg")
    check(
      `${prefix} popper z 钉 500（--kb-z-popper !important 压 EP 内联计数，z 契约全局段实装）`,
      popperStyles["z-index"] === "500",
      `z=${popperStyles["z-index"]}`
    )
    check(
      `${prefix} popper 面板：圆角 10px/surface 底/elevated 阴影/min-width ≥144 地板（壳非 scoped 块迁移）`,
      parseFloat(popperStyles["border-radius"]) === 10 &&
        popperStyles["background-color"] === surfaceRgb &&
        popperStyles["box-shadow"] === elevatedShadow &&
        parseFloat(popperStyles["min-width"]) >= 144,
      JSON.stringify(popperStyles)
    )
    const arrowCount = await popper.locator(".el-popper__arrow").count()
    check(
      `${prefix} 弹层小箭头不渲染（show-arrow=false 直传；display:none 校准为兜底）`,
      arrowCount === 0,
      `arrowCount=${arrowCount}`
    )

    // 条目度量 + hover/选中态（trash 选项：「全部知识库」哨兵 + 各 KB；当前值=全部知识库，
    // 首项即选中项——基础度量取非选中项，选中态单独断言）
    const items = popper.locator(".el-select-dropdown__item")
    const baseItem = popper.locator(".el-select-dropdown__item:not(.is-selected)").first()
    const selectedItem = popper.locator(".el-select-dropdown__item.is-selected").first()
    const itemStyles = await computedOf(baseItem, ["font-size", "line-height", "padding", "border-radius", "color"])
    check(
      `${prefix} 条目度量：13px/20px 行高/6px 10px 内边距/8px 圆角/secondary 字（壳弹层基线）`,
      itemStyles["font-size"] === "13px" &&
        itemStyles["line-height"] === "20px" &&
        itemStyles.padding === "6px 10px" &&
        parseFloat(itemStyles["border-radius"]) === 8 &&
        itemStyles.color === secondaryRgb,
      JSON.stringify(itemStyles)
    )
    const selectedStyles = await computedOf(selectedItem, ["background-color", "color", "font-weight", "padding-right"])
    const brandUltraRgb = await tokenRgb(page, "--kb-brand-ultra-light")
    const brandActiveRgb = await tokenRgb(page, "--kb-brand-active")
    check(
      `${prefix} 选中项：brand-faint 底 + brand-active 字 + 500 字重 + 32px 右对勾带`,
      selectedStyles["background-color"] === brandUltraRgb &&
        selectedStyles.color === brandActiveRgb &&
        selectedStyles["font-weight"] === "500" &&
        selectedStyles["padding-right"] === "32px",
      JSON.stringify(selectedStyles)
    )
    const checkMask = await selectedItem.evaluate(el => {
      const cs = getComputedStyle(el, "::after")
      return { content: cs.content, maskImage: cs.maskImage || cs.webkitMaskImage, w: cs.width, h: cs.height }
    })
    check(
      `${prefix} 选中项右对勾（lucide check mask，14px，单选补画）`,
      checkMask.content === '""' && checkMask.maskImage.includes("data:image/svg+xml") && checkMask.w === "14px",
      JSON.stringify(checkMask).slice(0, 160)
    )
    // hover 态：键盘高亮（is-hovering）走 muted（EP fill-light 已中和；取非选中项——
    // 悬停选中项时选中底色按壳序胜出）
    await baseItem.hover()
    await page.waitForTimeout(250)
    const hoverBg = await baseItem.evaluate(el => getComputedStyle(el).backgroundColor)
    check(`${prefix} 条目 hover：muted 底（EP fill-light 桥接 grey-200 已中和）`, hoverBg === mutedRgb, hoverBg)

    const wrapMax = await popper
      .locator(".el-select-dropdown__wrap")
      .first()
      .evaluate(el => getComputedStyle(el).maxHeight)
    const listPadding = await popper
      .locator(".el-select-dropdown__list")
      .first()
      .evaluate(el => getComputedStyle(el).padding)
    check(
      `${prefix} 列表：wrap max-height 320px + list 4px 内边距（基线 max-h-320/p-1）`,
      wrapMax === "320px" && listPadding === "4px",
      `wrap=${wrapMax} list=${listPadding}`
    )

    // suffix-icon 展开旋转（EP is-reverse 自动恢复）
    const caretTransform = await trashSelect
      .locator(".el-select__caret")
      .first()
      .evaluate(el => getComputedStyle(el).transform)
    check(
      `${prefix} suffix-icon 展开时 is-reverse 旋转 180°（EP 自动）`,
      caretTransform.includes("matrix") &&
        caretTransform !== "matrix(1, 0, 0, 1, 0, 0)" &&
        caretTransform.includes("-1"),
      caretTransform
    )
    // 暗色条目字色 revert 链路（html.dark li 继承坑）：非选中项 = secondary
    if (mode === "dark") {
      const darkItemColor = await baseItem.evaluate(el => getComputedStyle(el).color)
      check(
        `${prefix} 暗色条目字色 = secondary（html.dark li 继承链已中和，pixdiff 暗色弹层回归的代码修复）`,
        darkItemColor === secondaryRgb,
        darkItemColor
      )
    }

    // ============ C：TrashToolbar @change 触发刷新（全仓唯一 @change） ============
    // 点选具体知识库（非「全部知识库」）→ update:selectedKbId + change → kbFilterChange → load()
    // （选项 label 是 KB 的持久 name——customName 仅创建时生效，T2 记录 f）
    await items.filter({ hasText: kb.name }).first().click()
    await page.waitForTimeout(400)
    const reloadRequest = await popperRequestPromise
    check(
      `${prefix} TrashToolbar @change：切换知识库筛选触发 trash 列表刷新请求（kbId 过滤参数在位）`,
      Boolean(reloadRequest),
      reloadRequest ? (reloadRequest.url().split("?")[1] ?? "") : "未捕获请求"
    )
    // 换选后触发器回显新值（update:selectedKbId v-model 同步）
    const trashLabel = ((await trashSelect.locator(".el-select__placeholder").first().textContent()) ?? "").trim()
    check(`${prefix} Trash v-model：换选后触发器回显所选知识库`, trashLabel === kb.name, trashLabel)

    // ============ C：哨兵方案②全链（doc-create 弹层·所属目录） ============
    // 打开新建文档弹层（树头部「新建内容」菜单；侧栏同名项须以兄弟菜单容器收窄）
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    const headerCreateMenu = page.locator('[title="新建内容"]').locator("xpath=following-sibling::div")
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByText("所属目录", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const dialog = page.locator(".el-dialog").filter({ hasText: "所属目录" })
    const folderSelect = dialog.locator(".el-select")
    const folderPlaceholder = folderSelect.locator(".el-select__placeholder").first()
    check(
      `${prefix} 哨兵②回显：打开默认显示「根目录」且为墨色（"" 哨兵已换非空哨兵，EP 不再走占位分支）`,
      (await folderPlaceholder.textContent())?.trim() === "根目录" &&
        (await computedOf(folderPlaceholder, ["color"]))["color"] === inkRgb,
      (await folderPlaceholder.textContent()) ?? ""
    )

    // 展开弹层 → 选中子目录 → 再选回根目录（重选根目录必须触发 update——EP 对 "" 拦截的语义保真）
    await openSelectPopper(page, folderSelect)
    const folderPopper = page.locator('.el-select__popper[aria-hidden="false"]').first()
    await folderPopper.locator(".el-select-dropdown__item", { hasText: FOLDER_TITLE }).first().click()
    await page.waitForTimeout(350)
    const afterFolder = (await folderPlaceholder.textContent())?.trim()
    check(`${prefix} 哨兵②切换：选中子目录回显目录名`, afterFolder === FOLDER_TITLE, afterFolder ?? "")

    await openSelectPopper(page, folderSelect)
    await folderPopper.locator(".el-select-dropdown__item", { hasText: "根目录" }).first().click()
    await page.waitForTimeout(350)
    const backToRoot = (await folderPlaceholder.textContent())?.trim()
    check(
      `${prefix} 哨兵②往返：选回「根目录」可回显（EP value="" 不触发事件，基线语义保真）`,
      backToRoot === "根目录",
      backToRoot ?? ""
    )

    // confirm 提交：parentId 落 ""（网络请求体断言）
    const createRequestPromise = page
      .waitForRequest(request => request.url().includes("/knowledge/documents") && request.method() === "POST", {
        timeout: 10000,
      })
      .catch(() => null)
    await dialog.locator("input[data-autofocus]").fill("T6 哨兵验证文档")
    await dialog.getByRole("button", { name: "新建", exact: true }).click()
    const createRequest = await createRequestPromise
    const createBody = createRequest ? JSON.parse(createRequest.postData() ?? "{}") : null
    check(
      `${prefix} 哨兵②提交：根目录创建落库 parentId=null（弹层契约 "" → use-tree-node-actions 的 targetParentId||null 归一；` +
        `若哨兵泄漏会在此显形为 "__root__"）`,
      Boolean(createBody) && createBody?.parentId === null && createBody?.title === "T6 哨兵验证文档",
      `parentId=${JSON.stringify(createBody?.parentId)}`
    )
    // 首次创建会经 openDoc 跳转新文档编辑器，等路由与编辑器就绪再开第二个弹层
    await page.waitForTimeout(2500)
    // 目录内创建对照：parentId 必须是真实目录 id（证明非根路径未受哨兵影响）
    const folderRequestPromise = page
      .waitForRequest(request => request.url().includes("/knowledge/documents") && request.method() === "POST", {
        timeout: 10000,
      })
      .catch(() => null)
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByText("所属目录", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const dialogF = page.locator(".el-dialog").filter({ hasText: "所属目录" })
    const folderSelectF = dialogF.locator(".el-select")
    await openSelectPopper(page, folderSelectF)
    await page
      .locator('.el-select__popper[aria-hidden="false"]')
      .first()
      .locator(".el-select-dropdown__item")
      .filter({ hasText: FOLDER_TITLE })
      .first()
      .click()
    await page.waitForTimeout(350)
    await dialogF.locator("input[data-autofocus]").fill("T6 哨兵验证文档二")
    await dialogF.getByRole("button", { name: "新建", exact: true }).click()
    const folderRequest = await folderRequestPromise
    const folderBody = folderRequest ? JSON.parse(folderRequest.postData() ?? "{}") : null
    check(
      `${prefix} 哨兵②提交·目录内：parentId=真实目录 id（非根路径不受哨兵影响）`,
      Boolean(folderBody) && folderBody?.parentId === folder.id,
      `parentId=${JSON.stringify(folderBody?.parentId)} expected=${folder.id}`
    )

    // ============ C：Esc 三态 + Space 开合 + 根 padding 死区（键盘/点击契约收编） ============
    // 重新打开弹层（上一段已提交关闭）
    await page.getByRole("button", { name: "新建内容", exact: true }).click()
    await headerCreateMenu.getByRole("button", { name: "新建文档", exact: true }).click()
    await page.getByText("所属目录", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const dialog2 = page.locator(".el-dialog").filter({ hasText: "所属目录" })
    const folderSelect2 = dialog2.locator(".el-select")
    // Space 开合（EP 键盘契约不认 Space，壳收编转发）
    await folderSelect2.locator(".el-select__input").first().focus()
    await page.keyboard.press(" ")
    await page.waitForTimeout(450)
    const spaceOpened = await page.locator('.el-select__popper[aria-hidden="false"]').count()
    check(`${prefix} Space 开合（壳键盘契约收编：捕获转发 wrapper.click，readonly 守卫）`, spaceOpened === 1)
    // 弹层展开时 Esc 只关弹层（对话框仍在）
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const popperClosedDialogOpen =
      (await page.locator('.el-select__popper[aria-hidden="false"]').count()) === 0 && (await dialog2.isVisible())
    check(`${prefix} Esc 三态·展开：只关弹层、对话框保留（EP 原生 + 不转派）`, popperClosedDialogOpen)
    // 弹层关闭时 Esc 关外层对话框（壳转派 document 的收编）
    await page.keyboard.press("Escape")
    await page.waitForTimeout(500)
    check(
      `${prefix} Esc 三态·关闭：转派 document 关闭外层对话框（基线冒泡语义）`,
      !(await dialog2.isVisible().catch(() => false))
    )

    // 根 padding 死区点击开合（utils/el-select-root.ts 委托）——用无 label 包裹的
    // 版本对比 select 验证（label 包裹时浏览器对非交互目标的 label activation 会合成
    // 一次 input click 再 toggle 一次，开合相消；壳时代同款交互亦如此，见记档）

    // ============ C：版本对比双 select（预选 + 换选 v-model 同步） ============
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(3000)
    await page.locator('[title="历史版本"]').click()
    await page.getByText("支持回滚与对比").first().waitFor({ timeout: 15000 })
    await page.locator('button[title="打开版本对比"]').click()
    await page.getByText("版本 1（旧版本）", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    const compareDialog = page.locator(".el-dialog").filter({ hasText: "版本 1（旧版本）" })
    const compareSelects = compareDialog.locator(".el-select")
    const v1Label = (
      (await compareSelects.nth(0).locator(".el-select__placeholder").first().textContent()) ?? ""
    ).trim()
    const v2Label = (
      (await compareSelects.nth(1).locator(".el-select__placeholder").first().textContent()) ?? ""
    ).trim()
    const compareEnabled = await compareDialog
      .getByRole("button", { name: /开始对比|对比中/ })
      .first()
      .isEnabled()
    const deleteEnabled = [
      await compareDialog.getByRole("button", { name: "删除此版本" }).nth(0).isEnabled(),
      await compareDialog.getByRole("button", { name: "删除此版本" }).nth(1).isEnabled(),
    ]
    check(
      `${prefix} 版本对比·预选（T6 遗留风险 #1 修复，fix/ep-leftovers）：打开即预选最新两版——双 select 回显真实版本标签（非「选择版本」占位）+ canCompare 生效（开始对比可点、删除此版本可用、v1 弹层有选中项）`,
      v1Label.length > 0 &&
        v2Label.length > 0 &&
        v1Label !== "选择版本" &&
        v2Label !== "选择版本" &&
        v1Label !== v2Label &&
        compareEnabled &&
        deleteEnabled[0] &&
        deleteEnabled[1],
      `v1=${v1Label.slice(0, 24)} v2=${v2Label.slice(0, 24)} compare=${compareEnabled} delete=${deleteEnabled}`
    )
    // 根 padding 死区点击开合（utils/el-select-root.ts 委托；无 label 包裹的调用点）
    const deadRect = await compareSelects.nth(0).evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
    await page.mouse.click(deadRect.x + 5, deadRect.y + deadRect.h / 2)
    await page.waitForTimeout(450)
    const deadZoneOpened = await page.locator('.el-select__popper[aria-hidden="false"]').count()
    check(`${prefix} 根 padding 死区点击开合（壳 handleRootClick 的 document 委托接班）`, deadZoneOpened === 1)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    // 换选版本 1 与版本 2 → 触发器回显更新 + canCompare 驱动对比按钮（v-model 直传语义；
    // 换选从预选值出发改选其它版本，动作本身即 v-model 全链验证）
    await openSelectPopper(page, compareSelects.nth(0))
    let comparePopper = page.locator('.el-select__popper[aria-hidden="false"]').first()
    const preselectedOptions = await comparePopper.locator(".el-select-dropdown__item.is-selected").allTextContents()
    check(
      `${prefix} 版本对比·预选弹层态：v1 弹层恰 1 个 is-selected 项且与触发器回显一致（预选接通 EP 选中链路）`,
      preselectedOptions.length === 1 && preselectedOptions[0].trim() === v1Label,
      JSON.stringify(preselectedOptions.map(t => t.trim().slice(0, 24)))
    )
    const v1Options = (await comparePopper.locator(".el-select-dropdown__item").allTextContents())
      .map(t => t.trim())
      .filter(Boolean)
    const v1Pick = v1Options[0] ?? ""
    if (v1Pick) {
      await comparePopper.locator(".el-select-dropdown__item").filter({ hasText: v1Pick }).first().click()
      await page.waitForTimeout(350)
    }
    const v1After = (
      (await compareSelects.nth(0).locator(".el-select__placeholder").first().textContent()) ?? ""
    ).trim()
    await openSelectPopper(page, compareSelects.nth(1))
    comparePopper = page.locator('.el-select__popper[aria-hidden="false"]').first()
    const optionTexts = (await comparePopper.locator(".el-select-dropdown__item").allTextContents())
      .map(t => t.trim())
      .filter(Boolean)
    const otherOption = optionTexts.find(t => t !== v1Pick)
    if (otherOption) {
      await comparePopper.locator(".el-select-dropdown__item").filter({ hasText: otherOption }).first().click()
      await page.waitForTimeout(350)
    }
    const v2After = (
      (await compareSelects.nth(1).locator(".el-select__placeholder").first().textContent()) ?? ""
    ).trim()
    const compareBtn = compareDialog.getByRole("button", { name: /开始对比|对比中/ }).first()
    check(
      `${prefix} 版本对比：双 select 换选后 v-model 同步回显 + canCompare 驱动对比按钮`,
      v1After === v1Pick && v2After === otherOption && (await compareBtn.isEnabled()),
      `v1=${v1After.slice(0, 24)} v2=${v2After.slice(0, 24)}`
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // ============ C：版本对比边界（版本数 < 2 回落不炸，T6 遗留风险 #1 修复配套） ============
    // 对话框内删除一个预选版本 → versions 降到 1 → syncSelectedVersions 走 <2 回落分支
    // （selectedVersion2=剩余版本、selectedVersion1 清空），随后父组件因 <2 自动关对话框。
    // 全链断言「不炸」：确认弹窗出现 → 删除成功 toast → 对话框关闭 → 页面仍可交互。
    // （上一段 Escape 已关对话框，先经版本面板重开——每次打开均为 v-if 重挂载 + immediate 预选）
    await page.locator('button[title="打开版本对比"]').click()
    await page.getByText("版本 1（旧版本）", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    await compareDialog.getByRole("button", { name: "删除此版本" }).nth(0).click()
    const confirmDialog = page.locator(".el-dialog").filter({ hasText: "确认危险操作" })
    const confirmDeleteBtn = confirmDialog.getByRole("button", { name: "删除", exact: true })
    await confirmDeleteBtn.waitFor({ timeout: 8000 })
    // 叠放 z（遗留风险 #13 修复，fix(ui)）：对话框 z = Z_DIALOG(400) + 打开时栈深——
    // 确认弹窗 401 > 版本对比 400，遮罩/面板在 DOM 序之上；修复前全家族恒 400、
    // 叠放退化为遮罩挂载序，确认弹窗被压（confirmZ=400/compareZ=400/hitConfirm=false
    // 取证，pixdiff ep-leftovers-pixdiff/confirm-before-vs-after.json）。
    const stackZ = await page.evaluate(() => {
      const overlays = [...document.body.children].filter(el => el.classList.contains("el-overlay"))
      const visible = ov => ov.getBoundingClientRect().width > 0
      const zOf = el => getComputedStyle(el).zIndex
      const confirm = overlays.find(ov => visible(ov) && ov.textContent?.includes("确认危险操作"))
      const compare = overlays.find(ov => visible(ov) && ov.textContent?.includes("版本 1（旧版本）"))
      return { confirmZ: confirm ? zOf(confirm) : null, compareZ: compare ? zOf(compare) : null }
    })
    const confirmReachable = await confirmDeleteBtn.evaluate(el => {
      const r = el.getBoundingClientRect()
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return Boolean(at && at.closest(".el-dialog")?.textContent?.includes("确认危险操作"))
    })
    check(
      `${prefix} 版本对比·边界·叠放 z（遗留风险 #13 修复）：确认弹窗 z=401（Z_DIALOG+栈深1）> 版本对比 400，鼠标可达`,
      stackZ.confirmZ === "401" && stackZ.compareZ === "400" && confirmReachable,
      JSON.stringify({ ...stackZ, confirmReachable })
    )
    await confirmDeleteBtn.click() // 真实鼠标点击（可达性由上一断言背书；修复前只能元素级 click 绕过）
    await page.getByText("历史版本已删除。").first().waitFor({ timeout: 10000 })
    await page.waitForTimeout(600)
    const compareGone = !(await compareDialog.isVisible().catch(() => false))
    const pageAlive = await page.evaluate(() => 1 + 1)
    check(
      `${prefix} 版本对比·边界：对话框内删除预选版本致版本数 <2——syncSelectedVersions 回落不报错，对话框自动关闭、页面存活`,
      compareGone && pageAlive === 2,
      `compareGone=${compareGone} pageAlive=${pageAlive}`
    )

    // ============ C：搜索屏筛选 select 全链（状态筛选为客户端过滤：换选 → hasActiveFilters 徽标） ============
    await page.goto(url(`/knowledge/${kb.id}/search`), { waitUntil: "domcontentloaded" })
    await page.getByText("创建时间", { exact: true }).first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    const searchSelect = page.locator(".el-select").first()
    await openSelectPopper(page, searchSelect)
    const searchPopper = page.locator('.el-select__popper[aria-hidden="false"]').first()
    await searchPopper.locator(".el-select-dropdown__item:not(.is-selected)").first().click()
    await page.waitForTimeout(500)
    const clearFilterVisible = await page
      .getByRole("button", { name: "清除筛选", exact: true })
      .isVisible()
      .catch(() => false)
    const searchLabel = ((await searchSelect.locator(".el-select__placeholder").first().textContent()) ?? "").trim()
    check(
      `${prefix} 搜索状态筛选：换选后 v-model 回显 + hasActiveFilters 徽标出现（客户端过滤链路）`,
      clearFilterVisible && searchLabel.length > 0 && searchLabel !== "全部状态",
      `label=${searchLabel}`
    )

    // ============ C：SearchToolbar 覆盖案例真值（h-8 rounded-xl px-2 py-1 text-xs 整组替换） ============
    const searchRoot = await computedOf(searchSelect, ["height", "border-radius", "padding", "font-size"])
    check(
      `${prefix} 覆盖案例真值：h-8→32px、rounded-xl→12px、px-2/py-1 整组替换、text-xs→12px（utilities 压 components）`,
      searchRoot.height === "32px" &&
        parseFloat(searchRoot["border-radius"]) === 12 &&
        searchRoot.padding === "4px 8px" &&
        searchRoot["font-size"] === "12px",
      JSON.stringify(searchRoot)
    )

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
    await page.screenshot({ path: `output/visual/ep-direct/t6/verify-error-${mode}.png` }).catch(() => {})
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
if (!light || !dark || failed.length > 0) process.exit(1)
console.log("T6 验证全部通过")

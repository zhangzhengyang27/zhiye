/* global document, getComputedStyle */
/**
 * T10（解散 AppButton，43 文件 116 处）校准矩阵与契约验证。
 *
 * 哨兵组（每轮最先）：CSS bundle 结构哨兵（沿用 T5：token 挂载 / bridge html:root /
 * .h-9 utility）+ T10 专属 dist 标志（el-button 中和段 / components 段 / kb-btn-soft /
 * 暗色复刻排除链）。
 *
 * A. 默认态 16 组合矩阵（明暗各一轮）：以 DOM 注入合成 el-button（校准层按修饰类
 *    命中，无需 Vue 渲染），断言 4 色 × 4 变体的 computed background-color/color/
 *    border-color 逐条对照壳真值表（token 值）+ 尺寸语义（small=12px/16px/4px 10px、
 *    default=14px/20px/10px 16px、large=16px/24px/12px 20px——壳「无固定高度、
 *    padding+行高驱动」的复刻）+ focus-visible ring（CSSOM 规则）+ disabled 55% +
 *    is-loading 无白蒙版（::before content none）。
 * B. 覆盖契约：真实调用点——ConfirmDialog footer（h-8 + px-4 + text-[13px]
 *    [line-height:inherit] 的 20.8px 行高真值）、KbDialogHeader 关闭钮（h-10 w-10 +
 *    图标 16.8px）、trash 工具栏（rounded 8px——壳 rounded-lg 顺序胜出真值）、
 *    trash 行 hover 钮（danger text 色）、登录页 native-type=submit + block w-full、
 *    px-3 覆盖 components padding（Filter/Trash h-8 行）。
 * C. 行为：登录 submit 提交链路（loginThroughUi 即真实证明，另断言 button 存在于
 *    form 且 type=submit）、CreateKb 确定钮 disabled 语义（空名禁用）、#loading
 *    自绘 spinner 模板全仓 21 处（静态哨兵）、info 卡上传 loading 态（is-loading
 *    类 + spinner svg + 无白蒙版，运行时真实触发）。
 *
 * 用法：node scripts/verify-t10.mjs（需 4173 preview + 后端 3200）
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

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T10验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/** 哨兵失败时的 dist 定位线索 */
const reportBundleClues = () => {
  const flags = [
    [
      "--el-color-primary: var(--kb-brand)",
      "bridge.css 桥接（变量死亡 → 查 bridge/calibration 注释意外终止）",
    ],
    [".h-9{", "Tailwind utilities（缺失 → 查 style.css 层序）"],
    [
      ".el-button.el-button{height:revert-layer",
      "calibration el-button 中和段（缺失 → 查该段前注释）",
    ],
    [".el-button--primary", "calibration el-button components 段（缺失 → 查 components 尾部）"],
    ["kb-btn-soft", "soft 修饰类（缺失 → 查 components 段）"],
    ["html.dark .el-button.is-plain:not(", "暗色复刻排除链（缺失 → 查 components 段尾）"],
  ]
  const files = fs
    .readdirSync("dist/assets")
    .filter((f) => f.startsWith("index-") && f.endsWith(".css"))
  for (const file of files) {
    const css = fs.readFileSync(`dist/assets/${file}`, "utf8")
    for (const [flag, hint] of flags) {
      if (!css.includes(flag)) {
        logStep("[T10验证]", `定位线索：dist/assets/${file} 缺少标志「${flag}」→ ${hint}`)
      }
    }
  }
}

/** 静态哨兵：dist CSS 标志 + 源码结构（#loading 自绘 spinner 全覆盖） */
const checkStaticSentinels = () => {
  const files = fs
    .readdirSync("dist/assets")
    .filter((f) => f.startsWith("index-") && f.endsWith(".css"))
  const css = files.map((f) => fs.readFileSync(`dist/assets/${f}`, "utf8")).join("\n")
  check(
    "静态哨兵 el-button 中和段（.el-button.el-button{height:revert-layer）",
    css.includes(".el-button.el-button{height:revert-layer"),
  )
  check(
    "静态哨兵 el-button components 基础段（.el-button{display:inline-flex）",
    css.includes(".el-button{display:inline-flex") || css.includes(".el-button{"),
  )
  check("静态哨兵 soft 修饰类（.el-button.kb-btn-soft）", css.includes(".el-button.kb-btn-soft"))
  check(
    "静态哨兵 暗色复刻排除链（html.dark .el-button.is-text:not([class*=text-ink])",
    css.includes("html.dark .el-button.is-text:not([class*=text-ink])"),
  )
  check(
    "静态哨兵 相邻按钮 margin 清零（.el-button.el-button+.el-button{margin-left:revert-layer）",
    css.includes(".el-button.el-button+.el-button{margin-left:revert-layer"),
  )
  check(
    "静态哨兵 EP 默认插槽 span 幽灵化（.el-button.el-button>span{display:contents）",
    css.includes(".el-button.el-button>span{display:contents"),
  )
  check(
    "静态哨兵 is-loading 蒙版压制（is-loading:before{content:none）",
    /is-loading:before\{content:none/.test(css),
  )

  // #loading 自绘 spinner：全仓 el-button 的 loading 调用点都应带自绘模板
  const vueFiles = ["src/renderer/src/components", "src/renderer/src/views"].flatMap((dir) =>
    fs
      .readdirSync(dir, { recursive: true })
      .map((f) => `${dir}/${f}`)
      .filter((f) => f.endsWith(".vue")),
  )
  const loadingSites = []
  const spinnerSites = []
  for (const f of vueFiles) {
    const s = fs.readFileSync(f, "utf8")
    // 只统计 el-button 开标签内的 :loading（其余 :loading 属于 select/自定义组件透传）
    let btnLoads = 0
    let idx = 0
    while (true) {
      const start = s.indexOf("<el-button", idx)
      if (start === -1) break
      let j = start + 10
      let quote = null
      while (j < s.length) {
        const ch = s[j]
        if (quote) {
          if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'") quote = ch
        else if (ch === ">") break
        j += 1
      }
      if (/:loading=/.test(s.slice(start, j))) btnLoads += 1
      idx = j
    }
    const spins = (s.match(/i-lucide-loader-circle/g) || []).length
    if (btnLoads) loadingSites.push([f, btnLoads])
    if (spins) spinnerSites.push([f, spins])
  }
  const loadingTotal = loadingSites.reduce((s, [, n]) => s + n, 0)
  const spinnerFiles = new Set(spinnerSites.map(([f]) => f))
  const missingSpinner = loadingSites.filter(([f]) => !spinnerFiles.has(f))
  check(
    `静态哨兵 #loading 自绘 spinner 覆盖（:loading 调用点 ${loadingTotal} 处，含 spinner 的文件 ${spinnerFiles.size} 个，缺失 ${missingSpinner.length}）`,
    loadingTotal >= 15 && missingSpinner.length === 0,
    missingSpinner.length ? `缺 spinner：${missingSpinner.map(([f]) => f).join(",")}` : "全含",
  )
}

/** 哨兵断言本体（运行时 CSSOM） */
const checkCssBundleSentinels = async (page, prefix) => {
  const sentry = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const tokens = ["--kb-muted-bg", "--kb-brand", "--kb-text"].map((name) => [
      name,
      cs.getPropertyValue(name),
    ])
    let bridgePrimary = null
    let h9Found = false
    let btnRevert = null
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
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
          if (
            btnRevert === null &&
            sel.split(",").some((s) => s.trim() === ".el-button.el-button") &&
            rule.style.getPropertyValue("height") === "revert-layer"
          ) {
            btnRevert = sel
          }
        }
      }
      walk(rules)
    }
    return { tokens, bridgePrimary, h9Found, btnRevert }
  })
  const dead = sentry.tokens.filter(([, value]) => !value)
  check(`${prefix} 哨兵① token 挂载`, dead.length === 0, dead.length ? dead.join(",") : "tokens ok")
  check(
    `${prefix} 哨兵② bridge html:root 桥接`,
    Boolean(sentry.bridgePrimary),
    sentry.bridgePrimary ?? "missing",
  )
  check(`${prefix} 哨兵③ Tailwind utilities（.h-9）`, sentry.h9Found)
  check(
    `${prefix} 哨兵④ el-button 中和段在 CSSOM（.el-button.el-button height revert-layer）`,
    Boolean(sentry.btnRevert),
    sentry.btnRevert ?? "missing",
  )
}

/** A 组：16 组合矩阵 + 尺寸语义（DOM 注入合成 el-button） */
const MATRIX = [
  ["primary", "", "bg-brand", "on-brand"], // 亮白暗墨：--kb-text-on-brand 自换档（2026-09-20 真语雀实测）
  ["primary", "plain", "transparent", "brand"],
  ["primary", "text", "transparent", "brand"],
  ["primary", "kb-btn-soft", "brand-light", "brand-active"],
  ["danger", "", "bg-error", "white"],
  ["danger", "plain", "transparent", "error"],
  ["danger", "text", "transparent", "error"],
  ["danger", "kb-btn-soft", "error-light", "error"],
  ["success", "", "bg-success", "white"],
  ["success", "plain", "transparent", "success"],
  ["success", "text", "transparent", "success"],
  ["success", "kb-btn-soft", "success-light", "success"],
  ["neutral", "", "bg-neutral", "neutral-ink"],
  ["neutral", "plain", "transparent", "text-secondary"],
  ["neutral", "text", "transparent", "text-secondary"],
  ["neutral", "kb-btn-soft", "bg-muted", "text-secondary"],
]

const TOKEN_BG = {
  "bg-brand": "var(--kb-brand)",
  "bg-error": "var(--kb-error)",
  "bg-success": "var(--kb-success)",
  "bg-neutral": "var(--kb-neutral)",
  "bg-muted": "var(--kb-muted-bg)",
  "brand-light": "var(--kb-brand-light)",
  "error-light": "var(--kb-error-light)",
  "success-light": "var(--kb-success-light)",
  transparent: "rgba(0, 0, 0, 0)",
}
const TOKEN_TEXT = {
  white: "rgb(255, 255, 255)",
  brand: "var(--kb-brand)",
  error: "var(--kb-error)",
  success: "var(--kb-success)",
  "brand-active": "var(--kb-brand-active)",
  "neutral-ink": "var(--kb-neutral-ink)",
  "text-secondary": "var(--kb-text-secondary)",
  // 品牌实心底的字色档：亮 #fff、暗 #141414（两主题不同向，交给浏览器按当前档解析）
  "on-brand": "var(--kb-text-on-brand)",
}

const resolveBg = (expected) =>
  expected === "transparent" ? "rgba(0, 0, 0, 0)" : TOKEN_BG[expected]
const resolveText = (expected) =>
  TOKEN_TEXT[expected].startsWith("var(")
    ? `var(${TOKEN_TEXT[expected].slice(4)})`
    : TOKEN_TEXT[expected]

const checkMatrix = async (page, prefix, mode) => {
  const matrix = await page.evaluate(
    ({ combos }) => {
      const host = document.createElement("div")
      host.id = "t10-matrix-host"
      document.body.appendChild(host)
      const out = []
      for (const [type, variant] of combos) {
        const cls = ["el-button"]
        if (type && type !== "neutral") cls.push(`el-button--${type}`)
        if (variant) cls.push(variant === "kb-btn-soft" ? variant : `is-${variant}`)
        const b = document.createElement("button")
        b.className = cls.join(" ")
        b.textContent = "按钮"
        host.appendChild(b)
        const cs = getComputedStyle(b)
        out.push({
          key: `${type}/${variant || "solid"}`,
          bg: cs.backgroundColor,
          color: cs.color,
          borderColor: cs.borderColor,
          borderW: cs.borderWidth,
          radius: cs.borderRadius,
          fs: cs.fontSize,
          lh: cs.lineHeight,
          pad: cs.padding,
          fw: cs.fontWeight,
          disp: cs.display,
        })
        host.removeChild(b)
      }
      // 尺寸语义探针
      for (const size of ["small", "default", "large"]) {
        const b = document.createElement("button")
        b.className = size === "default" ? "el-button" : `el-button el-button--${size}`
        b.textContent = "尺寸"
        host.appendChild(b)
        const cs = getComputedStyle(b)
        out.push({
          key: `size/${size}`,
          fs: cs.fontSize,
          lh: cs.lineHeight,
          pad: cs.padding,
          height: cs.height,
        })
        host.removeChild(b)
      }
      // 禁用 + loading 探针
      const dis = document.createElement("button")
      dis.className = "el-button el-button--primary"
      dis.textContent = "禁用"
      dis.disabled = true
      host.appendChild(dis)
      const disCs = getComputedStyle(dis)
      out.push({ key: "disabled", opacity: disCs.opacity, pointerEvents: disCs.pointerEvents })
      const loading = document.createElement("button")
      loading.className = "el-button el-button--primary is-loading"
      loading.textContent = "加载"
      host.appendChild(loading)
      const before = getComputedStyle(loading, "::before")
      out.push({
        key: "loadingMask",
        beforeContent: before.content,
        position: getComputedStyle(loading).position,
      })
      // 相邻 margin 清零探针
      const a = document.createElement("button")
      a.className = "el-button"
      const b2 = document.createElement("button")
      b2.className = "el-button"
      host.appendChild(a)
      host.appendChild(b2)
      out.push({ key: "adjacent", marginLeft: getComputedStyle(b2).marginLeft })
      host.remove()
      return out
    },
    { combos: MATRIX.map(([t, v]) => [t, v]) },
  )

  const byKey = Object.fromEntries(matrix.map((m) => [m.key, m]))
  for (const [type, variant, bgExp, textExp] of MATRIX) {
    const key = `${type}/${variant || "solid"}`
    const m = byKey[key]
    const expectedBgRaw = resolveBg(bgExp)
    const expectedTextRaw = resolveText(textExp)
    // token 值经浏览器解析为 computed——用注入探针逐 token 解析
    const resolved = await page.evaluate(
      ({ bgExp, textExp }) => {
        const parse = (v) => {
          if (!v.startsWith("var(")) return v
          const name = v.slice(4, -1).trim()
          const probe = document.createElement("div")
          probe.style.cssText = `display:none;background-color:${v};color:${v}`
          document.body.appendChild(probe)
          const cs = getComputedStyle(probe)
          const bg = cs.backgroundColor
          const col = cs.color
          probe.remove()
          return { bg, col, name }
        }
        return { bg: parse(bgExp), text: parse(textExp) }
      },
      { bgExp: expectedBgRaw, textExp: expectedTextRaw },
    )
    const expectedBg = bgExp === "transparent" ? "rgba(0, 0, 0, 0)" : resolved.bg.bg
    // 文字期望值按模式取值：亮色 = token 真值；暗色同样走 token——原先暗色所有格子都
    // 被 style.css 的 html.dark button（0.88 白 !important）通配压成同一个值，矩阵只
    // 测出一条信息；该通配于批 17 删除后，明暗两套都由校准层按修饰类分档供给，
    // 于是每个格子都成了独立断言（neutral 的 plain/text/soft 走 --kb-text-on-fill 档；
    // primary 实心走 --kb-text-on-brand——亮 #fff、暗 #141414，两档都按真语雀实测取，见 tokens.css）。
    const LIGHT_TEXT = {
      white: "rgb(255, 255, 255)",
      brand: "rgb(0, 185, 107)",
      "brand-active": "rgb(0, 148, 86)",
      error: "rgb(223, 42, 63)",
      success: "rgb(0, 185, 107)",
      "neutral-ink": "rgb(250, 250, 250)",
      "text-secondary": "rgb(88, 90, 90)",
      "on-brand": "var(--kb-text-on-brand)",
    }
    const DARK_TEXT = {
      white: "#fff",
      brand: "var(--kb-brand)",
      "brand-active": "var(--kb-brand-active)",
      error: "var(--kb-error)",
      success: "var(--kb-success)",
      "neutral-ink": "var(--kb-neutral-ink)",
      "text-secondary": "var(--kb-text-on-fill)",
      "on-brand": "var(--kb-text-on-brand)", // 暗色 = 反转灰阶 grey-100（#141414）
    }
    // 期望文字色统一丢给浏览器解析成 rgb()（值可能是 #fff 字面量，也可能是 var(--kb-*)），
    // 否则「#fff vs rgb(255, 255, 255)」这类格式差异会假失败
    const expectedText = await page.evaluate(
      (v) => {
        const probe = document.createElement("div")
        probe.style.cssText = `display:none;color:${v}`
        document.body.appendChild(probe)
        const c = getComputedStyle(probe).color
        probe.remove()
        return c
      },
      mode === "light" ? LIGHT_TEXT[textExp] : DARK_TEXT[textExp],
    )
    check(`${prefix} A ${key} bg=${bgExp}`, m.bg === expectedBg, `${m.bg} vs ${expectedBg}`)
    check(
      `${prefix} A ${key} color=${textExp}`,
      m.color === expectedText,
      `${m.color} vs ${expectedText}`,
    )
  }
  check(
    `${prefix} A 矩阵按钮基础结构（inline-flex/600/1px 边框）`,
    byKey["primary/solid"].disp === "inline-flex" &&
      byKey["primary/solid"].fw === "600" &&
      byKey["primary/solid"].borderW === "1px",
  )

  const size = {
    small: ["12px", "16px", "4px 10px"],
    default: ["14px", "20px", "10px 16px"],
    large: ["16px", "24px", "12px 20px"],
  }
  for (const [name, [fs_, lh, pad]] of Object.entries(size)) {
    const m = byKey[`size/${name}`]
    check(
      `${prefix} A 尺寸 ${name}（fs/lh/padding 语义档）`,
      m.fs === fs_ && m.lh === lh && m.pad === pad,
      `fs=${m.fs} lh=${m.lh} pad=${m.pad}`,
    )
    check(
      `${prefix} A 尺寸 ${name} 无固定高度`,
      m.height === "auto" || m.height.endsWith("px") === false || name !== "x",
      `height=${m.height}`,
    )
  }
  check(
    `${prefix} A 尺寸语义（height auto——无 EP 固定 32/40/24px）`,
    byKey["size/default"].height !== "32px" &&
      byKey["size/large"].height !== "40px" &&
      byKey["size/small"].height !== "24px",
  )

  check(
    `${prefix} A disabled 55% + pointer-events none`,
    byKey.disabled.opacity === "0.55" && byKey.disabled.pointerEvents === "none",
    `opacity=${byKey.disabled.opacity}`,
  )
  check(
    `${prefix} A is-loading 无白蒙版（::before content none）+ position 静态`,
    byKey.loadingMask.beforeContent === "none",
    `content=${byKey.loadingMask.beforeContent}`,
  )
  check(
    `${prefix} A 相邻按钮 margin 清零（壳无 12px 规则）`,
    byKey.adjacent.marginLeft === "0px",
    byKey.adjacent.marginLeft,
  )

  // focus-visible ring（CSSOM 规则断言：box-shadow 0 0 0 3px brand）
  const ring = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      const walk = (list) => {
        for (const rule of list) {
          if (rule.cssRules && rule.cssRules.length && rule.selectorText === undefined) {
            const r = walk(rule.cssRules)
            if (r) return r
            continue
          }
          if (!rule.selectorText || !rule.style) continue
          if (
            rule.selectorText === ".el-button:focus-visible" &&
            rule.style.boxShadow.includes("var(--kb-brand)")
          ) {
            return rule.style.boxShadow
          }
        }
        return null
      }
      const r = walk(rules)
      if (r) return r
    }
    return null
  })
  check(
    `${prefix} A focus-visible ring（box-shadow brand 3px 外环 + 1px offset 白环）`,
    Boolean(ring) && ring.includes("var(--kb-brand)") && ring.includes("0 0 0 1px"),
    ring ?? "missing",
  )
}

/** B/C 组：真实调用点 */
const checkRealSites = async (page, prefix, kb, doc, mode) => {
  // B2. trash：工具栏按钮 rounded 8px + ConfirmDialog footer（h-8/px-4/行高 inherit 20.8px）
  await page.goto(new URL("/knowledge/trash", "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.waitForTimeout(1500)
  const trash = await page.evaluate(() => {
    const btns = [...document.querySelectorAll(".el-button")]
    const refresh = btns.find((b) => b.textContent.includes("刷新"))
    const out = {}
    if (refresh) {
      const cs = getComputedStyle(refresh)
      out.refresh = {
        radius: cs.borderRadius,
        h: refresh.getBoundingClientRect().height,
        pad: cs.padding,
        lh: cs.lineHeight,
      }
    }
    return out
  })
  check(
    `${prefix} B trash 工具栏圆角 8px（壳 rounded-lg 顺序胜出真值）`,
    trash.refresh && trash.refresh.radius === "8px",
    JSON.stringify(trash.refresh),
  )
  check(
    `${prefix} B trash 工具栏按钮 h-8 + px-3 + 行高 20px（壳 sm text-sm 真值）`,
    trash.refresh &&
      trash.refresh.h === 32 &&
      trash.refresh.pad === "0px 12px" &&
      trash.refresh.lh === "20px",
    JSON.stringify(trash.refresh),
  )

  // ConfirmDialog（trash 行删除 → 危险确认弹层）
  await page.locator('[title="彻底删除"]').first().click()
  const confirm = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll(".el-dialog")].find(
      (d) => d.getBoundingClientRect().height > 0 && d.textContent.includes("确认"),
    )
    if (!dlg) return null
    const btns = [...dlg.querySelectorAll(".el-button")].filter(
      (b) => b.textContent.includes("删除") || b.textContent.includes("取消"),
    )
    const cancel = btns.find((b) => b.textContent.includes("取消"))
    const ok = btns.find((b) => b.textContent.includes("删除"))
    const cs = getComputedStyle(ok)
    return {
      okType: ok.className.includes("el-button--danger"),
      okH: ok.getBoundingClientRect().height,
      okPad: cs.padding,
      okLh: cs.lineHeight,
      okRadius: cs.borderRadius,
      cancelPlain: cancel.className.includes("is-plain"),
      cancelH: cancel.getBoundingClientRect().height,
    }
  })
  check(
    `${prefix} B ConfirmDialog footer（danger solid + plain 取消 + h-8/px-4/20.8 行高/8px 圆角）`,
    confirm &&
      confirm.okType &&
      confirm.okH === 32 &&
      confirm.okPad === "0px 16px" &&
      confirm.okLh === "20.8px" &&
      confirm.okRadius === "8px" &&
      confirm.cancelPlain &&
      confirm.cancelH === 32,
    JSON.stringify(confirm),
  )
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)

  // B3. 概要页 KbDialogHeader 关闭钮几何 + QuickActions soft 文字色（信息面板）
  await page
    .goto(new URL(`/knowledge/${kb.id}/doc/x`, "http://127.0.0.1:4173").toString(), {
      waitUntil: "domcontentloaded",
    })
    .catch(() => {})
  await page.goto(new URL(`/knowledge/${kb.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.getByRole("button", { name: "新建内容", exact: true }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  const menu = page.locator('[title="新建内容"]').locator("xpath=following-sibling::div")
  await page.getByRole("button", { name: "新建内容", exact: true }).click()
  await menu.getByRole("button", { name: "新建文档", exact: true }).click()
  await page
    .locator(".el-dialog")
    .filter({ hasText: "新建文档" })
    .waitFor({ state: "visible", timeout: 15000 })
  await page.waitForTimeout(500)
  const closeBtn = await page.evaluate(() => {
    const header = [...document.querySelectorAll(".el-dialog")]
      .find((d) => d.getBoundingClientRect().height > 0)
      ?.querySelector(".el-dialog__header")
    const btn = header?.querySelector(".el-button")
    if (!btn) return null
    const cs = getComputedStyle(btn)
    const svg = btn.querySelector("svg")
    return {
      w: btn.getBoundingClientRect().width,
      h: btn.getBoundingClientRect().height,
      radius: cs.borderRadius,
      svgW: svg ? svg.getBoundingClientRect().width : 0,
      plain: btn.className.includes("is-plain"),
    }
  })
  check(
    `${prefix} B KbDialogHeader 关闭钮（h-10 w-10/12px 圆角/plain + 图标 16.8px）`,
    closeBtn &&
      closeBtn.w === 40 &&
      closeBtn.h === 40 &&
      closeBtn.radius === "12px" &&
      Math.abs(closeBtn.svgW - 16.8) < 0.5 &&
      closeBtn.plain,
    JSON.stringify(closeBtn),
  )
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)

  // B4. 激活 + 未 hover 态保真（评审 Important 收口）：打开讨论面板后把指针移开，
  //     激活钮 caller bg-brand-faint（twMerge 去重 caller 胜出）必须可见（绿底
  //     brand-ultra-light），而非被 hover:bg-muted 掩盖的 250；方钮圆角 = caller
  //     kb-sm 6px（壳 square 分支无 rounded 类，无顺序冲突）
  await page.goto(
    new URL(`/knowledge/${kb.id}/doc/${doc.id}`, "http://127.0.0.1:4173").toString(),
    {
      waitUntil: "domcontentloaded",
    },
  )
  await page.locator('[title="讨论"]').waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  await page.locator('[title="讨论"]').click()
  await page.waitForTimeout(1200)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  const activeUnhovered = await page.evaluate(() => {
    const btn = document.querySelector('button[title="讨论"]')
    if (!btn) return null
    const cs = getComputedStyle(btn)
    return { bg: cs.backgroundColor, radius: cs.borderRadius, cls: btn.className.slice(0, 160) }
  })
  const expectedActiveBg = mode === "light" ? "rgb(236, 250, 244)" : "rgb(16, 33, 26)"
  check(
    `${prefix} B 激活钮未 hover 态 bg = brand-faint（caller 胜出可见绿底）+ 圆角 kb-sm 6px`,
    Boolean(activeUnhovered) &&
      activeUnhovered.bg === expectedActiveBg &&
      activeUnhovered.radius === "6px",
    JSON.stringify({ ...activeUnhovered, expectedActiveBg, mode }),
  )
  await page.keyboard.press("Escape")
  await page.waitForTimeout(500)

  // C1. CreateKb 确定钮 disabled 语义（空名禁用 + 原生 disabled attribute）
  await page.goto(new URL("/knowledge/start", "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.getByText("新建知识库", { exact: true }).first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)
  await page.getByText("新建知识库", { exact: true }).first().click()
  await page
    .locator(".el-dialog")
    .filter({ hasText: "新建知识库" })
    .waitFor({ state: "visible", timeout: 15000 })
  const createKb = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll(".el-dialog")].find(
      (d) => d.getBoundingClientRect().height > 0 && d.textContent.includes("新建知识库"),
    )
    const btns = [...dlg.querySelectorAll(".el-button")]
    const ok = btns.find((b) => b.textContent.includes("创建") || b.textContent.includes("确定"))
    const cancel = btns.find((b) => b.textContent.includes("取消"))
    return {
      okDisabled: ok ? ok.disabled : null,
      okAria: ok ? ok.getAttribute("aria-disabled") : null,
      okType: ok ? ok.className.includes("el-button--primary") : null,
      cancelPlain: cancel ? cancel.className.includes("is-plain") : null,
    }
  })
  check(
    `${prefix} C CreateKb 确定钮 disabled 语义（空名原生禁用 + aria-disabled + primary）`,
    createKb &&
      createKb.okDisabled === true &&
      createKb.okAria === "true" &&
      createKb.okType &&
      createKb.cancelPlain,
    JSON.stringify(createKb),
  )
  // 输入名称后启用 + 点击提交链路（走真实 API → 关闭）
  await page
    .locator(".el-dialog input[data-autofocus], .el-dialog input")
    .first()
    .fill("T10 验证知识库")
  await page.waitForTimeout(300)
  const enabled = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll(".el-dialog")].find(
      (d) => d.getBoundingClientRect().height > 0 && d.textContent.includes("新建知识库"),
    )
    const ok = [...dlg.querySelectorAll(".el-button")].find(
      (b) => b.textContent.includes("创建") || b.textContent.includes("确定"),
    )
    return ok.disabled
  })
  check(
    `${prefix} C CreateKb 输入后确定钮启用（v-model 驱动）`,
    enabled === false,
    `disabled=${enabled}`,
  )
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)

  // C2. 覆盖契约注入探针：utilities（px-4 py-2 / px-3 py-0）压过 components 兜底
  //    （真实 loading 流程由三冒烟覆盖；is-loading 蒙版与自绘 spinner 由 A 组
  //    loadingMask 探针 + 静态哨兵覆盖）
  const overrides = await page.evaluate(() => {
    const mk = (cls) => {
      const b = document.createElement("button")
      b.className = cls
      b.textContent = "探针"
      document.body.appendChild(b)
      const cs = getComputedStyle(b)
      const out = { pad: cs.padding, radius: cs.borderRadius, fw: cs.fontWeight, type: b.className }
      b.remove()
      return out
    }
    return {
      mdCallerOverride: mk("el-button el-button--primary px-4 py-2"),
      smH8: mk("el-button is-plain h-8 px-4 py-0 text-[13px] [line-height:inherit]"),
      ghost: mk("el-button is-text"),
    }
  })
  check(
    `${prefix} C utilities 覆盖契约（px-4 py-2 → 8px 16px；px-4 py-0 → 0 16px；ghost 透明）`,
    overrides.mdCallerOverride.pad === "8px 16px" &&
      overrides.smH8.pad === "0px 16px" &&
      overrides.ghost.pad === "10px 16px",
    JSON.stringify(overrides),
  )
  check(
    `${prefix} C ghost（is-text）bg 透明（components 基准）`,
    overrides.ghost.type.includes("is-text"),
    JSON.stringify(overrides.ghost),
  )
}

const capturePass = async (mode) => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T10:${mode}]`
  await context.addInitScript(
    (scheme) => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light",
  )
  try {
    checkStaticSentinels()
    await page.goto(new URL("/auth/login", "http://127.0.0.1:4173").toString(), {
      waitUntil: "domcontentloaded",
    })
    await page.waitForTimeout(800)
    await checkCssBundleSentinels(page, prefix)

    // B1. 登录页（未登录态）：native-type=submit + block w-full + lg 尺寸
    await page.getByText("登录并进入", { exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(400)
    const login = await page.evaluate(() => {
      const btn =
        document.querySelector('button[type="submit"]') ??
        [...document.querySelectorAll("button")].find((b) => b.getAttribute("type") === "submit")
      if (!btn) return null
      const cs = getComputedStyle(btn)
      const r = btn.getBoundingClientRect()
      const form = btn.closest("form")
      return {
        inForm: Boolean(form),
        nativeType: btn.getAttribute("type") ?? btn.type,
        w: r.width,
        formW: form ? form.getBoundingClientRect().width : 0,
        h: r.height,
        fs: cs.fontSize,
      }
    })
    check(
      `${prefix} B 登录钮 native-type=submit 且在 form 内`,
      Boolean(login) && login.nativeType === "submit" && login.inForm,
      JSON.stringify(login),
    )
    check(
      `${prefix} B 登录钮 block w-full（宽度=表单宽）+ lg 字号 16px`,
      Boolean(login) && Math.abs(login.w - login.formW) < 4 && login.fs === "16px",
      `w=${login?.w} formW=${login?.formW} fs=${login?.fs}`,
    )

    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T10 按钮库")
    const doc = await ensureDocument(kb.id, token, {
      title: "T10 直用改造文档",
      content: "# T10 直用改造文档\n\n用于解散 AppButton 的行为断言。\n",
    })

    // A 组：矩阵注入在任意页（登录后）
    await checkMatrix(page, prefix, mode)
    // B/C 组：真实调用点
    await checkRealSites(page, prefix, kb, doc, mode)

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证失败：`, error)
    await page.screenshot({ path: `/tmp/verify-t10-error-${mode}.png` }).catch(() => {})
    await browser.close().catch(() => {})
    return false
  }
}

const light = await capturePass("light")
const dark = await capturePass("dark")
const failed = results.filter((r) => !r.ok)
console.log(`\n===== T10 验证：${results.length - failed.length}/${results.length} 通过 =====`)
if (failed.length) {
  console.log("失败项：")
  for (const f of failed) console.log(`  ❌ ${f.name} — ${f.detail}`)
}
/**
 * 断言数下限（ratchet，取 2026-09-19 实测值留余量——部分脚本的 check 数会随数据态分支浮动）。脚本中途抛异常会让后续 check 静默不执行，
 * 汇总却只写「N/N 通过」——低于本下限即判为本轮盲跑，按失败退出。
 */
const MIN_CHECKS = 120
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`,
  )
}
if (!light || !dark || failed.length > 0 || results.length < MIN_CHECKS) {
  reportBundleClues()
  process.exit(1)
}

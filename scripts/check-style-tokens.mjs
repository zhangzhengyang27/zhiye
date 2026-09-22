/**
 * 样式 token 守卫：把「只有运行时才看得出」的样式缺陷变成 `pnpm lint` 期的错误。
 *
 * 六项检查（都是踩过的真实坑，不是泛化 lint）：
 * 1. 未定义的 CSS 变量引用——`var(--kb-muted, #f5f5f5)` 这类拼错的变量名会静默
 *    退到兜底字面量，暗色下整块配色不跟着换档，构建期零报错。
 * 2. 不存在的主题色工具类——`text-ink-primary` 在 `@theme` 里没有 `--color-ink-primary`，
 *    Tailwind 根本不产出该类，元素拿到的是继承色。
 * 3. `rounded-kb-*` / `text-kb-*` / `leading-kb-*` 反查 `@theme` 是否声明了对应的
 *    `--radius/--text/--leading-kb-*`，漏声明会让用了该类的整批元素直接丢样式
 *    （实测过一次：3xl 键丢失而构建零报错）。
 * 4. 圆角只许走 kb 阶梯——Tailwind 自带 `--radius-*` 与 `--kb-radius-*` 是两套平行
 *    刻度且名字错位（rounded-lg=8px 而 rounded-kb-lg=10px），批 14 已全量吸附。
 * 5. 阴影只许走 --kb-*-shadow / --kb-glow-brand-* 档——`shadow-[0_12px_24px_rgba(…)]`
 *    这类一次性几何+色值批 19 已收编 14 处；带 rgba/hex 的字面量在暗色下不换档，
 *    其中把亮色 brand #00b96b 写死的 7 处连主题色都跟不上。
 * 6. z 契约——组件里不得再写 `z-[数字]` 字面量（CLAUDE.md「新弹层 z 走 var(--kb-z-*)」），
 *    且 constants/z-index.ts 与 tokens.css 的 --kb-z-* 两侧值必须一一对应。
 *
 * 用法：`pnpm lint:style`（已并入 `pnpm lint`）。
 */
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(scriptDir, "../src/renderer/src")
const zIndexFile = path.join(srcDir, "constants/z-index.ts")
const tokensFile = path.join(srcDir, "assets/styles/tokens.css")
const styleFile = path.join(srcDir, "style.css")

const SCAN_EXTENSIONS = new Set([".vue", ".ts", ".css"])

/** 外部系统定义的变量前缀：EP 与 Lake 编辑器的运行时变量不在本仓声明，不参与「未定义」判定。 */
const EXTERNAL_VAR_PREFIXES = ["--el-", "--lakex-", "--ant-"]

/** 本仓自己拥有的颜色族工具类；只查这些族，避免误伤 slate/sky 等 Tailwind 原生色。 */
const COLOR_FAMILIES = [
  "ink",
  "grey",
  "brand",
  "primary",
  "surface",
  "line",
  "muted",
  "neutral",
  "success",
  "warning",
  "error",
  "info",
  "file",
]

/** TS 常量名 → tokens.css 里的 CSS 档位名；null 表示该档只住 TS（EP 计数器起点）。 */
const Z_TIER_MAP = {
  Z_SIDE_PANEL: "--kb-z-side-panel",
  Z_SIDE_PANEL_OVERLAY: "--kb-z-side-panel-overlay",
  Z_DROPDOWN: "--kb-z-dropdown",
  Z_DROPDOWN_BACKDROP: "--kb-z-dropdown-backdrop",
  Z_EP_PROVIDER_BASE: null,
  Z_DIALOG: "--kb-z-modal",
  Z_POPPER: "--kb-z-popper",
  Z_TOAST: "--kb-z-toast",
}

/** 只在 CSS 侧存在、无 TS 对应常量的档位（值即基线渲染结果，组件直接 var() 消费）。 */
const Z_CSS_ONLY_TIERS = new Set(["--kb-z-overlay", "--kb-z-sticky"])

const collectFiles = async dir => {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? collectFiles(full) : Promise.resolve([full])
    })
  )
  return nested.flat().filter(file => SCAN_EXTENSIONS.has(path.extname(file)))
}

const rel = file => path.relative(path.resolve(scriptDir, ".."), file)

/** 行号供报错定位：按偏移量回算 1-based 行。 */
const lineAt = (text, index) => text.slice(0, index).split("\n").length

/** 注释里的举例不是用量：等长挖空成空白，行号与 match.index 保持对源文件可用
 *  （圆角/阴影两项守卫早就这么做，变量与主题类两项曾经漏——注释里写一句
 *  `var(--yq-yuque-grey-100)` 就会被当成未定义引用）。除块注释与行注释外，
 *  .vue 模板的 HTML 注释同样挖空（注释里举例 z-[999] 曾让 z 契约守卫假红灯）。 */
const blankComments = text =>
  text
    .replace(/<!--[\s\S]*?-->/g, block => block.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*(\/\/|\*).*$/gm, line => " ".repeat(line.length))

const definedVarNames = sources => {
  const names = new Set()
  for (const { text } of sources) {
    for (const match of blankComments(text).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) names.add(match[1])
  }
  return names
}

const checkVarReferences = sources => {
  const defined = definedVarNames(sources)
  const problems = []
  for (const { file, text } of sources) {
    const code = blankComments(text)
    /** 两种消费写法：var(--x) 与 Tailwind 4 的括号简写 max-w-(--x) */
    for (const match of code.matchAll(/var\((--[a-zA-Z0-9-]+)|\((--[a-zA-Z0-9-]+)\)/g)) {
      const name = match[1] || match[2]
      /** 注释里的泛指写法（如 var(--kb-z-*)）不参与判定 */
      if (name.endsWith("-")) continue
      if (defined.has(name) || EXTERNAL_VAR_PREFIXES.some(prefix => name.startsWith(prefix))) continue
      problems.push(`${rel(file)}:${lineAt(text, match.index)} 引用了未定义的变量 ${name}`)
    }
  }
  return problems
}

const themeColorKeys = styleText => {
  const keys = new Set()
  for (const block of styleText.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const match of block[1].matchAll(/--color-([a-zA-Z0-9-]+)\s*:/g)) keys.add(match[1])
  }
  return keys
}

const checkThemeClasses = (sources, keys) => {
  if (!keys.size) return ["style.css 中未解析到 @theme 的 --color-* 定义，主题类检查失效"]
  const utilities = "(?:text|bg|border|ring|fill|stroke|from|via|to|decoration|shadow|outline|accent|caret|divide)"
  const family = COLOR_FAMILIES.join("|")
  /** 候选必须取到词尾（不允许回溯），且尾随 = 说明命中的是 SVG 属性名（stroke-linecap） */
  const pattern = new RegExp(String.raw`(?:[a-z-]+:)*${utilities}-((?:${family})[a-z0-9-]*)(?![a-z0-9-=])`, "g")
  const problems = []
  for (const { file, text } of sources) {
    if (path.extname(file) === ".css") continue
    for (const match of blankComments(text).matchAll(pattern)) {
      const candidate = match[1]
      if (keys.has(candidate)) continue
      problems.push(`${rel(file)}:${lineAt(text, match.index)} 使用了不存在的主题色类片段「${candidate}」`)
    }
  }
  return [...new Set(problems)]
}

/** `-kb-` 系列工具类与 @theme 命名空间的对应关系（本仓自己的结构层） */
const KB_UTILITY_NAMESPACES = { rounded: "radius", text: "text", leading: "leading" }

const checkKbUtilityClasses = (sources, styleText) => {
  const declared = new Set()
  for (const block of styleText.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const match of block[1].matchAll(/--([a-z]+)-(kb-[a-z0-9]+)\s*:/g)) declared.add(`${match[1]}|${match[2]}`)
  }
  const utilities = Object.keys(KB_UTILITY_NAMESPACES).join("|")
  const pattern = new RegExp(String.raw`(?:[a-z-]+:)*(${utilities})-(kb-[a-z0-9]+)(?![a-z0-9-=])`, "g")
  const problems = []
  for (const { file, text } of sources) {
    if (path.extname(file) === ".css") continue
    for (const match of blankComments(text).matchAll(pattern)) {
      const utility = match[1]
      const suffix = match[2]
      const namespace = KB_UTILITY_NAMESPACES[utility]
      if (declared.has(`${namespace}|${suffix}`)) continue
      problems.push(
        `${rel(file)}:${lineAt(text, match.index)} 使用了 ${utility}-${suffix.replace("kb-", "")}，但 @theme 缺少 --${namespace}-${suffix}`
      )
    }
  }
  return [...new Set(problems)]
}

/** Tailwind 自带的 --radius-* 与 --kb-radius-* 是两套平行刻度，而且**名字错位**
 *  （rounded-lg = 8px 而 rounded-kb-lg = 10px），靠记忆换算必翻车。样式排查批 14
 *  已把全量源码吸附到 kb 阶梯（按值映射，见下表），此守卫防回潮。
 *  rounded-full / rounded-none 是形状不是刻度，放行。 */
const RADIUS_TO_KB = {
  xs: "rounded-kb-xs（同为 4px）",
  sm: "rounded-kb-sm（Tailwind 0.25rem=4px → kb sm 6px，按实际取 -xs）",
  md: "rounded-kb-sm（同为 6px）",
  lg: "rounded-kb-md（同为 8px）",
  xl: "rounded-kb-xl（同为 12px）",
  "2xl": "rounded-kb-2xl（同为 16px）",
  "3xl": "rounded-kb-3xl（24→20px）",
  "4xl": "rounded-kb-3xl（需记档）",
}

const checkRadiusScale = sources => {
  const problems = []
  for (const { file, text } of sources) {
    if (path.extname(file) === ".css") continue
    // 注释里的举例不是用量。挖空而不是删除：保留原长度与换行，match.index 才是
    // 源文件里的真实行号（同理把行首注释符整行挖成等长空白）
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, " "))
      .replace(/^[ \t]*(\/\/|\*).*$/gm, line => " ".repeat(line.length))
    for (const match of code.matchAll(/(?:[a-z-]+:)*rounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)(?![a-z0-9-])/g)) {
      problems.push(
        `${rel(file)}:${lineAt(text, match.index)} 用了 Tailwind 自带圆角「${match[0]}」，改贴 kb 阶梯：${RADIUS_TO_KB[match[1]]}`
      )
    }
  }
  return [...new Set(problems)]
}

/** 阴影只许走 --kb-*-shadow / --kb-glow-brand-* 档。批 19 之前组件里长期并存 14 处
 *  「手写几何 + rgba」的一次性阴影，其中 7 处把亮色 brand #00b96b 直接钉进了暗色主题
 *  （--kb-brand 暗档是 #2ed790，光晕不跟档）。口径：任意值里不得出现 rgba()/hex 色值。 */
const checkShadowScale = sources => {
  const problems = []
  for (const { file, text } of sources) {
    if (path.extname(file) !== ".vue") continue
    const code = text.replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, " "))
    for (const match of code.matchAll(/(?:[a-z-]+:)*shadow-\[[^\]]*(rgba\(|#[0-9a-fA-F]{3,8}\b)[^\]]*\]/g)) {
      problems.push(
        `${rel(file)}:${lineAt(text, match.index)} 写了散落阴影「${match[0]}」，改贴阶梯：${SHADOW_TIERS_HINT}`
      )
    }
  }
  return [...new Set(problems)]
}

const SHADOW_TIERS_HINT =
  "中性 elevation 用 --kb-card/hover/elevated/surface/float/panel/modal-shadow，品牌光晕用 --kb-glow-brand-faint/-cta/-cta-hover"

const parseZConstants = async () => {
  const text = await readFile(zIndexFile, "utf8")

  const tiers = new Map()
  for (const match of text.matchAll(/export const (Z_[A-Z_]+) = (\d+)/g)) tiers.set(match[1], Number(match[2]))
  return tiers
}

const parseZTokens = async () => {
  const text = await readFile(tokensFile, "utf8")
  const tiers = new Map()
  for (const match of text.matchAll(/(--kb-z-[a-z-]+)\s*:\s*(\d+)\s*;/g)) tiers.set(match[1], Number(match[2]))
  return tiers
}

const checkZContract = async sources => {
  const problems = []
  for (const { file, text } of sources) {
    for (const match of blankComments(text).matchAll(/z-\[\d+\]/g)) {
      problems.push(`${rel(file)}:${lineAt(text, match.index)} 写了散落 z 字面量「${match[0]}」，改走 var(--kb-z-*)`)
    }
  }
  const [constants, tokens] = await Promise.all([parseZConstants(), parseZTokens()])
  for (const [name, value] of constants) {
    const cssName = Z_TIER_MAP[name]
    if (cssName === undefined) {
      problems.push(`z-index.ts 新增档位 ${name}，请先在 Z_TIER_MAP 登记与 tokens.css 的对应关系`)
      continue
    }
    if (cssName === null) continue
    if (!tokens.has(cssName)) problems.push(`z-index.ts 的 ${name} 在 tokens.css 缺少 ${cssName}`)
    else if (tokens.get(cssName) !== value)
      problems.push(`z 契约两侧不同步：${name}=${value} 但 ${cssName}=${tokens.get(cssName)}`)
  }
  for (const cssName of tokens.keys()) {
    if (Object.values(Z_TIER_MAP).includes(cssName) || Z_CSS_ONLY_TIERS.has(cssName)) continue
    problems.push(`tokens.css 新增 ${cssName}，未在 Z_TIER_MAP 登记 TS 侧对应档位`)
  }
  return problems
}

const main = async () => {
  const files = await collectFiles(srcDir)
  const sources = await Promise.all(files.map(async file => ({ file, text: await readFile(file, "utf8") })))
  const styleText = await readFile(styleFile, "utf8")
  const themeKeys = themeColorKeys(styleText)

  const varProblems = checkVarReferences(sources)
  const classProblems = checkThemeClasses(sources, themeKeys)
  const kbClassProblems = checkKbUtilityClasses(sources, styleText)
  const radiusProblems = checkRadiusScale(sources)
  const shadowProblems = checkShadowScale(sources)
  const zProblems = await checkZContract(sources)

  const literals = sources.reduce(
    (sum, { text }) => sum + (text.match(/(?:rounded|text|shadow|gap|w|h)-\[[^\]]+\]/g) || []).length,
    0
  )

  for (const [label, problems] of [
    ["未定义的 CSS 变量引用", varProblems],
    ["不存在的主题色类", classProblems],
    ["@theme 未注册的结构层工具类", kbClassProblems],
    ["Tailwind 自带圆角刻度（应贴 kb 阶梯）", radiusProblems],
    ["散落阴影字面量（应贴 --kb-*-shadow 档）", shadowProblems],
    ["z 契约违规或两侧不同步", zProblems],
  ]) {
    if (!problems.length) continue
    console.error(`\n✗ ${label}（${problems.length}）`)
    problems.forEach(problem => console.error(`  ${problem}`))
  }

  console.log(`\n参考用量：@theme 颜色 token ${themeKeys.size} 个，任意值字面量 ${literals} 处（不参与判定）`)

  const failed =
    varProblems.length ||
    classProblems.length ||
    kbClassProblems.length ||
    radiusProblems.length ||
    shadowProblems.length ||
    zProblems.length
  if (failed) {
    console.error("\n样式 token 守卫未通过。")
    process.exit(1)
  }
  console.log("✓ 样式 token 守卫通过")
}

await main()

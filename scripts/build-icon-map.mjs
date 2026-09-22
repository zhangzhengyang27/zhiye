/**
 * 图标映射生成器：扫描 src/renderer/src 源码里实际用到的图标名，
 * 生成 `icon-map.generated.ts`——把 `ph:*` 映射到 @phosphor-icons/vue、
 * `i-lucide-*` 映射到 lucide-vue-next 的本地组件。
 *
 * 取代原 build-offline-icons.mjs（Iconify 运行时/离线 JSON 方案）：
 * 图标全部编译期内联，无任何网络请求，随包 tree-shaking。
 * 新增图标后重新执行 `pnpm icons`（dev / build 脚本已自动前置该步骤）。
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rendererSrc = path.resolve(scriptDir, "../src/renderer/src")
const outputFile = path.join(rendererSrc, "components/common/icon-map.generated.ts")

const SCAN_EXTENSIONS = new Set([".vue", ".ts", ".tsx"])

/** 手工别名：源码里用到、但两个包命名差异需要中转的图标。 */
const PHOSPHOR_ALIASES = {}

const collectFiles = async dir => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return entry.name === "node_modules" ? [] : collectFiles(full)
      }
      return SCAN_EXTENSIONS.has(path.extname(entry.name)) ? [full] : []
    })
  )
  return files.flat()
}

const toPascalCase = name =>
  name
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")

const main = async () => {
  const files = (await collectFiles(rendererSrc)).filter(file => file !== outputFile)
  const phosphor = new Set()
  const lucide = new Set()

  for (const file of files) {
    const content = await readFile(file, "utf8")
    for (const match of content.matchAll(/\bph:([a-z0-9-]+)/g)) {
      phosphor.add(match[1])
    }
    for (const match of content.matchAll(/\bi-lucide-([a-z0-9-]+)/g)) {
      lucide.add(match[1])
    }
  }

  // Iconify 的 ph 命名把字重并进图标名（如 book-fill / dots-three-bold），
  // 官方包则按子入口分层：@phosphor-icons/vue（regular）、/fill、/bold 等。
  const PHOSPHOR_WEIGHTS = ["fill", "bold", "duotone", "light", "thin"]
  const splitPhosphorWeight = name => {
    for (const weight of PHOSPHOR_WEIGHTS) {
      if (name.endsWith(`-${weight}`)) {
        return { base: name.slice(0, -(weight.length + 1)), weight }
      }
    }
    return { base: name, weight: "regular" }
  }

  const lines = [
    // 不再写 /* eslint-disable */：生成物本身 lint 干净（映射与导入一一对应、
    // prettier 兼容），整档 disable 会被 ESLint 报「Unused eslint-disable
    // directive」存量警告；若未来生成内容触发规则，请修生成器输出而非恢复禁令。
    "// 由 scripts/build-icon-map.mjs 自动生成，请勿手工编辑。",
    'import type { Component } from "vue"',
  ]

  const entries = []
  const phosphorImportsByModule = new Map()

  for (const name of [...phosphor].sort()) {
    const mapped = PHOSPHOR_ALIASES[name] ?? name
    const { base, weight } = splitPhosphorWeight(mapped)
    const component = `Ph${toPascalCase(base)}`
    if (!phosphorImportsByModule.has("@phosphor-icons/vue")) {
      phosphorImportsByModule.set("@phosphor-icons/vue", new Set())
    }
    phosphorImportsByModule.get("@phosphor-icons/vue").add(component)
    entries.push([`ph:${name}`, component, weight === "regular" ? null : weight])
  }

  for (const [module, components] of [...phosphorImportsByModule.entries()].sort()) {
    for (const component of [...components].sort()) {
      lines.push(`import { ${component} } from "${module}"`)
    }
  }
  lines.push("")

  for (const name of [...lucide].sort()) {
    const component = toPascalCase(name)
    lines.push(`import { ${component} } from "lucide-vue-next"`)
    entries.push([`i-lucide-${name}`, component])
  }

  lines.push("")
  lines.push("/** 源码中出现的图标名 -> 本地图标组件（attrs 为渲染时附加的默认属性）。 */")
  lines.push("export interface IconMapEntry {")
  lines.push("  component: Component")
  lines.push("  attrs?: Record<string, unknown>")
  lines.push("}")
  lines.push("")
  lines.push("export const iconMap: Record<string, IconMapEntry> = {")
  for (const [key, component, weight] of entries) {
    if (weight) {
      lines.push(`  "${key}": { component: ${component}, attrs: { weight: "${weight}" } },`)
    } else {
      lines.push(`  "${key}": { component: ${component} },`)
    }
  }
  lines.push("}")
  lines.push("")

  await writeFile(outputFile, lines.join("\n"))
  console.log(
    `[icons] 生成 ${entries.length} 个图标映射（phosphor ${phosphor.size} / lucide ${lucide.size}）-> ${path.relative(scriptDir, outputFile)}`
  )
}

main()

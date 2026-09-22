// 从语雀解包产物中提取明暗两套 --yq-* token，导出为 JSON 供移植参考。
// 用法: node scripts/extract-yuque-tokens.mjs [theme.css 路径]
import fs from "node:fs"
import path from "node:path"

const cssPath = process.argv[2] ?? "../yuque-source/build/renderer/app.theme.css"
const css = fs.readFileSync(path.resolve(cssPath), "utf8")

// 语雀把色板(:root)与暗色(html[data-kumuhana=pouli])各拆成多个块，必须合并全部匹配
const light = {}
const dark = {}
for (const m of css.matchAll(/:root\{([^}]+)\}/g))
  for (const d of m[1].matchAll(/(--yq-[a-z0-9-]+):([^;}]+)/g)) light[d[1]] = d[2]
for (const m of css.matchAll(/html\[data-kumuhana=pouli\]\{([^}]+)\}/g))
  for (const d of m[1].matchAll(/(--yq-[a-z0-9-]+):([^;}]+)/g)) dark[d[1]] = d[2]

const out = { source: cssPath, extractedAt: new Date().toISOString(), light: {}, dark: {} }
for (const [k, v] of Object.entries(light)) out.light[k.slice(5)] = v
for (const [k, v] of Object.entries(dark)) out.dark[k.slice(5)] = v

fs.mkdirSync("docs", { recursive: true })
fs.writeFileSync("docs/yuque-tokens.json", JSON.stringify(out, null, 2))
console.log(
  `light: ${Object.keys(light).length} tokens, dark: ${Object.keys(dark).length} tokens -> docs/yuque-tokens.json`
)

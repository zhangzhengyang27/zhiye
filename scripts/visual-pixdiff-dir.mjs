/**
 * 目录级像素对比（每批验收惯例的一键入口）：对 before/after 两个目录下的同名 PNG
 * 逐对调用 visual-pixdiff.mjs 做「精确 + 容差」双口径对比，汇总退出码。
 *
 * 用法（配合 visual:capture 的 --out）：
 *   批次开始  pnpm visual:capture -- --out output/visual/<批次>/before
 *   改完重跑  pnpm build:web && pnpm preview:web --port 4173 --host 127.0.0.1
 *             pnpm visual:capture -- --out output/visual/<批次>/after
 *   一键对比  pnpm visual:diff output/visual/<批次>/before output/visual/<批次>/after
 *
 * - 只配对两个目录都存在的同名 .png；单侧缺失会列出并按失败退出；
 * - 报告默认写到 <afterDir>/pixdiff-report.json，--out 可改；
 * - 退出码：任何一屏存在超容差像素（major）、单侧缺文件或发生错误时为 1。
 */
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

const parseArgs = (argv) => {
  const positional = []
  let tolerance = 8
  let out = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === "--tolerance") {
      tolerance = Number(value)
      if (!Number.isInteger(tolerance) || tolerance < 0)
        throw new Error("--tolerance 必须是非负整数")
      i += 1
    } else if (arg === "--out") {
      if (!value) throw new Error("--out 缺少输出路径")
      out = value
      i += 1
    } else if (arg.startsWith("--")) {
      throw new Error(`未知参数：${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length !== 2)
    throw new Error(
      "用法：visual-pixdiff-dir.mjs <beforeDir> <afterDir> [--tolerance N] [--out report.json]",
    )
  return { beforeDir: positional[0], afterDir: positional[1], tolerance, out }
}

const { beforeDir, afterDir, tolerance, out } = parseArgs(process.argv.slice(2))

for (const dir of [beforeDir, afterDir]) {
  if (!fs.existsSync(dir)) throw new Error(`目录不存在：${dir}`)
}

const listPngs = (dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()

const beforePngs = listPngs(beforeDir)
const afterPngs = listPngs(afterDir)
const onlyBefore = beforePngs.filter((name) => !afterPngs.includes(name))
const onlyAfter = afterPngs.filter((name) => !beforePngs.includes(name))
const pairs = beforePngs.filter((name) => afterPngs.includes(name))

if (pairs.length === 0) throw new Error("两个目录没有可配对的同名 PNG")
if (onlyBefore.length > 0 || onlyAfter.length > 0) {
  console.error(
    `⚠️ 单侧缺失文件：before 独有 ${JSON.stringify(onlyBefore)}；after 独有 ${JSON.stringify(onlyAfter)}`,
  )
}

const reportOut = out ?? path.join(afterDir, "pixdiff-report.json")
const args = ["scripts/visual-pixdiff.mjs"]
for (const name of pairs) {
  args.push("--baseline", path.join(beforeDir, name), "--current", path.join(afterDir, name))
}
args.push("--tolerance", String(tolerance), "--out", reportOut)

console.log(`对比 ${pairs.length} 对截图（tolerance=${tolerance}）→ ${reportOut}`)
const result = spawnSync(process.execPath, args, {
  cwd: path.resolve(scriptDir, ".."),
  stdio: "inherit",
})

if (onlyBefore.length > 0 || onlyAfter.length > 0) process.exit(1)
process.exit(result.status ?? 1)

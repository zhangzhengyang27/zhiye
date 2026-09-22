import { decodePng } from "./visual-pixdiff.mjs"

const [,, beforePath, afterPath, x0s, y0s, x1s, y1s] = process.argv
const before = decodePng(beforePath)
const after = decodePng(afterPath)
const { width, height, data: bd } = before
const ad = after.data
if (after.width !== width || after.height !== height) throw new Error("尺寸不一致")

const x0 = Number(x0s ?? 0), y0 = Number(y0s ?? 0)
const x1 = Number(x1s ?? width - 1), y1 = Number(y1s ?? height - 1)

const isMajor = (x, y) => {
  const i = (y * width + x) * 4
  return (
    Math.abs(bd[i] - ad[i]) > 8 ||
    Math.abs(bd[i + 1] - ad[i + 1]) > 8 ||
    Math.abs(bd[i + 2] - ad[i + 2]) > 8
  )
}

// 统计 bbox 内 major 像素
let major = 0
const rowHist = new Map(), colHist = new Map()
for (let y = y0; y <= y1; y++) {
  for (let x = x0; x <= x1; x++) {
    if (isMajor(x, y)) {
      major++
      rowHist.set(y, (rowHist.get(y) ?? 0) + 1)
      colHist.set(x, (colHist.get(x) ?? 0) + 1)
    }
  }
}
console.log(`bbox=(${x0},${y0})-(${x1},${y1}) major=${major}`)

// 行区间聚类（连续行聚合）
const rows = [...rowHist.keys()].sort((a, b) => a - b)
const bands = []
for (const y of rows) {
  const last = bands[bands.length - 1]
  if (last && y - last.y1 <= 3) { last.y1 = y; last.count += rowHist.get(y) }
  else bands.push({ y0: y, y1: y, count: rowHist.get(y) })
}
console.log("行带（y0-y1: major数）:", bands.map(b => `${b.y0}-${b.y1}: ${b.count}`).join(" | "))

// 列区间聚类
const cols = [...colHist.keys()].sort((a, b) => a - b)
const cbands = []
for (const x of cols) {
  const last = cbands[cbands.length - 1]
  if (last && x - last.x1 <= 3) { last.x1 = x; last.count += colHist.get(x) }
  else cbands.push({ x0: x, x1: x, count: colHist.get(x) })
}
console.log("列带（x0-x1: major数）:", cbands.map(b => `${b.x0}-${b.x1}: ${b.count}`).join(" | "))

// 采样：每个行带中心行,输出 8px 块粗图 + 若干像素对的 before/after 颜色
const hex = (d, x, y) => {
  const i = (y * width + x) * 4
  return `#${[d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`
}
for (const b of bands.slice(0, 6)) {
  const yc = Math.floor((b.y0 + b.y1) / 2)
  let line1 = "", line2 = ""
  const samples = []
  for (let x = x0; x <= x1; x += 4) {
    if (isMajor(x, yc)) {
      line1 += "█"
      if (samples.length < 4) samples.push({ x, y: yc })
    } else line1 += "·"
  }
  console.log(`y=${yc} [${b.y0}-${b.y1}] ${line1}`)
  for (const s of samples) {
    console.log(`   (${s.x},${s.y}) before=${hex(bd, s.x, s.y)} after=${hex(ad, s.x, s.y)}`)
  }
}

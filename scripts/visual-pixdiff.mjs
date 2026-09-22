/**
 * 视觉像素对比工具（EP 迁移通用）：对同名 PNG 做精确 + 容差双口径逐像素对比。
 *
 * 用法：
 *   node scripts/visual-pixdiff.mjs \
 *     --baseline output/visual/ep-migration/task-2.2/before/a.png \
 *     --current  output/visual/ep-migration/task-2.2/after/a.png \
 *     --baseline <pair2-baseline> --current <pair2-current> \
 *     --tolerance 8 --out output/task-2.2-pixdiff.json
 *
 * - baseline/current 可重复传多对，页名取 baseline 文件名（去 .png）；
 * - 容差口径：任一通道 Δ>tolerance 记为超容差（major），Δ≤tolerance 记 minor；
 * - 输出 JSON schema 与 Task 2.1/2.2 手工对比轮一致（tolerance/pages{精确数、双口径
 *   计数、meanDelta、bbox、clusters}），另有 sources 记录每对输入路径；
 * - 退出码：存在超容差像素或发生错误时为 1，否则 0。
 *
 * 实现：不依赖 Playwright——PNG 解码用 Node 内置 zlib（inflate）+ 自实现 defilter，
 * 支持 bit depth 8、color type 0/2/4/6、非交错（覆盖 Playwright/Chromium 截图全部
 * 输出格式），其余格式直接报错。pngjs 仅是 qrcode 的传递依赖（pnpm 隔离模式下
 * 不可 require），按「新增依赖需先确认」约定未引入。
 */
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CLUSTER_BLOCK = 16
const CLUSTER_TOP = 6

/** 解析 CLI 参数：--baseline/--current 成对可重复、--tolerance、--out。 */
export const parseArgs = (argv) => {
  const pairs = []
  let tolerance = 8
  let out = null
  let pendingBaseline = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = argv[i + 1]
    if (arg === "--baseline") {
      if (!value) throw new Error("--baseline 缺少文件路径")
      pendingBaseline = value
      i += 1
    } else if (arg === "--current") {
      if (!value) throw new Error("--current 缺少文件路径")
      if (!pendingBaseline) throw new Error("--current 前缺少配对的 --baseline")
      pairs.push({ baseline: pendingBaseline, current: value })
      pendingBaseline = null
      i += 1
    } else if (arg === "--tolerance") {
      tolerance = Number(value)
      if (!Number.isInteger(tolerance) || tolerance < 0)
        throw new Error("--tolerance 必须是非负整数")
      i += 1
    } else if (arg === "--out") {
      if (!value) throw new Error("--out 缺少输出路径")
      out = value
      i += 1
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }
  if (pendingBaseline) throw new Error("--baseline 缺少配对的 --current")
  if (pairs.length === 0) throw new Error("至少需要一对 --baseline/--current")
  return { pairs, tolerance, out }
}

const paethPredict = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/**
 * 解码 PNG 为 RGBA 像素（8-bit/非交错/color type 0|2|4|6）。
 * 返回 { width, height, data: Buffer(width*height*4) }。
 */
export const decodePng = (filePath) => {
  const file = fs.readFileSync(filePath)
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath}: 不是 PNG 文件（签名不符）`)
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idatParts = []
  let seenIhdr = false
  let seenIend = false

  let offset = 8
  while (offset < file.length) {
    if (offset + 8 > file.length) throw new Error(`${filePath}: chunk 头越界`)
    const length = file.readUInt32BE(offset)
    const type = file.subarray(offset + 4, offset + 8).toString("ascii")
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > file.length) throw new Error(`${filePath}: chunk 数据越界`)
    const data = file.subarray(dataStart, dataEnd)

    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      const compression = data[10]
      const filterMethod = data[11]
      interlace = data[12]
      if (compression !== 0 || filterMethod !== 0)
        throw new Error(`${filePath}: 不支持的压缩/滤波方法`)
      seenIhdr = true
    } else if (type === "IDAT") {
      idatParts.push(data)
    } else if (type === "IEND") {
      seenIend = true
      break
    }
    offset = dataEnd + 4
  }

  if (!seenIhdr || !seenIend) throw new Error(`${filePath}: IHDR/IEND 缺失`)
  if (width <= 0 || height <= 0) throw new Error(`${filePath}: 尺寸非法`)
  if (bitDepth !== 8) throw new Error(`${filePath}: 仅支持 bit depth 8（实际 ${bitDepth}）`)
  if (![0, 2, 4, 6].includes(colorType))
    throw new Error(`${filePath}: 仅支持 color type 0/2/4/6（实际 ${colorType}）`)
  if (interlace !== 0) throw new Error(`${filePath}: 不支持 Adam7 交错格式`)

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  const bytesPerRow = width * channels
  const raw = zlib.inflateSync(Buffer.concat(idatParts))
  if (raw.length !== (bytesPerRow + 1) * height) {
    throw new Error(
      `${filePath}: 解压后数据长度不符（期望 ${(bytesPerRow + 1) * height}，实际 ${raw.length}）`,
    )
  }

  // 逐行 defilter（PNG spec 滤波 0-4）
  const pixels = Buffer.alloc(width * height * 4)
  const current = Buffer.alloc(bytesPerRow)
  const previous = Buffer.alloc(bytesPerRow)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (bytesPerRow + 1)]
    const line = raw.subarray(y * (bytesPerRow + 1) + 1, (y + 1) * (bytesPerRow + 1))
    for (let x = 0; x < bytesPerRow; x += 1) {
      const a = x >= channels ? current[x - channels] : 0
      const b = previous[x]
      const c = x >= channels ? previous[x - channels] : 0
      let value = line[x]
      if (filter === 1) {
        value = (value + a) & 0xff
      } else if (filter === 2) {
        value = (value + b) & 0xff
      } else if (filter === 3) {
        value = (value + ((a + b) >> 1)) & 0xff
      } else if (filter === 4) {
        value = (value + paethPredict(a, b, c)) & 0xff
      } else if (filter !== 0) {
        throw new Error(`${filePath}: 未知滤波类型 ${filter}`)
      }
      current[x] = value
    }

    // 归一化为 RGBA
    for (let x = 0; x < width; x += 1) {
      const src = x * channels
      const dst = (y * width + x) * 4
      if (colorType === 0) {
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = current[src]
        pixels[dst + 3] = 255
      } else if (colorType === 2) {
        pixels[dst] = current[src]
        pixels[dst + 1] = current[src + 1]
        pixels[dst + 2] = current[src + 2]
        pixels[dst + 3] = 255
      } else if (colorType === 4) {
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = current[src]
        pixels[dst + 3] = current[src + 1]
      } else {
        pixels[dst] = current[src]
        pixels[dst + 1] = current[src + 1]
        pixels[dst + 2] = current[src + 2]
        pixels[dst + 3] = current[src + 3]
      }
    }
    current.copy(previous)
  }

  return { width, height, data: pixels }
}

/** 16px 粗粒度 diff 聚类（BFS 连通），返回按 block 数降序的前若干个。 */
export const clusterDiffs = (width, height, isMajorAt) => {
  const bw = Math.ceil(width / CLUSTER_BLOCK)
  const bh = Math.ceil(height / CLUSTER_BLOCK)
  const hot = new Uint8Array(bw * bh)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isMajorAt(x, y))
        hot[Math.floor(y / CLUSTER_BLOCK) * bw + Math.floor(x / CLUSTER_BLOCK)] = 1
    }
  }
  const clusters = []
  const seen = new Uint8Array(bw * bh)
  for (let start = 0; start < hot.length; start += 1) {
    if (!hot[start] || seen[start]) continue
    const queue = [start]
    seen[start] = 1
    let minX = start % bw
    let maxX = minX
    let minY = Math.floor(start / bw)
    let maxY = minY
    let blocks = 0
    while (queue.length > 0) {
      const cur = queue.pop()
      blocks += 1
      const cx = cur % bw
      const cy = Math.floor(cur / bw)
      minX = Math.min(minX, cx)
      maxX = Math.max(maxX, cx)
      minY = Math.min(minY, cy)
      maxY = Math.max(maxY, cy)
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ]
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue
        const ni = ny * bw + nx
        if (hot[ni] && !seen[ni]) {
          seen[ni] = 1
          queue.push(ni)
        }
      }
    }
    clusters.push({
      bboxPx: [
        minX * CLUSTER_BLOCK,
        minY * CLUSTER_BLOCK,
        (maxX + 1) * CLUSTER_BLOCK,
        (maxY + 1) * CLUSTER_BLOCK,
      ],
      blocks,
    })
  }
  clusters.sort((a, b) => b.blocks - a.blocks)
  return clusters.slice(0, CLUSTER_TOP)
}

/** 双口径对比一对 RGBA 像素，schema 与手工对比轮一致。 */
export const comparePair = (baseline, current, tolerance) => {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      sizeMismatch: {
        baseline: [baseline.width, baseline.height],
        current: [current.width, current.height],
      },
    }
  }

  const { width, height } = baseline
  const dataA = baseline.data
  const dataB = current.data
  let exactSame = 0
  let differingAny = 0
  let minorWithinTolerance = 0
  let majorBeyondTolerance = 0
  let deltaSumAny = 0
  let deltaSumMajor = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const majorFlags = new Uint8Array(width * height)

  for (let i = 0; i < dataA.length; i += 4) {
    const deltaR = Math.abs(dataA[i] - dataB[i])
    const deltaG = Math.abs(dataA[i + 1] - dataB[i + 1])
    const deltaB = Math.abs(dataA[i + 2] - dataB[i + 2])
    const deltaA = Math.abs(dataA[i + 3] - dataB[i + 3])
    const maxDelta = Math.max(deltaR, deltaG, deltaB, deltaA)
    if (maxDelta === 0) {
      exactSame += 1
      continue
    }
    differingAny += 1
    deltaSumAny += maxDelta
    if (maxDelta > tolerance) {
      majorBeyondTolerance += 1
      deltaSumMajor += maxDelta
      const px = (i / 4) % width
      const py = Math.floor(i / 4 / width)
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
      majorFlags[py * width + px] = 1
    } else {
      minorWithinTolerance += 1
    }
  }

  const hasMajor = majorBeyondTolerance > 0
  return {
    width,
    height,
    totalPixels: width * height,
    exactSame,
    differingAny,
    minorWithinTolerance,
    majorBeyondTolerance,
    meanDeltaAny: differingAny ? Math.round(deltaSumAny / differingAny) : 0,
    meanDeltaMajor: majorBeyondTolerance ? Math.round(deltaSumMajor / majorBeyondTolerance) : 0,
    bbox: hasMajor ? [minX, minY, maxX, maxY] : null,
    clusters: hasMajor
      ? clusterDiffs(width, height, (x, y) => majorFlags[y * width + x] === 1)
      : [],
  }
}

const run = () => {
  const { pairs, tolerance, out } = parseArgs(process.argv.slice(2))
  const report = { tolerance, pages: {}, sources: {} }
  let hasMajor = false

  for (const { baseline, current } of pairs) {
    const name = path.basename(baseline).replace(/\.png$/i, "")
    const decodedA = decodePng(baseline)
    const decodedB = decodePng(current)
    const result = comparePair(decodedA, decodedB, tolerance)
    report.pages[name] = result
    report.sources[name] = { baseline, current }
    if (result.majorBeyondTolerance > 0 || result.sizeMismatch) hasMajor = true
    console.log(
      result.sizeMismatch
        ? `${name}: 尺寸不一致 ${JSON.stringify(result.sizeMismatch)}`
        : `${name}: exactSame=${result.exactSame}/${result.totalPixels} minor(≤${tolerance})=${result.minorWithinTolerance} major(>${tolerance})=${result.majorBeyondTolerance} bbox=${JSON.stringify(result.bbox)}`,
    )
  }

  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
    console.log(`报告已写入 ${out}（major=${hasMajor ? "存在" : "无"}）`)
  }
  return hasMajor
}

const hasMajor = run()
process.exit(hasMajor ? 1 : 0)

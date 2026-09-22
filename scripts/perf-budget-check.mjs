/**
 * 性能预算断言：读取 output/playwright/profile-latest.json（由 profile:workbench 落盘），
 * 对冷/热启动的关键指标逐项比对预算，超预算输出明细并以非零退出。
 *
 * 阈值依据（2026-09-11 实测：cold DCL 157ms / JS 5465KB，warm DCL 21ms / JS 45KB，
 * 本地 preview 场景）：实测值 × 5~10 倍余量，兼顾回归灵敏度与 CI 稳定性。
 * 用法：pnpm perf:budget:check
 */
import { access, readFile, stat } from "node:fs/promises"
import path from "node:path"

const summaryFile = path.resolve(globalThis.process.cwd(), "output/playwright/profile-latest.json")
const distEntryFile = path.resolve(globalThis.process.cwd(), "dist/index.html")

const BUDGETS = {
  cold: {
    averageDomContentLoadedMs: { limit: 1500, label: "冷启动平均 DOMContentLoaded" },
    averageLoadEndMs: { limit: 2000, label: "冷启动平均加载完成" },
    totalJsTransferSizeKb: { limit: 8192, label: "冷启动 JS 传输总量" },
    totalCssTransferSizeKb: { limit: 512, label: "冷启动 CSS 传输总量" },
  },
  warm: {
    averageDomContentLoadedMs: { limit: 500, label: "热启动平均 DOMContentLoaded" },
    averageLoadEndMs: { limit: 800, label: "热启动平均加载完成" },
    totalJsTransferSizeKb: { limit: 512, label: "热启动 JS 传输总量" },
    totalCssTransferSizeKb: { limit: 128, label: "热启动 CSS 传输总量" },
  },
}

async function main() {
  try {
    await access(summaryFile)
  } catch {
    console.error("[perf:budget] 找不到画像数据，请先运行 pnpm perf:budget（或 profile:workbench）")
    globalThis.process.exitCode = 1
    return
  }

  const summary = JSON.parse(await readFile(summaryFile, "utf8"))
  const violations = []
  const rows = []

  // 新鲜度守卫：画像必须不早于当前 dist 构建，否则断言的是旧包（坑 3 同源：
  // preview/dist 是构建快照，改完代码必须重跑 perf:budget 再校验）
  const generatedAtMs = Date.parse(summary.generatedAt ?? "")
  const distStat = await stat(distEntryFile).catch(() => null)
  if (distStat) {
    if (!Number.isFinite(generatedAtMs)) {
      console.error(
        "[perf:budget] ❌ 画像数据缺少 generatedAt（旧版 profile 落盘），请重跑 pnpm perf:budget",
      )
      globalThis.process.exitCode = 1
      return
    }
    if (generatedAtMs < distStat.mtimeMs) {
      console.error(
        `[perf:budget] ❌ 画像数据(${summary.generatedAt})早于当前 dist 构建(${distStat.mtime.toISOString()})，` +
          "断言对象是旧包——请重跑 pnpm perf:budget 再校验",
      )
      globalThis.process.exitCode = 1
      return
    }
  }

  for (const [mode, budgets] of Object.entries(BUDGETS)) {
    const measured = summary[mode]
    if (!measured) {
      rows.push([mode, "—", "未测量（PROFILE_MODE 未包含该模式）", "—"])
      continue
    }

    for (const [key, { limit, label }] of Object.entries(budgets)) {
      const value = measured[key]
      const over = typeof value === "number" && value > limit
      if (over) {
        violations.push(`${mode} ${label}：${value} 超预算 ${limit}`)
      }
      rows.push([`${mode} ${label}`, value ?? "—", limit, over ? "❌ 超标" : "✅"])
    }
  }

  console.log("\n[perf:budget] 性能预算核对")
  for (const [name, value, limit, status] of rows) {
    console.log(
      `  ${status.padEnd(6)} ${name.padEnd(28)} 实测 ${String(value).padEnd(10)} 预算 ${limit}`,
    )
  }

  if (violations.length > 0) {
    console.error(
      `\n[perf:budget] ❌ ${violations.length} 项超预算：\n  ${violations.join("\n  ")}`,
    )
    globalThis.process.exitCode = 1
    return
  }

  console.log("\n[perf:budget] ✅ 全部指标在预算内")
}

main().catch((error) => {
  console.error("[perf:budget] 失败", error)
  globalThis.process.exitCode = 1
})

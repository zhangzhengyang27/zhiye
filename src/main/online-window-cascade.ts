/**
 * 在线子窗口的级联几何（#28）——纯函数层，不 import electron。
 *
 * 单独成模块是为了可测：`scripts/verify-desktop-b6.mjs` 直接以 node 原生
 * type-stripping 加载本文件，对级联序列做单测级断言；依赖 electron 的窗口
 * 跟踪在 online-window-manager.ts，那里只做编排。
 */

/** 同时打开的在线子窗口上限（语雀 online-window-manager 语义）。 */
export const MAX_ONLINE_WINDOWS = 5

/** 级联偏移步长：每多开一扇，落点相对基准再挪 24px。 */
export const CASCADE_OFFSET_PX = 24

/** 超限提示文案（经 `xiaoye:toast` 发给发起方渲染层）。 */
export const ONLINE_WINDOW_LIMIT_TOAST = "最多同时打开 5 个窗口"

/** 级联步数回卷上限：连开超过该扇数后回到第一步，避免窗口一路滑出屏幕。 */
export const CASCADE_MAX_STEPS = 10

/** 工作区夹取时的边缘保护：保证窗口标题栏（左上角区域）留在工作区内。 */
const CASCADE_EDGE_GUARD = { width: 400, height: 200 }

export interface CascadeOrigin {
  x: number
  y: number
}

export interface CascadeBaseBounds extends CascadeOrigin {
  width: number
  height: number
}

export interface CascadeWorkArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 第 `openCount` 扇子窗（0 起）的落点：
 * - 基准（通常是主窗几何）右下方向错开 `24px × (序号 + 1)`；
 * - 连开超过 CASCADE_MAX_STEPS 扇后按步数回卷，同一屏幕内循环级联；
 * - 夹取到工作区内，标题栏永远可达（双屏/小屏不把窗口丢到屏幕外）。
 *
 * `workArea` 缺省时不做夹取（测试与无屏环境兜底）。
 */
export const computeCascadeOrigin = (
  base: CascadeBaseBounds | null,
  openCount: number,
  workArea?: CascadeWorkArea
): CascadeOrigin => {
  const step = (Math.max(openCount, 0) % CASCADE_MAX_STEPS) + 1
  const originX = (base?.x ?? 0) + CASCADE_OFFSET_PX * step
  const originY = (base?.y ?? 0) + CASCADE_OFFSET_PX * step

  if (!workArea) {
    return { x: originX, y: originY }
  }

  const maxX = workArea.x + workArea.width - CASCADE_EDGE_GUARD.width
  const maxY = workArea.y + workArea.height - CASCADE_EDGE_GUARD.height
  return {
    x: Math.min(Math.max(originX, workArea.x), Math.max(workArea.x, maxX)),
    y: Math.min(Math.max(originY, workArea.y), Math.max(workArea.y, maxY)),
  }
}

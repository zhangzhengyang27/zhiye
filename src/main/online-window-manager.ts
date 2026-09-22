/**
 * 在线子窗口管理器（#28，对齐语雀 online-window-manager 语义）。
 *
 * 职责边界：
 * - 跟踪数组：每扇「在新窗口打开文档」的子窗都登记在案，close 即移除；
 * - 上限 MAX_ONLINE_WINDOWS：超限拒绝创建，并经 onLimit 回调向发起方渲染层
 *   发 toast 事件（消费端待接线，先发事件）；
 * - 级联落点：级联几何在 online-window-cascade.ts（纯函数，可单测）；
 * - 记忆每窗 URL/几何：跟踪项内存登记 { win, path }，几何经 win.getBounds()
 *   即取（简化实现，不落盘——主窗几何才参与持久化，见 index.ts）。
 *
 * 主窗/偏好设置窗不归本管理器管：主窗隐藏语义（macOS 关窗不退出）不变，
 * 设置窗维持既有单例。
 */
import type { BrowserWindow } from "electron"
import {
  computeCascadeOrigin,
  MAX_ONLINE_WINDOWS,
  ONLINE_WINDOW_LIMIT_TOAST,
  type CascadeBaseBounds,
  type CascadeWorkArea,
} from "./online-window-cascade"

/** 子窗跟踪项：URL（SPA 路由）与窗口引用。 */
interface OnlineWindowEntry {
  win: BrowserWindow
  /** 子窗加载的 SPA 内部路由（记忆 URL）。 */
  path: string
}

/** 打开子窗的依赖注入：创建与级联基准都来自 index.ts，管理器不反向依赖主窗状态。 */
export interface OpenOnlineWindowOptions {
  /** 子窗加载的 SPA 内部路由（已由调用方 sanitize）。 */
  targetPath: string
  /** 级联基准几何（主窗）；主窗不存在时传 null（退化为屏幕原点级联）。 */
  baseBounds: CascadeBaseBounds | null
  /** 级联落点所在屏的工作区（夹取用）；拿不到时传 undefined。 */
  workArea?: CascadeWorkArea
  /** 用给定落点创建子窗（index.ts 的 createWindow 包装）。 */
  create: (position: { x: number; y: number }) => BrowserWindow
  /** 超限回调：把 ONLINE_WINDOW_LIMIT_TOAST 发给发起方渲染层。 */
  onLimit?: (message: string) => void
}

export interface OpenOnlineWindowResult {
  opened: boolean
  reason?: "limit"
}

/** 子窗跟踪数组（模块级持有；close 即移除，destroy 不经 close 也要 prune 兜底）。 */
const onlineWindows: OnlineWindowEntry[] = []

/** 清掉已销毁的跟踪项（closed 监听是主路径，这里兜底 GC 引用）。 */
const pruneDestroyed = () => {
  for (let index = onlineWindows.length - 1; index >= 0; index -= 1) {
    const entry = onlineWindows[index]
    if (!entry || entry.win.isDestroyed()) {
      onlineWindows.splice(index, 1)
    }
  }
}

/** 当前在线子窗口数（验证脚本口径用）。 */
export const getOnlineWindowCount = (): number => {
  pruneDestroyed()
  return onlineWindows.length
}

/** 跟踪项快照：path + 当前几何（记忆 URL/几何的只读视图）。 */
export const getOnlineWindowSnapshots = () => {
  pruneDestroyed()
  return onlineWindows.map(entry => ({
    path: entry.path,
    bounds: entry.win.isDestroyed() ? null : entry.win.getBounds(),
  }))
}

/**
 * 经管理器打开一扇在线子窗（文档「在新窗口打开」共用入口）。
 *
 * 超限返回 { opened: false, reason: "limit" } 并触发 onLimit（toast 事件）；
 * 成功即登记跟踪并在 close 时移除。
 */
export const openOnlineWindow = (options: OpenOnlineWindowOptions): OpenOnlineWindowResult => {
  pruneDestroyed()
  if (onlineWindows.length >= MAX_ONLINE_WINDOWS) {
    options.onLimit?.(ONLINE_WINDOW_LIMIT_TOAST)
    return { opened: false, reason: "limit" }
  }

  const position = computeCascadeOrigin(options.baseBounds, onlineWindows.length, options.workArea)
  const win = options.create(position)
  onlineWindows.push({ win, path: options.targetPath })

  win.once("closed", () => {
    const index = onlineWindows.findIndex(entry => entry.win === win)
    if (index >= 0) {
      onlineWindows.splice(index, 1)
    }
  })

  return { opened: true }
}

/** 退出前清理：清空跟踪数组（窗口随应用退出自行销毁，无需逐扇 close）。 */
export const teardownOnlineWindows = () => {
  onlineWindows.splice(0, onlineWindows.length)
}

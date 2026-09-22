/**
 * 桌面端锁定（#27）的渲染层桥接与状态。
 *
 * 调用方：设置页「桌面端锁定」组（读写配置）与锁定窗口 /lock 路由（校验、退出登录）。
 * Web 端（window.xiaoyeDesktop 不存在）该能力整体不可用，desktopAvailable=false，
 * 设置页据此禁用整组并标注「仅桌面端可用」。
 *
 * 类型说明：window.xiaoyeDesktop 的声明在 services/desktop-bridge.ts，注入形状的
 * 单一事实源是 @/types/desktop-bridge（preload 同源 import），lock 族成员直接可用。
 * "unavailable" 是本模块在桥接缺失时补的本地失败分支，不在主进程返回值域里。
 */
import { reactive } from "vue"
import type {
  DesktopLockState,
  LockMutationResult,
  LockVerifyResult,
  XiaoyeDesktopApi,
} from "@/types/desktop-bridge"

export type { DesktopLockState }

/** lock 族动作的结果：主进程返回值，或桥接缺失时的 unavailable。 */
type LockMutationOutcome = LockMutationResult | { ok: false; reason: "unavailable" }
type LockVerifyOutcome = LockVerifyResult | { ok: false; reason: "unavailable" }

const lockBridge = (): XiaoyeDesktopApi | null =>
  // services/desktop-bridge.ts 的 window 声明仍是迁移前的旧 Bridge 接口（缺 lock 族），
  // 按事实源（@/types/desktop-bridge）形状断言；该处迁移回 XiaoyeDesktopApi 后可去掉
  typeof window !== "undefined" && window.xiaoyeDesktop
    ? (window.xiaoyeDesktop as XiaoyeDesktopApi)
    : null

/**
 * 当前环境是否可用桌面端锁定（Web 端 false）。
 */
export const isDesktopLockAvailable = (): boolean => lockBridge() !== null

/**
 * 锁定的状态与动作。设置页与锁定窗各自调用（两窗口不共享内存，各自从主进程取态）。
 */
export function useDesktopLock() {
  const desktopAvailable = isDesktopLockAvailable()
  const state = reactive<DesktopLockState>({
    hasPassword: false,
    autoLockOnBlur: false,
    autoLockDelayMinutes: 1,
    locked: false,
  })

  /** 从主进程回读锁定状态（挂载时调用一次）。 */
  const refresh = async () => {
    const bridge = lockBridge()
    if (!bridge) {
      return
    }
    Object.assign(state, await bridge.getLockState())
  }

  /** 设置/修改锁定密码；返回失败原因供设置页提示（ok=false + unauthorized = 当前密码不对）。 */
  const setLockPassword = async (
    newPassword: string,
    currentPassword?: string,
  ): Promise<LockMutationOutcome> => {
    const bridge = lockBridge()
    if (!bridge) {
      return { ok: false, reason: "unavailable" }
    }
    const result = await bridge.setLockPassword({
      newPassword,
      ...(currentPassword ? { currentPassword } : {}),
    })
    await refresh()
    return result
  }

  /** 清除锁定密码（需当前密码）。 */
  const clearLockPassword = async (currentPassword: string): Promise<LockMutationOutcome> => {
    const bridge = lockBridge()
    if (!bridge) {
      return { ok: false, reason: "unavailable" }
    }
    const result = await bridge.clearLockPassword(currentPassword)
    await refresh()
    return result
  }

  /** 更新失焦自动锁定（开关 + 延迟档一并下发）。 */
  const setAutoLock = async (enabled: boolean, delayMinutes: number) => {
    const bridge = lockBridge()
    if (!bridge) {
      return
    }
    Object.assign(state, await bridge.setAutoLock({ enabled, delayMinutes }))
  }

  /** 立即锁定（设置页「开启锁定」）。 */
  const lockNow = async () => {
    await lockBridge()?.lockNow()
  }

  /** 锁定窗校验密码（连错 5 次由主进程返回 cooldown）。 */
  const verifyPassword = async (password: string): Promise<LockVerifyOutcome> => {
    const bridge = lockBridge()
    if (!bridge) {
      return { ok: false, reason: "unavailable" }
    }
    return bridge.verifyLockPassword(password)
  }

  /** 锁定窗「退出登录」收尾：请主进程关锁定窗并通知其余窗口清会话。 */
  const unlockAfterLogout = async () => {
    await lockBridge()?.unlockAfterLogout()
  }

  return {
    desktopAvailable,
    state,
    refresh,
    setLockPassword,
    clearLockPassword,
    setAutoLock,
    lockNow,
    verifyPassword,
    unlockAfterLogout,
  }
}

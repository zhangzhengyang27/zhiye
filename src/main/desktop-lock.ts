/**
 * 桌面端锁定（#27 应用锁定，对齐语雀「桌面端锁定」：锁定密码 + 失焦自动锁定）。
 *
 * 职责边界：
 * - 锁定密码的哈希（sha256 + 随机盐）经 desktop-settings 的快照机制落
 *   `userData/desktop-settings.json`，不落明文；比对只在本模块（主进程）完成；
 * - 「锁定桌面端」= 创建全屏置顶无边框 LockWindow，加载应用内 `/lock` 路由
 *   （渲染层只负责输入 UI，校验经 IPC 回到本模块），连错 5 次锁 30s；
 * - 失焦自动锁定：主窗口 blur 且此刻本应用没有任何窗口持有焦点才起计时
 *   （焦点移到设置窗等自家窗口不算失焦），任一应用窗口 focus 或解锁即取消；
 * - 锁定期间的遮蔽策略：LockWindow 以 screen-saver 级置顶 + 全屏盖在最上层，
 *   主窗口不强求隐藏。
 */
import { BrowserWindow, app, ipcMain } from "electron"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import path from "node:path"
import { getLockSettings, saveLockSettings, type LockSettingsSnapshot } from "./desktop-settings"

/** 密码长度边界（语雀规格：4-32 位）。 */
export const LOCK_PASSWORD_MIN_LENGTH = 4
export const LOCK_PASSWORD_MAX_LENGTH = 32

/** 连续输错上限与冷却时长：第 5 次错后需等待 30s。 */
const MAX_FAILED_ATTEMPTS = 5
const FAILED_ATTEMPTS_COOLDOWN_MS = 30_000

/** 失焦自动锁定的合法延迟档（分钟），与渲染层 AUTO_LOCK_DELAY_OPTIONS 同值。 */
const AUTO_LOCK_DELAY_MINUTES = [1, 5, 15] as const
const DEFAULT_AUTO_LOCK_DELAY_MINUTES = 1

/** 渲染层校验结果（IPC 载荷）。 */
interface LockVerifyResult {
  ok: boolean
  reason?: "empty" | "mismatch" | "cooldown"
  /** reason=cooldown 时：还需等待的秒数。 */
  waitSeconds?: number
  /** reason=mismatch 时：剩余可尝试次数。 */
  remainingAttempts?: number
}

interface LockMutationResult {
  ok: boolean
  reason?: "unauthorized" | "invalid" | "invalid-length"
}

/** LockWindow 实例（模块级持有；null = 未锁定）。 */
let lockWindow: BrowserWindow | null = null
/** 当前锁定会话内连续输错次数（成功校验或重新锁定时清零）。 */
let failedAttempts = 0
/** 冷却截止时间戳（ms）；0 表示不在冷却中。 */
let cooldownUntil = 0
/** 失焦自动锁定计时器。 */
let autoLockTimer: NodeJS.Timeout | null = null
/** blur 后延迟判定「焦点是否真的离开了应用」的定时器。 */
let blurCheckTimer: NodeJS.Timeout | null = null
/** before-quit 置位：放行 LockWindow 随应用一起退出，否则下面会拦下 close。 */
let quitting = false

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex")

const hashPassword = (password: string, salt: string) => sha256Hex(`${salt}:${password}`)

/** 常量时间比对，避免逐字节短路 leaking 前缀匹配信息。 */
const verifyPasswordHash = (password: string, stored: { salt: string; hash: string }): boolean => {
  const actual = Buffer.from(hashPassword(password, stored.salt), "hex")
  const expected = Buffer.from(stored.hash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const isLocked = () => Boolean(lockWindow && !lockWindow.isDestroyed())

/** 判定给定窗口是否当前锁定窗（index.ts 的广播按窗口标识排除它，不按标题判定）。 */
export const isLockWindow = (win: BrowserWindow): boolean => win === lockWindow

const normalizeDelayMinutes = (value: unknown): number =>
  (AUTO_LOCK_DELAY_MINUTES as readonly number[]).includes(
    value as (typeof AUTO_LOCK_DELAY_MINUTES)[number],
  )
    ? (value as number)
    : DEFAULT_AUTO_LOCK_DELAY_MINUTES

/** 锁定状态：设置页渲染与锁定窗口兜底都从这里取。 */
export const getLockState = () => {
  const lock: LockSettingsSnapshot = getLockSettings()
  return {
    hasPassword: Boolean(lock.passwordHash),
    autoLockOnBlur: lock.autoLockOnBlur === true,
    autoLockDelayMinutes: normalizeDelayMinutes(lock.autoLockDelayMinutes),
    locked: isLocked(),
  }
}

const cancelAutoLockTimer = () => {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer)
    autoLockTimer = null
  }
}

/** destroy() 不触发 close 事件，用它关闭锁定窗（close 拦截只防菜单快捷键）。 */
const closeLockWindow = () => {
  const win = lockWindow
  lockWindow = null
  if (win && !win.isDestroyed()) {
    win.destroy()
  }
}

/** 创建全屏置顶无边框锁定窗，加载应用内 /lock 路由（复用渲染层 token 与图标，成本低于独立 lock.html）。 */
const createLockWindow = () => {
  // 非主窗口身份（与 index.ts 的 createWindow 同口径）：锁定窗不承担偏好设置的启动同步
  process.env.XIAOYE_MAIN_WINDOW = "0"
  const win = new BrowserWindow({
    show: false,
    frame: false,
    fullscreen: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    // 任务栏/Dock 不出现锁定窗入口（Windows 下 skipTaskbar 生效；macOS 全屏本就盖住 Dock）
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#f8faf8",
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // screen-saver 级置顶：压过普通 alwaysOnTop 窗口，锁定界面不被应用内浮窗盖住
  win.setAlwaysOnTop(true, "screen-saver")

  lockWindow = win
  win.once("ready-to-show", () => win.show())
  win.on("closed", () => {
    if (lockWindow === win) {
      lockWindow = null
    }
  })
  // 无边框窗没有关闭按钮，但应用菜单的 role 快捷键（⌘W 关窗）仍会命中焦点窗口：
  // 解锁/退出登录走 destroy() 不经过 close，这里把其余 close 全拦下，锁定不可绕过
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault()
    }
  })

  // app:// 主机名与 index.ts 的 APP_PROTOCOL_HOST 同源（主进程侧不互相 import）
  const targetPath = "/lock"
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${targetPath}`)
  } else {
    void win.loadURL(`app://bundle${targetPath}`)
  }

  // 锁定窗内不放行任何 window.open：渲染层被攻破也不能借新开的子窗口绕过锁定
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
}

/** 「锁定桌面端」动作（菜单/托盘/⌘L/设置页共用）：未设密码时忽略，已锁定则唤到前台。 */
export const lockNow = (): boolean => {
  if (!getLockSettings().passwordHash) {
    console.log("[xiaoye] 未设置锁定密码，忽略锁定请求")
    return false
  }
  if (isLocked()) {
    lockWindow?.focus()
    return true
  }

  // 新的锁定会话：清掉上次遗留的失败计数，停掉已无意义的失焦计时
  failedAttempts = 0
  cooldownUntil = 0
  cancelAutoLockTimer()
  createLockWindow()
  return true
}

/**
 * 校验锁定密码（LockWindow 渲染层经 IPC 调用）。连错 5 次进入 30s 冷却；
 * 成功即关闭锁定窗（解锁）。冷却按「失败 5 次 → 30s → 计数清零」循环。
 */
const verifyLockPassword = (password: unknown): LockVerifyResult => {
  const stored = getLockSettings().passwordHash
  if (typeof password !== "string" || !password || !stored) {
    return { ok: false, reason: "empty" }
  }
  if (cooldownUntil > Date.now()) {
    return {
      ok: false,
      reason: "cooldown",
      waitSeconds: Math.ceil((cooldownUntil - Date.now()) / 1000),
    }
  }

  if (verifyPasswordHash(password, stored)) {
    failedAttempts = 0
    cooldownUntil = 0
    closeLockWindow()
    return { ok: true }
  }

  failedAttempts += 1
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    cooldownUntil = Date.now() + FAILED_ATTEMPTS_COOLDOWN_MS
    failedAttempts = 0
    return { ok: false, reason: "cooldown", waitSeconds: FAILED_ATTEMPTS_COOLDOWN_MS / 1000 }
  }
  return { ok: false, reason: "mismatch", remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts }
}

/** 设置/修改锁定密码：已有密码时必须先验当前密码（4-32 位）。 */
const setLockPassword = (payload: {
  currentPassword?: unknown
  newPassword?: unknown
}): LockMutationResult => {
  const stored = getLockSettings().passwordHash
  if (typeof payload?.newPassword !== "string") {
    return { ok: false, reason: "invalid" }
  }
  const newPassword = payload.newPassword
  if (
    newPassword.length < LOCK_PASSWORD_MIN_LENGTH ||
    newPassword.length > LOCK_PASSWORD_MAX_LENGTH
  ) {
    return { ok: false, reason: "invalid-length" }
  }
  if (
    stored &&
    (typeof payload.currentPassword !== "string" ||
      !verifyPasswordHash(payload.currentPassword, stored))
  ) {
    return { ok: false, reason: "unauthorized" }
  }

  const salt = randomBytes(16).toString("hex")
  saveLockSettings({ passwordHash: { salt, hash: hashPassword(newPassword, salt) } })
  return { ok: true }
}

/** 清除锁定密码：需验当前密码；自动锁定一并关闭并停表（无密码的自动锁定没有意义）。 */
const clearLockPassword = (currentPassword: unknown): LockMutationResult => {
  const stored = getLockSettings().passwordHash
  if (!stored) {
    return { ok: true }
  }
  if (typeof currentPassword !== "string" || !verifyPasswordHash(currentPassword, stored)) {
    return { ok: false, reason: "unauthorized" }
  }

  saveLockSettings({ passwordHash: undefined, autoLockOnBlur: false })
  cancelAutoLockTimer()
  return { ok: true }
}

/** 更新失焦自动锁定配置（设置页下发）。 */
const setAutoLock = (payload: { enabled?: unknown; delayMinutes?: unknown }) => {
  const enabled = payload?.enabled === true
  const delayMinutes = normalizeDelayMinutes(payload?.delayMinutes)
  saveLockSettings({ autoLockOnBlur: enabled, autoLockDelayMinutes: delayMinutes })

  // 关闭或无密码时立即停表；开启时不主动起表——等下一次真实失焦再计
  if (!enabled || !getLockSettings().passwordHash) {
    cancelAutoLockTimer()
  }
  return getLockState()
}

const startAutoLockTimer = () => {
  cancelAutoLockTimer()
  if (!getLockSettings().autoLockOnBlur || !getLockSettings().passwordHash || isLocked()) {
    return
  }
  const delayMinutes = getLockState().autoLockDelayMinutes

  autoLockTimer = setTimeout(() => {
    autoLockTimer = null
    lockNow()
  }, delayMinutes * 60_000)
  console.log(`[xiaoye] 主窗口失焦，${delayMinutes} 分钟后自动锁定`)
}

/**
 * 绑定主窗口的失焦自动锁定（createWindow 时对主窗口调用一次）。
 *
 * blur 起计时前先延迟一拍确认「本应用没有任何窗口持有焦点」：焦点若只是移到
 * 偏好设置窗/文档新窗等自家窗口，不算失焦。「取消计时」挂在 app 级的
 * browser-window-focus 上（见 registerDesktopLockIpc）：任一应用窗口获得焦点
 * 即取消——计时期间用户把焦点移到子窗同样在使用应用中，只盯主窗 focus 会
 * 在子窗使用到一半时突然锁屏。
 */
export const attachAutoLockWindow = (win: BrowserWindow) => {
  win.on("blur", () => {
    if (blurCheckTimer) {
      clearTimeout(blurCheckTimer)
    }
    blurCheckTimer = setTimeout(() => {
      blurCheckTimer = null
      const focusedInApp = BrowserWindow.getAllWindows().some(
        (item) => !item.isDestroyed() && item.isFocused(),
      )
      if (focusedInApp) {
        return
      }
      startAutoLockTimer()
    }, 100)
  })
}

/**
 * 锁定界面「退出登录」的收尾：关锁定窗，并让其余窗口清会话回登录页。
 *
 * 通知方式复用渲染层既有的 auth:unauthorized 事件（services/auth-events.ts 的
 * AUTH_UNAUTHORIZED_EVENT，App.vue 据此清会话并跳登录）——主进程不能 import 渲染层
 * 模块，这里用同名字面量经 executeJavaScript 派发，与事件常量同源维护。
 */
const unlockAfterLogout = () => {
  closeLockWindow()
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) {
      continue
    }
    void win.webContents
      .executeJavaScript('window.dispatchEvent(new CustomEvent("auth:unauthorized"))')
      .catch(() => {})
  }
}

/** 注册锁定相关的 IPC 通道（bootstrap 期调用）。 */
export const registerDesktopLockIpc = () => {
  app.on("before-quit", () => {
    quitting = true
  })

  // 任一应用窗口获得焦点即取消失焦计时与「离开应用」延迟判定（应用内窗口间
  // 切换同样触发本事件，正好覆盖「子窗使用中不锁屏」的取消路径）
  app.on("browser-window-focus", () => {
    if (blurCheckTimer) {
      clearTimeout(blurCheckTimer)
      blurCheckTimer = null
    }
    cancelAutoLockTimer()
  })

  ipcMain.handle("xiaoye:lock:get-state", () => getLockState())
  ipcMain.handle("xiaoye:lock:lock-now", () => ({ locked: lockNow() }))
  ipcMain.handle("xiaoye:lock:set-password", (_event, payload: unknown) =>
    setLockPassword(payload as { currentPassword?: unknown; newPassword?: unknown }),
  )
  ipcMain.handle("xiaoye:lock:clear-password", (_event, currentPassword: unknown) =>
    clearLockPassword(currentPassword),
  )
  ipcMain.handle("xiaoye:lock:verify-password", (_event, password: unknown) =>
    verifyLockPassword(password),
  )
  ipcMain.handle("xiaoye:lock:set-auto-lock", (_event, payload: unknown) =>
    setAutoLock(payload as { enabled?: unknown; delayMinutes?: unknown }),
  )
  ipcMain.handle("xiaoye:lock:unlock-after-logout", () => {
    unlockAfterLogout()
    return { ok: true }
  })
}

/** 退出前清理：停表、销毁锁定窗（close 拦截对 destroy 无效，无需额外放行）。 */
export const teardownDesktopLock = () => {
  cancelAutoLockTimer()
  if (blurCheckTimer) {
    clearTimeout(blurCheckTimer)
    blurCheckTimer = null
  }
  closeLockWindow()
}

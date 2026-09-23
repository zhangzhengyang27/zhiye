/**
 * 独立登录窗口（对齐语雀 windows/login + login-helper 的窗口化登录语义）。
 *
 * 语雀桌面端登录不在主窗口内整页跳转，而是独立 login 窗（400×649，macOS
 * hiddenInset 无边框、仅开发态可调宽、不可最大化/最小化）：未登录时先只开
 * 登录窗，登录成功才销毁它、再创建/唤回主窗。本仓对齐该形态——主窗不再承载
 * 登录页，会话是否有效由登录窗渲染层 hydration 后经 IPC 回报：
 * - `xiaoye:login-window:ready` —— hydration 完成且未登录：把隐藏的登录窗亮出来；
 * - `xiaoye:auth:session-established` —— 表单登录/注册成功或 refresh cookie
 *   自动登录：交给 index.ts 的钩子关登录窗、开/唤回主窗（带回跳目标）。
 *
 * 与 desktop-lock 同款约定：close 在 macOS 上隐藏而非销毁（关窗不退出），
 * 非 macOS 关登录窗即退出应用；broadcast 会按 isLoginWindow 排除本窗。
 * 渲染层自举失败（bundle 异常等）时靠 SHOW_FALLBACK_MS 兜底亮窗，避免应用
 * 启动后无任何可见窗口。
 */
import { BrowserWindow, app, ipcMain, type IpcMainInvokeEvent } from "electron"
import path from "node:path"
import { attachNavigationGuard } from "./window-navigation"

/** 登录窗固定尺寸（语雀 size-manager loginWindowSize 实测同值：400×649）。 */
export const LOGIN_WINDOW_SIZE = { width: 400, height: 649 }
/** 开发态放开 resize 时的下限（生产不可调宽，仅兜底）。 */
const LOGIN_WINDOW_MIN_SIZE = { width: 320, height: 480 }
/** 渲染层自举兜底：超时仍未收到 ready/established 就直接亮窗（宁可白窗不可无窗）。 */
const SHOW_FALLBACK_MS = 8_000

/** 登录窗实例（模块级持有；null = 未在登录流程）。 */
let loginWindow: BrowserWindow | null = null
/** before-quit 置位：放行登录窗随应用一起退出，否则 close 拦截会卡住退出。 */
let quitting = false
/** 自举兜底亮窗计时器。 */
let showFallbackTimer: NodeJS.Timeout | null = null

/** 判定给定窗口是否登录窗（index.ts 的广播按窗口标识排除它，不按标题判定）。 */
export const isLoginWindow = (win: BrowserWindow): boolean => win === loginWindow

/** 登录窗是否在场（含隐藏态）——index.ts 的窗口自举据此决定唤谁。 */
export const hasLoginWindow = (): boolean => Boolean(loginWindow && !loginWindow.isDestroyed())

/** 渲染层回报「需要登录」或「已登录」后都不再需要兜底亮窗。 */
const cancelShowFallback = () => {
  if (showFallbackTimer) {
    clearTimeout(showFallbackTimer)
    showFallbackTimer = null
  }
}

/** 销毁登录窗（登录成功或自举完成；destroy 不触发 close 拦截）。 */
export const destroyLoginWindow = () => {
  cancelShowFallback()
  const win = loginWindow
  loginWindow = null
  if (win && !win.isDestroyed()) {
    win.destroy()
  }
}

/** 唤起登录窗到前台（托盘/Dock/activate 在未登录期间的统一落点）。 */
export const focusLoginWindow = () => {
  if (!loginWindow || loginWindow.isDestroyed()) {
    return
  }
  if (!loginWindow.isVisible()) {
    loginWindow.show()
  }
  loginWindow.focus()
}

/** 回跳目标只放行站内路径（与渲染层 resolveSafeRedirect 同判据，长度/空白从紧）。 */
const sanitizeRedirectPath = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.length > 2048 ||
    /\s/.test(trimmed)
  ) {
    return null
  }
  return trimmed
}

/** 加载登录路由（dev 走 electron-vite dev server，生产走 app:// 协议）。 */
const loadLoginRoute = (win: BrowserWindow, redirectPath: string | null) => {
  const suffix = redirectPath
    ? `/auth/login?redirect=${encodeURIComponent(redirectPath)}`
    : "/auth/login"
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${suffix}`)
  } else {
    void win.loadURL(`app://bundle${suffix}`)
  }
}

/**
 * 打开（或聚焦已存在的）登录窗。窗口以隐藏态创建，是否亮出由渲染层 hydration
 * 结果决定（未登录 → ready 亮窗；refresh cookie 仍有效 → established 关窗开主窗），
 * 避免已登录用户每次启动都闪一帧登录表单。
 *
 * 已存在的登录窗不会被重灌 redirect（用户多半正在输入，重灌会清掉表单态）。
 */
export const ensureLoginWindow = (redirectPath?: string): BrowserWindow => {
  if (loginWindow && !loginWindow.isDestroyed()) {
    focusLoginWindow()
    return loginWindow
  }

  // 非主窗口身份：登录窗不承担主窗的几何持久化与失焦自动锁定
  const win = new BrowserWindow({
    width: LOGIN_WINDOW_SIZE.width,
    height: LOGIN_WINDOW_SIZE.height,
    minWidth: LOGIN_WINDOW_MIN_SIZE.width,
    minHeight: LOGIN_WINDOW_MIN_SIZE.height,
    // 语雀：登录窗仅开发态可调，正式包定宽定高
    resizable: !app.isPackaged,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: "登录",
    show: false,
    backgroundColor: "#f8faf8",
    autoHideMenuBar: true,
    // macOS 无边框 + 红绿灯内嵌（语雀同款 hiddenInset {6,6}）；渲染层补顶部拖拽带
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 6, y: 6 } }
      : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [
        // 与 index.ts createWindow 同口径：主窗=0（几何持久化/自动锁定都排除本窗）
        "--xiaoye-is-main-window=0",
        // 登录窗身份标记：渲染层据此分叉登录流程（preload 透传为 isLoginWindow）
        "--xiaoye-is-login-window=1",
      ],
    },
  })

  loginWindow = win
  win.on("closed", () => {
    cancelShowFallback()
    if (loginWindow === win) {
      loginWindow = null
    }
  })
  // macOS：关窗隐藏（应用不退出，托盘/Dock 可再唤起）；其余平台关窗即退出
  win.on("close", (event) => {
    if (quitting) {
      return
    }
    if (process.platform === "darwin") {
      event.preventDefault()
      win.hide()
    } else {
      app.quit()
    }
  })
  // 登录页不放行任何 window.open：注册/忘记密码都是站内路由
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  // 整窗导航防护：登录窗只承载应用自身页面，外链交系统浏览器
  attachNavigationGuard(win.webContents)

  // 自举兜底：渲染层超时未回报（bundle 异常、IPC 断裂）也必须亮窗
  showFallbackTimer = setTimeout(() => {
    showFallbackTimer = null
    if (loginWindow === win && !win.isDestroyed() && !win.isVisible()) {
      console.warn("[xiaoye] 登录窗渲染层自举超时，兜底亮窗")
      win.show()
    }
  }, SHOW_FALLBACK_MS)

  loadLoginRoute(win, sanitizeRedirectPath(redirectPath))
  return win
}

/**
 * 登录窗渲染层回报后的应用级动作，由 index.ts 注入（它才掌握主窗与创建逻辑，
 * 本模块不反向依赖主窗状态）。
 */
export interface LoginWindowIpcHooks {
  /** 登录/注册成功或 refresh cookie 自动登录；redirectPath 为回跳目标（未校验原文）。 */
  onSessionEstablished: (redirectPath?: string) => void
  /** 内容窗会话失效，请求唤起登录窗（redirectPath 为失效时的页面路径）。 */
  onOpenLoginRequested: (redirectPath?: string) => void
  /** 内容窗请求退出登录（销毁全部内容窗回到登录窗）。 */
  onLogoutRequested: () => void
}

/** invoke 来源必须是登录窗本人（ready/established 只信登录窗渲染层）。 */
const senderIsLoginWindow = (event: IpcMainInvokeEvent): boolean => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return Boolean(win && !win.isDestroyed() && win === loginWindow)
}

const readRedirectPayload = (payload: unknown): string | undefined => {
  const redirectPath =
    typeof payload === "object" && payload !== null
      ? (payload as { redirectPath?: unknown }).redirectPath
      : undefined
  return sanitizeRedirectPath(redirectPath) ?? undefined
}

/** 注册登录窗相关 IPC（bootstrap 期调用，与 registerDesktopLockIpc 并列）。 */
export const registerLoginWindowIpc = (hooks: LoginWindowIpcHooks) => {
  app.on("before-quit", () => {
    quitting = true
  })

  // hydration 完成且未登录：亮窗（首个挂载信号，此后不再兜底）
  ipcMain.handle("xiaoye:login-window:ready", (event) => {
    if (senderIsLoginWindow(event)) {
      cancelShowFallback()
      focusLoginWindow()
    }
    return { ok: true }
  })

  // 登录/注册成功（或自动登录）：关窗 + 交回 index.ts 开主窗
  ipcMain.handle("xiaoye:auth:session-established", (event, payload: unknown) => {
    if (!senderIsLoginWindow(event)) {
      return { ok: false }
    }
    destroyLoginWindow()
    hooks.onSessionEstablished(readRedirectPayload(payload))
    return { ok: true }
  })

  // 内容窗会话失效 → 唤登录窗（幂等：已在场只聚焦）
  ipcMain.handle("xiaoye:auth:open-login-window", (_event, payload: unknown) => {
    hooks.onOpenLoginRequested(readRedirectPayload(payload))
    return { ok: true }
  })

  // 内容窗退出登录 → 销毁内容窗回到登录窗
  ipcMain.handle("xiaoye:auth:logout-desktop", () => {
    hooks.onLogoutRequested()
    return { ok: true }
  })
}

/** 退出前清理：销毁登录窗（close 拦截对 destroy 无效）。 */
export const teardownLoginWindow = () => {
  quitting = true
  destroyLoginWindow()
}

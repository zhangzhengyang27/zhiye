/**
 * 知识库桌面端主进程。
 *
 * 职责：
 * - 窗口生命周期（单实例锁、macOS 关窗不退出）
 * - 生产模式下通过 `app://` 特权协议加载本地渲染层（含 SPA 路由 fallback）
 * - 解析后端地址并注入渲染层（env > userData/config.json > 默认 localhost:3200）
 * - 接管 window.open：空白打印窗放行、下载端点转本地下载、其余外链走系统浏览器
 */
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  Notification,
  screen,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type MenuItemConstructorOptions,
} from "electron"
import path from "node:path"
import fs from "node:fs"
import { pathToFileURL } from "node:url"
import {
  getSavedWindowBounds,
  isTrayVisibleRequested,
  registerDesktopSettingsIpc,
  restoreDesktopSettings,
  saveWindowBounds,
  teardownDesktopSettings,
  type WindowBounds,
} from "./desktop-settings"

/** `app://` 协议主机名（standard 协议要求显式 host）。 */
const APP_PROTOCOL_HOST = "bundle"
/** 本地渲染层构建产物目录（out/renderer）。 */
const RENDERER_DIST = path.join(import.meta.dirname, "../renderer")
/** 渲染层入口文件。 */
const RENDERER_INDEX = path.join(RENDERER_DIST, "index.html")
/** 后端默认地址：本地 xiaoye-server。 */
const DEFAULT_SERVER_BASE_URL = "http://localhost:3200"

/** 托盘实例（模块级持有，防止被 GC 后图标消失）。 */
let tray: Tray | null = null
/** 主窗口与偏好设置窗口引用（多窗口后不能再靠 getAllWindows()[0] 猜主窗）。 */
let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

/**
 * 桌面端持久化配置（userData/config.json）。
 */
interface DesktopConfig {
  /** 知识库后端地址，例如 http://localhost:3200 或 https://kb.example.com。 */
  serverBaseUrl?: string
  /** 网页版站点地址（分享链接指向的 Web 端部署地址），缺省与 serverBaseUrl 同源。 */
  webBaseUrl?: string
}

// 必须在 app ready 之前注册特权协议：
// standard 保证与 Web 一致的 origin 语义，secure 保证 window.isSecureContext
// 为 true（Web Crypto / AI 密钥加密依赖它），supportFetchAPI 放行 fetch。
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

/**
 * 读取用户配置文件（不存在或非法时返回空对象）。
 */
const readDesktopConfig = (): DesktopConfig => {
  try {
    const configPath = path.join(app.getPath("userData"), "config.json")
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as DesktopConfig
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 去掉地址末尾的 `/` 与 `/api` 后缀，归一化为 origin 形式。
 */
const normalizeOrigin = (url: string) =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/, "")

/**
 * 只接受 http/https 的 origin，挡掉 config.json 里的非法值
 * （写成主机名、忘了协议、带路径都会让渲染层所有请求静默失败）。
 */
const isValidHttpOrigin = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0
  } catch {
    return false
  }
}

/**
 * 解析后端地址：环境变量 > 配置文件 > 默认本地 3200。配置非法时回落到默认值并告警。
 */
const resolveServerBaseUrl = (): string => {
  const fromEnv = process.env.XIAOYE_SERVER_URL?.trim()
  const fromFile = readDesktopConfig().serverBaseUrl?.trim()
  const candidate = normalizeOrigin(fromEnv || fromFile || DEFAULT_SERVER_BASE_URL)

  if (isValidHttpOrigin(candidate)) {
    return candidate
  }

  console.warn(`[xiaoye] 后端地址非法（${candidate}），已回落到 ${DEFAULT_SERVER_BASE_URL}`)
  return DEFAULT_SERVER_BASE_URL
}

/**
 * 解析网页版站点地址（分享链接用）：环境变量 > 配置文件 > 与后端同源。
 */
const resolveWebBaseUrl = (serverBaseUrl: string): string => {
  const fromEnv = process.env.XIAOYE_WEB_URL?.trim()
  const fromFile = readDesktopConfig().webBaseUrl?.trim()
  const candidate = normalizeOrigin(fromEnv || fromFile || serverBaseUrl)

  if (isValidHttpOrigin(candidate)) {
    return candidate
  }

  console.warn(`[xiaoye] 网页版地址非法（${candidate}），已回落到后端地址 ${serverBaseUrl}`)
  return serverBaseUrl
}

/**
 * 已知下载端点：OSS 签名直链。
 */
const DOWNLOAD_URL_PATTERN = /Signature=|OSSAccessKeyId=|X-Amz-Signature=/i

/**
 * macOS 下隐藏原生标题栏（保留红绿灯，红绿灯浮在侧栏之上），让侧栏/目录列/正文
 * 三栏真正通到窗口顶——对齐语雀桌面端实测：它的两列首行都从窗口顶往下约 32px 开始，
 * 红绿灯落在这段空带里，没有整宽标题条。
 *
 * 渲染层要知道这件事（顶部要留同一条可拖拽带、列首行要下移让位），但 preload 是
 * sandbox 且不能 import 主进程模块，所以沿用本文件既有的 env 传值口径：这里判定一次，
 * preload 读出来透给渲染层，避免两处各写一遍 darwin 判断。
 */
const HIDDEN_TITLE_BAR = process.platform === "darwin"

if (HIDDEN_TITLE_BAR) {
  process.env.XIAOYE_HIDDEN_TITLE_BAR = "1"
}

/**
 * window.open 接管策略：
 * - 空白页（document-export 的 PDF 打印窗）→ 放行为原生子窗口
 * - 下载端点 / OSS 签名直链 → deny 并转交 session 下载
 * - 其余 http(s) 外链 → deny 并调用系统默认浏览器
 */
const createWindowOpenHandler = (parentWindow: BrowserWindow) => {
  return ({ url }: { url: string }) => {
    if (!url || url === "about:blank") {
      return {
        action: "allow" as const,
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 760,
          autoHideMenuBar: true,
          ...(HIDDEN_TITLE_BAR ? { titleBarStyle: "hidden" as const } : {}),
        },
      }
    }

    if (/^https?:/i.test(url)) {
      if (DOWNLOAD_URL_PATTERN.test(url)) {
        parentWindow.webContents.downloadURL(url)
      } else {
        void shell.openExternal(url)
      }
    }

    return { action: "deny" as const }
  }
}

/**
 * 统一下载接管：保留默认保存对话框，完成后在日志中记录结果。
 */
const attachDownloadHandler = () => {
  session.defaultSession.on("will-download", (_event, item) => {
    item.once("done", (_doneEvent, state) => {
      if (state === "completed") {
        console.log(`[xiaoye] 下载完成：${item.getFilename()} -> ${item.getSavePath()}`)
      } else if (state === "interrupted") {
        console.warn(`[xiaoye] 下载中断：${item.getFilename()}`)
      }
    })
  })
}

/**
 * 渲染层内容安全策略。
 *
 * 只放行本地资源与已配置的后端地址，禁掉 object / base / frame，降低渲染远端
 * 文档内容（v-html、Lake 富文本）时的注入影响面。script-src 保留 'unsafe-inline'
 * 是因为 index.html 里有一段同步应用主题的内联脚本（防首屏闪白）。
 */
const buildContentSecurityPolicy = (serverBaseUrl: string): string =>
  [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${serverBaseUrl} https: ws: wss:`,
    "media-src 'self' data: blob: https:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
  ].join("; ")

/**
 * 注册 `app://` 协议处理器：优先返回静态文件，非资源路径回落到 index.html
 * （SPA fallback，保证 HTML5 History 路由在刷新/直达时不 404）。
 *
 * 注意：protocol.handle 注册的自定义协议不走 webRequest 钩子，CSP 只能在这里
 * 直接写进 HTML 入口的响应头。
 */
const registerAppProtocol = (serverBaseUrl: string) => {
  // SPA 深链下资源请求会带路由前缀（页面 app://bundle/auth/login 里引用
  // ./assets/... 解析为 /auth/assets/...；electron-vite 强制 renderer base="./"，
  // 无法在构建期改为绝对路径）。这里把被污染的资源路径重写回真实位置。
  const ASSET_MARKERS = ["/assets/", "/yuque-assets/"]

  protocol.handle("app", async request => {
    let decodedPath = decodeURIComponent(new URL(request.url).pathname)

    if (!decodedPath.startsWith("/assets/") && !decodedPath.startsWith("/yuque-assets/")) {
      for (const marker of ASSET_MARKERS) {
        const index = decodedPath.indexOf(marker)
        if (index > 0) {
          decodedPath = decodedPath.slice(index)
          break
        }
      }
    }

    const filePath = path.normalize(path.join(RENDERER_DIST, decodedPath))

    // 防目录穿越：解析后的路径必须仍在渲染层目录内。
    // 前缀比较要带路径分隔符，否则 out/renderer-secret 这类兄弟目录会被放行
    const isInsideRendererDist = filePath === RENDERER_DIST || filePath.startsWith(RENDERER_DIST + path.sep)

    if (!isInsideRendererDist) {
      return new Response("Forbidden", { status: 403 })
    }

    const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : RENDERER_INDEX
    const response = await net.fetch(pathToFileURL(target).toString())

    // CSP 只对 HTML 入口有意义，静态资源原样透传
    if (target !== RENDERER_INDEX) {
      return response
    }

    const headers = new Headers(response.headers)
    headers.set("Content-Security-Policy", buildContentSecurityPolicy(serverBaseUrl))
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  })
}

/**
 * 「偏好设置」菜单项（语雀桌面端把它放在 Application 菜单第 2 项与托盘菜单，
 * accelerator 均为 ⌘,；渲染层无齿轮入口，Windows 下靠托盘、Web 端靠侧栏「更多」）。
 */
const preferencesMenuItem = (): MenuItemConstructorOptions => ({
  label: "偏好设置",
  accelerator: "CommandOrControl+,",
  click: () => openSettingsWindow(),
})

/**
 * 构建基础应用菜单（macOS 必需，其他平台提供常规编辑/视图快捷键）。
 *
 * macOS 首菜单不能用 `role: "appMenu"`——role 是整块模板，无法在「关于」之后
 * 插入「偏好设置」，因此按 macOS 标准顺序手写（关于 / 偏好设置 / 服务 / 隐藏 / 退出）。
 */
const buildAppMenu = () => {
  const applicationMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      preferencesMenuItem(),
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  }

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [applicationMenu] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * 创建主窗口并加载渲染层。
 *
 * `targetPath` 为 SPA 内部路由路径（如 `/knowledge/:kbId/doc/:docId`）：
 * - 生产模式通过 app:// 协议加载，history fallback 会把未知路径回落到
 *   index.html，SPA 路由再按 location.pathname 渲染目标页面。
 * - 开发模式直接拼到 electron-vite dev server 的 URL 上（vite 自带 history fallback）。
 */
/**
 * 主窗口最小尺寸。语雀是 720×640（它的主窗口是远端 webview，窄了会自适应），
 * 我们刻意停在 1080×760：KnowledgePageShell 写死了 min-w-[1080px] min-h-[760px]，
 * 再窄就触发整壳双向滚动、正文区出现难以发现的横向滚动条。
 * 要降到语雀口径，得先放宽那层壳的最小宽度，不能只改这里。
 *
 * 隐藏标题栏（HIDDEN_TITLE_BAR）后外框高 == 内容高，760 这条下限才真正贴合壳层的
 * min-h-[760px]；带原生标题栏时外框 760 只剩 ~732 内容高，最小尺寸必出纵向滚动。
 */
const WINDOW_MIN_WIDTH = 1080
const WINDOW_MIN_HEIGHT = 760

/**
 * 首次启动（无历史尺寸）时的默认窗口大小：按主屏工作区分档，逐档照抄语雀
 * `windowSizeManager.defaultWindowSize`。语雀从不写死 1440×900——
 * 大屏（>1680）取工作区的 80%，小屏逐级收窄，所以它在 4K/1920 逻辑屏上是 1536×844。
 */
const computeDefaultWindowSize = (): WindowBounds => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const ratio = (factor: number) => Math.trunc(width * factor)

  if (width <= 1024) {
    return { width: 1000, height: 640 }
  }
  if (width <= 1280) {
    return { width: ratio(0.9), height: 640 }
  }
  if (width <= 1440) {
    return { width: ratio(0.9), height: 720 }
  }
  if (width <= 1680) {
    return { width: Math.min(ratio(0.9), 1440), height: 800 }
  }
  return { width: ratio(0.8), height: Math.trunc(height * 0.8) }
}

/**
 * 本次开多大：有历史尺寸且装得进当前屏幕就用它（语雀 mainWindowSize 的同判据），
 * 否则回落到分档默认。换显示器/分辨率变大屏时历史尺寸可能超出工作区，弃用。
 */
const resolveInitialWindowBounds = (): WindowBounds => {
  const fallback = computeDefaultWindowSize()
  const saved = getSavedWindowBounds()
  if (!saved) {
    return fallback
  }

  const display = screen.getDisplayMatching({
    x: saved.x ?? 0,
    y: saved.y ?? 0,
    width: saved.width,
    height: saved.height,
  })

  if (display.workAreaSize.width < saved.width || display.workAreaSize.height < saved.height) {
    return fallback
  }

  return { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
}

interface CreateWindowOptions {
  /** SPA 内部路由；空串为主窗口。 */
  targetPath?: string
  /** 覆盖默认尺寸（辅助窗口用，不参与几何持久化）。 */
  size?: { width: number; height: number }
  minWidth?: number
  minHeight?: number
  title?: string
}

const createWindow = (options: CreateWindowOptions = {}) => {
  const isMainWindow = !options.targetPath
  const initialBounds = resolveInitialWindowBounds()
  const win = new BrowserWindow({
    x: isMainWindow ? initialBounds.x : undefined,
    y: isMainWindow ? initialBounds.y : undefined,
    width: options.size?.width ?? initialBounds.width,
    height: options.size?.height ?? initialBounds.height,
    minWidth: options.minWidth ?? WINDOW_MIN_WIDTH,
    minHeight: options.minHeight ?? WINDOW_MIN_HEIGHT,
    title: options.title ?? "知识库",
    show: false,
    backgroundColor: "#f8faf8",
    ...(HIDDEN_TITLE_BAR ? { titleBarStyle: "hidden" as const } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 只记主窗口几何（辅助窗口尺寸是产品定值，写进去会污染恢复值）：
  // resize/move 连发去抖后再写；最大化/全屏态不记（还原时会失真）
  let persistTimer: NodeJS.Timeout | null = null
  const persistBounds = () => {
    if (!isMainWindow) {
      return
    }
    if (win.isMaximized() || win.isFullScreen()) {
      return
    }
    const bounds = win.getBounds()
    saveWindowBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
  }
  const schedulePersist = () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(persistBounds, 400)
  }
  win.on("resize", schedulePersist)
  win.on("move", schedulePersist)
  win.on("close", () => {
    if (persistTimer) {
      clearTimeout(persistTimer)
    }
    persistBounds()
  })

  if (isMainWindow) {
    mainWindow = win
    win.on("closed", () => {
      if (mainWindow === win) {
        mainWindow = null
      }
    })
  }

  win.on("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(createWindowOpenHandler(win))

  const targetPath = options?.targetPath ?? ""
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    // 开发模式：加载 electron-vite 渲染层开发服务器
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${targetPath}`)
  } else {
    // 生产模式：加载本地 app:// 协议
    void win.loadURL(`app://${APP_PROTOCOL_HOST}${targetPath}`)
  }

  return win
}

/**
 * 允许作为 SPA 内部路由加载的路径：必须以 `/` 开头，且不含协议、
 * 用户信息或空白字符，防止把任意字符串拼进 app:// 协议导致越权加载。
 */
const INTERNAL_PATH_PATTERN = /^\/[A-Za-z0-9/:_-]*$/

/**
 * 校验并归一化渲染层请求的 SPA 内部路径，非法时返回 null。
 */
const sanitizeInternalPath = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!INTERNAL_PATH_PATTERN.test(trimmed)) {
    return null
  }

  return trimmed
}

/**
 * 聚焦主窗口（不存在则重建）。
 *
 * 必须先 show 再 focus：应用被 ⌘H 隐藏时窗口仍在但不可见，只调 focus() 唤不出来
 * （全局快捷键「打开知识库主窗口」与托盘点击都走这条路）——语雀同写法是
 * `e.isVisible() || e.show()`。
 */
const focusMainWindow = () => {
  const win =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item !== settingsWindow)

  if (win) {
    if (win.isMinimized()) {
      win.restore()
    }
    if (!win.isVisible()) {
      win.show()
    }
    win.focus()
    return
  }

  createWindow()
}

/**
 * 偏好设置窗口尺寸与最小尺寸。
 *
 * 语雀是在主窗口内整页替换 `/setting`（实测：点「设置…」窗口列表不变），
 * 本仓按产品决定改为**独立窗口**——主窗口保持 1080 最小宽，设置窗自带 720 最小宽，
 * 于是「设置页想要窄」不再需要临时放宽主窗口最小宽那套补丁。
 * 默认 830×768：内容列 780 + 两侧内缩，正好是语雀用户常见的窗口宽度。
 */
const SETTINGS_WINDOW_SIZE = { width: 830, height: 768 }

/**
 * 打开（或聚焦已存在的）偏好设置窗口——菜单、托盘与侧栏入口共用。
 * 单例：重复打开只把它唤到前台，不再开第二个。
 */
const openSettingsWindow = () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (!settingsWindow.isVisible()) {
      settingsWindow.show()
    }
    settingsWindow.focus()
    return
  }

  settingsWindow = createWindow({
    targetPath: "/settings",
    size: SETTINGS_WINDOW_SIZE,
    minWidth: 720,
    minHeight: 640,
    title: "偏好设置",
  })

  settingsWindow.on("closed", () => {
    settingsWindow = null
  })
}

/**
 * 向全部渲染层窗口广播事件（托盘菜单等主进程动作）。
 */
const broadcastToRenderer = (channel: string, payload?: unknown) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

/**
 * 托盘：常驻菜单栏，提供打开窗口 / 快捷导航 / 退出。
 *
 * 托盘创建失败（图标加载、系统托盘不可用等）不应阻塞主窗口启动，
 * 因此整体 try/catch 降级为仅记日志。
 */
const createTray = () => {
  try {
    const iconPath = path.join(app.getAppPath(), "build", "icon.icns")
    const sourceIcon = nativeImage.createFromPath(iconPath)
    // icns 体积大，缩小到托盘尺寸；加载失败时退化为空图（macOS 仍会显示占位点）
    const icon = sourceIcon.isEmpty() ? sourceIcon : sourceIcon.resize({ width: 18, height: 18 })

    tray = new Tray(icon)
    tray.setToolTip("知识库")

    const menu = Menu.buildFromTemplate([
      { label: "打开知识库", click: () => focusMainWindow() },
      { label: "开始页", click: () => broadcastToRenderer("xiaoye:tray-command", "navigate-start") },
      { label: "最近访问", click: () => broadcastToRenderer("xiaoye:tray-command", "navigate-recent") },
      { type: "separator" },
      preferencesMenuItem(),
      { label: "退出知识库", click: () => app.quit() },
    ])
    tray.setContextMenu(menu)

    // macOS 点击托盘图标也打开窗口（与语雀行为一致）
    tray.on("click", () => focusMainWindow())
  } catch (error) {
    console.warn("[xiaoye] 托盘创建失败（不影响主窗口）：", error)
  }
}

/**
 * 托盘显隐（设置页「其他设置 → 在状态栏中显示图标」）。
 *
 * Electron 的 Tray 没有 setVisible——关闭即 destroy、打开即重建，
 * 所以托盘生命周期留在本文件，desktop-settings 只下达指令。
 */
const setTrayVisible = (visible: boolean): boolean => {
  if (visible) {
    if (!tray) {
      createTray()
    }
    return !!tray
  }

  tray?.destroy()
  tray = null
  return true
}

/**
 * 应用启动引导：协议注册、IPC、菜单与窗口。
 */
const bootstrap = () => {
  // 应用名用于菜单与关于面板显示。注意：userData 目录名取的是 package.json 的
  // name（实测 ~/Library/Application Support/xiaoye），setName 改不了它——
  // 排查 config.json / desktop-settings.json 落点时别按「知识库」去找。
  app.setName("知识库")

  const serverBaseUrl = resolveServerBaseUrl()
  const webBaseUrl = resolveWebBaseUrl(serverBaseUrl)

  // 通过环境变量注入 sandbox preload（渲染层进程启动时同步可读）
  process.env.XIAOYE_SERVER_BASE_URL = serverBaseUrl
  process.env.XIAOYE_WEB_BASE_URL = webBaseUrl

  ipcMain.handle("xiaoye:get-config", () => ({
    serverBaseUrl,
    webBaseUrl,
    platform: process.platform,
    appVersion: app.getVersion(),
  }))

  // 文档「在新窗口打开」：校验路径后新开一个渲染窗口加载目标 SPA 路由
  ipcMain.handle("xiaoye:open-document-window", (_event, payload: { path?: unknown }) => {
    const targetPath = sanitizeInternalPath(payload?.path)
    if (targetPath === null) {
      return { opened: false, reason: "invalid-path" }
    }

    createWindow({ targetPath })
    return { opened: true }
  })

  // 系统通知（macOS 通知中心）：渲染层在收到新通知时调用
  ipcMain.handle("xiaoye:notify", (_event, payload: { title?: unknown; body?: unknown }) => {
    if (!Notification.isSupported()) {
      return { shown: false, reason: "unsupported" }
    }

    const title = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "知识库"
    const body = typeof payload?.body === "string" ? payload.body : ""
    console.log(`[xiaoye] 系统通知 -> ${title} | ${body}`)
    new Notification({ title, body }).show()
    return { shown: true }
  })

  // 侧栏「偏好设置」入口：桌面端开独立窗口（Web 端由渲染层 window.open）
  ipcMain.handle("xiaoye:open-settings-window", () => {
    openSettingsWindow()
    return { opened: true }
  })

  // 偏好设置的桌面能力（开机自启 / 代理 / 状态栏图标 / 全局快捷键 / 外链）
  registerDesktopSettingsIpc({
    setTrayVisible,
    focusMainWindow,
    broadcastToRenderer,
  })

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
    }
  })

  // protocol.handle 与 session 均要求在 app ready 之后调用
  app.whenReady().then(() => {
    registerAppProtocol(serverBaseUrl)
    attachDownloadHandler()
    // 先回放偏好设置快照：状态栏图标开关决定要不要建托盘
    restoreDesktopSettings()
    buildAppMenu()

    if (isTrayVisibleRequested()) {
      createTray()
    }
    createWindow()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

// 全局快捷键必须在退出前注销，否则 macOS 下重启会短暂报「已被占用」
app.on("will-quit", () => {
  teardownDesktopSettings()
})

// macOS：关窗不退出，点击 Dock 图标重建窗口
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

// 单实例锁：重复启动时聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  bootstrap()
}

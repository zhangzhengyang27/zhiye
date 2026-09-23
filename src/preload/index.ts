/**
 * 知识库桌面端 preload 脚本（sandbox + contextIsolation）。
 *
 * 以同步方式向渲染层暴露最小桥接 API：
 * - 服务器地址在主进程创建窗口前写入环境变量，preload 加载时同步读取，
 *   渲染层的请求封装无需任何异步改造即可拿到绝对后端地址。
 * - `getConfig` 为兜底的异步通道，返回完整配置。
 * - `openDocumentInNewWindow` / `notify` / `onTrayCommand` 为桌面原生能力桥接：
 *   文档新窗口、系统通知、托盘菜单广播。
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

/**
 * 主进程经 webPreferences.additionalArguments 传入的本窗口角色标记
 * （主窗=1，文档/设置等子窗=0）。进程级 env 无法区分多窗口，只能走 argv。
 */
const isMainWindowFlag = process.argv
  .find((arg) => arg.startsWith("--xiaoye-is-main-window="))
  ?.split("=")[1]
  ?.trim()

/** 独立登录窗标记（login-window.ts 经 additionalArguments 注入，仅登录窗为 1）。 */
const isLoginWindowFlag = process.argv
  .find((arg) => arg.startsWith("--xiaoye-is-login-window="))
  ?.split("=")[1]
  ?.trim()

/** 订阅主进程广播的通用壳：只透传字符串/白名单形状，返回取消订阅函数。 */
const subscribeBroadcast = (channel: string, callback: (payload: unknown) => void) => {
  const listener = (_event: IpcRendererEvent, payload: unknown) => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

/**
 * 注入渲染层的桌面端桥接 API。
 */
const desktopApi = {
  isDesktop: true as const,
  /** 后端服务地址（已归一化，无末尾斜杠）。 */
  getServerBaseUrl: (): string => process.env.XIAOYE_SERVER_BASE_URL?.trim() ?? "",
  /** 网页版站点地址（分享链接使用，已归一化，无末尾斜杠）。 */
  getWebBaseUrl: (): string => process.env.XIAOYE_WEB_BASE_URL?.trim() ?? "",
  /** 操作系统平台标识。 */
  platform: process.platform,
  /** 主进程是否给本窗口隐藏了原生标题栏（渲染层据此留顶部拖拽带、列首行下移）。 */
  hiddenTitleBar: process.env.XIAOYE_HIDDEN_TITLE_BAR === "1",
  /** 本窗口是否主窗口（偏好设置的启动同步只由主窗执行，避免多窗口重复 IPC）。 */
  isMainWindow: isMainWindowFlag !== "0",
  /** 本窗口是否独立登录窗（登录/跳转行为据此分叉；Web 端恒 false）。 */
  isLoginWindow: isLoginWindowFlag === "1",
  /** 兜底异步通道：返回主进程解析后的完整配置。 */
  getConfig: () => ipcRenderer.invoke("xiaoye:get-config"),
  /**
   * 在应用内新窗口打开 SPA 内部路由（如 `/knowledge/:kbId/doc/:docId`）。
   * 仅接受 `/` 开头的内部路径；主进程会再次校验。
   */
  openDocumentInNewWindow: (targetPath: string) =>
    ipcRenderer.invoke("xiaoye:open-document-window", { path: targetPath }),
  /** 发送系统通知（macOS 通知中心）。 */
  notify: (title: string, body: string) => ipcRenderer.invoke("xiaoye:notify", { title, body }),
  /**
   * 订阅托盘菜单广播（`navigate-start` / `navigate-notes`）。
   * 返回取消订阅函数。
   */
  onTrayCommand: (callback: (command: string) => void) => {
    const listener = (_event: IpcRendererEvent, command: unknown) => {
      if (typeof command === "string") {
        callback(command)
      }
    }
    ipcRenderer.on("xiaoye:tray-command", listener)
    return () => {
      ipcRenderer.removeListener("xiaoye:tray-command", listener)
    }
  },
  /**
   * 订阅应用菜单命令广播（`find-in-page` / `doc-history` / `presentation-mode`）。
   * 主进程应用菜单的对应项发出；尚未接入的命令不会触发。
   */
  onInAppMenu: (callback: (command: string) => void) =>
    subscribeBroadcast("xiaoye:in-app-menu", (payload) => {
      if (typeof payload === "string") {
        callback(payload)
      }
    }),
  /** 订阅主进程 toast 文案（子窗口超限「最多同时打开 5 个窗口」等）。 */
  onToast: (callback: (message: string) => void) =>
    subscribeBroadcast("xiaoye:toast", (payload) => {
      if (typeof payload === "string") {
        callback(payload)
      }
    }),
  /** 打开（或聚焦）偏好设置独立窗口——侧栏入口用，与菜单/托盘走同一个入口函数。 */
  openSettingsWindow: () => ipcRenderer.invoke("xiaoye:open-settings-window"),
  /**
   * 偏好设置的桌面能力通道。每条都是具名方法 + 固定 channel，
   * 不做通用 invoke 透传（否则渲染层可借它向任意 channel 发消息）。
   */
  getOpenAtLogin: () => ipcRenderer.invoke("xiaoye:get-open-at-login"),
  setOpenAtLogin: (enabled: boolean) => ipcRenderer.invoke("xiaoye:set-open-at-login", enabled),
  setProxySettings: (settings: {
    enable: boolean
    mode: "HTTP" | "PAC"
    type: "HTTP" | "SOCKS4" | "SOCKS5"
    url: string
  }) => ipcRenderer.invoke("xiaoye:set-proxy-settings", settings),
  setTrayVisible: (visible: boolean) => ipcRenderer.invoke("xiaoye:set-tray-visible", visible),
  /** 注册/取消（value 传 `NO_SHORTCUT`）一个全局快捷键；返回 false 表示系统已占用。 */
  setGlobalShortcut: (payload: { key: string; value: string }) =>
    ipcRenderer.invoke("xiaoye:set-global-shortcut", payload),
  openExternal: (url: string) => ipcRenderer.invoke("xiaoye:open-external", url),
  /**
   * 桌面端锁定（#27）：密码哈希比对全在主进程，渲染层只拿状态与结果。
   * 通道语义见 src/main/desktop-lock.ts；verifyLockPassword 供锁定窗 /lock 路由调用。
   */
  getLockState: () => ipcRenderer.invoke("xiaoye:lock:get-state"),
  setLockPassword: (payload: { currentPassword?: string; newPassword: string }) =>
    ipcRenderer.invoke("xiaoye:lock:set-password", payload),
  clearLockPassword: (currentPassword: string) =>
    ipcRenderer.invoke("xiaoye:lock:clear-password", currentPassword),
  verifyLockPassword: (password: string) =>
    ipcRenderer.invoke("xiaoye:lock:verify-password", password),
  setAutoLock: (payload: { enabled: boolean; delayMinutes: number }) =>
    ipcRenderer.invoke("xiaoye:lock:set-auto-lock", payload),
  lockNow: () => ipcRenderer.invoke("xiaoye:lock:lock-now"),
  unlockAfterLogout: () => ipcRenderer.invoke("xiaoye:lock:unlock-after-logout"),
  /**
   * 桌面端安全存储（G4）：加密、落盘与损坏兜底全在主进程
   * （src/main/secure-store.ts），渲染层只传存储键与明文载荷。
   */
  secureStoreSet: (storageKey: string, plaintext: string) =>
    ipcRenderer.invoke("xiaoye:secure-store:set", storageKey, plaintext),
  secureStoreGet: (storageKey: string) => ipcRenderer.invoke("xiaoye:secure-store:get", storageKey),
  secureStoreDelete: (storageKey: string) =>
    ipcRenderer.invoke("xiaoye:secure-store:delete", storageKey),
  /**
   * 独立登录窗（窗口化登录）流程。通道语义见 src/main/login-window.ts：
   * - loginWindowReady：登录窗 hydration 后确认未登录，请主进程亮窗；
   * - notifyAuthSessionEstablished：登录/注册成功或自动登录，主进程关登录窗
   *   开主窗（redirectPath 为回跳目标）；
   * - openLoginWindow：内容窗会话失效，唤起登录窗；
   * - logoutDesktop：退出登录，销毁内容窗回到登录窗。
   */
  loginWindowReady: () => ipcRenderer.invoke("xiaoye:login-window:ready"),
  notifyAuthSessionEstablished: (redirectPath?: string) =>
    ipcRenderer.invoke("xiaoye:auth:session-established", { redirectPath }),
  openLoginWindow: (redirectPath?: string) =>
    ipcRenderer.invoke("xiaoye:auth:open-login-window", { redirectPath }),
  logoutDesktop: () => ipcRenderer.invoke("xiaoye:auth:logout-desktop"),
}

contextBridge.exposeInMainWorld("xiaoyeDesktop", desktopApi)

export type XiaoyeDesktopApi = typeof desktopApi

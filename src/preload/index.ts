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
   * 订阅托盘菜单广播（`navigate-start` / `navigate-recent`）。
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
}

contextBridge.exposeInMainWorld("xiaoyeDesktop", desktopApi)

export type XiaoyeDesktopApi = typeof desktopApi

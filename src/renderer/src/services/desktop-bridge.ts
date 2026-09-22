/**
 * 桌面端（Electron）桥接层：检测运行环境并解析双端差异的地址配置。
 *
 * - Web 端：`window.xiaoyeDesktop` 不存在，所有解析回落到 `import.meta.env`
 *   与 `window.location.origin`，行为与纯 Web 部署完全一致。
 * - 桌面端：通过 preload 注入的桥接对象同步取得后端与网页版站点地址。
 */

/**
 * 桥接对象形状以 `@/types/desktop-bridge` 的 `XiaoyeDesktopApi` 为唯一事实源
 * （本文件曾经自带局部声明，迁移期已收编；注意 src/preload/index.ts 当前仍是最小桥，
 * 后加入的成员（secureStore/lock 族等）在 preload 补齐前运行期不可用，
 * 调用方须按「桥缺失」降级处理，不得假设成员存在）。
 */
import type { XiaoyeDesktopApi } from "@/types/desktop-bridge"

declare global {
  interface Window {
    xiaoyeDesktop?: XiaoyeDesktopApi
  }
}

/** 桌面端后端兜底地址：本地 xiaoye-server（与主进程 DEFAULT_SERVER_BASE_URL 一致）。 */
const DEFAULT_DESKTOP_SERVER_BASE_URL = "http://localhost:3200"

/**
 * 去掉地址末尾的 `/` 与 `/api` 后缀，归一化为 origin 形式。
 */
const normalizeOrigin = (url: string) =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/, "")

/**
 * 当前是否运行在 Electron 桌面端。
 */
export const isDesktopApp = (): boolean => typeof window !== "undefined" && !!window.xiaoyeDesktop

/**
 * 解析后端服务 origin（不含 `/api` 后缀）。
 *
 * Web 端一般不需要此函数（请求走相对路径 `/api`），主要用于桌面端。
 */
export const resolveServerOriginUrl = (): string => {
  const desktopBase = window.xiaoyeDesktop?.getServerBaseUrl()?.trim()
  if (desktopBase) {
    return normalizeOrigin(desktopBase)
  }
  // Web 部署回落当前站点 origin（与 /api 同源代理），避免连到 localhost:3200
  if (!isDesktopApp() && typeof window !== "undefined") {
    return normalizeOrigin(window.location.origin)
  }
  return normalizeOrigin(DEFAULT_DESKTOP_SERVER_BASE_URL)
}

/**
 * 解析接口请求基础地址。
 *
 * - 桌面端：`{serverOrigin}/api`（fetch 直接指向后端，无 dev 代理）。
 * - Web 端：保持 `VITE_ELEMENTS_API_BASE_URL`（缺省 `/api` 相对路径）不变。
 */
export const resolveApiBaseUrl = (): string => {
  if (isDesktopApp()) {
    return `${resolveServerOriginUrl()}/api`
  }

  return (import.meta.env.VITE_ELEMENTS_API_BASE_URL?.trim() || "/api").replace(/\/+$/, "")
}

/** 偏好设置新窗口的特性串，与主进程 SETTINGS_WINDOW_SIZE 同尺寸。 */
const SETTINGS_WINDOW_FEATURES = "width=830,height=768,menubar=no,toolbar=no,location=no"

/**
 * 打开偏好设置——桌面端与 Web 端共用这一个入口。
 *
 * 桌面端交给主进程开**独立窗口**（语雀是在主窗口内整页替换，本仓按产品决定改开新窗，
 * 于是设置页想要窄不再需要临时放宽主窗口最小宽那套补丁）；Web 端开新窗口/标签，
 * 被拦截时退回当前页导航，至少不能点了没反应。
 */
export const openSettingsWindow = (): void => {
  if (isDesktopApp()) {
    void window.xiaoyeDesktop?.openSettingsWindow()
    return
  }

  const opened = window.open("/settings", "kb-settings", SETTINGS_WINDOW_FEATURES)
  if (!opened) {
    window.location.assign("/settings")
  }
}

/**
 * 解析网页版站点 origin（构造对外分享链接时使用）。
 *
 * - Web 端：`window.location.origin`（与历史行为一致）。
 * - 桌面端：主进程下发的 webBaseUrl；未配置时与后端同源。
 */
export const resolveWebBaseUrl = (): string => {
  if (isDesktopApp()) {
    const webBase = window.xiaoyeDesktop?.getWebBaseUrl()?.trim()
    return webBase ? normalizeOrigin(webBase) : resolveServerOriginUrl()
  }

  return typeof window === "undefined" ? "" : window.location.origin
}

/**
 * 桌面端安全存储（G4）的转发层结果：value 为 null 时 reason 说明原因。
 * reason 口径——`no-desktop-bridge` 非 Electron 环境 / 桥上无该方法；
 * `unavailable` 主进程系统级加密不可用（Linux 缺 keyring 等）；
 * `not-found` 键存在但无记录；`error` 其余失败（IO 异常等）。
 */
export interface DesktopSecureStoreReadOutcome {
  value: string | null
  reason?: "no-desktop-bridge" | "unavailable" | "not-found" | "error"
}

/** 桌面端安全存储写入/删除的转发层结果。 */
export interface DesktopSecureStoreMutationOutcome {
  ok: boolean
  reason?: "no-desktop-bridge" | "unavailable" | "error"
}

/**
 * 读取主进程安全存储的一条明文载荷（画板 AI 密钥槽位用）。
 *
 * 不可用环境（Web 端 / 桥缺失）返回 `{ value: null, reason: "no-desktop-bridge" }`，
 * 调用方据 reason 回退本地实现，而不是盲目当「无记录」。
 */
export const readDesktopSecureStore = async (
  storageKey: string,
): Promise<DesktopSecureStoreReadOutcome> => {
  const bridge = window.xiaoyeDesktop
  if (!bridge?.secureStoreGet) {
    return { value: null, reason: "no-desktop-bridge" }
  }

  try {
    const result = await bridge.secureStoreGet(storageKey)
    if (!result.ok) {
      return { value: null, reason: result.reason === "unavailable" ? "unavailable" : "error" }
    }
    return { value: result.value ?? null, reason: result.value == null ? "not-found" : undefined }
  } catch {
    return { value: null, reason: "error" }
  }
}

/** 向主进程安全存储写入一条明文载荷（主进程负责 safeStorage 加密与落盘）。 */
export const writeDesktopSecureStore = async (
  storageKey: string,
  plaintext: string,
): Promise<DesktopSecureStoreMutationOutcome> => {
  const bridge = window.xiaoyeDesktop
  if (!bridge?.secureStoreSet) {
    return { ok: false, reason: "no-desktop-bridge" }
  }

  try {
    const result = await bridge.secureStoreSet(storageKey, plaintext)
    return result.ok
      ? { ok: true }
      : { ok: false, reason: result.reason === "unavailable" ? "unavailable" : "error" }
  } catch {
    return { ok: false, reason: "error" }
  }
}

/** 从主进程安全存储删除一条记录（幂等：键不存在也返回 ok）。 */
export const removeDesktopSecureStore = async (
  storageKey: string,
): Promise<DesktopSecureStoreMutationOutcome> => {
  const bridge = window.xiaoyeDesktop
  if (!bridge?.secureStoreDelete) {
    return { ok: false, reason: "no-desktop-bridge" }
  }

  try {
    const result = await bridge.secureStoreDelete(storageKey)
    return result.ok
      ? { ok: true }
      : { ok: false, reason: result.reason === "unavailable" ? "unavailable" : "error" }
  } catch {
    return { ok: false, reason: "error" }
  }
}

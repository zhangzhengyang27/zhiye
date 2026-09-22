/**
 * 偏好设置的渲染层状态与落盘。
 *
 * 事实源分工（与主进程 `src/main/desktop-settings.ts` 对应）：
 * - 值一律存渲染层 localStorage（一项一 key，对齐语雀「一个 key 一个 json 文件」），
 *   这样 Web 端与桌面端共用同一份 UI 状态；
 * - 桌面必需项（开机自启、代理、状态栏图标、globalShortcut 族快捷键）在写入时
 *   同步下发主进程生效；主进程另存快照只为下次启动提前生效，回灌由本模块负责；
 * - 开机自启的真值在操作系统侧，初始化时向主进程读，不信任本地值。
 */
import { reactive, readonly } from "vue"
import type { XiaoyeDesktopApi } from "@/types/desktop-bridge"
import {
  DEFAULT_PROXY_SETTINGS,
  NO_SHORTCUT,
  SETTINGS_STORAGE_KEYS,
  SHORTCUT_ROWS,
  type ProxySettings,
} from "@/constants/desktop-settings"
import { isDesktopApp } from "@/services/desktop-bridge"

export interface DesktopSettingsState {
  /** 颜色主题不在此列：它的事实源是 useThemeMode（与 index.html 防闪烁脚本共用
   *  vueuse-color-scheme 一个 key），再存一份只会两边漂移。 */
  locale: string
  openAtLogin: boolean
  /** 快捷键标识 → accelerator（或 NO_SHORTCUT 哨兵）。 */
  shortcuts: Record<string, string>
  proxy: ProxySettings
  trayVisible: boolean
  isBetaVersion: boolean
}

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw) as T
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 无痕模式等场景写入失败：本次会话内仍然生效，不阻塞用户操作 */
  }
}

/** 出厂态 + 本地已存的自定义快捷键（未覆盖的项回落默认）。 */
const loadShortcuts = (): Record<string, string> => {
  const stored = readJson<Record<string, string>>(SETTINGS_STORAGE_KEYS.customShortcut, {})
  const merged: Record<string, string> = {}

  for (const row of SHORTCUT_ROWS) {
    const value = stored[row.key]
    merged[row.key] = typeof value === "string" && value ? value : row.defaultShortcut
  }

  return merged
}

const state = reactive<DesktopSettingsState>({
  locale: readJson<string>(SETTINGS_STORAGE_KEYS.locale, "zh-CN"),
  openAtLogin: false,
  shortcuts: loadShortcuts(),
  proxy: { ...DEFAULT_PROXY_SETTINGS, ...readJson<Partial<ProxySettings>>(SETTINGS_STORAGE_KEYS.proxy, {}) },
  trayVisible: readJson<boolean>(SETTINGS_STORAGE_KEYS.trayStatus, true),
  isBetaVersion: readJson<boolean>(SETTINGS_STORAGE_KEYS.isBetaVersion, false),
})

/**
 * Web 端没有 Electron 主进程，开机自启 / 代理 / 状态栏图标 / 全局快捷键族无处生效，
 * 设置页据此禁用并标注「仅桌面端可用」。运行期不会切换，故取普通布尔。
 */
const desktopFeaturesUnavailable = !isDesktopApp()

let bootstrapped = false

/**
 * 启动同步：向主进程取开机自启真值，并把本地已存的全局快捷键重新注册一遍
 * （localStorage 才是事实源——主进程快照可能在别的窗口或清缓存后与本地不一致）。
 *
 * 只在主窗口执行（主进程创建窗口前经环境变量下发身份，preload 透传为
 * isMainWindow）：设置窗、锁定窗与文档子窗各自跑一遍只会把同一组 IPC
 * 重放 N 次，还可能与设置页的写入动作互相竞争。
 */
const bootstrap = async () => {
  if (bootstrapped || !isDesktopApp()) {
    return
  }
  bootstrapped = true

  // services/desktop-bridge.ts 的 window 声明仍是迁移前的旧 Bridge 接口（缺 isMainWindow），
  // 按事实源（@/types/desktop-bridge）形状断言；该处迁移回 XiaoyeDesktopApi 后可去掉
  const desktop = window.xiaoyeDesktop as XiaoyeDesktopApi | undefined
  if (!desktop?.isMainWindow) {
    return
  }

  try {
    state.openAtLogin = await desktop.getOpenAtLogin()
  } catch {
    /* 读不到就保持关闭态，不猜测 */
  }

  for (const row of SHORTCUT_ROWS) {
    if (row.type !== "globalShortcut" || row.unavailable) {
      continue
    }
    await desktop.setGlobalShortcut({ key: row.key, value: state.shortcuts[row.key] ?? NO_SHORTCUT }).catch(() => false)
  }

  // 代理与状态栏图标：主进程启动时已按快照应用，这里只在值与快照可能不一致时补一次
  await desktop
    .setProxySettings({ ...state.proxy })
    .then(() => desktop.setTrayVisible(state.trayVisible))
    .catch(() => false)
}

/** 写快捷键；返回 false 表示该组合键已被系统占用，调用方保持原值并提示。 */
const setShortcut = async (key: string, value: string): Promise<boolean> => {
  const row = SHORTCUT_ROWS.find(item => item.key === key)
  if (!row || row.unavailable) {
    return false
  }

  if (row.type === "globalShortcut" && isDesktopApp()) {
    const ok = await window.xiaoyeDesktop?.setGlobalShortcut({ key, value }).catch(() => false)
    if (!ok) {
      return false
    }
  }

  state.shortcuts = { ...state.shortcuts, [key]: value }
  writeJson(SETTINGS_STORAGE_KEYS.customShortcut, state.shortcuts)
  return true
}

const resetShortcut = (key: string) => {
  const row = SHORTCUT_ROWS.find(item => item.key === key)
  return row ? setShortcut(key, row.defaultShortcut) : Promise.resolve(false)
}

const setProxy = async (settings: ProxySettings): Promise<boolean> => {
  if (isDesktopApp()) {
    const ok = await window.xiaoyeDesktop?.setProxySettings({ ...settings }).catch(() => false)
    if (!ok) {
      return false
    }
  }

  state.proxy = { ...settings }
  writeJson(SETTINGS_STORAGE_KEYS.proxy, state.proxy)
  return true
}

const setOpenAtLogin = async (enabled: boolean): Promise<boolean> => {
  if (!isDesktopApp()) {
    return false
  }

  const ok = await window.xiaoyeDesktop?.setOpenAtLogin(enabled).catch(() => false)
  if (!ok) {
    return false
  }

  state.openAtLogin = enabled
  writeJson(SETTINGS_STORAGE_KEYS.openAtLogin, enabled)
  return true
}

const setTrayVisible = async (visible: boolean): Promise<boolean> => {
  if (isDesktopApp()) {
    const ok = await window.xiaoyeDesktop?.setTrayVisible(visible).catch(() => false)
    if (!ok) {
      return false
    }
  }

  state.trayVisible = visible
  writeJson(SETTINGS_STORAGE_KEYS.trayStatus, visible)
  return true
}

/** 外链统一走系统浏览器（桌面）或新标签（Web）。 */
const openExternal = (url: string) => {
  if (!url) {
    return
  }

  if (isDesktopApp()) {
    void window.xiaoyeDesktop?.openExternal(url)
    return
  }

  window.open(url, "_blank", "noopener")
}

/**
 * 应用级单例：设置页写、主题与快捷键消费方读，多处调用共享同一份 state。
 */
export function useDesktopSettings() {
  void bootstrap()

  return {
    settings: readonly(state),
    desktopFeaturesUnavailable,
    setOpenAtLogin,
    setProxy,
    setShortcut,
    resetShortcut,
    setTrayVisible,
    openExternal,
  }
}

/**
 * 非组件环境（如全局快捷键监听）读取当前生效的 mousetrap 族快捷键。
 */
export const currentInAppShortcuts = () => ({
  createNewDoc: state.shortcuts.createNewDoc ?? "",
  showGlobalSearchModal: state.shortcuts.showGlobalSearchModal ?? "",
})

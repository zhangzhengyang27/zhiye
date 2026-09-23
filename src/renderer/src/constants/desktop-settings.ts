/**
 * 偏好设置的事实源常量。
 *
 * 逐表对齐语雀桌面端 `app/main/isomorphic/constants/{color-theme,shortcut,proxy,storage}.js`
 * 与 `build/renderer/76858.js`（设置页组件本体）——枚举值、默认值、localStorage key 名
 * 都照抄，只有文案里的产品名换成本项目的「知叶」。
 */

/** 产品名称：语雀原文案里硬编码「语雀」的几处（自启、主窗口、状态栏）统一由此替换。 */
export const PRODUCT_NAME = "知叶"

/** 设置页 localStorage key（一个 key 一项，与语雀「一个 key 一个 json 文件」同粒度）。 */
export const SETTINGS_STORAGE_KEYS = {
  locale: "locale",
  openAtLogin: "openAtLogin",
  /** 注意语雀实际落盘用的就是这个带连字符的名字，其常量表里的 custom-keyboard-shortcut 是死值。 */
  customShortcut: "custom-short-cut",
  proxy: "proxy",
  trayStatus: "tray_status",
  isBetaVersion: "is_beta_version",
} as const

/** 颜色主题另住 `vueuse-color-scheme`（index.html 的防闪烁脚本读的就是它），不在此列。 */
export type ColorThemeOption = "light" | "dark" | "system"

export const COLOR_THEME_OPTIONS: { label: string; value: ColorThemeOption }[] = [
  { label: "暗黑模式", value: "dark" },
  { label: "浅色模式", value: "light" },
  { label: "跟随系统", value: "system" },
]

/** 出厂默认：语雀 init/app.js 在值为空时回落 LIGHT。 */
export const DEFAULT_COLOR_THEME: ColorThemeOption = "light"

export const LOCALE_OPTIONS = [
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en-US" },
]

/** 「取消快捷键」的哨兵值；显示时回落成占位文案「设置快捷键」。 */
export const NO_SHORTCUT = "NO_SHORTCUT"

type ShortcutType = "globalShortcut" | "mousetrap"

export interface ShortcutRow {
  key: string
  label: string
  type: ShortcutType
  defaultShortcut: string
  /** 本仓暂未开放该能力（AI 独立框、锁屏窗口），条目照抄但只读置灰。 */
  unavailable?: boolean
}

/** 设置页暴露的 6 条（顺序与语雀一致）；其余快捷键只住菜单，不进设置页。 */
export const SHORTCUT_ROWS: ShortcutRow[] = [
  {
    key: "openMainWindow",
    label: `打开${PRODUCT_NAME}主窗口`,
    type: "globalShortcut",
    defaultShortcut: "CommandOrControl+Alt+Y",
  },
  {
    key: "openMiniWindow",
    label: "全局唤起小记新建窗口",
    type: "globalShortcut",
    defaultShortcut: "CommandOrControl+Shift+Y",
  },
  {
    key: "createNewDoc",
    label: "新建文档",
    type: "mousetrap",
    defaultShortcut: "CommandOrControl+N",
  },
  {
    key: "showGlobalSearchModal",
    label: "全局搜索",
    type: "mousetrap",
    defaultShortcut: "CommandOrControl+J",
  },
  {
    key: "lockWindow",
    label: "锁定桌面端",
    type: "globalShortcut",
    defaultShortcut: "CommandOrControl+L",
  },
  {
    key: "openAIWindow",
    label: "打开AI独立框",
    type: "globalShortcut",
    defaultShortcut: "CommandOrControl+Shift+E",
    unavailable: true,
  },
]

/** ⌘, 与 ⌘J 等菜单级默认值（不进设置页，供渲染层兜底绑定引用）。 */
export const MENU_SHORTCUTS = {
  openSetting: "CommandOrControl+,",
} as const

/** 锁定密码长度边界（与主进程 desktop-lock 的 LOCK_PASSWORD_* 同口径）。 */
export const LOCK_PASSWORD_MIN_LENGTH = 4
export const LOCK_PASSWORD_MAX_LENGTH = 32

/** 问题反馈邮箱（占位，待产品定；B4 反馈直达）。 */
export const FEEDBACK_EMAIL = "feedback@example.com"

/** 反馈主题里带上的版本号：构建注入 VITE_APP_VERSION 时常显，否则按 dev 标注。 */
const FEEDBACK_APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev"

/**
 * 组装 mailto 反馈链接：subject 带产品与版本，body 带平台与 UA，便于定位问题环境。
 */
export const buildFeedbackMailto = (): string => {
  const platform = typeof window !== "undefined" ? window.xiaoyeDesktop?.platform : undefined
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  const subject = encodeURIComponent(`${PRODUCT_NAME} 问题反馈（v${FEEDBACK_APP_VERSION}）`)
  const bodyParts = [
    `版本：${FEEDBACK_APP_VERSION}`,
    `平台：${platform ?? (typeof navigator !== "undefined" ? navigator.platform : "Web")}`,
    `User-Agent：${ua}`,
    "",
    "请描述你遇到的问题：",
  ]
  const body = encodeURIComponent(bodyParts.join("\n"))

  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`
}

/**
 * 打开反馈邮件：桌面端经主进程 openExternal（走系统默认邮件客户端；主进程对
 * 非 http(s) 的 mailto 直接拒绝时回落 location.href 交给渲染层协议路由），
 * Web 端直接 location.href。
 */
export const openFeedbackMailto = () => {
  const mailto = buildFeedbackMailto()
  const desktop = typeof window !== "undefined" ? window.xiaoyeDesktop : undefined

  if (desktop?.openExternal) {
    void desktop.openExternal(mailto).then((ok) => {
      if (!ok) {
        window.location.href = mailto
      }
    })
    return
  }

  window.location.href = mailto
}

interface PlatformKeyMap {
  /** KeyboardEvent 属性名 → 展示符号（或 Windows 下的键名）。 */
  glyph: Record<string, string>
  /** KeyboardEvent 属性名 → accelerator 里的规范修饰键名。 */
  accelerator: Record<string, string>
  /** 修饰键采集顺序，决定 ⌘⌥⇧^ 的排列。 */
  metaOrder: ("metaKey" | "altKey" | "shiftKey" | "ctrlKey")[]
  /** 展示串分隔符。 */
  separator: string
  /** accelerator 片段 → 展示符号。 */
  acceleratorToGlyph: Record<string, string>
}

const MAC_MAP: PlatformKeyMap = {
  glyph: { metaKey: "⌘", altKey: "⌥", shiftKey: "⇧", ctrlKey: "^" },
  accelerator: { metaKey: "CommandOrControl", altKey: "Alt", shiftKey: "Shift", ctrlKey: "Ctrl" },
  metaOrder: ["metaKey", "altKey", "shiftKey", "ctrlKey"],
  separator: " ",
  acceleratorToGlyph: {
    CommandOrControl: "⌘",
    CmdOrCtrl: "⌘",
    Command: "⌘",
    Control: "^",
    Ctrl: "^",
    Alt: "⌥",
    Shift: "⇧",
  },
}

/** Windows 与 Linux 共用：Linux 没有 ⌘ 系符号约定，accelerator 里的
    CommandOrControl 在 Linux 即 Ctrl，展示同款键名风格（`Ctrl + Alt + Y`）。 */
const WINDOWS_MAP: PlatformKeyMap = {
  glyph: { ctrlKey: "Ctrl", altKey: "Alt", shiftKey: "Shift" },
  accelerator: { ctrlKey: "CommandOrControl", altKey: "Alt", shiftKey: "Shift" },
  metaOrder: ["ctrlKey", "altKey", "shiftKey"],
  separator: " + ",
  acceleratorToGlyph: {
    CommandOrControl: "Ctrl",
    CmdOrCtrl: "Ctrl",
    Control: "Ctrl",
    Ctrl: "Ctrl",
    Alt: "Alt",
    Shift: "Shift",
  },
}

const currentMap = (): PlatformKeyMap => {
  const platform = typeof window !== "undefined" ? window.xiaoyeDesktop?.platform : undefined
  const fromUserAgent =
    typeof navigator !== "undefined" && /windows|linux/i.test(navigator.userAgent)
  return platform === "win32" || platform === "linux" || (!platform && fromUserAgent)
    ? WINDOWS_MAP
    : MAC_MAP
}

/**
 * accelerator（`CommandOrControl+Alt+Y`）→ 展示串（macOS `⌘ ⌥ Y`、
 * Windows/Linux `Ctrl + Alt + Y`）。
 * 取消态（NO_SHORTCUT）返回空串，由调用方回落占位文案。
 */
export const shortcutToDisplay = (accelerator: string | undefined): string => {
  if (!accelerator || accelerator === NO_SHORTCUT) {
    return ""
  }

  const map = currentMap()
  return accelerator
    .split("+")
    .map((part) => map.acceleratorToGlyph[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join(map.separator)
}

/**
 * keydown 事件 → accelerator；缺修饰键或只按下修饰键时返回 null。
 * 后者由 shortcutModifiersDisplay 单独供显示态使用（语雀同口径：只刷占位、不下发）。
 */
export const keyboardEventToAccelerator = (event: KeyboardEvent): string | null => {
  const map = currentMap()
  const metaKeys = map.metaOrder.filter((name) => event[name])
  const { key } = event

  if (!metaKeys.length || /^(Meta|Control|Alt|Shift)$/.test(key)) {
    return null
  }

  const mainKey = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key
  return [...metaKeys.map((name) => map.accelerator[name]), mainKey].join("+")
}

/** 捕获态下只按了修饰键时的占位显示（`⌘ ⌥` / `Ctrl + Alt`）；无修饰键返回空串。 */
export const shortcutModifiersDisplay = (event: KeyboardEvent): string => {
  const map = currentMap()
  return map.metaOrder
    .filter((name) => event[name])
    .map((name) => map.glyph[name])
    .join(map.separator)
}

export const PROXY_MODE_OPTIONS = [
  { label: "HTTP 代理", value: "HTTP" as const },
  { label: "PAC 代理", value: "PAC" as const },
]

/** 语雀这里直接把枚举值当 label 显示，没有中文翻译——保持原样。 */
export const PROXY_TYPE_OPTIONS = ["HTTP", "SOCKS4", "SOCKS5"] as const

export const DEFAULT_PROXY_SETTINGS = {
  enable: false,
  mode: "HTTP" as const,
  type: "HTTP" as const,
  url: "",
}

/** 代理配置形状（渲染层与主进程共用；DEFAULT_PROXY_SETTINGS 的字面量收窄到此）。 */
export interface ProxySettings {
  enable: boolean
  /** `HTTP` 走 proxyRules，`PAC` 走 pacScript。 */
  mode: "HTTP" | "PAC"
  /** HTTP 模式下的代理协议，体现在下发给主进程的 url 前缀里。 */
  type: "HTTP" | "SOCKS4" | "SOCKS5"
  url: string
}

/**
 * 「关于」分组底部四条链接（语雀取自 appConfig 的 changelog/faq/terms，问题反馈走内部通道）。
 * 本仓尚无对应站点，留空即按「未提供」置灰——不拿语雀地址凑数。
 */
export const ABOUT_LINKS: { key: string; label: string; url: string; tip?: string }[] = [
  { key: "changelog", label: "更新日志", url: "" },
  { key: "faq", label: "常见问题", url: "" },
  {
    key: "feedback",
    label: "问题反馈",
    url: "",
    tip: "反馈前，建议升级到最新版本，问题或许已被修复了哦",
  },
  { key: "terms", label: `${PRODUCT_NAME}服务协议`, url: "" },
]

/** 「更多快捷键」外链（语雀 appConfig.shortcut）。 */
export const SHORTCUT_HELP_URL = ""

/** 「加入内测版体验计划」的了解更多外链（语雀指向其 beta 招募页）。 */
export const BETA_HELP_URL = ""

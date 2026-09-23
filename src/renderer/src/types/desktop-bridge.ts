/**
 * 桌面端桥接 API 的共享类型（preload 注入形状的唯一事实源）。
 *
 * 历史包袱：preload（contextBridge 实现侧）与渲染层 services/desktop-bridge.ts
 * 曾各维护一份接口，早已漂移——渲染层那份缺 lock 族与 onToast 等 9 个成员，
 * 消费端只能双重断言兜底。现统一在此定义，两侧 `import type` 消费：
 * - preload 以它注解 desktopApi 对象字面量（实现即受形状约束，漏改即编译报错）；
 * - 渲染层以它声明 window.xiaoyeDesktop（消费端零断言）。
 *
 * 硬约束：本文件必须保持纯类型、零 import——它同时落在渲染层（DOM lib）与
 * preload（ES2023 + node types）两个 tsconfig 的编译图里，而 preload 构建为
 * cjs，任何运行时代码都会被带进 bundle。事件订阅的内部 listener 形状
 * （IpcRendererEvent 等 electron 类型）留在 preload 实现侧，不进本文件。
 */

/** 主进程 `xiaoye:get-config` 的返回：后端与网页版地址、平台与版本。 */
export interface DesktopRuntimeConfig {
  serverBaseUrl: string
  webBaseUrl: string
  platform: string
  appVersion: string
}

/** 文档「在新窗口打开」的结果：失败带原因（路径非法 / 超出子窗口上限）。 */
export interface OpenDocumentWindowResult {
  opened: boolean
  reason?: "invalid-path" | "limit"
}

/** 系统通知（macOS 通知中心）的发送结果。 */
export interface DesktopNotifyResult {
  shown: boolean
  reason?: "unsupported"
}

/** 桌面端锁定状态（主进程 getLockState 的返回，设置页与锁定窗各自回读）。 */
export interface DesktopLockState {
  hasPassword: boolean
  autoLockOnBlur: boolean
  autoLockDelayMinutes: number
  locked: boolean
}

/** 锁定密码校验结果：连错 5 次进入 cooldown（带剩余等待秒数）。 */
export interface LockVerifyResult {
  ok: boolean
  reason?: "empty" | "mismatch" | "cooldown"
  /** reason=cooldown 时：还需等待的秒数。 */
  waitSeconds?: number
  /** reason=mismatch 时：剩余可尝试次数。 */
  remainingAttempts?: number
}

/** 锁定密码设置/清除结果（unauthorized = 当前密码不对）。 */
export interface LockMutationResult {
  ok: boolean
  reason?: "unauthorized" | "invalid" | "invalid-length"
}

/**
 * 主进程安全存储（G4：画板 AI Key 等敏感小文本）的操作结果。
 * 主进程用 safeStorage（macOS Keychain / Windows DPAPI / Linux libsecret）加密
 * 后落 userData/secure-store.json；ok=false 时 reason 说明原因。
 */
export interface DesktopSecureStoreResult {
  ok: boolean
  /** 仅读取：ok=true 时命中返回明文载荷、无记录为 null。 */
  value?: string | null
  reason?: "unavailable" | "invalid" | "io-error"
}

/**
 * preload 经 contextBridge 注入渲染层的桥接 API 形状
 * （实现见 src/preload/index.ts，通道语义见各主进程模块的文件头）。
 */
export interface XiaoyeDesktopApi {
  readonly isDesktop: true
  /** 后端服务地址（已归一化，无末尾斜杠）。 */
  readonly getServerBaseUrl: () => string
  /** 网页版站点地址（分享链接使用，已归一化，无末尾斜杠）。 */
  readonly getWebBaseUrl: () => string
  /** 操作系统平台标识（darwin / win32 / linux）。 */
  readonly platform: string
  /** 主进程是否给本窗口隐藏了原生标题栏（渲染层据此留顶部拖拽带、列首行下移）。 */
  readonly hiddenTitleBar: boolean
  /** 本窗口是否主窗口（偏好设置的启动同步只由主窗执行，避免多窗口重复 IPC）。 */
  readonly isMainWindow: boolean
  /** 本窗口是否独立登录窗（登录/跳转行为据此分叉；Web 端恒 false）。 */
  readonly isLoginWindow: boolean
  /** 兜底异步通道：返回主进程解析后的完整配置。 */
  getConfig: () => Promise<DesktopRuntimeConfig>
  /**
   * 在应用内新窗口打开 SPA 内部路由（如 `/knowledge/:kbId/doc/:docId`）。
   * 仅接受 `/` 开头的内部路径；主进程会再次校验。
   */
  openDocumentInNewWindow: (targetPath: string) => Promise<OpenDocumentWindowResult>
  /** 发送系统通知（macOS 通知中心）。 */
  notify: (title: string, body: string) => Promise<DesktopNotifyResult>
  /** 订阅托盘菜单广播（`navigate-start` / `navigate-notes`）。 */
  onTrayCommand: (callback: (command: string) => void) => () => void
  /**
   * 订阅应用菜单命令（`find-in-page` 在当页查找 / `doc-history` 查看文档
   * 历史 / `presentation-mode` 演示模式）。
   */
  onInAppMenu: (callback: (command: string) => void) => () => void
  /** 订阅主进程 toast 文案（子窗口超限「最多同时打开 5 个窗口」等）。 */
  onToast: (callback: (message: string) => void) => () => void
  /** 打开（或聚焦）偏好设置独立窗口。 */
  openSettingsWindow: () => Promise<{ opened: boolean }>
  /** 开机自启真值在操作系统侧（系统设置里也可能被改），需向主进程读取。 */
  getOpenAtLogin: () => Promise<boolean>
  setOpenAtLogin: (enabled: boolean) => Promise<boolean>
  /** 代理配置交给主进程落到默认 session；返回 false 表示地址非法。 */
  setProxySettings: (settings: {
    enable: boolean
    mode: "HTTP" | "PAC"
    type: "HTTP" | "SOCKS4" | "SOCKS5"
    url: string
  }) => Promise<boolean>
  setTrayVisible: (visible: boolean) => Promise<boolean>
  /** 注册/取消（value 传 `NO_SHORTCUT`）一个全局快捷键；返回 false 表示系统已占用。 */
  setGlobalShortcut: (payload: { key: string; value: string }) => Promise<boolean>
  openExternal: (url: string) => Promise<boolean>
  /**
   * 桌面端锁定：密码的哈希比对全在主进程，渲染层只拿状态与结果。
   * setLockPassword 已有密码时须带 currentPassword；verifyLockPassword 供锁定窗
   * /lock 路由调用（连错 5 次返回 cooldown）；unlockAfterLogout 供「退出登录」收尾。
   */
  getLockState: () => Promise<DesktopLockState>
  setLockPassword: (payload: {
    currentPassword?: string
    newPassword: string
  }) => Promise<LockMutationResult>
  clearLockPassword: (currentPassword: string) => Promise<LockMutationResult>
  verifyLockPassword: (password: string) => Promise<LockVerifyResult>
  setAutoLock: (payload: { enabled: boolean; delayMinutes: number }) => Promise<DesktopLockState>
  lockNow: () => Promise<{ locked: boolean }>
  unlockAfterLogout: () => Promise<{ ok: boolean }>
  /**
   * 画板 AI 密钥等敏感小文本的系统级安全存储。渲染层只传存储键（按 userId 构造）
   * 与明文载荷，加密、落盘与损坏兜底全在主进程；系统级加密不可用时 set/get/delete
   * 返回 ok=false 且 reason=unavailable，渲染层据此回退本地实现。
   */
  secureStoreSet: (storageKey: string, plaintext: string) => Promise<DesktopSecureStoreResult>
  secureStoreGet: (storageKey: string) => Promise<DesktopSecureStoreResult>
  secureStoreDelete: (storageKey: string) => Promise<DesktopSecureStoreResult>
  /**
   * 独立登录窗（窗口化登录）流程。通道语义见 src/main/login-window.ts：
   * - loginWindowReady：登录窗 hydration 后确认未登录，请主进程亮窗；
   * - notifyAuthSessionEstablished：登录/注册成功或 refresh cookie 自动登录，
   *   主进程关登录窗、开/唤回主窗（redirectPath 为回跳目标）；
   * - openLoginWindow：内容窗会话失效，唤起登录窗（redirectPath 为失效页路径）；
   * - logoutDesktop：退出登录，销毁内容窗回到登录窗。
   */
  loginWindowReady: () => Promise<{ ok: boolean }>
  notifyAuthSessionEstablished: (redirectPath?: string) => Promise<{ ok: boolean }>
  openLoginWindow: (redirectPath?: string) => Promise<{ ok: boolean }>
  logoutDesktop: () => Promise<{ ok: boolean }>
}

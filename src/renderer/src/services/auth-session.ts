/**
 * 认证会话单一事实源：内存 access token + 本地「已登录」标记与用户档案。
 *
 * 2026-09 token 架构改造后的职责：
 * - access token 短时（默认 15m）且只持有在内存（响应式 ref），不再落 localStorage；
 * - 持久层只存「已登录」标记与用户档案（非敏感），启动/恢复时凭标记静默 refresh；
 * - refresh token 在 HttpOnly cookie（kb_refresh），本模块只负责发起 /auth/refresh；
 * - 401 处理走全局单飞刷新（并发共享同一个 Promise），成功后由调用方重放原请求。
 */
import { ref } from "vue"
import { buildApiUrl, ensureApiResponseOk, getApiErrorStatus } from "./http-client"
import { dispatchUnauthorizedEvent } from "./auth-events"
import type { AuthSuccessResponse, AuthUser } from "./auth"

/** 浏览器持久化认证会话时使用的存储键。 */
export const AUTH_STORAGE_KEY = "tools-web-auth-session"

/** 本地持久化的认证会话形状：只存「已登录」标记与用户档案，access token 不落盘。 */
export interface PersistedAuthSession {
  loggedIn: boolean
  user: AuthUser | null
}

/** 解析并校验持久化会话文本；旧版（含 accessToken）或无效数据一律视为无会话。 */
export const parsePersistedAuthSession = (rawText: string | null): PersistedAuthSession | null => {
  if (!rawText) {
    return null
  }

  try {
    const session = JSON.parse(rawText) as Partial<PersistedAuthSession> & { accessToken?: unknown }

    // 旧版会话只存 accessToken：token 架构改造后不再受信（无 refresh cookie 可续期），直接丢弃
    if ("accessToken" in session || typeof session.loggedIn !== "boolean") {
      return null
    }

    return { loggedIn: session.loggedIn, user: (session.user as AuthUser | null) ?? null }
  } catch {
    return null
  }
}

/** 会话内存缓存：undefined 表示尚未读取，null 表示已读且无有效会话。 */
let cachedSession: PersistedAuthSession | null | undefined

if (typeof window !== "undefined") {
  // 本页签的写入走下方 persist 与 clear 同步更新缓存；其它页签的写入只触发
  // storage 事件（key 为 null 表示 clear() 一类整库清空），据此失效缓存
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_STORAGE_KEY || event.key === null) {
      cachedSession = undefined
    }
  })
}

/** 读取本地持久化的认证会话（带内存缓存）。 */
export const readPersistedAuthSession = (): PersistedAuthSession | null => {
  if (typeof window === "undefined") {
    return null
  }

  if (cachedSession === undefined) {
    cachedSession = parsePersistedAuthSession(window.localStorage.getItem(AUTH_STORAGE_KEY))
  }

  return cachedSession
}

/** 本地是否带有「已登录」标记（token 本体在内存与 HttpOnly cookie 中）。 */
export const isPersistedLoggedIn = (): boolean => {
  return readPersistedAuthSession()?.loggedIn === true
}

/** 写入本地持久化认证会话。 */
export const persistAuthSession = (session: PersistedAuthSession) => {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  cachedSession = session
}

/** 登录/刷新成功后写入用户档案（保持「已登录」标记）。 */
export const persistAuthUser = (user: AuthUser) => {
  persistAuthSession({ loggedIn: true, user })
}

/** 清空本地持久化认证会话。 */
export const clearPersistedAuthSession = () => {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  cachedSession = null
}

/** 内存持有的 access token（响应式：auth store 以 computed 直接镜像给视图）。 */
const memoryAccessToken = ref<string | null>(null)
let tokenExpiresAtMs = 0

export const getMemoryAccessToken = (): string | null => memoryAccessToken.value

export const setMemoryAccessToken = (token: string | null) => {
  memoryAccessToken.value = token
  tokenExpiresAtMs = token ? (decodeJwtExpMs(token) ?? 0) : 0
}

/** 解析 JWT exp（base64url payload）；无法解析返回 null（视为过期，触发刷新）。 */
const decodeJwtExpMs = (token: string): number | null => {
  try {
    const payloadPart = token.split(".")[1]
    if (!payloadPart) {
      return null
    }

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown }

    return typeof payload.exp === "number" ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/** 提前刷新阈值：剩余寿命不足 30s 视为临期，避免请求途中失效。 */
const FRESH_THRESHOLD_MS = 30_000

const isTokenFresh = () => {
  const token = memoryAccessToken.value
  return Boolean(token && tokenExpiresAtMs - Date.now() > FRESH_THRESHOLD_MS)
}

const requestRefreshSession = async (): Promise<AuthSuccessResponse> => {
  const response = await fetch(buildApiUrl("/auth/refresh"), {
    method: "POST",
    // 桌面端对后端是跨源上下文，必须显式携带凭据才能带上 HttpOnly refresh cookie
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })

  // 刷新请求的 401 由调用方（tryRefreshSession / restoreSession）语义化处理，
  // 不在通用出口派发登出事件，避免与调用方行为叠加
  await ensureApiResponseOk(response, "会话刷新失败")
  return (await response.json()) as AuthSuccessResponse
}

let refreshInFlight: Promise<AuthSuccessResponse> | null = null

/**
 * 全局单飞刷新：并发调用共享同一个 Promise。成功后同步内存 token 与本地用户档案。
 */
export const refreshSessionSingleFlight = (): Promise<AuthSuccessResponse> => {
  if (!refreshInFlight) {
    refreshInFlight = requestRefreshSession()
      .then((result) => {
        setMemoryAccessToken(result.accessToken)
        if (result.user) {
          persistAuthSession({ loggedIn: true, user: result.user })
        }
        return result
      })
      .finally(() => {
        refreshInFlight = null
      })
  }

  return refreshInFlight
}

/**
 * 供 401 处理链调用的刷新入口。服务端明确拒绝（401 等）时清空会话并派发
 * 登出事件；网络抖动（无状态码）则保留会话状态、仅返回 false，由调用方的
 * 原 401 走统一登出语义。
 */
export const tryRefreshSession = async (): Promise<boolean> => {
  try {
    await refreshSessionSingleFlight()
    return true
  } catch (error) {
    if (getApiErrorStatus(error) !== null) {
      setMemoryAccessToken(null)
      clearPersistedAuthSession()
      dispatchUnauthorizedEvent()
    }
    return false
  }
}

/**
 * 统一取令牌入口：保证返回值在请求发出时仍然有效——临期（<30s）先静默刷新。
 * 无「已登录」标记时不发起刷新（匿名态快速返回，避免无谓请求打刷新端点）。
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (isTokenFresh()) {
    return memoryAccessToken.value
  }

  if (!isPersistedLoggedIn()) {
    return memoryAccessToken.value
  }

  await tryRefreshSession()
  return memoryAccessToken.value
}

/** 这些端点的 401 有自己的语义（凭据错误/匿名访问/登出本身），不进入刷新重放链路。 */
const REFRESH_EXEMPT_PATTERNS = ["/auth/login", "/auth/refresh", "/auth/logout"]

/** 判断 URL 是否参与「401 → 刷新 → 重放」链路（公开分享端点与认证端点豁免）。 */
export const isRefreshEligibleUrl = (url: string): boolean => {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const pathname = new URL(url, window.location.origin).pathname.toLowerCase()
    if (REFRESH_EXEMPT_PATTERNS.some((pattern) => pathname.includes(pattern))) {
      return false
    }
    if (pathname.includes("/public/")) {
      return false
    }
    return true
  } catch {
    return false
  }
}

export interface AuthAwareFetchInit extends RequestInit {
  /** 调用方显式持有的令牌提示；缺省（undefined）时内部经 getAccessToken 解析。 */
  authToken?: string | null
}

/**
 * 带 401 单飞刷新与一次重放的统一 fetch：
 * 首次 401（可刷新路径）→ 触发全局单次刷新 → 成功后用新令牌重放一次原请求。
 * 刷新失败时原样返回 401 响应——登出事件已由 tryRefreshSession 派发过一次，
 * 调用方按常规错误抛出即可。
 */
export const fetchWithAuthRetry = async (
  url: string,
  init: AuthAwareFetchInit = {},
): Promise<Response> => {
  const { authToken, ...requestInit } = init

  const send = (token: string | null) => {
    const headers = new Headers(requestInit.headers)
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    return fetch(url, { ...requestInit, headers })
  }

  const initialToken =
    authToken !== undefined && authToken !== null ? authToken : await getAccessToken()
  let response = await send(initialToken)

  if (response.status === 401 && isRefreshEligibleUrl(url) && (await tryRefreshSession())) {
    response = await send(getMemoryAccessToken())
  }

  return response
}

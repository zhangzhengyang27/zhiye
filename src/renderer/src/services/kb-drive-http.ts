/**
 * 封装知识库后端的统一请求入口、鉴权头组装与错误处理。
 */
import { ensureApiResponseOk } from "./http-client"
import { fetchWithAuthRetry, getAccessToken, type AuthAwareFetchInit } from "./auth-session"
import { resolveServerOriginUrl } from "./desktop-bridge"

/** 自定义基址允许带末尾斜杠或 api 后缀，统一归一化为 origin 形式。 */
const toOriginUrl = (url: string) => url.replace(/\/+$/, "").replace(/\/api$/, "")

const resolveKbDriveApiBaseUrl = () => {
  const customBaseUrl = import.meta.env.VITE_KB_DRIVE_API_BASE_URL?.trim()

  if (customBaseUrl) {
    return toOriginUrl(customBaseUrl)
  }

  // ELEMENTS 基址指向其它主机时沿用该绝对地址；默认（/api 相对部署）复用
  // 桌面端桥接层的 origin 解析：桌面端为主进程下发的后端地址，Web 端为当前站点
  const elementsBaseUrl = import.meta.env.VITE_ELEMENTS_API_BASE_URL?.trim()

  if (elementsBaseUrl && elementsBaseUrl !== "/api") {
    return toOriginUrl(elementsBaseUrl)
  }

  if (typeof window === "undefined") {
    return ""
  }

  return resolveServerOriginUrl()
}

/** 知识库接口的基础地址。 */
const KB_DRIVE_API_BASE_URL = resolveKbDriveApiBaseUrl()

/**
 * 解析本次请求使用的访问令牌：调用方显式传入时优先（兼容既有签名，传入的
 * 过期令牌会在 401 后经单飞刷新重放兜底）；缺省时走统一入口 getAccessToken
 * ——内部保证令牌在请求发出时有效，临期先静默刷新。
 */
export const resolveAccessToken = async (inputToken?: string | null): Promise<string | null> => {
  if (inputToken) {
    return inputToken
  }

  return getAccessToken()
}

const buildKbDriveUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${KB_DRIVE_API_BASE_URL}/api${normalizedPath}`
}

/**
 * 将查询参数组装为查询串：undefined 的键整体跳过。
 */
export const buildKbDriveQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return
    }

    query.set(key, String(value))
  })

  return query.toString()
}

const createHeaders = (hasBody: boolean, extraHeaders?: HeadersInit) => {
  const headers = new Headers(extraHeaders)

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return headers
}

/** 请求选项：在原生 RequestInit 之上支持客户端超时。 */
export interface KbDriveRequestOptions extends RequestInit {
  /** 客户端超时毫秒数：到点中止请求，AI 生成等长请求用它兜底防挂死。 */
  timeoutMs?: number
}

/** AI 生成类请求的客户端超时：服务端提供方超时上限 120s，客户端留余量兜底。 */
export const AI_REQUEST_TIMEOUT_MS = 180_000

/**
 * 发起知识库接口请求并统一处理错误。
 *
 * 401 处理：可刷新路径在 fetchWithAuthRetry 内完成「全局单飞刷新 → 新令牌
 * 重放一次」；刷新失败仍 401 时由 ensureApiResponseOk 派发登出事件（刷新层
 * 已派发过一次，App.vue 按空 token 去重）。公开端点（分享密码校验等）的
 * 401 不代表登录态失效，不派发登出事件。
 */
export const requestKbDriveApi = async <T>(
  path: string,
  options: KbDriveRequestOptions = {},
  token?: string | null
): Promise<T> => {
  const { timeoutMs, signal, ...requestInit } = options
  const resolvedToken = await resolveAccessToken(token)
  const hasBody = requestInit.body !== undefined && !(requestInit.body instanceof FormData)

  // 显式 signal 与超时信号合并：任一触发即中止
  const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : null
  const requestSignal = signal && timeoutSignal ? AbortSignal.any([signal, timeoutSignal]) : (signal ?? timeoutSignal)

  const requestInitWithAuth: AuthAwareFetchInit = {
    ...requestInit,
    headers: createHeaders(hasBody, requestInit.headers),
    authToken: resolvedToken,
    ...(requestSignal ? { signal: requestSignal } : {}),
  }

  const response = await fetchWithAuthRetry(buildKbDriveUrl(path), requestInitWithAuth)

  // 401 的登出事件已由刷新链（tryRefreshSession）统一派发，通用出口不再重复派发
  await ensureApiResponseOk(response, "请求知识库接口失败")

  if (response.status === 204) {
    return undefined as T
  }

  // 空体的 2xx（如 DELETE 回空）直接按无数据处理，避免 JSON 解析抛错
  const bodyText = await response.text()

  if (!bodyText) {
    return undefined as T
  }

  return JSON.parse(bodyText) as T
}

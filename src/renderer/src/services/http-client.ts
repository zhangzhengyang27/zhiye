/**
 * 封装知识库后端的统一请求入口、鉴权头组装与错误处理。
 */
import { dispatchUnauthorizedEvent } from "./auth-events"
import { resolveApiBaseUrl } from "./desktop-bridge"

/**
 * 当前前端环境使用的接口基础地址，会自动去掉末尾斜杠以便后续拼接。
 * Web 端为相对路径（走 dev 代理 / 同源部署），桌面端为主进程下发的绝对后端地址。
 */
const API_BASE_URL = resolveApiBaseUrl()

/**
 * 统一表示接口层的 HTTP 错误，并保留状态码、原始响应体与兜底提示。
 */
export class ApiHttpError extends Error {
  readonly status: number
  readonly bodyText: string
  readonly fallbackMessage: string

  constructor(params: {
    status: number
    statusText: string
    bodyText: string
    fallbackMessage: string
  }) {
    const { status, statusText, bodyText, fallbackMessage } = params
    super(`${fallbackMessage}（${status}）：${bodyText || statusText}`)
    this.name = "ApiHttpError"
    this.status = status
    this.bodyText = bodyText
    this.fallbackMessage = fallbackMessage
  }
}

const normalizeUnknownMessage = (input: unknown): string | null => {
  if (typeof input === "string" && input.trim()) {
    return input
  }

  if (Array.isArray(input)) {
    const joined = input
      .map((item) => normalizeUnknownMessage(item))
      .filter((item): item is string => Boolean(item))
      .join("；")

    return joined || null
  }

  if (input && typeof input === "object") {
    const nestedMessage = normalizeUnknownMessage((input as { message?: unknown }).message)
    if (nestedMessage) {
      return nestedMessage
    }

    return null
  }

  return null
}

const resolveApiBodyMessage = (bodyText: string): string | null => {
  if (!bodyText.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown
    const parsedMessage = normalizeUnknownMessage(parsed)

    if (parsedMessage) {
      return parsedMessage
    }
  } catch {
    return bodyText
  }

  return bodyText
}

/**
 * 提取接口错误中的状态码。
 */
export const getApiErrorStatus = (error: unknown): number | null => {
  if (error instanceof ApiHttpError) {
    return error.status
  }

  return null
}

/**
 * 提取接口错误中的可读提示。
 */
export const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof ApiHttpError) {
    const bodyMessage = resolveApiBodyMessage(error.bodyText)
    if (bodyMessage) {
      return bodyMessage
    }

    return error.message || fallbackMessage
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

/**
 * 构造接口请求地址。
 */
export const buildApiUrl = (path: string) => {
  if (path.startsWith("/")) {
    return `${API_BASE_URL}${path}`
  }

  return `${API_BASE_URL}/${path}`
}

/** 这些端点的 401 有自己的语义（凭据错误/匿名访问/登出本身），不派发登出事件。 */
const UNAUTHORIZED_EXEMPT_PATTERNS = ["/auth/login", "/auth/refresh", "/auth/logout"]

/**
 * 判断该响应的 401 是否代表登录态失效：公开分享等 /public/ 匿名端点与认证
 * 端点豁免，其余路径派发全局登出事件，使裸 fetch 通道与 kb-drive-http 的
 * 401 行为一致（App.vue 按空 token 去重，重复派发无副作用）。
 */
const isUnauthorizedSessionExpired = (url: string): boolean => {
  if (typeof window === "undefined") {
    return false
  }

  try {
    const pathname = new URL(url, window.location.origin).pathname.toLowerCase()
    if (UNAUTHORIZED_EXEMPT_PATTERNS.some((pattern) => pathname.includes(pattern))) {
      return false
    }
    return !pathname.includes("/public/")
  } catch {
    return false
  }
}

/**
 * 在响应失败时抛出统一的接口错误。
 */
export const ensureApiResponseOk = async (response: Response, fallbackMessage: string) => {
  if (response.ok) {
    return
  }

  // 401 → 派发全局未授权事件统一跳转登录（刷新层已派发过一次的路径由
  // App.vue 去重；此处补齐不经刷新链的裸 fetch 通道）
  if (response.status === 401 && isUnauthorizedSessionExpired(response.url)) {
    dispatchUnauthorizedEvent()
  }

  const bodyText = await response.text()
  throw new ApiHttpError({
    status: response.status,
    statusText: response.statusText,
    bodyText,
    fallbackMessage,
  })
}

/**
 * 创建 JSON 请求头，并允许合并调用方额外传入的头信息。
 */
export const createJsonHeaders = (
  extraHeaders?: Record<string, string>,
): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(extraHeaders || {}),
})

/**
 * 创建包含管理员令牌的 JSON 请求头。
 */
export const createAdminJsonHeaders = (adminToken: string): Record<string, string> =>
  createJsonHeaders({
    "x-admin-token": adminToken,
  })

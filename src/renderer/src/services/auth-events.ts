/** 封装认证事件相关接口请求与数据结构。 */
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized"

/**
 * 派发全局未授权事件，供认证失效后的统一跳转与清理逻辑复用。
 */
export const dispatchUnauthorizedEvent = () => {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT))
}

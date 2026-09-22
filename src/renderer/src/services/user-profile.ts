/** 封装用户资料相关接口请求与数据结构。 */

import { buildApiUrl, createJsonHeaders, ensureApiResponseOk } from "./http-client"
import { fetchWithAuthRetry } from "./auth-session"

/** 统一响应出口：校验 ok 后解析 JSON（与 services/auth 的 parseResponse 同口径）。 */
const parseJsonResponse = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  await ensureApiResponseOk(response, fallbackMessage)
  return (await response.json()) as T
}

/**
 * 描述用户资料信息。
 */
export interface UserProfile {
  id: string
  email: string | null
  phone: string | null
  displayName: string
  name?: string
  avatar?: string | null
  lastLoginAt?: string | null
  createdAt: string
  updatedAt?: string
}

/**
 * 描述更新资料时提交的请求体。
 */
export interface UpdateUserProfileInput {
  displayName?: string
  email?: string
  phone?: string
  avatar?: string
}

/**
 * 描述修改密码时提交的请求体。
 */
export interface ChangeMyPasswordInput {
  currentPassword: string
  newPassword: string
}

/**
 * 获取当前用户资料（401 时内部会先单飞刷新再重放一次）。
 */
export const fetchMyProfile = async (token?: string | null): Promise<UserProfile> => {
  const response = await fetchWithAuthRetry(buildApiUrl("/users/me"), {
    headers: createJsonHeaders(),
    authToken: token ?? null,
  })

  return parseJsonResponse<UserProfile>(response, "读取账号资料失败")
}

/**
 * 更新当前用户资料（401 时内部会先单飞刷新再重放一次）。
 */
export const updateMyProfile = async (
  token: string | null | undefined,
  payload: UpdateUserProfileInput,
): Promise<UserProfile> => {
  const response = await fetchWithAuthRetry(buildApiUrl("/users/me"), {
    method: "PATCH",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
    authToken: token ?? null,
  })

  return parseJsonResponse<UserProfile>(response, "更新账号资料失败")
}

/**
 * 修改当前用户密码。服务端会 bump tokenVersion：本设备的后续请求经 401 →
 * 单飞刷新续期（refresh 会话保留），其余设备会话被吊销。
 */
export const changeMyPassword = async (
  token: string | null | undefined,
  payload: ChangeMyPasswordInput,
): Promise<{ success: true }> => {
  const response = await fetchWithAuthRetry(buildApiUrl("/users/me/change-password"), {
    method: "POST",
    credentials: "include",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
    authToken: token ?? null,
  })

  return parseJsonResponse<{ success: true }>(response, "修改密码失败")
}

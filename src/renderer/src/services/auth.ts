/**
 * 封装认证相关的验证码、登录、注册与当前用户查询接口。
 */
import {
  buildApiUrl,
  createJsonHeaders as createBaseJsonHeaders,
  ensureApiResponseOk,
} from "./http-client"

/**
 * 描述登录用户信息。
 */
export interface AuthUser {
  id: string
  email: string | null
  phone: string | null
  displayName: string
  avatar?: string | null
  role: "admin" | "user"
  createdAt: string
}

export interface AuthSuccessResponse {
  accessToken: string
  user: AuthUser
}

/**
 * 描述账号密码注册接口需要的字段。
 * 邮箱账号：`emailCode` 必填（先经 sendEmailCode 取码），图形验证码不需要；
 * 手机号账号：仍走图形验证码（captchaId/captchaCode）。
 */
export interface RegisterInput {
  account: string
  password: string
  displayName?: string
  captchaId?: string
  captchaCode?: string
  /** 邮箱验证码（注册邮箱账号时必填） */
  emailCode?: string
}

/**
 * 描述账号密码登录接口需要的字段。
 */
export interface LoginInput {
  account: string
  password: string
  /** 信任当前设备：勾选后 refresh cookie 以 30 天持久化，否则为会话 cookie（对齐后端 LoginDto） */
  trustedDevice?: boolean
}

/**
 * 描述手机号免密登录或自动注册所需的验证码字段。
 */
export interface PhoneAuthInput {
  phone: string
  captchaId: string
  captchaCode: string
}

/**
 * 描述图形验证码响应。
 */
export interface AuthCaptchaPayload {
  captchaId: string
  /** data:image/svg+xml;base64,... */
  image: string
  expiresAt: string
  /** 仅开发环境返回，便于自动化冒烟直接取码 */
  captchaCode?: string
  message?: string
}

const createJsonHeaders = (token?: string): Record<string, string> => {
  if (!token) {
    return createBaseJsonHeaders()
  }

  return createBaseJsonHeaders({
    Authorization: `Bearer ${token}`,
  })
}

/** 邮箱形态判定（与后端 normalizeAccount 的 EMAIL_PATTERN 同判据；大小写/首尾空白容忍）。 */
export const isEmailAccount = (account: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.trim().toLowerCase())

const parseResponse = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  await ensureApiResponseOk(response, fallbackMessage)
  return (await response.json()) as T
}

/**
 * 获取图形验证码。
 */
export const fetchAuthCaptcha = async (): Promise<AuthCaptchaPayload> => {
  const response = await fetch(buildApiUrl("/auth/captcha"))
  return parseResponse<AuthCaptchaPayload>(response, "获取图形验证码失败")
}

/**
 * 使用手机号登录或自动注册。
 */
export const phoneSignInOrRegister = async (
  payload: PhoneAuthInput,
): Promise<AuthSuccessResponse> => {
  const response = await fetch(buildApiUrl("/auth/phone-auth"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
    // 桌面端页面与后端跨源（app://bundle 或 dev 5173 → 3200）：不显式 include
    // 凭据，响应里的 kb_refresh cookie 会被浏览器丢弃，重启后无法静默续期
    credentials: "include",
  })

  return parseResponse<AuthSuccessResponse>(response, "手机号登录失败")
}

/**
 * 使用账号密码完成注册。
 */
export const registerByAccount = async (payload: RegisterInput): Promise<AuthSuccessResponse> => {
  const response = await fetch(buildApiUrl("/auth/register"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
    credentials: "include",
  })

  return parseResponse<AuthSuccessResponse>(response, "注册失败")
}

/**
 * 使用账号密码完成登录。
 */
export const loginByAccount = async (payload: LoginInput): Promise<AuthSuccessResponse> => {
  const response = await fetch(buildApiUrl("/auth/login"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
    credentials: "include",
  })

  return parseResponse<AuthSuccessResponse>(response, "登录失败")
}

/**
 * 获取当前登录用户信息。
 */
export const fetchCurrentUser = async (token: string): Promise<AuthUser> => {
  const response = await fetch(buildApiUrl("/auth/me"), {
    headers: createJsonHeaders(token),
  })

  return parseResponse<AuthUser>(response, "读取当前用户失败")
}

/**
 * 使用访问令牌执行退出登录。
 */
export const logoutByToken = async (token: string): Promise<void> => {
  const response = await fetch(buildApiUrl("/auth/logout"), {
    method: "POST",
    headers: createJsonHeaders(token),
    // 同登录：跨源下要凭据模式 include，服务端清 refresh cookie 才能落到本端
    credentials: "include",
  })

  await ensureApiResponseOk(response, "退出登录失败")
}

/**
 * 描述申请密码重置的响应（开发环境 SMTP 未配置时回显 devResetUrl 便于验证）。
 */
export interface PasswordResetRequestResult {
  message?: string
  /** 仅开发环境返回：一次性重置链接（30 分钟有效），前端直接展示为可点击入口 */
  devResetUrl?: string
}

/**
 * 申请密码重置：服务端向注册邮箱发送一次性重置链接（对齐后端 ForgotPasswordDto）。
 */
export const requestPasswordReset = async (email: string): Promise<PasswordResetRequestResult> => {
  const response = await fetch(buildApiUrl("/auth/forgot-password"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ email }),
  })

  return parseResponse<PasswordResetRequestResult>(response, "提交重置请求失败")
}

/**
 * 凭重置链接中的令牌设置新密码（对齐后端 ResetPasswordDto：token + newPassword）。
 * 旧链接式找回已由验证码制（resetPasswordByEmailCode）取代，端点保留向后兼容。
 */
export const resetPasswordByToken = async (token: string, newPassword: string): Promise<void> => {
  const response = await fetch(buildApiUrl("/auth/reset-password"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ token, newPassword }),
  })

  await ensureApiResponseOk(response, "密码重置失败")
}

/**
 * 描述邮箱验证码的用途：注册验证 / 找回密码（对齐后端 SendEmailCodeDto）。
 */
export type EmailCodePurpose = "register" | "password_reset" | "change_email"

/**
 * 描述邮箱验证码发送响应。devCode 仅开发环境返回（SMTP 未配置/发送失败/
 * EMAIL_CODE_DEV_ECHO=1），用于自动化与联调自动回填。
 */
export interface EmailCodeSendResult {
  sent: boolean
  channel?: "email"
  devCode?: string
  message?: string
}

/**
 * 发送邮箱验证码（注册验证 / 找回密码取码）。
 * 服务端分层限流：IP 10 次/分 + 同邮箱 5 次/小时 + 60 秒重发冷却。
 */
export const sendEmailCode = async (
  email: string,
  purpose: EmailCodePurpose,
): Promise<EmailCodeSendResult> => {
  const response = await fetch(buildApiUrl("/auth/email-code"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ email, purpose }),
  })

  return parseResponse<EmailCodeSendResult>(response, "验证码发送失败")
}

/**
 * 凭邮箱验证码重置密码（对齐后端 ResetPasswordByCodeDto；验证码一次性）。
 */
export const resetPasswordByEmailCode = async (payload: {
  email: string
  code: string
  newPassword: string
}): Promise<void> => {
  const response = await fetch(buildApiUrl("/auth/reset-password-by-code"), {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
  })

  await ensureApiResponseOk(response, "密码重置失败")
}

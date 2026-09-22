/**
 * 密码找回全链路探针（后端 auth-reset 口径，纯 fetch，无需浏览器）。
 *
 * 前置：后端 :3200（`cd xiaoye-server && pnpm start`）。
 * 用法：`node scripts/verify-auth-reset.mjs`
 *
 * 链路：注册一次性用户（开发环境图形验证码回显明文，脚本自动识别）
 *   → forgot-password 拿 devResetUrl（开发环境 SMTP 未配置时回显）
 *   → reset-password 设置新密码
 *   → 新密码登录成功 / 旧密码登录 401
 *   → 重置令牌复用 400（一次性）
 *   → 清理一次性用户（注销会话；用户数据交由既有测试数据约定清理）。
 *
 * 注意：reset-password / forgot-password 端点由后端并行批提供；端点未就绪时本脚本
 * 会在对应步骤失败并打印原因（预期内的「未就绪」可接受），脚本链路本身完整。
 */
import assert from "node:assert/strict"

const SERVER_BASE_URL = (process.env.XIAOYE_SERVER_URL ?? "http://127.0.0.1:3200").replace(
  /\/+$/,
  "",
)
const API_BASE = `${SERVER_BASE_URL}/api`

const PREFIX = "[auth-reset]"
let checks = 0

const logStep = (message) => console.log(`${PREFIX} ${message}`)

const pass = (label) => {
  checks += 1
  logStep(`✓ ${label}`)
}

/** 统一请求封装：返回 { status, body }，非 2xx 时不抛错交由调用方断言。 */
const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  })

  let body = null
  const text = await response.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  return { status: response.status, body }
}

/** 注册一次性用户（开发环境验证码接口直接回传明文验证码）。 */
const registerOneOffUser = async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const email = `auth-reset-probe-${suffix}@example.com`
  const password = `probe-${suffix}-old`

  const captcha = await api("/auth/captcha")
  assert.equal(captcha.status, 200, "获取图形验证码失败")
  const captchaCode = captcha.body?.captchaCode
  const captchaId = captcha.body?.captchaId
  assert.ok(captchaId, "验证码响应缺 captchaId")
  assert.ok(captchaCode, "验证码响应缺明文 captchaCode（仅开发环境提供，检查后端是否 dev 模式）")

  const registered = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      account: email,
      password,
      captchaId,
      captchaCode,
    }),
  })
  assert.equal(registered.status, 201, `注册一次性用户失败：${JSON.stringify(registered.body)}`)

  return { email, password }
}

const extractResetToken = (devResetUrl) => {
  let url
  try {
    url = new URL(devResetUrl)
  } catch {
    // devResetUrl 可能是纯路径（/auth/reset?token=...）
    url = new URL(devResetUrl, SERVER_BASE_URL)
  }

  return url.searchParams.get("token")
}

const main = async () => {
  logStep(`后端地址：${API_BASE}`)

  // 1. 注册一次性用户
  const user = await registerOneOffUser()
  pass(`注册一次性用户 ${user.email}`)

  // 2. 申请重置：开发环境回显 devResetUrl
  const forgot = await api("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: user.email }),
  })
  assert.equal(forgot.status, 201, `forgot-password 失败：${JSON.stringify(forgot.body)}`)
  const devResetUrl = forgot.body?.devResetUrl
  assert.ok(devResetUrl, "forgot-password 未回显 devResetUrl（SMTP 已配置？探针需要 dev 回显）")
  pass("forgot-password 返回一次性重置链接")

  // 3. 提取令牌并重置密码
  const resetToken = extractResetToken(devResetUrl)
  assert.ok(resetToken, `重置链接缺 token 参数：${devResetUrl}`)
  const newPassword = `${user.password}-new`
  const reset = await api("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetToken, newPassword }),
  })
  assert.ok(
    reset.status === 200 || reset.status === 201,
    `reset-password 失败：${JSON.stringify(reset.body)}`,
  )
  pass("reset-password 以一次性令牌设置新密码成功")

  // 4. 新密码登录成功
  const loginNew = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: user.email, password: newPassword }),
  })
  assert.equal(loginNew.status, 201, `新密码登录失败：${JSON.stringify(loginNew.body)}`)
  assert.ok(loginNew.body?.accessToken ?? loginNew.body?.token, "登录响应缺访问令牌")
  pass("新密码登录成功")

  // 5. 旧密码登录 401
  const loginOld = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: user.email, password: user.password }),
  })
  assert.equal(loginOld.status, 401, `旧密码登录应 401，实际 ${loginOld.status}`)
  pass("旧密码登录被拒（401）")

  // 6. 重置令牌一次性：复用必须 400
  const reuse = await api("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetToken, newPassword: `${newPassword}-again` }),
  })
  assert.equal(reuse.status, 400, `令牌复用应 400，实际 ${reuse.status}`)
  pass("重置令牌复用被拒（400，一次性）")

  // 7. 清理：注销新会话（一次性用户留在库内由测试数据约定清理；邮箱唯一可再辨识）
  const accessToken = loginNew.body?.accessToken ?? loginNew.body?.token
  const logout = await api("/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (logout.status === 200 || logout.status === 201) {
    pass("清理：已注销探针会话")
  } else {
    logStep(`清理：注销返回 ${logout.status}（不阻塞验收）`)
  }

  console.log(`\n${PREFIX} 全部通过，共 ${checks} 项断言。`)
}

main().catch((error) => {
  console.error(`\n${PREFIX} ✗ 验收失败：${error?.message ?? error}`)
  if (error?.cause) {
    console.error(`${PREFIX}   cause: ${error.cause}`)
  }
  console.error(
    `${PREFIX} 提示：forgot-password / reset-password 端点由后端并行批提供，` +
      `若后端未就绪（404/401 属预期），端点补齐后重跑即可。`,
  )
  process.exit(1)
})

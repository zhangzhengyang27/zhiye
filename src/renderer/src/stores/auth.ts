/** 管理认证相关全局状态与业务操作。 */
import { computed, ref } from "vue"
import { defineStore } from "pinia"
import {
  loginByAccount,
  logoutByToken,
  phoneSignInOrRegister,
  registerByAccount,
  type AuthUser,
} from "@/services/auth"
import { getApiErrorStatus } from "@/services/http-client"
import {
  clearPersistedAuthSession,
  getMemoryAccessToken,
  isPersistedLoggedIn,
  persistAuthSession,
  readPersistedAuthSession,
  refreshSessionSingleFlight,
  setMemoryAccessToken,
} from "@/services/auth-session"

interface AuthActionInput {
  account: string
  password: string
  displayName?: string
  captchaId?: string
  captchaCode?: string
  /** 邮箱验证码（注册邮箱账号时必填，先经 sendEmailCode 取码） */
  emailCode?: string
  /** 信任当前设备：勾选后 refresh cookie 以 30 天持久化，否则为会话 cookie */
  trustedDevice?: boolean
}

/**
 * 管理认证相关的全局状态与业务操作。
 *
 * 2026-09 token 架构改造：access token 短时（15m）且只在内存持有，不再落
 * localStorage；持久层只存「已登录」标记与用户档案，恢复会话走静默 refresh。
 */
export const useAuthStore = defineStore("auth", () => {
  /** 当前登录用户。 */
  const user = ref<AuthUser | null>(null)
  /**
   * 内存 access token（不落盘）。事实源在 auth-session（含刷新链路），
   * 这里以 computed 只读镜像，供视图与既有调用方消费。
   */
  const accessToken = computed(() => getMemoryAccessToken())
  /** 标记本地会话是否已经完成恢复。 */
  const hydrated = ref(false)

  /** 复用中的 hydration Promise，避免并发重复恢复会话。 */
  let hydrationPromise: Promise<void> | null = null

  /** 表示当前是否处于有效登录态。 */
  const isLoggedIn = computed(() => Boolean(accessToken.value && user.value))

  /**
   * 同步更新内存中的会话数据，并持久化「已登录」标记与用户档案（不含 token）。
   */
  const setSession = (nextAccessToken: string, nextUser: AuthUser) => {
    setMemoryAccessToken(nextAccessToken)
    user.value = nextUser

    persistAuthSession({
      loggedIn: true,
      user: nextUser,
    })
  }

  /**
   * 清空当前会话及其对应的本地持久化数据。
   */
  const clearSession = () => {
    setMemoryAccessToken(null)
    user.value = null
    clearPersistedAuthSession()
  }

  /**
   * 合并更新当前用户的部分字段，常用于资料编辑后的本地回写。
   */
  const patchUser = (partialUser: Partial<AuthUser>) => {
    if (!user.value) {
      return
    }

    user.value = {
      ...user.value,
      ...partialUser,
    }

    persistAuthSession({ loggedIn: true, user: user.value })
  }

  /**
   * 恢复会话：本地有「已登录」标记时先静默 refresh 换取内存 access token
   * 与用户档案，失败才回落到未登录状态。
   */
  const restoreSession = async () => {
    const persistedSession = readPersistedAuthSession()

    if (!persistedSession?.loggedIn) {
      hydrated.value = true
      // 兼容清理：旧版遗留的 accessToken 会话在这里被一并抹掉
      clearSession()
      return
    }

    try {
      try {
        const result = await refreshSessionSingleFlight()
        user.value = result.user ?? persistedSession.user
      } catch (error) {
        // 网络抖动/后端重启（fetch 直接抛错）时重试一次，避免启动瞬断被当成登出
        if (getApiErrorStatus(error) === null) {
          await new Promise((resolve) => setTimeout(resolve, 600))
          const result = await refreshSessionSingleFlight()
          user.value = result.user ?? persistedSession.user
        } else {
          throw error
        }
      }
    } catch (error) {
      // 只有明确 401（refresh cookie 失效）才清会话；其余错误保留「已登录」
      // 标记与档案，等待下次恢复
      if (getApiErrorStatus(error) === 401) {
        clearSession()
      }
    } finally {
      hydrated.value = true
    }
  }

  /**
   * 确保认证状态只完成一次 hydration，供路由守卫和页面初始化复用。
   */
  const ensureHydrated = async () => {
    if (hydrated.value) {
      return
    }

    if (!hydrationPromise) {
      hydrationPromise = restoreSession().finally(() => {
        hydrationPromise = null
      })
    }

    await hydrationPromise
  }

  /**
   * 使用账号密码登录，并在成功后建立本地会话。
   */
  const login = async ({ account, password, trustedDevice }: AuthActionInput) => {
    const result = await loginByAccount({ account, password, trustedDevice })
    setSession(result.accessToken, result.user)
  }

  /**
   * 使用账号信息完成注册，并在成功后建立本地会话。
   * 邮箱账号带 emailCode（邮箱验证码），手机号账号带图形验证码。
   */
  const register = async ({
    account,
    password,
    displayName,
    captchaId,
    captchaCode,
    emailCode,
  }: AuthActionInput) => {
    if (!emailCode && (!captchaId || !captchaCode)) {
      throw new Error("注册缺少人机验证凭证")
    }

    const result = await registerByAccount({
      account,
      password,
      displayName,
      captchaId,
      captchaCode,
      emailCode,
    })
    setSession(result.accessToken, result.user)
  }

  /**
   * 使用手机号和图形验证码执行免密登录或自动注册。
   */
  const signInOrRegisterByPhone = async (phone: string, captchaId: string, captchaCode: string) => {
    const result = await phoneSignInOrRegister({ phone, captchaId, captchaCode })
    setSession(result.accessToken, result.user)
  }

  /**
   * 退出当前登录会话，并在接口失败时仍确保清空本地状态。
   * 后端 /auth/logout 强制校验 Bearer token（无 cookie 兜底通道），内存 token
   * 已丢失时跳过请求、直接清本地会话。
   */
  const logout = async () => {
    try {
      if (accessToken.value) {
        await logoutByToken(accessToken.value)
      }
    } finally {
      clearSession()
    }
  }

  return {
    user,
    accessToken,
    hydrated,
    isLoggedIn,
    clearSession,
    patchUser,
    login,
    register,
    signInOrRegisterByPhone,
    logout,
    ensureHydrated,
    restoreSession,
  }
})

/** 供登录页等判断本地是否残留「已登录」标记（token 恢复前内存为空）。 */
export { isPersistedLoggedIn }

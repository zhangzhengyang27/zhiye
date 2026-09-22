<script setup lang="ts">
/**
 * 页面组件，负责登录页面展示与交互流程。
 *
 * 设计约定（2026-09 重构）：单卡片极简布局——只保留账号/密码、会话偏好、
 * 深链回跳提示与登录动作；回跳与偏好信息不再以卡片/徽标形式重复展示，
 * 深链回跳仅在非默认目标时显示一行人话文案（不展示原始路径）。
 */
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import UiIcon from "@/components/common/UiIcon.vue"
import { fetchAuthCaptcha } from "@/services/auth"
import { getApiErrorMessage } from "@/services/http-client"
import { useAuthStore } from "@/stores/auth"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const account = ref("")
const password = ref("")
const submitting = ref(false)
const errorMessage = ref("")
const rememberSession = ref(true)
const trustedDevice = ref(true)

const mode = ref<"login" | "register">("login")
const isRegister = computed(() => mode.value === "register")
const captcha = ref<{ id: string; image: string } | null>(null)
const captchaCode = ref("")
const captchaLoading = ref(false)

const LOGIN_STORAGE_KEYS = {
  account: "kb-drive:last-login-account",
  remember: "kb-drive:remember-login",
  trusted: "kb-drive:trusted-device",
} as const

const redirectTarget = computed(() => {
  if (typeof route.query.redirect === "string" && route.query.redirect.trim()) {
    return route.query.redirect
  }

  return "/knowledge"
})
/** 深链回跳才需要提示；默认进知识库首页时保持页面零噪音 */
const isDeepLink = computed(() => redirectTarget.value !== "/knowledge")
const redirectLabel = computed(() => {
  if (redirectTarget.value === "/knowledge") {
    return "知识库首页"
  }

  if (redirectTarget.value.includes("/workspace")) {
    return "知识库工作区"
  }

  if (redirectTarget.value.includes("/doc")) {
    return "文档编辑页"
  }

  return "知识库"
})

const restoreLocalPreference = () => {
  if (typeof window === "undefined") {
    return
  }

  rememberSession.value = window.localStorage.getItem(LOGIN_STORAGE_KEYS.remember) !== "0"
  trustedDevice.value = window.localStorage.getItem(LOGIN_STORAGE_KEYS.trusted) !== "0"

  if (rememberSession.value) {
    account.value = window.localStorage.getItem(LOGIN_STORAGE_KEYS.account) || ""
  }
}

const persistLocalPreference = () => {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(LOGIN_STORAGE_KEYS.remember, rememberSession.value ? "1" : "0")
  window.localStorage.setItem(LOGIN_STORAGE_KEYS.trusted, trustedDevice.value ? "1" : "0")

  if (rememberSession.value && account.value.trim()) {
    window.localStorage.setItem(LOGIN_STORAGE_KEYS.account, account.value.trim())
    return
  }

  window.localStorage.removeItem(LOGIN_STORAGE_KEYS.account)
}

const refreshCaptcha = async () => {
  if (captchaLoading.value) {
    return
  }

  captchaLoading.value = true

  try {
    const payload = await fetchAuthCaptcha()
    captcha.value = { id: payload.captchaId, image: payload.image }
    // 开发环境后端会同时回传明文，直接回填省掉手输
    captchaCode.value = payload.captchaCode ?? ""
  } catch (error) {
    captcha.value = null
    errorMessage.value = getApiErrorMessage(error, "验证码加载失败，点击图片可重试。")
  } finally {
    captchaLoading.value = false
  }
}

const switchMode = (next: "login" | "register") => {
  if (mode.value === next) {
    return
  }

  mode.value = next
  errorMessage.value = ""
  captchaCode.value = ""

  if (next === "register" && !captcha.value) {
    void refreshCaptcha()
  }
}

const submitLogin = async (normalizedAccount: string) => {
  // 「信任当前设备」接成 refresh cookie 有效期语义：勾选 30 天持久，否则会话 cookie
  await authStore.login({
    account: normalizedAccount,
    password: password.value,
    trustedDevice: trustedDevice.value,
  })
}

const submitRegister = async (normalizedAccount: string) => {
  if (password.value.length < 6) {
    errorMessage.value = "密码至少 6 位。"
    return
  }

  if (!captcha.value) {
    await refreshCaptcha()
    return
  }

  if (!captchaCode.value.trim()) {
    errorMessage.value = "请输入图形验证码。"
    return
  }

  try {
    await authStore.register({
      account: normalizedAccount,
      password: password.value,
      captchaId: captcha.value.id,
      captchaCode: captchaCode.value.trim(),
    })
  } catch (error) {
    // 验证码是一次性的（校验即销毁），失败后必须换一张再试
    await refreshCaptcha()
    throw error
  }
}

const submit = async () => {
  if (submitting.value) {
    return
  }

  const normalizedAccount = account.value.trim()

  if (!normalizedAccount) {
    errorMessage.value = "请输入账号、邮箱或手机号。"
    return
  }

  if (!password.value.trim()) {
    errorMessage.value = "请输入密码。"
    return
  }

  errorMessage.value = ""
  submitting.value = true

  try {
    if (isRegister.value) {
      await submitRegister(normalizedAccount)
    } else {
      await submitLogin(normalizedAccount)
    }

    persistLocalPreference()
    await router.replace(redirectTarget.value)
  } catch (error) {
    errorMessage.value = getApiErrorMessage(
      error,
      isRegister.value ? "注册失败，请稍后重试。" : "登录失败，请稍后重试。",
    )
  } finally {
    submitting.value = false
  }
}

/** 测试账号一键登录：种子账号（prisma/seed.ts），仅开发环境展示 */
const TEST_ACCOUNT = "demo@example.com"
const TEST_PASSWORD = "123456"
const isDevEnvironment = import.meta.env.DEV

const loginAsTestAccount = () => {
  if (submitting.value) {
    return
  }

  account.value = TEST_ACCOUNT
  password.value = TEST_PASSWORD
  void submit()
}

onMounted(() => {
  restoreLocalPreference()
})
</script>

<template>
  <section class="min-h-screen bg-[image:var(--kb-shell-bg)] px-4 py-10">
    <div class="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[420px] items-center">
      <div
        class="w-full rounded-kb-3xl border border-line bg-surface p-8 shadow-[var(--kb-elevated-shadow)] sm:p-10"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-kb-xl bg-brand text-[18px] font-semibold text-white"
            aria-hidden="true"
            >语</span
          >
          <div class="min-w-0">
            <h1 class="text-[22px] font-bold tracking-[-0.03em] text-ink">
              {{ isRegister ? "注册账号" : "进入知识库" }}
            </h1>
            <p class="mt-0.5 truncate text-[13px] text-ink-tertiary">
              {{ isRegister ? "创建账号后即可开始写作与分享" : "登录后继续写作、评论与分享" }}
            </p>
          </div>
        </div>

        <form class="mt-8 space-y-5" @submit.prevent="submit">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-ink-secondary">账号</span>
            <div class="relative">
              <el-input
                v-model="account"
                name="account"
                autocomplete="username"
                spellcheck="false"
                placeholder="请输入账号、邮箱或手机号"
                class="w-full pl-10"
              />
              <!-- 前缀图标必须排在控件之后：EP 根是 position:relative 且自带填充色，
                   同级定位元素按 DOM 序后画，写在前面会被输入框整个盖住 -->
              <AppIcon
                name="i-lucide-user"
                class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-quaternary"
              />
            </div>
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-ink-secondary">密码</span>
            <div class="relative">
              <el-input
                v-model="password"
                name="password"
                type="password"
                :autocomplete="isRegister ? 'new-password' : 'current-password'"
                :placeholder="isRegister ? '至少 6 位' : '请输入密码'"
                class="w-full pl-10"
              />
              <AppIcon
                name="i-lucide-key-round"
                class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-quaternary"
              />
            </div>
          </label>

          <label v-if="isRegister" class="block">
            <span class="mb-2 block text-sm font-medium text-ink-secondary">图形验证码</span>
            <div class="flex items-center gap-3">
              <div class="relative min-w-0 flex-1">
                <el-input
                  v-model="captchaCode"
                  name="captcha-code"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  spellcheck="false"
                  maxlength="6"
                  placeholder="请输入图中 6 位数字"
                  class="w-full pl-10"
                />
                <AppIcon
                  name="i-lucide-shield-check"
                  class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-quaternary"
                />
              </div>
              <button
                type="button"
                class="flex h-9 w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-kb-lg border border-line bg-muted transition hover:border-brand-lighter disabled:opacity-60"
                :disabled="captchaLoading"
                title="看不清？点击换一张"
                aria-label="刷新图形验证码"
                @click="refreshCaptcha"
              >
                <img
                  v-if="captcha"
                  :src="captcha.image"
                  alt="图形验证码图片，点击可刷新"
                  width="132"
                  height="40"
                  class="h-full w-full object-contain"
                />
                <span v-else class="text-[12px] text-ink-quaternary">{{
                  captchaLoading ? "加载中…" : "点击获取"
                }}</span>
              </button>
            </div>
          </label>

          <div v-if="!isRegister" class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <el-checkbox v-model="rememberSession" label="记住账号" />
            <el-checkbox v-model="trustedDevice" label="信任当前设备" />
          </div>

          <p v-if="isDeepLink" class="text-[13px] leading-6 text-ink-tertiary">
            {{ isRegister ? "注册完成后将回到" : "登录后将回到"
            }}<span class="font-medium text-ink-secondary">{{ redirectLabel }}</span>
          </p>

          <p
            v-if="errorMessage"
            class="kb-fade-in rounded-kb-xl border border-error-light bg-error-bg px-4 py-3 text-sm font-medium text-error"
          >
            {{ errorMessage }}
          </p>

          <el-button
            type="primary"
            size="large"
            native-type="submit"
            :loading="submitting"
            class="h-12 rounded-kb-2xl text-base shadow-[var(--kb-glow-brand-cta)] duration-200 hover:shadow-[var(--kb-glow-brand-cta-hover)] active:scale-[0.98] w-full py-0"
            ><template #loading
              ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
            /></template>
            <span class="truncate">{{ isRegister ? "注册并进入" : "登录并进入" }}</span>
          </el-button>

          <el-button
            v-if="isDevEnvironment && !isRegister"
            type="primary"
            plain
            :disabled="submitting"
            class="h-10 text-[13px] text-ink-tertiary hover:border-brand hover:text-brand w-full py-0 [line-height:inherit]"
            @click="loginAsTestAccount"
            ><AppIcon name="i-lucide-flask-conical" class="h-4 w-4" />
            <span class="truncate">测试账号一键登录（仅开发环境）</span>
          </el-button>

          <p class="pt-1 text-center text-[13px] text-ink-tertiary">
            {{ isRegister ? "已有账号？" : "还没有账号？" }}
            <button
              type="button"
              class="rounded-kb-sm font-medium text-brand underline-offset-2 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              @click="switchMode(isRegister ? 'login' : 'register')"
            >
              {{ isRegister ? "返回登录" : "注册账号" }}
            </button>
          </p>
        </form>
      </div>
    </div>
  </section>
</template>

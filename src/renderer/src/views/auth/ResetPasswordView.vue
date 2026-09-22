<script setup lang="ts">
/**
 * 密码找回页（/auth/reset，双态）：
 * - 无 token：申请表单——输入邮箱提交，服务端发送一次性重置链接（30 分钟有效）；
 *   开发环境（SMTP 未配置）响应会回显 devResetUrl，直接展示为可点击链接。
 * - 有 token：重置表单——校验通过后设置新密码，成功跳回登录页。
 */
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import UiIcon from "@/components/common/UiIcon.vue"
import { requestPasswordReset, resetPasswordByToken } from "@/services/auth"

const route = useRoute()
const router = useRouter()

const token = computed(() => {
  const value = route.query.token
  return typeof value === "string" ? value : ""
})

const email = ref("")
const newPassword = ref("")
const confirmPassword = ref("")
const submitting = ref(false)
const errorMessage = ref("")
const successMessage = ref("")
const devResetUrl = ref("")

/** devResetUrl 来自接口回显，进 href 前只放行 http(s) 地址，阻断其它 scheme 注入 */
const safeDevResetUrl = computed(() => (/^https?:\/\//i.test(devResetUrl.value) ? devResetUrl.value : ""))

const resetPasswordMismatch = computed(
  () => confirmPassword.value.length > 0 && confirmPassword.value !== newPassword.value
)

const submitRequest = async () => {
  if (submitting.value) return
  const normalizedEmail = email.value.trim()
  if (!normalizedEmail) {
    errorMessage.value = "请输入注册时使用的邮箱。"
    return
  }

  submitting.value = true
  errorMessage.value = ""
  try {
    const result = await requestPasswordReset(normalizedEmail)
    devResetUrl.value = result.devResetUrl ?? ""
    successMessage.value = "若该邮箱已注册，重置链接将发送至邮箱，请在 30 分钟内完成重置。"
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "提交重置请求失败，请稍后重试。"
  } finally {
    submitting.value = false
  }
}

const submitReset = async () => {
  if (submitting.value) return
  if (newPassword.value.length < 6) {
    errorMessage.value = "新密码至少 6 位。"
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = "两次输入的新密码不一致。"
    return
  }

  submitting.value = true
  errorMessage.value = ""
  try {
    await resetPasswordByToken(token.value, newPassword.value)
    successMessage.value = "密码已重置，请使用新密码登录。"
    void router.push({ name: "login" })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "密码重置失败，请稍后重试。"
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="min-h-screen bg-[image:var(--kb-shell-bg)] px-4 py-10">
    <div class="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[420px] items-center">
      <div class="w-full rounded-kb-3xl border border-line bg-surface p-8 shadow-[var(--kb-elevated-shadow)] sm:p-10">
        <div class="flex items-center gap-3">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-kb-xl bg-brand text-[18px] font-semibold text-white"
            aria-hidden="true"
            >语</span
          >
          <div class="min-w-0">
            <h1 class="text-[22px] font-bold tracking-[-0.03em] text-ink">
              {{ token ? "设置新密码" : "找回密码" }}
            </h1>
            <p class="mt-0.5 truncate text-[13px] text-ink-tertiary">
              {{ token ? "请输入并确认新密码" : "输入注册邮箱，我们将发送重置链接" }}
            </p>
          </div>
        </div>

        <!-- 申请态：无 token -->
        <form v-if="!token" class="mt-8 space-y-5" @submit.prevent="submitRequest">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-ink-secondary">注册邮箱</span>
            <el-input
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              spellcheck="false"
              placeholder="请输入注册时使用的邮箱"
              class="w-full"
            />
          </label>

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
            class="h-12 rounded-kb-2xl w-full py-0"
            ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
            <span class="truncate">发送重置链接</span>
          </el-button>
        </form>

        <!-- 重置态：有 token -->
        <form v-else class="mt-8 space-y-5" @submit.prevent="submitReset">
          <label class="block">
            <span class="mb-2 block text-sm font-medium text-ink-secondary">新密码</span>
            <el-input
              v-model="newPassword"
              name="new-password"
              type="password"
              autocomplete="new-password"
              placeholder="至少 6 位"
              class="w-full"
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-ink-secondary">确认新密码</span>
            <el-input
              v-model="confirmPassword"
              name="confirm-password"
              type="password"
              autocomplete="new-password"
              placeholder="再次输入新密码"
              class="w-full"
            />
          </label>

          <p v-if="resetPasswordMismatch" class="text-[13px] text-warning">两次输入的密码不一致。</p>

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
            class="h-12 rounded-kb-2xl w-full py-0"
            ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
            <span class="truncate">重置密码</span>
          </el-button>
        </form>

        <div v-if="successMessage" class="mt-5 space-y-2">
          <p class="rounded-kb-xl border border-success-light bg-success-bg px-4 py-3 text-sm font-medium text-success">
            {{ successMessage }}
          </p>
          <p v-if="safeDevResetUrl" class="break-all text-[12px] leading-5 text-ink-tertiary">
            开发环境快捷入口：
            <a class="text-brand underline" :href="safeDevResetUrl">{{ safeDevResetUrl }}</a>
          </p>
        </div>

        <p class="mt-6 text-center text-[13px] text-ink-tertiary">
          <RouterLink class="font-medium text-brand hover:underline" :to="{ name: 'login' }">返回登录</RouterLink>
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 密码找回页（/auth/reset，验证码制单表单）：
 * 输入注册邮箱 → 发送邮箱验证码（60s 冷却，EmailCodeField 内聚）→ 凭码设置新密码。
 * 旧「邮箱链接 + token」双态流程已废弃（后端 /auth/reset-password 保留兼容）；
 * 旧链接里的 token 参数不再读取，直达本页即走验证码流程。
 */
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import AuthShell from "@/components/auth/AuthShell.vue"
import EmailCodeField from "@/components/auth/EmailCodeField.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import { resetPasswordByEmailCode } from "@/services/auth"
import { getApiErrorMessage } from "@/services/http-client"

const router = useRouter()

const email = ref("")
const emailCode = ref("")
const newPassword = ref("")
const confirmPassword = ref("")
const submitting = ref(false)
const errorMessage = ref("")
const successMessage = ref("")

const passwordMismatch = computed(
  () => confirmPassword.value.length > 0 && confirmPassword.value !== newPassword.value,
)

const submit = async () => {
  if (submitting.value) return

  const normalizedEmail = email.value.trim()
  if (!normalizedEmail) {
    errorMessage.value = "请输入注册时使用的邮箱。"
    return
  }
  if (!emailCode.value.trim()) {
    errorMessage.value = "请先获取并输入邮箱验证码。"
    return
  }
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
    await resetPasswordByEmailCode({
      email: normalizedEmail,
      code: emailCode.value.trim(),
      newPassword: newPassword.value,
    })
    successMessage.value = "密码已重置，请使用新密码登录。"
    void router.push({ name: "login" })
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "密码重置失败，请稍后重试。")
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell title="找回密码" subtitle="输入注册邮箱，凭邮箱验证码设置新密码">
    <form class="mt-8 space-y-5" @submit.prevent="submit">
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

      <EmailCodeField v-model:code="emailCode" :email="email" purpose="password_reset" />

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

      <p v-if="passwordMismatch" class="text-[13px] text-warning">两次输入的密码不一致。</p>

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
        <span class="truncate">重置密码</span>
      </el-button>
    </form>

    <p class="mt-6 text-center text-[13px] text-ink-tertiary">
      <RouterLink class="font-medium text-brand hover:underline" :to="{ name: 'login' }"
        >返回登录</RouterLink
      >
    </p>
  </AuthShell>
</template>

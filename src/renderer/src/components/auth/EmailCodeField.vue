<script setup lang="ts">
/**
 * 邮箱验证码输入行（注册验证 / 找回密码共用）。
 *
 * 结构对齐 LoginView 图形验证码行：左侧验证码输入 + 右侧发送按钮；发送、
 * 60s 重发倒计时、发送结果提示与错误文案内聚在组件内，调用方只消费 code。
 * 开发环境后端回显 devCode 时自动回填输入框（与图形验证码 dev 自动化同口径），
 * 生产环境提示用户查收邮件。
 */
import { computed, onBeforeUnmount, ref } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import { sendEmailCode, type EmailCodePurpose } from "@/services/auth"
import { getApiErrorMessage, getApiErrorStatus } from "@/services/http-client"

const props = defineProps<{
  /** 收件邮箱（取调用方表单的账号/邮箱字段；为空或格式不对时不可发送） */
  email: string
  /** 验证码用途，透传后端（决定防枚举与冷却的落库键） */
  purpose: EmailCodePurpose
  name?: string
  placeholder?: string
}>()

const code = defineModel<string>("code", { default: "" })

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailReady = computed(() => EMAIL_PATTERN.test(props.email.trim().toLowerCase()))

const RESEND_COOLDOWN_SECONDS = 60

const sending = ref(false)
const cooldownSeconds = ref(0)
const infoMessage = ref("")
const errorMessage = ref("")
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const stopCooldown = () => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
}

const startCooldown = () => {
  stopCooldown()
  cooldownSeconds.value = RESEND_COOLDOWN_SECONDS
  cooldownTimer = setInterval(() => {
    cooldownSeconds.value -= 1
    if (cooldownSeconds.value <= 0) {
      stopCooldown()
    }
  }, 1000)
}

const sendButtonLabel = computed(() => {
  if (sending.value) {
    return "发送中…"
  }
  if (cooldownSeconds.value > 0) {
    return `${cooldownSeconds.value}s 后重发`
  }
  return "发送验证码"
})

const handleSend = async () => {
  if (sending.value || cooldownSeconds.value > 0) {
    return
  }
  if (!isEmailReady.value) {
    errorMessage.value = "请先输入正确的邮箱地址"
    return
  }

  errorMessage.value = ""
  infoMessage.value = ""
  sending.value = true

  try {
    const result = await sendEmailCode(props.email.trim(), props.purpose)
    startCooldown()
    if (result.devCode) {
      // 开发环境：自动回填省掉手输（探针/联调无感）
      code.value = result.devCode
      infoMessage.value = result.message ?? "开发环境已自动回填验证码"
    } else {
      infoMessage.value = "验证码已发送，请查收邮箱（10 分钟内有效）"
    }
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "验证码发送失败，请稍后再试。")
    // 服务端 429（IP 限流/60s 重发冷却）时启动同长度的本地倒计时，防连点连败
    if (getApiErrorStatus(error) === 429) {
      startCooldown()
    }
  } finally {
    sending.value = false
  }
}

onBeforeUnmount(stopCooldown)
</script>

<template>
  <label class="block">
    <span class="mb-2 block text-sm font-medium text-ink-secondary">邮箱验证码</span>
    <div class="flex items-center gap-3">
      <div class="relative min-w-0 flex-1">
        <el-input
          v-model="code"
          :name="name ?? 'email-code'"
          inputmode="numeric"
          autocomplete="one-time-code"
          spellcheck="false"
          maxlength="6"
          :placeholder="placeholder ?? '请输入 6 位邮箱验证码'"
          class="w-full pl-10"
        />
        <!-- 前缀图标排在控件之后：EP 根自带填充色，按 DOM 序后画才能不被盖住（同 LoginView 口径） -->
        <AppIcon
          name="i-lucide-mail-check"
          class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-quaternary"
        />
      </div>
      <button
        type="button"
        class="h-9 shrink-0 rounded-kb-lg border border-line bg-muted px-3 text-[13px] text-ink-secondary transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="sending || cooldownSeconds > 0"
        :aria-label="sendButtonLabel"
        @click="handleSend"
      >
        {{ sendButtonLabel }}
      </button>
    </div>
    <p v-if="infoMessage" class="mt-2 text-[12px] leading-5 text-ink-tertiary">
      {{ infoMessage }}
    </p>
    <p v-if="errorMessage" class="mt-2 text-[12px] leading-5 text-error">
      {{ errorMessage }}
    </p>
  </label>
</template>

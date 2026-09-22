<script setup lang="ts">
/**
 * 锁定窗口渲染层（/lock 路由，全屏置顶 LockWindow 专属；#27 应用锁定）。
 *
 * 只做输入与提示：密码校验经 IPC 交给主进程比对 sha256 快照（渲染层拿不到哈希），
 * 校验通过由主进程关闭锁定窗；连错 5 次主进程返回 cooldown，这里负责 30s 倒计时。
 * 「退出登录」先走 authStore.logout 作废服务端会话并清本地 token，再请主进程关窗
 * 并向其余窗口广播 auth:unauthorized（各自回登录页）——锁定后只有输对密码或退出
 * 登录两条路能回到应用。
 *
 * Web 端直接访问 /lock 没有桌面主进程，降级为「仅桌面端可用」提示。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import logoUrl from "@/assets/yuque-logo.png"
import { PRODUCT_NAME } from "@/constants/desktop-settings"
import { useDesktopLock } from "@/composables/use-desktop-lock"
import { useAuthStore } from "@/stores/auth"

/** 冷却档与主进程 FAILED_ATTEMPTS_COOLDOWN_MS 同口径（30s）。 */
const COOLDOWN_SECONDS = 30

const { desktopAvailable, verifyPassword, unlockAfterLogout } = useDesktopLock()
const authStore = useAuthStore()

const password = ref("")
const errorMessage = ref("")
const cooldownSeconds = ref(0)
const busy = ref(false)
const inputRef = ref<{ focus: () => void } | null>(null)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const inCooldown = computed(() => cooldownSeconds.value > 0)

const stopCooldown = () => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
}

const startCooldown = (seconds: number) => {
  stopCooldown()
  cooldownSeconds.value = seconds
  cooldownTimer = setInterval(() => {
    cooldownSeconds.value -= 1
    if (cooldownSeconds.value <= 0) {
      stopCooldown()
      errorMessage.value = ""
    }
  }, 1000)
}

const handleVerify = async () => {
  if (busy.value || inCooldown.value) {
    return
  }
  const value = password.value
  if (!value) {
    errorMessage.value = "请输入锁定密码"
    return
  }

  busy.value = true
  try {
    const result = await verifyPassword(value)
    if (result.ok) {
      // 主进程校验通过后会自行关闭锁定窗（destroy），这里清输入即可
      password.value = ""
      errorMessage.value = ""
      return
    }

    password.value = ""
    if (result.reason === "cooldown") {
      const seconds = result.waitSeconds ?? COOLDOWN_SECONDS
      startCooldown(seconds)
      errorMessage.value = `尝试次数已达上限，请等待 ${seconds} 秒后重试`
    } else if (result.reason === "mismatch") {
      errorMessage.value = `密码错误，还可尝试 ${result.remainingAttempts ?? 0} 次`
    } else {
      errorMessage.value = "锁定服务不可用，请重启应用后重试"
    }
  } catch {
    // IPC 通道异常（主进程崩溃/窗口将销毁）：不给未处理的 rejection，
    // 也别把用户已输入的密码留在框里
    password.value = ""
    errorMessage.value = "锁定服务不可用，请重启应用后重试"
  } finally {
    busy.value = false
  }
}

const handleLogout = async () => {
  if (busy.value) {
    return
  }

  busy.value = true
  try {
    // authStore.logout 的 finally 保证接口失败也清本地会话，故这里吞掉异常也要继续
    await authStore.logout()
  } catch {
    /* 本地会话已清，继续退出锁屏 */
  } finally {
    await unlockAfterLogout()
    busy.value = false
  }
}

onMounted(() => {
  if (desktopAvailable) {
    inputRef.value?.focus()
  }
})

onBeforeUnmount(stopCooldown)
</script>

<template>
  <div class="kb-lock-page" data-testid="desktop-lock">
    <!-- Web 端无主进程：/lock 直达时降级为占位提示（正常不会出现在用户路径里） -->
    <div v-if="!desktopAvailable" class="kb-lock-card">
      <h1 class="kb-lock-title">{{ PRODUCT_NAME }}</h1>
      <p class="kb-lock-desc text-ink-secondary">锁定仅桌面端可用。</p>
    </div>

    <div v-else class="kb-lock-card">
      <img class="kb-lock-logo" :src="logoUrl" :alt="PRODUCT_NAME" />
      <h1 class="kb-lock-title">{{ PRODUCT_NAME }}已锁定</h1>
      <p class="kb-lock-desc text-ink-secondary">输入锁定密码以解锁</p>

      <el-input
        ref="inputRef"
        v-model="password"
        class="kb-lock-input"
        type="password"
        placeholder="请输入锁定密码"
        data-testid="lock-password-input"
        :disabled="inCooldown"
        @keyup.enter="handleVerify"
      />
      <p v-if="errorMessage" class="kb-lock-error" data-testid="lock-error">{{ errorMessage }}</p>

      <div class="kb-lock-actions">
        <el-button
          class="kb-lock-submit"
          type="primary"
          data-testid="lock-unlock"
          :loading="busy"
          :disabled="inCooldown"
          @click="handleVerify"
        >
          {{ inCooldown ? `${cooldownSeconds}s 后可重试` : "解锁" }}
        </el-button>
        <el-button
          text
          class="kb-lock-logout"
          data-testid="lock-logout"
          :disabled="busy"
          @click="handleLogout"
        >
          退出登录
        </el-button>
      </div>
    </div>
  </div>
</template>

<style>
/*
 * 锁定窗口度量：全屏居中卡片，色值一律走 --kb-* token（明暗自动换档）。
 * 该窗口无边框全屏，页面本体就是全部可视区。
 */
.kb-lock-page {
  align-items: center;
  background-color: var(--kb-surface-bg);
  color: var(--kb-text);
  display: flex;
  height: 100vh;
  justify-content: center;
}

.kb-lock-card {
  text-align: center;
  width: 320px;
}

.kb-lock-logo {
  margin: 0 auto;
  width: 64px;
}

.kb-lock-title {
  font-size: 20px;
  font-weight: 600;
  margin: 16px 0 0;
}

.kb-lock-desc {
  margin: 8px 0 24px;
}

.kb-lock-input {
  margin-bottom: 4px;
}

.kb-lock-error {
  color: var(--kb-error);
  font-size: 12px;
  line-height: 18px;
  margin: 8px 0 0;
  text-align: left;
}

.kb-lock-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.kb-lock-submit {
  width: 100%;
}
</style>

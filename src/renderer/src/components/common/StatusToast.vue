<script setup lang="ts">
/**
 * 组件，负责状态提示相关界面展示与交互。
 * duration 需与 useTransientToast 的自动关闭时长一致（默认 1800ms；AccountView 用 2200ms 时显式传入），
 * 底部进度条按同一时长做 scaleX 收缩倒计时，与实际消失时间同步。
 */
import { computed, ref, watch } from "vue"
import AppIcon from "./AppIcon.vue"

interface Props {
  show: boolean
  message: string
  type?: "success" | "error" | "info"
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: "success",
  duration: 1800,
})

/** 每次重新弹出都重置进度条动画（key 变化强制重建元素） */
const barKey = ref(0)

watch(
  () => props.show && !!props.message,
  active => {
    if (active) {
      barKey.value += 1
    }
  }
)

const toastMeta = computed(() => {
  if (props.type === "error") {
    return {
      shellClass: "border-error-light bg-error-bg/95 text-error-hover",
      iconClass: "bg-error-bg text-error",
      barClass: "bg-error-hover",
      label: "错误",
      icon: "i-lucide-triangle-alert",
    }
  }

  if (props.type === "info") {
    return {
      shellClass: "border-line bg-surface/95 text-ink-secondary",
      iconClass: "bg-muted text-ink-tertiary",
      barClass: "bg-grey-500",
      label: "提示",
      icon: "i-lucide-info",
    }
  }

  return {
    shellClass: "border-success-light bg-success-bg/95 text-success-active",
    iconClass: "bg-surface text-brand",
    barClass: "bg-success-hover",
    label: "成功",
    icon: "i-lucide-circle-check-big",
  }
})
</script>

<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="show && message"
      role="status"
      aria-live="polite"
      class="fixed right-6 top-6 z-[500] min-w-[240px] max-w-[380px] rounded-[22px] border px-4 py-3.5 shadow-[0_22px_48px_rgba(15,23,42,0.16)] backdrop-blur"
      :class="toastMeta.shellClass"
    >
      <div class="flex items-start gap-3">
        <span
          class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
          :class="toastMeta.iconClass"
        >
          <AppIcon :name="toastMeta.icon" class="h-[18px] w-[18px]" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium tracking-[0.08em] text-ink-quaternary">{{ toastMeta.label }}</p>
          <div class="mt-1 min-w-0 text-sm font-medium leading-6">{{ message }}</div>
        </div>
      </div>
      <div class="mt-3 h-1 overflow-hidden rounded-full bg-black/5">
        <div
          :key="barKey"
          class="h-full w-full origin-left rounded-full"
          :class="toastMeta.barClass"
          :style="{ animation: `kb-toast-countdown ${duration}ms linear forwards` }"
        />
      </div>
    </div>
  </transition>
</template>

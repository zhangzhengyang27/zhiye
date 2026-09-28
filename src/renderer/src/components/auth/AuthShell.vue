<script setup lang="ts">
/**
 * 认证页外壳（登录/注册/找回共用）。
 *
 * 双形态：Web 端维持「底色上浮卡片」的历史观感（改动前后像素口径不变）；
 * 独立登录窗（桌面端窗口化登录）内为扁平全幅版式——无卡片、居中大标，
 * 对齐语雀登录窗。窗口顶部拖拽带由 App.vue 统一渲染，这里不重复。
 * 品牌标用 zhiye-logo.png（与锁屏页/侧栏/设置页同一资产）。
 */
import zhiyeLogo from "@/assets/zhiye-logo.png"

defineProps<{
  title: string
  subtitle?: string
}>()

// 窗口形态每窗口静态，无需响应式
const isLoginWindow = Boolean(window.xiaoyeDesktop?.isLoginWindow)
</script>

<template>
  <section
    :class="
      isLoginWindow
        ? 'flex min-h-screen flex-col bg-surface px-8 pb-7 pt-14'
        : 'min-h-screen bg-[image:var(--kb-shell-bg)] px-4 py-10'
    "
  >
    <div
      :class="
        isLoginWindow
          ? 'mx-auto flex w-full max-w-[340px] flex-1 flex-col'
          : 'mx-auto flex min-h-[calc(100vh-5rem)] max-w-[420px] items-center'
      "
    >
      <div
        :class="
          isLoginWindow
            ? 'flex w-full flex-1 flex-col'
            : 'w-full rounded-kb-3xl border border-line bg-surface p-8 shadow-[var(--kb-elevated-shadow)] sm:p-10'
        "
      >
        <div
          :class="
            isLoginWindow
              ? 'flex flex-col items-center gap-3 pt-2 text-center'
              : 'flex items-center gap-3'
          "
        >
          <img
            :src="zhiyeLogo"
            alt="知叶"
            :class="isLoginWindow ? 'h-12 w-12 shrink-0' : 'h-11 w-11 shrink-0'"
            aria-hidden="true"
          />
          <div class="min-w-0">
            <h1 class="text-[22px] font-bold tracking-[-0.03em] text-ink">{{ title }}</h1>
            <p v-if="subtitle" class="mt-0.5 truncate text-[13px] text-ink-tertiary">
              {{ subtitle }}
            </p>
          </div>
        </div>

        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 认证页外壳（登录/注册/找回共用）。
 *
 * 双形态：Web 端维持「底色上浮卡片」的历史观感（改动前后像素口径不变）；
 * 独立登录窗（桌面端窗口化登录）内为扁平全幅版式——无卡片、居中大标，
 * 对齐语雀登录窗。窗口顶部拖拽带由 App.vue 统一渲染，这里不重复。
 * 品牌字用 text-on-brand：暗色品牌实心底按批 21 定档墨字（两向不同档）。
 */
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
          <span
            :class="
              isLoginWindow
                ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-kb-2xl bg-brand text-[20px] font-semibold text-on-brand'
                : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-kb-xl bg-brand text-[18px] font-semibold text-on-brand'
            "
            aria-hidden="true"
            >语</span
          >
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

<script setup lang="ts">
/**
 * 按钮组件（纯 Tailwind + design tokens，替代原 UButton / AppButton 包装）。
 *
 * color × variant 组合对齐原 UButton 的主要用法：
 * - primary（品牌绿）: solid=实底 / outline=描边 / soft=浅底深字 / ghost=无底
 * - neutral（中性灰）: 同上四态
 * - error / success / info: solid 与 soft 两态
 * 语义色全部来自 tokens，明暗两态自动跟随。
 */
import { computed } from "vue"
import AppIcon from "./AppIcon.vue"

const props = withDefaults(
  defineProps<{
    color?: "primary" | "neutral" | "error" | "success" | "info"
    variant?: "solid" | "outline" | "soft" | "ghost"
    size?: "xs" | "sm" | "md"
    type?: "button" | "submit" | "reset"
    icon?: string
    trailingIcon?: string
    loading?: boolean
    loadingIcon?: string
    square?: boolean
    disabled?: boolean
  }>(),
  {
    color: "primary",
    variant: "solid",
    size: "md",
    type: "button",
    icon: undefined,
    trailingIcon: undefined,
    loading: false,
    loadingIcon: "i-lucide-loader-circle",
    square: false,
    disabled: false,
  }
)

defineOptions({ inheritAttrs: false })

const isDisabled = computed(() => props.disabled || props.loading)

/** 色彩语义：按 color × variant 映射到 token utility。 */
const colorClass = computed(() => {
  const { color, variant } = props

  if (color === "primary") {
    if (variant === "solid") return "bg-brand text-white hover:bg-brand-hover active:bg-brand-active"
    if (variant === "outline") return "border border-brand text-brand hover:bg-brand-faint"
    if (variant === "soft") return "bg-brand-light text-brand-active hover:bg-brand-lighter"
    return "text-brand hover:bg-brand-faint"
  }

  if (color === "error") {
    if (variant === "solid") return "bg-error text-white hover:bg-error-hover active:bg-error-active"
    if (variant === "outline") return "border border-error text-error hover:bg-error-bg"
    if (variant === "soft") return "bg-error-light text-error hover:bg-error-bg"
    return "text-error hover:bg-error-bg"
  }

  if (color === "success") {
    if (variant === "solid") return "bg-success text-white hover:bg-success-hover active:bg-success-active"
    if (variant === "outline") return "border border-success text-success hover:bg-success-bg"
    if (variant === "soft") return "bg-success-light text-success hover:bg-success-bg"
    return "text-success hover:bg-success-bg"
  }

  if (color === "info") {
    if (variant === "solid") return "bg-info text-white hover:bg-info-hover active:bg-info-active"
    if (variant === "outline") return "border border-info text-info hover:bg-info-bg"
    if (variant === "soft") return "bg-info-light text-info hover:bg-info-bg"
    return "text-info hover:bg-info-bg"
  }

  // neutral：注意暗色下 grey 反转，solid 用 grey-900 底 + grey-100 字保证两种模式可读
  if (variant === "solid") return "bg-grey-900 text-grey-100 hover:bg-grey-700"
  if (variant === "outline") return "border border-line text-ink-secondary hover:bg-muted"
  if (variant === "soft") return "bg-muted text-ink-secondary hover:bg-grey-200"
  return "text-ink-secondary hover:bg-muted"
})

/** 尺寸语义：对齐原 UButton 的 xs/sm/md。 */
const sizeClass = computed(() => {
  if (props.size === "xs") return props.square ? "h-6 w-6 p-0 text-xs" : "h-6 gap-1 px-2 text-xs"
  if (props.size === "sm") return props.square ? "h-8 w-8 p-0 text-sm" : "h-8 gap-1.5 px-3 text-sm"
  return props.square ? "h-9 w-9 p-0 text-sm" : "h-9 gap-2 px-3.5 text-sm"
})
</script>

<template>
  <button
    :type="type"
    :disabled="isDisabled"
    class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-medium transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
    :class="[colorClass, sizeClass, $attrs.class]"
  >
    <AppIcon v-if="loading" :name="loadingIcon" class="animate-spin" />
    <AppIcon v-else-if="icon" :name="icon" />
    <slot />
    <AppIcon v-if="trailingIcon && !loading" :name="trailingIcon" />
  </button>
</template>

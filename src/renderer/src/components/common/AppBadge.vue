<script setup lang="ts">
/**
 * 徽标组件（纯 Tailwind + design tokens，替代 UBadge）。
 * color × variant 组合对齐原 UBadge 的用法：soft=浅底色字 / subtle=极浅底色字 / solid=实底白字。
 */
import { computed } from "vue"

const props = withDefaults(
  defineProps<{
    color?: "primary" | "neutral" | "success" | "warning" | "error" | "info"
    variant?: "soft" | "subtle" | "solid"
    size?: "xs" | "sm" | "md"
  }>(),
  {
    color: "neutral",
    variant: "soft",
    size: "sm",
  },
)

const toneClass = computed(() => {
  const { color, variant } = props

  if (variant === "solid") {
    if (color === "primary") return "bg-brand text-white"
    if (color === "success") return "bg-success text-white"
    if (color === "warning") return "bg-warning text-white"
    if (color === "error") return "bg-error text-white"
    if (color === "info") return "bg-info text-white"
    // 与 AppButton 的中性实心一致，底色/文字由 --kb-neutral* 在明暗两态换档
    return "bg-neutral text-neutral-ink"
  }

  const tones: Record<string, { soft: string; subtle: string }> = {
    primary: {
      soft: "bg-brand-light text-brand-active",
      subtle: "bg-brand-faint text-brand-active",
    },
    success: { soft: "bg-success-light text-success", subtle: "bg-success-bg text-success" },
    warning: { soft: "bg-warning-light text-warning", subtle: "bg-warning-bg text-warning" },
    error: { soft: "bg-error-light text-error", subtle: "bg-error-bg text-error" },
    info: { soft: "bg-info-light text-info", subtle: "bg-info-bg text-info" },
    neutral: { soft: "bg-muted text-ink-secondary", subtle: "bg-grey-100 text-ink-tertiary" },
  }

  return tones[color]?.[variant] ?? ""
})

const sizeClass = computed(() => {
  if (props.size === "xs") return "h-4 px-1.5 text-[10px]"
  if (props.size === "md") return "h-6 px-2.5 text-xs"
  return "h-5 px-2 text-[11px]"
})
</script>

<template>
  <span
    class="inline-flex items-center justify-center gap-1 rounded-full font-medium whitespace-nowrap"
    :class="[toneClass, sizeClass]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
/**
 * 卡片组件（纯 Tailwind + design tokens，替代 UCard）。
 * 提供 header / 默认 body / footer 三段插槽；原 UCard 的 `:ui` 深度定制
 * 在替换时转成本组件的 class。调用方 class 经 cn() 合并，冲突组（bg/rounded 等）以调用方为准。
 */
import { computed, useAttrs } from "vue"
import { cn } from "@/utils/cn"

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()

const cardAttrs = computed(() => {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class"))
})

const cardClass = computed(() =>
  cn("rounded-2xl border border-line bg-surface shadow-[var(--kb-card-shadow)]", String(attrs.class ?? ""))
)
</script>

<template>
  <div v-bind="cardAttrs" :class="cardClass">
    <div v-if="$slots.header" class="px-5 py-4">
      <slot name="header" />
    </div>

    <div class="px-5 py-4">
      <slot />
    </div>

    <div v-if="$slots.footer" class="px-5 py-3">
      <slot name="footer" />
    </div>
  </div>
</template>

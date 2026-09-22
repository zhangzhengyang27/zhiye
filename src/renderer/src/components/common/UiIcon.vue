<script setup lang="ts">
/**
 * 图标组件：本地渲染替代 Iconify 运行时方案。
 *
 * `icon="ph:*"` 渲染 @phosphor-icons/vue、`icon="i-lucide-*"` 渲染 lucide-vue-next，
 * 映射表来自 `icon-map.generated.ts`（由 scripts/build-icon-map.mjs 扫描源码生成，
 * dev / build 脚本已自动前置该步骤）。新增图标后重新执行 `pnpm icons`。
 *
 * 兼容原 @iconify/vue 的使用方式：`<Icon icon="ph:x" :width="14" :height="14" />`，
 * width / height / class 等属性直接透传给图标组件（两者都用 currentColor，颜色跟随文字）。
 */
import { computed } from "vue"
import { iconMap } from "./icon-map.generated"

const props = defineProps<{
  icon?: string | null
}>()

const entry = computed(() => (props.icon ? iconMap[props.icon] : undefined))
</script>

<template>
  <component :is="entry.component" v-if="entry" aria-hidden="true" v-bind="entry.attrs" />
</template>

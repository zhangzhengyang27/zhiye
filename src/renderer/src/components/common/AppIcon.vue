<script setup lang="ts">
/**
 * 图标组件（AppIcon）：基于本地图标映射渲染，兼容原 `i-lucide-*` 与 `ph:*` 命名。
 *
 * 映射表来自 `icon-map.generated.ts`（由 scripts/build-icon-map.mjs 扫描源码生成，
 * dev / build 脚本已自动前置该步骤）。新增图标后重新执行 `pnpm icons`。
 */
import { computed } from "vue"
import { iconMap } from "./icon-map.generated"

const props = defineProps<{
  name: string
}>()

const entry = computed(() => iconMap[props.name.trim()])
</script>

<template>
  <component
    :is="entry.component"
    v-if="entry"
    aria-hidden="true"
    class="h-[1.2em] w-[1.2em] shrink-0"
    v-bind="entry.attrs"
  />
</template>

<script setup lang="ts">
/** 卡片组件，负责文档信息概览信息展示与局部操作。 */
defineProps<{
  stats: Array<{ label: string; value: string }>
  meta: Array<{ label: string; value: string }>
}>()
</script>

<template>
  <!-- 原 UCard variant="soft" 深度定制（无边框浅底卡片），以普通 div 保持视觉等价 -->
  <div class="rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-ink">文档概况</p>
        <p class="mt-1 text-xs text-ink-quaternary">结构、评论和协作概览。</p>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2">
      <div
        v-for="item in stats"
        :key="item.label"
        class="rounded-kb-2xl border border-line bg-muted px-3 py-3"
      >
        <p class="text-[11px] font-medium text-ink-quaternary">{{ item.label }}</p>
        <p class="mt-1 text-[16px] font-semibold text-ink">{{ item.value }}</p>
      </div>
    </div>

    <!-- 创建者 / 创建时间 / 更新时间（对齐语雀信息面板的元信息行） -->
    <dl class="mt-4 space-y-2 border-t border-line pt-3 text-xs">
      <div v-for="item in meta" :key="item.label" class="flex items-center gap-3">
        <dt class="w-14 shrink-0 text-ink-quaternary">{{ item.label }}</dt>
        <dd class="min-w-0 flex-1 truncate text-ink-secondary">{{ item.value }}</dd>
      </div>
    </dl>
  </div>
</template>

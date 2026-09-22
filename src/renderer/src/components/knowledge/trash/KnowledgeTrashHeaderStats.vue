<script setup lang="ts">
/** 组件，负责知识库回收站头部统计相关界面展示与交互。 */
const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    docsCount: number
    kbsCount: number
    selectedCount: number
  }>(),
  {
    title: "管理待恢复与待清理内容",
    description: "集中处理被删除的文档与知识库，支持恢复、批量彻底删除和按空间筛选，保证回收流程有序可控。",
  }
)
</script>

<template>
  <section class="kb-section-shell p-6">
    <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div class="min-w-0">
        <div
          class="inline-flex items-center gap-2 rounded-full border border-error-light bg-error-bg px-3 py-1 text-xs font-medium text-error"
        >
          <AppIcon name="i-lucide-trash-2" class="h-3.5 w-3.5" />
          回收站
        </div>
        <h1 class="mt-4 text-2xl font-semibold tracking-tight text-ink">{{ props.title }}</h1>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-ink-tertiary">
          {{ props.description }}
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="kb-stat-card">
          <p class="text-[11px] uppercase tracking-[0.18em] text-ink-quaternary">文档待清理</p>
          <p class="mt-2 text-lg font-semibold text-ink">{{ props.docsCount }}</p>
        </div>
        <div class="kb-stat-card">
          <p class="text-[11px] uppercase tracking-[0.18em] text-ink-quaternary">知识库待恢复</p>
          <p class="mt-2 text-lg font-semibold text-ink">{{ props.kbsCount }}</p>
        </div>
        <div class="kb-stat-card">
          <p class="text-[11px] uppercase tracking-[0.18em] text-ink-quaternary">当前已选</p>
          <p class="mt-2 text-lg font-semibold text-ink">{{ props.selectedCount }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

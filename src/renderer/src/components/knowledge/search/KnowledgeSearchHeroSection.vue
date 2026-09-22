<script setup lang="ts">
/** 分区组件，负责知识库搜索头部内容组织与展示。 */
import { computed } from "vue"
import Icon from "@/components/common/UiIcon.vue"

type InsightCard = {
  label: string
  value: string | number
  hint: string
}

const props = defineProps<{
  workspaceName: string
  currentScopeLabel: string
  hasActiveFilters: boolean
  activeFilterCount: number
  insightCards: InsightCard[]
}>()

const emit = defineEmits<{
  "back-overview": []
  "open-settings": []
}>()

const statusLabel = computed(() => {
  return props.hasActiveFilters ? `已启用 ${props.activeFilterCount} 个筛选条件` : "当前未额外筛选"
})
</script>

<template>
  <section class="kb-section-shell">
    <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div
          class="inline-flex items-center gap-2 rounded-full bg-fill-muted px-3 py-1 text-xs font-medium text-ink-secondary"
        >
          <Icon icon="ph:magnifying-glass" :width="14" :height="14" />
          文档搜索
        </div>
        <h1 class="mt-4 text-[28px] font-semibold tracking-[-0.03em] text-ink">
          在当前知识库中检索内容
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-7 text-ink-tertiary">
          支持按标题或正文搜索，并叠加状态、日期等筛选条件，帮助你快速定位知识沉淀。
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary"
          >
            当前空间：{{ props.workspaceName }}
          </span>
          <span
            class="inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary"
          >
            搜索范围：{{ props.currentScopeLabel }}
          </span>
          <span
            class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
            :class="
              props.hasActiveFilters
                ? 'bg-warning-bg text-warning-hover'
                : 'bg-surface text-ink-tertiary'
            "
          >
            {{ statusLabel }}
          </span>
        </div>
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <el-button
            plain
            class="border-line-input bg-surface py-2 text-ink-secondary"
            @click="emit('back-overview')"
            ><span class="truncate">返回概览</span>
          </el-button>
          <el-button text class="bg-surface py-2 text-ink-secondary" @click="emit('open-settings')"
            ><span class="truncate">打开设置</span>
          </el-button>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="card in props.insightCards" :key="card.label" class="kb-section-card px-4 py-3">
          <p class="text-[11px] uppercase tracking-[0.18em] text-ink-quaternary">
            {{ card.label }}
          </p>
          <p class="mt-2 text-lg font-semibold text-ink">{{ card.value }}</p>
          <p class="mt-2 line-clamp-2 text-xs leading-5 text-ink-tertiary">{{ card.hint }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

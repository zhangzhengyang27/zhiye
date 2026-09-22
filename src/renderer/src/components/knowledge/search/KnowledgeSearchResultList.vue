<script setup lang="ts">
/** 列表组件，负责知识库搜索Result集合渲染与批量交互。 */
import { computed } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeDocumentSearchResult } from "@/services/knowledge-documents"
import KnowledgeSearchResultRow from "@/components/knowledge/search/KnowledgeSearchResultRow.vue"

type KnowledgeSearchItem = KnowledgeDocumentSearchResult["items"][number]

const props = defineProps<{
  filteredItems: KnowledgeSearchItem[]
  resultTotal: number
  keyword: string
  currentScopeLabel: string
  activeFilterLabels: string[]
}>()

const emit = defineEmits<{
  refresh: []
  "open-doc": [docId: string, editorType?: string]
}>()

const visibleCount = computed(() => props.filteredItems.length)
</script>

<template>
  <div class="space-y-3 p-5">
    <div class="rounded-kb-3xl bg-muted px-4 py-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-full bg-brand-faint px-3 py-1 text-xs font-medium text-brand">
          关键词：{{ props.keyword.trim() }}
        </span>
        <span class="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-secondary">
          范围：{{ props.currentScopeLabel }}
        </span>
        <span
          v-for="label in props.activeFilterLabels"
          :key="`${label}-result`"
          class="rounded-full border border-warning-light bg-surface px-3 py-1 text-xs font-medium text-warning-active"
        >
          {{ label }}
        </span>
        <span
          v-if="!props.activeFilterLabels.length"
          class="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-tertiary"
        >
          当前未额外筛选
        </span>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-tertiary">
        <p>
          共命中 <span class="font-semibold text-ink">{{ props.resultTotal }}</span> 条， 当前可见
          <span class="font-semibold text-ink">{{ visibleCount }}</span> 条。
        </p>
        <el-button
          text
          size="small"
          class="rounded-full bg-surface px-3 py-1.5 text-ink-secondary hover:text-brand"
          @click="emit('refresh')"
          ><Icon icon="ph:arrow-clockwise" :width="14" :height="14" />
          <span class="truncate">刷新搜索</span>
        </el-button>
      </div>
    </div>

    <KnowledgeSearchResultRow
      v-for="item in props.filteredItems"
      :key="item.id"
      :item="item"
      :keyword="props.keyword"
      @open="(docId, editorType) => emit('open-doc', docId, editorType)"
    />
  </div>
</template>

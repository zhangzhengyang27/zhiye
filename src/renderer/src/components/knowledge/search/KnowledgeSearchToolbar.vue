<script setup lang="ts">
/** 工具栏组件，负责知识库搜索筛选、搜索与快捷操作。 */
import { computed } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeSearchScope } from "@/services/knowledge-documents"
import { ChevronDown } from "lucide-vue-next"
import { isImeComposing } from "@/utils/keyboard"

type SuggestedQuery = {
  label: string
  keyword: string
  scope: KnowledgeSearchScope
  description: string
}

type ScopeOption = {
  id: KnowledgeSearchScope
  label: string
}

type StatusOption = {
  label: string
  value: string
}

const props = defineProps<{
  keyword: string
  scope: KnowledgeSearchScope
  scopeOptions: ScopeOption[]
  statusOptions: StatusOption[]
  loading: boolean
  recommendedQueries: SuggestedQuery[]
  filterStatus: string
  filterDateFrom: string
  filterDateTo: string
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  "update:keyword": [value: string]
  "update:scope": [value: KnowledgeSearchScope]
  "update:filterStatus": [value: string]
  "update:filterDateFrom": [value: string]
  "update:filterDateTo": [value: string]
  search: []
  clearFilters: []
  applySuggested: [payload: { keyword: string; scope: KnowledgeSearchScope }]
}>()

/** 输入法组词期间的 Enter 是「确认候选」，不能当作搜索 */
const handleEnter = (event: KeyboardEvent) => {
  if (isImeComposing(event)) {
    return
  }

  event.preventDefault()
  emit("search")
}

/**
 * 创建时间筛选：两个独立的 YYYY-MM-DD prop 桥接为 daterange 选择器的
 * [from, to] 模型（原生 date input 的占位格式随浏览器 locale 漂移，
 * 曾露出英文 mm/dd/yyyy，见 docs/UI精致度排查-2026-09-15.md P0-3）。
 */
const dateRange = computed<[string, string] | null>({
  get: () =>
    props.filterDateFrom && props.filterDateTo
      ? ([props.filterDateFrom, props.filterDateTo] as [string, string])
      : null,
  set: value => {
    emit("update:filterDateFrom", value?.[0] ?? "")
    emit("update:filterDateTo", value?.[1] ?? "")
  },
})
</script>

<template>
  <div class="mt-6 rounded-kb-3xl bg-surface p-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <div class="relative flex-1">
        <el-input
          :model-value="props.keyword"
          type="text"
          placeholder="输入关键字后按 Enter 搜索"
          class="w-full py-2.5 pl-9 pr-3 text-sm text-ink-secondary"
          @update:model-value="emit('update:keyword', $event)"
          @keydown.enter="handleEnter($event as KeyboardEvent)"
        />
        <Icon
          icon="ph:magnifying-glass"
          :width="16"
          :height="16"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-quaternary"
        />
      </div>

      <div class="flex items-center gap-2">
        <el-button
          v-for="option in props.scopeOptions"
          :key="option.id"
          plain
          class="border px-3 py-2 text-xs font-semibold"
          :class="
            props.scope === option.id
              ? 'border-brand-lighter bg-brand-faint text-brand'
              : 'border-line-input bg-surface text-ink-quaternary hover:border-brand-lighter hover:text-brand'
          "
          @click="emit('update:scope', option.id)"
          ><span class="truncate">{{ option.label }}</span>
        </el-button>
      </div>

      <el-button type="primary" class="py-2 font-semibold" :disabled="props.loading" @click="emit('search')"
        ><span class="truncate">{{ props.loading ? "搜索中…" : "搜索" }}</span>
      </el-button>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <span class="text-xs font-medium text-ink-quaternary">建议搜索</span>
      <el-button
        v-for="preset in props.recommendedQueries"
        :key="preset.label"
        text
        class="rounded-full bg-fill-muted px-3 py-1.5 text-xs text-ink-secondary hover:bg-surface-soft hover:text-brand font-semibold"
        @click="emit('applySuggested', { keyword: preset.keyword, scope: preset.scope })"
        ><span class="truncate">{{ preset.label }}</span>
      </el-button>
    </div>

    <!-- 分组底色不能再取 bg-muted：控件填充 --kb-muted-bg 与它是同一个 token，
         明暗两套都会让筛选控件与容器同色（隐形件检测器实测命中）。改成分隔描边 -->
    <div class="mt-4 rounded-kb-3xl border border-line p-4">
      <div class="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-quaternary">
        <span class="inline-flex items-center gap-1">
          <Icon icon="ph:sliders-horizontal" :width="14" :height="14" />
          筛选条件
        </span>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-3">
        <el-select
          :model-value="props.filterStatus"
          :options="props.statusOptions"
          :offset="6"
          :show-arrow="false"
          :suffix-icon="ChevronDown"
          class="h-8 px-2 text-xs"
          @update:model-value="emit('update:filterStatus', String($event))"
        />

        <div class="flex items-center gap-1.5 text-xs text-ink-tertiary">
          <span id="kb-search-created-range-label">创建时间</span>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            range-separator="~"
            :clearable="true"
            :editable="false"
            aria-labelledby="kb-search-created-range-label"
            class="h-8 text-xs"
          />
        </div>

        <el-button
          v-if="props.hasActiveFilters"
          text
          size="small"
          class="rounded-kb-xl text-ink-quaternary hover:bg-surface hover:text-ink-secondary"
          @click="emit('clearFilters')"
          ><span class="truncate">清除筛选</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

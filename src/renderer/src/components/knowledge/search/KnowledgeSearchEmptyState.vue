<script setup lang="ts">
/** 空态组件，负责知识库搜索结果缺失时的提示展示。 */
import type { KnowledgeSearchScope } from "@/services/knowledge-documents"

type SuggestedQuery = {
  label: string
  keyword: string
  scope: KnowledgeSearchScope
  description: string
}

const props = defineProps<{
  keyword: string
  scope: KnowledgeSearchScope
  currentScopeLabel: string
  hasActiveFilters: boolean
  activeFilterCount: number
  activeFilterLabels: string[]
  hasSuppressedMatches: boolean
  recommendedQueries: SuggestedQuery[]
}>()

const emit = defineEmits<{
  "clear-filters": []
  "apply-suggested-search": [keyword: string, scope: KnowledgeSearchScope]
  "reset-search": []
}>()
</script>

<template>
  <div class="px-5 py-8">
    <div class="mx-auto max-w-4xl rounded-kb-3xl bg-warning-bg p-6">
      <div
        class="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-warning-active"
      >
        暂无匹配结果
      </div>
      <h3 class="mt-4 text-xl font-semibold text-ink">
        {{
          props.hasSuppressedMatches
            ? "已有原始命中，但被当前筛选条件排除了"
            : `没有找到“${props.keyword.trim()}”相关文档`
        }}
      </h3>
      <p class="mt-3 text-sm leading-6 text-ink-secondary">
        当前在 {{ props.currentScopeLabel }} 中检索
        <span class="font-medium text-ink">“{{ props.keyword.trim() }}”</span>
        <span v-if="props.hasActiveFilters"
          >，并叠加了 {{ props.activeFilterCount }} 项筛选条件。</span
        >
        <span v-else>，尚未添加额外筛选。</span>
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-white/80 bg-surface px-3 py-1 text-xs font-medium text-ink-secondary"
        >
          搜索范围：{{ props.currentScopeLabel }}
        </span>
        <span
          v-for="label in props.activeFilterLabels"
          :key="label"
          class="rounded-full border border-warning-light bg-surface px-3 py-1 text-xs font-medium text-warning-active"
        >
          {{ label }}
        </span>
        <span
          v-if="!props.activeFilterLabels.length"
          class="rounded-full border border-white/80 bg-surface px-3 py-1 text-xs font-medium text-ink-tertiary"
        >
          当前未额外筛选
        </span>
      </div>

      <div class="mt-6 flex flex-wrap gap-2">
        <el-button v-if="props.hasActiveFilters" type="primary" @click="emit('clear-filters')"
          ><span class="truncate">清除筛选后重试</span>
        </el-button>
        <el-button
          v-if="props.scope !== 'title'"
          plain
          @click="emit('apply-suggested-search', props.keyword.trim(), 'title')"
          ><span class="truncate">改为仅搜标题</span>
        </el-button>
        <el-button
          v-if="props.scope !== 'all'"
          plain
          @click="emit('apply-suggested-search', props.keyword.trim(), 'all')"
          ><span class="truncate">恢复全文检索</span>
        </el-button>
        <el-button text @click="emit('reset-search')"
          ><span class="truncate">重新开始搜索</span>
        </el-button>
      </div>

      <div class="mt-6 grid gap-3 md:grid-cols-3">
        <el-button
          v-for="preset in props.recommendedQueries"
          :key="`${preset.label}-empty`"
          text
          class="justify-start rounded-kb-2xl bg-surface py-4 text-left shadow-sm hover:-translate-y-0.5 w-full"
          @click="emit('apply-suggested-search', preset.keyword, preset.scope)"
          ><span class="truncate"
            ><div class="w-full">
              <p class="text-sm font-semibold text-ink">{{ preset.label }}</p>
              <p class="mt-2 text-xs leading-5 text-ink-tertiary">{{ preset.description }}</p>
              <p class="mt-3 text-xs font-medium text-brand">改搜 “{{ preset.keyword }}”</p>
            </div></span
          >
        </el-button>
      </div>
    </div>
  </div>
</template>

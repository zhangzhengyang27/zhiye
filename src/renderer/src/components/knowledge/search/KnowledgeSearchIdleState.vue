<script setup lang="ts">
/** 空闲态组件，负责知识库搜索初始引导展示。 */
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeSearchScope } from "@/services/knowledge-documents"

type SuggestedQuery = {
  label: string
  keyword: string
  scope: KnowledgeSearchScope
  description: string
}

const props = defineProps<{
  recommendedQueries: SuggestedQuery[]
}>()

const emit = defineEmits<{
  "apply-suggested-search": [keyword: string, scope: KnowledgeSearchScope]
  "reset-search": []
  "back-overview": []
}>()
</script>

<template>
  <div class="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
    <div class="rounded-kb-3xl bg-muted p-6">
      <div
        class="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-brand"
      >
        <Icon icon="ph:magnifying-glass" :width="14" :height="14" />
        尚未开始搜索
      </div>
      <h3 class="mt-4 text-xl font-semibold text-ink">先输入关键词，再逐步收窄范围</h3>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
        搜索页现在会同时承接“探索”和“定位”两种工作。建议先用较宽的关键词发起首次检索，再通过标题 /
        正文范围与状态筛选逐层收窄。
      </p>

      <div class="mt-6 grid gap-3 md:grid-cols-3">
        <el-button
          v-for="preset in props.recommendedQueries"
          :key="preset.keyword"
          text
          class="min-w-0 justify-start rounded-kb-2xl bg-surface py-4 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md w-full"
          @click="emit('apply-suggested-search', preset.keyword, preset.scope)"
          ><span class="block w-full min-w-0"
            ><div class="w-full">
              <p class="text-sm font-semibold text-ink">{{ preset.label }}</p>
              <p class="mt-2 text-xs leading-5 text-ink-tertiary">{{ preset.description }}</p>
              <p class="mt-3 text-xs font-medium text-brand">搜索 “{{ preset.keyword }}”</p>
            </div></span
          >
        </el-button>
      </div>
    </div>

    <div class="space-y-4">
      <div class="rounded-kb-3xl bg-muted px-5 py-5">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-ink-quaternary">
          可搜索范围
        </p>
        <div class="mt-4 space-y-3 text-sm text-ink-secondary">
          <div class="rounded-kb-2xl bg-surface px-4 py-3">
            <p class="font-medium text-ink">标题与正文</p>
            <p class="mt-1 text-xs leading-5 text-ink-tertiary">
              适合先做全局定位，再切换到更精确的标题搜索。
            </p>
          </div>
          <div class="rounded-kb-2xl bg-surface px-4 py-3">
            <p class="font-medium text-ink">状态与创建时间</p>
            <p class="mt-1 text-xs leading-5 text-ink-tertiary">
              可快速排除草稿、历史文档或非当前阶段内容。
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-kb-3xl bg-surface px-5 py-5">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-ink-quaternary">
          下一步动作
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <el-button
            type="primary"
            class="bg-brand-faint text-brand kb-btn-soft"
            @click="emit('apply-suggested-search', '规范', 'title')"
            ><span class="truncate">先搜标题中的规范</span>
          </el-button>
          <el-button plain @click="emit('back-overview')"
            ><span class="truncate">回到概览看上下文</span>
          </el-button>
        </div>
        <p class="mt-4 text-xs leading-5 text-ink-tertiary">
          如果你还不确定关键词，可以先回到概览或最近更新，确认最近活跃主题后再检索。
        </p>
        <el-button
          text
          size="small"
          class="mt-4 rounded-full bg-surface px-3 py-1 text-ink-secondary hover:text-brand"
          @click="emit('reset-search')"
          ><Icon icon="ph:sliders-horizontal" :width="14" :height="14" />
          <span class="truncate">重新开始搜索</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

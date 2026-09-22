<script setup lang="ts">
/** 行组件，负责知识库回收站 Kb 单项展示与行内操作（扁平行式，对齐语雀列表密度）。 */
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"

const props = defineProps<{
  item: KnowledgeBaseItem
  submitting: boolean
  deletedAtText: string
}>()

const emit = defineEmits<{
  restore: [id: string]
}>()
</script>

<template>
  <div
    class="group flex h-(--kb-row-height-doc) items-center gap-2.5 rounded-kb-sm px-2.5 transition-colors duration-150 hover:bg-grey-200"
  >
    <Icon icon="ph:database" :width="16" :height="16" class="shrink-0 text-ink-tertiary" />

    <span class="min-w-0 flex-1 truncate text-kb-base text-ink">{{ props.item.name }}</span>

    <span class="hidden shrink-0 text-kb-xs text-ink-quaternary lg:inline">知识库</span>
    <span class="w-24 shrink-0 text-right text-kb-xs text-ink-quaternary">{{
      props.deletedAtText
    }}</span>

    <div class="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="kb-trash-row-action flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-quaternary opacity-0 transition hover:bg-grey-300 hover:text-success group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-55"
        :disabled="props.submitting"
        title="恢复知识库"
        @click="emit('restore', props.item.id)"
      >
        <Icon icon="ph:arrow-counter-clockwise" :width="15" :height="15" />
      </button>
    </div>
  </div>
</template>

<style>
/* 触屏无 hover（与 KnowledgeTreeNode 的 hover:none 处理同族）：行内操作按钮
   靠 opacity-0 加 group-hover 浮现，触屏上 hover 永不成立就永不可见，却仍可点。
   用 unlayered 媒体查询让按钮在无 hover 设备上恒可见——@layer utilities 的
   Tailwind 变体会输给 unlayered 声明；:not(:disabled) 保留提交中的置灰态 */
@media (hover: none) {
  .kb-trash-row-action:not(:disabled) {
    opacity: 1;
  }
}
</style>

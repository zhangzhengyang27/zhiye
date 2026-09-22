<script setup lang="ts">
/** 列表组件，负责知识库回收站Kb集合渲染与批量交互。 */
import { computed } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"
import KnowledgeTrashKbRow from "@/components/knowledge/trash/KnowledgeTrashKbRow.vue"

const props = defineProps<{
  items: readonly KnowledgeBaseItem[]
  submitting: boolean
  formatDateTime: (input: string | undefined) => string
}>()

const emit = defineEmits<{
  restoreSingleKb: [id: string]
}>()

const hasItems = computed(() => props.items.length > 0)
</script>

<template>
  <div v-if="!hasItems" class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <Icon icon="ph:database" :width="36" :height="36" class="mb-3 text-ink-quaternary" />
    <p class="text-kb-base font-medium text-ink-secondary">知识库回收站为空</p>
    <p class="mt-1.5 max-w-sm text-kb-xs leading-5 text-ink-tertiary">被删除的知识库会在这里等待恢复。</p>
  </div>

  <div v-else class="space-y-0.5">
    <KnowledgeTrashKbRow
      v-for="item in props.items"
      :key="item.id"
      :item="item"
      :submitting="props.submitting"
      :deleted-at-text="props.formatDateTime(item.deletedAt || '')"
      @restore="emit('restoreSingleKb', $event)"
    />
  </div>
</template>

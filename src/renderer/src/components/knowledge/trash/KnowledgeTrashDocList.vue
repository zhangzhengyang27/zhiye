<script setup lang="ts">
/** 列表组件，负责知识库回收站 Doc 集合渲染与批量交互（全选 + 批量恢复/彻底删除）。 */
import { computed } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeTrashDocRow from "@/components/knowledge/trash/KnowledgeTrashDocRow.vue"

type TrashDocItem = {
  id: string
  title: string
  editorType?: string
  kbId: string
  /** 后端 listTrash 返回扁平 kbName（无嵌套 kb 对象） */
  kbName: string
  deletedAt: string
}

const props = defineProps<{
  items: readonly TrashDocItem[]
  selectedDocIds: string[]
  total: number
  selectAll: boolean
  selectIndeterminate: boolean
  submitting: boolean
  formatDateTime: (input: string | undefined) => string
  resolveEditorLabel: (editorType?: string | null) => string
}>()

const emit = defineEmits<{
  toggleSelectAll: []
  toggleSelectDoc: [id: string]
  restoreSingleDoc: [id: string]
  hardDeleteSingleDoc: [id: string]
  restoreSelectedDocs: []
  hardDeleteSelectedDocs: []
}>()

const hasItems = computed(() => props.items.length > 0)
const selectedCount = computed(() => props.selectedDocIds.length)
const canBatchOperate = computed(() => selectedCount.value > 0 && !props.submitting)
</script>

<template>
  <div v-if="!hasItems" class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <Icon icon="ph:file-text" :width="36" :height="36" class="mb-3 text-ink-quaternary" />
    <p class="text-kb-base font-medium text-ink-secondary">文档回收站为空</p>
    <p class="mt-1.5 max-w-sm text-kb-xs leading-5 text-ink-tertiary">
      被删除的文档会在这里等待恢复。
    </p>
  </div>

  <div v-else class="space-y-0.5">
    <!-- 全选 + 批量操作行：勾选任意行后浮现批量恢复/彻底删除（配合行内单行操作） -->
    <div class="flex h-(--kb-row-height-doc) items-center gap-2.5 rounded-kb-sm px-2.5">
      <el-checkbox
        :model-value="props.selectAll"
        :indeterminate="props.selectIndeterminate"
        :disabled="props.submitting"
        aria-label="全选文档"
        class="shrink-0"
        @update:model-value="emit('toggleSelectAll')"
      />
      <span class="min-w-0 truncate text-kb-xs text-ink-quaternary">
        共 {{ props.total }} 条，已选 {{ selectedCount }} 项
      </span>

      <div class="flex flex-1 items-center justify-end gap-2">
        <el-button
          plain
          size="small"
          class="rounded-kb-md border-line bg-surface px-3 text-[12px] text-ink-secondary"
          :disabled="!canBatchOperate"
          @click="emit('restoreSelectedDocs')"
          ><span class="truncate">恢复选中项</span>
        </el-button>
        <el-button
          plain
          size="small"
          class="rounded-kb-md border-line bg-surface px-3 text-[12px] text-error"
          :disabled="!canBatchOperate"
          @click="emit('hardDeleteSelectedDocs')"
          ><span class="truncate">彻底删除</span>
        </el-button>
      </div>
    </div>

    <KnowledgeTrashDocRow
      v-for="item in props.items"
      :key="item.id"
      :item="item"
      :selected="props.selectedDocIds.includes(item.id)"
      :submitting="props.submitting"
      :deleted-at-text="props.formatDateTime(item.deletedAt)"
      :editor-label="props.resolveEditorLabel(item.editorType)"
      @toggle-select="emit('toggleSelectDoc', $event)"
      @restore="emit('restoreSingleDoc', $event)"
      @hard-delete="emit('hardDeleteSingleDoc', $event)"
    />
  </div>
</template>

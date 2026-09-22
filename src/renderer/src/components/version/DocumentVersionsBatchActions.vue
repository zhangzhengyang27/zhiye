<script setup lang="ts">
/** 批量操作组件，负责文档版本批量操作触发与状态反馈。 */
import { computed } from "vue"

const props = defineProps<{
  selectedVersionCount: number
  allVersionsSelected: boolean
  versionDeleteBusy: boolean
  batchDeletingVersions: boolean
}>()

const emit = defineEmits<{
  "toggle-all": []
  "delete-selected": []
  "clear-selection": []
}>()

const toggleAllLabel = computed(() => (props.allVersionsSelected ? "取消全选" : "全选"))
</script>

<template>
  <div class="rounded-kb-3xl bg-muted p-3">
    <div class="flex items-center justify-between gap-3">
      <div class="text-xs text-ink-tertiary">批量操作会基于当前勾选项执行。</div>
      <el-button
        text
        size="small"
        class="rounded-kb-xl"
        :disabled="props.versionDeleteBusy"
        @click="emit('toggle-all')"
        ><span class="truncate">{{ toggleAllLabel }}</span>
      </el-button>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <el-button
        type="danger"
        size="small"
        class="rounded-kb-xl kb-btn-soft"
        :loading="props.batchDeletingVersions"
        :disabled="props.selectedVersionCount === 0 || props.versionDeleteBusy"
        @click="emit('delete-selected')"
        ><template #loading
          ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
        /></template>
        <span class="truncate">批量删除</span>
      </el-button>
      <el-button
        text
        size="small"
        class="rounded-kb-xl"
        :disabled="props.selectedVersionCount === 0 || props.versionDeleteBusy"
        @click="emit('clear-selection')"
        ><span class="truncate">清空选择</span>
      </el-button>
    </div>
  </div>
</template>

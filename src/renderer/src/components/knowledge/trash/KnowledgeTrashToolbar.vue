<script setup lang="ts">
/** 工具栏组件，负责知识库回收站筛选、搜索与快捷操作。 */
import { computed } from "vue"
import { ChevronDown } from "lucide-vue-next"
import KnowledgeTrashTabs from "@/components/knowledge/KnowledgeTrashTabs.vue"

type KnowledgeBaseOption = {
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    activeTab: "docs" | "kbs"
    canClearDocs: boolean
    loading: boolean
    searchKeyword: string
    selectedKbId: string
    knowledgeBaseItems: KnowledgeBaseOption[]
    searchPlaceholderDocs?: string
    searchPlaceholderKbs?: string
  }>(),
  {
    searchPlaceholderDocs: "搜索文档标题或知识库名称",
    searchPlaceholderKbs: "搜索知识库名称",
  }
)

const emit = defineEmits<{
  changeTab: [tab: "docs" | "kbs"]
  clearDocs: []
  refresh: []
  "update:searchKeyword": [value: string]
  "update:selectedKbId": [value: string]
  kbFilterChange: []
}>()

const searchPlaceholder = computed(() => {
  return props.activeTab === "docs" ? props.searchPlaceholderDocs : props.searchPlaceholderKbs
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <KnowledgeTrashTabs
        :active-tab="props.activeTab"
        :can-clear-docs="props.canClearDocs"
        :loading="props.loading"
        @change-tab="emit('changeTab', $event)"
        @clear-docs="emit('clearDocs')"
      />

      <el-button plain class="h-8 rounded-kb-md px-3 py-0 gap-1.5" :disabled="props.loading" @click="emit('refresh')"
        ><AppIcon name="i-lucide-refresh-cw" class="h-3.5 w-3.5" :class="props.loading ? 'animate-spin' : ''" />
        <span class="truncate">刷新</span>
      </el-button>
    </div>

    <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div class="relative max-w-sm flex-1">
        <el-input
          :model-value="props.searchKeyword"
          type="text"
          :placeholder="searchPlaceholder"
          class="h-8 w-full pl-8 text-kb-sm"
          @update:model-value="emit('update:searchKeyword', $event)"
        />
        <!-- 前缀图标排在控件之后：EP 根 position:relative + 自带填充，写在前头会被盖住 -->
        <AppIcon
          name="i-lucide-search"
          class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-quaternary"
        />
      </div>

      <el-select
        v-if="props.activeTab === 'docs'"
        :model-value="props.selectedKbId"
        :options="props.knowledgeBaseItems"
        :offset="6"
        :show-arrow="false"
        :suffix-icon="ChevronDown"
        class="min-w-45"
        @update:model-value="emit('update:selectedKbId', String($event ?? ''))"
        @change="emit('kbFilterChange')"
      />
    </div>
  </div>
</template>

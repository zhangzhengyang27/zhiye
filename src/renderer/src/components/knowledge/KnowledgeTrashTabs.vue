<script setup lang="ts">
/** 标签组件，负责知识库回收站视图切换（T4 解散 AppTabs 后直用 el-tabs）。 */

const props = defineProps<{
  activeTab: "docs" | "kbs"
  canClearDocs: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  changeTab: [tab: "docs" | "kbs"]
  clearDocs: []
}>()

/**
 * EP 的 tab 项是 div[role=tab]，无按钮语义（Enter/Space 原生不激活）；
 * 方向键移动即激活是 EP 原生，这里补齐壳时代的 Enter/Space 激活契约（T3 手法）。
 */
const activateFocusedTab = (event: Event) => {
  const active = document.activeElement
  if (active instanceof HTMLElement && active.getAttribute("role") === "tab") {
    event.preventDefault()
    active.click()
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <el-tabs
      :model-value="props.activeTab"
      class="min-w-0 w-full sm:w-auto"
      @update:model-value="emit('changeTab', $event as 'docs' | 'kbs')"
      @keydown.enter="activateFocusedTab"
      @keydown.space="activateFocusedTab"
    >
      <el-tab-pane name="docs">
        <template #label>
          <AppIcon name="i-lucide-file-text" class="h-4 w-4" />
          文档回收站
        </template>
      </el-tab-pane>
      <el-tab-pane name="kbs">
        <template #label>
          <AppIcon name="i-lucide-database" class="h-4 w-4" />
          知识库回收站
        </template>
      </el-tab-pane>
    </el-tabs>

    <el-button
      v-if="activeTab === 'docs'"
      type="danger"
      class="sm:ml-auto kb-btn-soft"
      :disabled="!canClearDocs || loading"
      @click="emit('clearDocs')"
      ><AppIcon name="i-lucide-trash-2" class="h-[15px] w-[15px]" />
      <span class="truncate">清空文档回收站</span>
    </el-button>
  </div>
</template>

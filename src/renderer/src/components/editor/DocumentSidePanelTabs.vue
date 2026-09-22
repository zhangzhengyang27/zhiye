<script setup lang="ts">
/** 标签组件，负责文档Side面板视图切换。 */
type DocumentSidePanelTab = "search" | "comments" | "versions" | "info" | "ai"

const props = withDefaults(
  defineProps<{
    activeTab: DocumentSidePanelTab
    tabs?: DocumentSidePanelTab[]
  }>(),
  {
    // search/comments 随 TipTap 下线后没有对应实现（全文搜索已由 Lake 内置
    // 查找替换面板承担——⇧⌘F / 工具栏 search 按钮，与语雀形态一致，Side 面板
    // 不再设搜索 tab；评论锚点见内核评估结论）。保留在默认值里会渲染出点了就
    // 关闭整个侧栏的死 tab
    tabs: () => ["versions", "info"],
  }
)

const emit = defineEmits<{
  "switch-tab": [tab: DocumentSidePanelTab]
}>()

const tabItems: Array<{ id: DocumentSidePanelTab; label: string; icon: string }> = [
  { id: "search", label: "搜索", icon: "i-lucide-search" },
  { id: "comments", label: "讨论", icon: "i-lucide-message-circle" },
  { id: "versions", label: "历史", icon: "i-lucide-history" },
  { id: "info", label: "信息", icon: "i-lucide-panel-right-open" },
  { id: "ai", label: "AI", icon: "i-lucide-sparkles" },
]
</script>

<template>
  <div class="rounded-kb-2xl border border-line bg-muted p-1">
    <div
      class="grid gap-1"
      :style="{ gridTemplateColumns: `repeat(${Math.max(props.tabs.length, 1)}, minmax(0, 1fr))` }"
    >
      <button
        v-for="tab in tabItems.filter(item => props.tabs.includes(item.id))"
        :key="tab.id"
        type="button"
        class="inline-flex items-center justify-center gap-1.5 rounded-kb-xl px-2 py-2 text-[12px] font-medium transition"
        :class="
          activeTab === tab.id
            ? 'bg-surface text-ink shadow-[var(--kb-surface-shadow)]'
            : 'text-ink-tertiary hover:bg-surface/70 hover:text-brand'
        "
        @click="emit('switch-tab', tab.id)"
      >
        <AppIcon :name="tab.icon" class="h-3.5 w-3.5" />
        <span>{{ tab.label }}</span>
      </button>
    </div>
  </div>
</template>

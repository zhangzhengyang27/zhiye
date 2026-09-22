<script setup lang="ts">
/**
 * 面板组件：文档左侧「大纲」（对齐语雀：标题层级缩进列表，点击跳转对应正文位置）。
 *
 * 数据来自编辑器的 outlineItems（extractDocumentOutline，h1-h4 → depth 0-3）；
 * 跳转由父级 jumpToOutlineItem 完成（滚动定位，不再借道右侧信息面板）。
 * 空态：文档没有标题时给「暂无标题」提示。
 */
import type { DocumentOutlineItem } from "@/utils/document-content-metadata"

defineProps<{
  items: DocumentOutlineItem[]
}>()

const emit = defineEmits<{
  close: []
  jump: [itemId: string]
}>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface">
    <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
      <p class="text-[13px] font-semibold text-ink">
        大纲
        <span
          v-if="items.length > 0"
          class="ml-1 text-[11px] font-normal tabular-nums text-ink-quaternary"
          >{{ items.length }}</span
        >
      </p>
      <button
        type="button"
        class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink-secondary"
        title="收起大纲"
        aria-label="收起大纲"
        @click="emit('close')"
      >
        <UiIcon icon="i-lucide-panel-left-close" class="h-[1.2em] w-[1.2em]" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <p
        v-if="items.length === 0"
        class="px-3 py-8 text-center text-xs leading-5 text-ink-quaternary"
      >
        正文还没有标题，添加 h1-h4 标题后会在这里生成大纲。
      </p>

      <!-- 层级缩进对齐语雀大纲：depth 越深缩进越多；点击跳转正文 -->
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="flex w-full items-center rounded-kb-md px-2 py-1.5 text-left text-[13px] text-ink-secondary transition-colors duration-150 hover:bg-grey-200 hover:text-ink dark:hover:bg-grey-400"
        :style="{ paddingLeft: `${8 + item.depth * 14}px` }"
        :title="item.text"
        @click="emit('jump', item.id)"
      >
        <span class="truncate">{{ item.text }}</span>
      </button>
    </div>
  </div>
</template>

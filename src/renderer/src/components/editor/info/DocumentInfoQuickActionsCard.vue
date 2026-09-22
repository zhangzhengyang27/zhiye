<script lang="ts">
/**
 * DocumentInfoAction 单源导出：本组件是快捷操作 prop/emit 契约的持有方，动作联合
 * 类型在此声明并对外导出（DocumentInfoPanel 以 type-only import 复用，取代其本地
 * 同名定义——拼接残片曾在本文件把 QuickActionItem/DocumentInfoAction 重复声明多遍，
 * 2026-09-22 恢复批去重收口）。
 */
export type DocumentInfoAction =
  | "copy-link"
  | "copy-markdown-link"
  | "enter-reading"
  | "open-share"
  | "open-history"
  | "toggle-favorite"
  | "open-template-library"
  | "open-knowledge-network"
  | "open-in-browser"
  | "insert-emoji"
  | "print-doc"
  | "export-markdown"
  | "export-pdf"
  | "export-word"
  | "export-image"
  | "export-lake"
  | "save-doc"
  | "reload-doc"
  | "make-template"
  | "move-trash"
</script>

<script setup lang="ts">
/** 卡片组件，负责文档信息快捷操作信息展示与局部操作。 */
import { computed } from "vue"

/** 快捷操作条目：id 即 DocumentInfoAction（emit trigger-action 载荷同源） */
type QuickActionItem = {
  id: DocumentInfoAction
  label: string
}

const props = defineProps<{
  quickActions: QuickActionItem[]
  badge: {
    label: string
    className: string
  }
}>()

const emit = defineEmits<{
  "trigger-action": [action: DocumentInfoAction]
}>()

const quickActionsGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.min(Math.max(props.quickActions.length, 1), 2)}, minmax(0, 1fr))`,
}))
</script>

<template>
  <!-- 原 UCard variant="soft" 深度定制（无边框浅底卡片），以普通 div 保持视觉等价 -->
  <div class="rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-ink">快捷操作</p>
        <p class="mt-1 text-xs text-ink-quaternary">把最常用的流转操作收在这里。</p>
      </div>
      <el-tag disable-transitions :class="badge.className">
        {{ badge.label }}
      </el-tag>
    </div>

    <div class="mt-4 grid gap-2" :style="quickActionsGridStyle">
      <el-button
        v-for="action in quickActions"
        :key="action.id"
        class="h-auto justify-start rounded-kb-2xl border border-line bg-muted px-3 py-3 text-left text-[12px] text-ink-secondary hover:border-brand-lighter hover:bg-surface hover:text-brand [line-height:inherit] kb-btn-soft font-semibold"
        @click="emit('trigger-action', action.id)"
        ><span class="truncate">{{ action.label }}</span>
      </el-button>
    </div>
  </div>
</template>

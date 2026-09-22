<script setup lang="ts">
/** 界面组件，负责只读画板内容渲染与交互。 */
import type { KnowledgeBoardDocument } from "@/types/knowledge-board"
import ExcalidrawBoardSurface from "./ExcalidrawBoardSurface.vue"

const props = withDefaults(
  defineProps<{
    board: KnowledgeBoardDocument
    heightClass?: string
  }>(),
  {
    heightClass: "h-[640px]",
  },
)
</script>

<template>
  <div class="space-y-4">
    <div
      class="rounded-kb-3xl border border-line bg-surface-soft px-4 py-3 text-sm leading-6 text-ink-secondary"
    >
      当前为画板只读预览。可查看内容布局、缩放和平移，但公共链接中的在线编辑本轮仍保持关闭。
    </div>

    <ExcalidrawBoardSurface
      :scene="props.board"
      :readonly="true"
      :height-class="heightClass"
      :reset-token="`readonly:${board.version}:${board.elements.length}`"
    />
  </div>
</template>

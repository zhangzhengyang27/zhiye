<script setup lang="ts">
/**
 * 选中浮动条（对齐语雀：划选文字后在选区上方浮出快捷操作）。
 *
 * 实现：Lake 内核的 onSelectionChange 不携带选区信息，但编辑器与宿主同文档，
 * 这里监听 document 的 selectionchange 后自行读取 window.getSelection()：
 * - 选区落在 surfaceSelector 容器内且非空 → 在选区上方浮出；
 * - 格式化动作直接调内核 YuqueEditorRef 的命令（作用于当前选区），
 *   按钮用 mousedown.prevent 保住选区不被点击动作清除。
 *
 * 划词评论：选区由 CommentManager.captureSelection() 序列化为 XPath-like 锚点
 * 持久化在 comments.position，编辑页 KnowledgeDocEditorView 已接入（见 @comment 事件）。
 */
import { onBeforeUnmount, onMounted, ref } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import type { YuqueEditorRef } from "yuque-editor-core/editor"

const props = withDefaults(
  defineProps<{
    /** Lake 编辑器实例（YuqueDocEditor 的 editorReady 产物），格式化命令作用其上 */
    editor: unknown
    /** 是否可编辑：只读时仅保留「复制」 */
    editable?: boolean
    /** 编辑器滚动容器选择器，用于判断选区是否落在编辑区内 */
    surfaceSelector?: string
  }>(),
  {
    editable: false,
    surfaceSelector: ".yuque-doc-editor__surface",
  }
)

const { showToastMessage } = useTransientToast()

const visible = ref(false)
const selectedText = ref("")
const barStyle = ref<{ top: string; left: string }>({ top: "0px", left: "0px" })

const HIGHLIGHT_COLOR = "#ffe58f"

const hideBar = () => {
  visible.value = false
}

const syncFromSelection = () => {
  const selection = typeof document === "undefined" ? null : document.getSelection()

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    hideBar()
    return
  }

  const text = selection.toString()
  if (!text.trim()) {
    hideBar()
    return
  }

  const range = selection.getRangeAt(0)
  const origin = range.commonAncestorContainer
  const host = origin instanceof Element ? origin : origin.parentElement
  if (!host?.closest(props.surfaceSelector)) {
    hideBar()
    return
  }

  const rect = range.getBoundingClientRect()
  if ((!rect.width && !rect.height) || rect.top < 0 || rect.bottom > window.innerHeight) {
    hideBar()
    return
  }

  selectedText.value = text
  const left = Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120)
  barStyle.value = {
    top: `${Math.max(rect.top - 12, 56)}px`,
    left: `${left}px`,
  }
  visible.value = true
}

let selectionFrame = 0
const handleSelectionChange = () => {
  if (selectionFrame) {
    cancelAnimationFrame(selectionFrame)
  }
  selectionFrame = requestAnimationFrame(syncFromSelection)
}

onMounted(() => {
  document.addEventListener("selectionchange", handleSelectionChange)
  // 滚动/改窗时选区矩形会失真，直接隐藏，等下一次 selectionchange 再浮出
  window.addEventListener("scroll", hideBar, true)
  window.addEventListener("resize", hideBar)
})

onBeforeUnmount(() => {
  if (selectionFrame) {
    cancelAnimationFrame(selectionFrame)
  }
  document.removeEventListener("selectionchange", handleSelectionChange)
  window.removeEventListener("scroll", hideBar, true)
  window.removeEventListener("resize", hideBar)
})

const asEditor = () => (props.editor && typeof props.editor === "object" ? (props.editor as YuqueEditorRef) : null)

/** mousedown.prevent 保住 DOM 选区，内核命令才能命中当前选中内容 */
const runFormat = (action: (editor: YuqueEditorRef) => void) => {
  if (!props.editable) return
  const editor = asEditor()
  if (!editor) return
  action(editor)
}

const clearSelectionFormatting = (editor: YuqueEditorRef) => {
  editor.clearColor()
  editor.clearBgColor()
  editor.clearFormat()
}

const emit = defineEmits<{
  comment: []
  /** 划选 AI 入口：携带选中文本交宿主打开 AI 侧栏并对齐语雀浮动条的 AI 助手入口 */
  ai: [text: string]
}>()

const copySelectedText = async () => {
  if (!selectedText.value) return

  try {
    await navigator.clipboard.writeText(selectedText.value)
    showToastMessage("已复制选中文本。", "success")
  } catch {
    showToastMessage("复制失败，请重试。", "error")
  }
}

const runAiAssistant = () => {
  const text = selectedText.value
  hideBar()
  if (text.trim()) {
    emit("ai", text)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed z-[var(--kb-z-overlay)] flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-kb-lg border border-line bg-surface p-1 shadow-[var(--kb-float-shadow)]"
        :style="barStyle"
        @mousedown.prevent
      >
        <template v-if="editable">
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-kb-sm text-[13px] font-semibold text-ink-secondary transition hover:bg-muted"
            title="加粗"
            @click="runFormat(editor => editor.setBold())"
          >
            B
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-kb-sm text-[13px] italic text-ink-secondary transition hover:bg-muted"
            title="斜体"
            @click="runFormat(editor => editor.setItalic())"
          >
            I
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-kb-sm text-[13px] text-ink-secondary line-through transition hover:bg-muted"
            title="删除线"
            @click="runFormat(editor => editor.setStrikethrough())"
          >
            S
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-kb-sm transition hover:bg-muted"
            title="高亮"
            @click="runFormat(editor => editor.setBgColor(HIGHLIGHT_COLOR))"
          >
            <AppIcon name="i-lucide-highlighter" class="h-4 w-4 text-warning" />
          </button>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-secondary transition hover:bg-muted"
            title="清除格式"
            @click="runFormat(clearSelectionFormatting)"
          >
            <AppIcon name="i-lucide-eraser" class="h-4 w-4" />
          </button>
          <button
            type="button"
            data-testid="selection-ai-button"
            class="flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-secondary transition hover:bg-muted"
            title="AI 助手"
            @click="runAiAssistant"
          >
            <AppIcon name="i-lucide-sparkles" class="h-4 w-4 text-brand" />
          </button>
          <span class="mx-1 h-4 w-px bg-line" />
        </template>
        <button
          type="button"
          class="flex h-7 items-center gap-1 rounded-kb-sm px-2 text-[12px] text-ink-secondary transition hover:bg-muted"
          title="评论选中内容"
          @click="emit('comment')"
        >
          <AppIcon name="i-lucide-message-circle" class="h-3.5 w-3.5" />
          评论
        </button>
        <span class="mx-1 h-4 w-px bg-line" />
        <button
          type="button"
          class="flex h-7 items-center gap-1 rounded-kb-sm px-2 text-[12px] text-ink-secondary transition hover:bg-muted"
          title="复制选中文本"
          @click="copySelectedText"
        >
          <AppIcon name="i-lucide-copy" class="h-3.5 w-3.5" />
          复制
        </button>
      </div>
    </Transition>

    <!-- 复制反馈：组件自带 toast 状态，需与浮动条同处一个 Teleport 树 -->
  </Teleport>
</template>

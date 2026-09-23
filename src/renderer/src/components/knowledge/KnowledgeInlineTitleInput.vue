<script setup lang="ts">
/**
 * 行内标题输入框（对齐语雀：重命名不开弹窗，就地改）。
 *
 * 目录树行与「全部文档」平铺卡片共用：挂载即全选原文本，Enter/失焦提交、
 * Esc 取消；一次改名只收尾一遍（settled 标记吃掉提交后卸载带来的二次 blur）。
 * 观感走校准层的 `.kb-input-inplace` 无边框档——EP 本体 + 与标题同字号行高字重，
 * 不额外在调用点画盒子（样式排查批 11 的收编口径）。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import type { InputInstance } from "element-plus"
import { isImeComposing } from "@/utils/keyboard"

const props = defineProps<{
  value: string
  ariaLabel?: string
}>()

const emit = defineEmits<{
  (event: "finish", payload: { title: string; committed: boolean }): void
}>()

const inputRef = ref<InputInstance | null>(null)
const draft = ref(props.value)
let settled = false

const settle = (committed: boolean) => {
  if (settled) {
    return
  }

  settled = true
  emit("finish", { title: draft.value, committed })
}

/** el-input 的 keydown 声明为 KeyboardEvent | Event，按仓内口径先收窄（批 11 同写法） */
const handleKeyDown = (event: KeyboardEvent | Event) => {
  if (!(event instanceof KeyboardEvent) || isImeComposing(event)) {
    return
  }

  if (event.key === "Enter") {
    event.preventDefault()
    settle(true)
    return
  }

  if (event.key === "Escape") {
    event.preventDefault()
    // 全局 keydown 的 Escape 分支会连带动树菜单/速查，行内编辑自己吃掉
    event.stopPropagation()
    settle(false)
  }
}

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

// 从 DOM 摘掉聚焦元素不会补发 blur：右键另一行「重命名」会把 renamingNodeId
// 直接挪走，本组件被卸载而草稿蒸发。卸载等价于离开编辑位，按失焦同一口径收尾。
onBeforeUnmount(() => settle(true))
</script>

<template>
  <el-input
    ref="inputRef"
    v-model="draft"
    class="kb-input-inplace min-w-0 flex-1"
    :aria-label="ariaLabel"
    maxlength="200"
    @keydown="handleKeyDown"
    @blur="settle(true)"
  />
</template>

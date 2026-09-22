<script setup lang="ts">
/**
 * 标签页组件（纯 Tailwind，替代 UTabs 的 pill 用法）。
 * 仅渲染标签头（对齐原 `:content="false"` 用法），激活项经 modelValue 受控。
 *
 * 键盘：tablist 语义，ArrowLeft/Right 移动焦点（Home/End 首尾），
 * Enter/Space 或点击激活；roving tabindex 使 Tab 只停留在当前激活项。
 */
import { computed, nextTick, ref } from "vue"
import AppIcon from "./AppIcon.vue"

interface TabItem {
  label: string
  value: string
  icon?: string
  disabled?: boolean
}

const props = defineProps<{
  modelValue: string
  items: TabItem[]
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const enabledValues = computed(() =>
  props.items.filter((item) => !item.disabled).map((item) => item.value),
)

const tabRefs = ref<Record<string, HTMLButtonElement | null>>({})
/** 键盘移动中的焦点值；只有激活/失焦后回落回选中项 */
const focusedValue = ref<string | null>(null)

const setTabRef = (item: TabItem) => (el: unknown) => {
  tabRefs.value[item.value] = el as HTMLButtonElement | null
}

const activeKey = computed(() => {
  if (focusedValue.value && enabledValues.value.includes(focusedValue.value)) {
    return focusedValue.value
  }

  return enabledValues.value.includes(props.modelValue)
    ? props.modelValue
    : (enabledValues.value[0] ?? "")
})

const handleTablistKeydown = (event: KeyboardEvent) => {
  const values = enabledValues.value

  if (values.length === 0) {
    return
  }

  let targetIndex = values.indexOf(activeKey.value)
  if (targetIndex < 0) {
    targetIndex = 0
  }

  switch (event.key) {
    case "ArrowRight":
      targetIndex = (targetIndex + 1) % values.length
      break
    case "ArrowLeft":
      targetIndex = (targetIndex - 1 + values.length) % values.length
      break
    case "Home":
      targetIndex = 0
      break
    case "End":
      targetIndex = values.length - 1
      break
    default:
      return
  }

  event.preventDefault()
  const targetValue = values[targetIndex]

  if (targetValue === undefined) {
    return
  }

  focusedValue.value = targetValue

  void nextTick(() => {
    tabRefs.value[targetValue]?.focus()
  })
}
</script>

<template>
  <div
    class="inline-flex items-center gap-1 rounded-full bg-muted p-1"
    role="tablist"
    aria-label="选项卡"
    @keydown="handleTablistKeydown"
  >
    <button
      v-for="item in items"
      :key="item.value"
      :ref="setTabRef(item)"
      type="button"
      role="tab"
      :aria-selected="item.value === modelValue"
      :tabindex="activeKey === item.value ? 0 : -1"
      :disabled="item.disabled"
      class="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
      :class="
        item.value === modelValue
          ? 'bg-surface text-ink shadow-[var(--kb-card-shadow)]'
          : 'text-ink-tertiary hover:text-ink-secondary'
      "
      @click="emit('update:modelValue', item.value)"
    >
      <AppIcon v-if="item.icon" :name="item.icon" class="h-4 w-4" />
      {{ item.label }}
    </button>
  </div>
</template>

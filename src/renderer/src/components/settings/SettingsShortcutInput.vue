<script setup lang="ts">
/**
 * 单条快捷键输入（对齐语雀设置页的 ShortcutInput，`76858.js` 的 `B` 函数）。
 *
 * 交互链：点击容器 → 聚焦只读 input 进入捕获态（占位换成「请输入快捷键」，
 * 只按修饰键时实时显示 `⌘ ⌥`）→ 凑成「修饰键 + 主键」即提交并退出捕获；
 * 非捕获态且已有值时右侧给「取消快捷键」（写 NO_SHORTCUT 哨兵），
 * 捕获态或尚未设置时给「重置快捷键」（写回默认值）。
 * 提交一律交给父级落盘，失败（系统占用）时 prop 不变，显示自然回退。
 */
import { computed, ref } from "vue"
import {
  NO_SHORTCUT,
  keyboardEventToAccelerator,
  shortcutModifiersDisplay,
  shortcutToDisplay,
} from "@/constants/desktop-settings"

const props = defineProps<{
  shortcutKey: string
  /** 当前 accelerator（或 NO_SHORTCUT 哨兵）。 */
  value: string
  defaultShortcut: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  commit: [value: string]
}>()

const PLACEHOLDER = "设置快捷键"
const CAPTURING_PLACEHOLDER = "请输入快捷键"

const inputRef = ref<{ focus: () => void; blur: () => void } | null>(null)
const capturing = ref(false)
const partialDisplay = ref("")

const currentDisplay = computed(() => shortcutToDisplay(props.value))
const shown = computed(() => {
  if (!capturing.value) {
    return currentDisplay.value || PLACEHOLDER
  }
  return partialDisplay.value || CAPTURING_PLACEHOLDER
})

/** 捕获中或未设置时给「重置」，与语雀 `c || f === l` 同判据。 */
const showsReset = computed(() => capturing.value || !currentDisplay.value)

const handleKeydown = (raw: KeyboardEvent | Event) => {
  if (props.disabled || !(raw instanceof KeyboardEvent)) {
    return
  }
  const event = raw
  const modifiers = shortcutModifiersDisplay(event)
  if (modifiers) {
    partialDisplay.value = modifiers
  }

  const accelerator = keyboardEventToAccelerator(event)
  if (!accelerator) {
    return
  }

  event.preventDefault()
  capturing.value = false
  partialDisplay.value = ""
  inputRef.value?.blur()
  emit("commit", accelerator)
}

const enterCapturing = () => {
  if (props.disabled) {
    return
  }
  capturing.value = true
  inputRef.value?.focus()
}

const leaveCapturing = () => {
  capturing.value = false
  partialDisplay.value = ""
}

/** 右侧动作钮：捕获态或未设置＝重置为默认，否则＝取消（写哨兵）。 */
const handleActionClick = () => {
  if (props.disabled) {
    return
  }
  emit("commit", showsReset.value ? props.defaultShortcut : NO_SHORTCUT)
}
</script>

<template>
  <div
    class="kb-shortcut-input"
    :class="{ 'is-disabled': props.disabled }"
    @click="enterCapturing"
    @focusout="leaveCapturing"
  >
    <!-- 输入框恒空（语雀同写法：只挂 readonly + onKeyDown，不传 value）——
         显示文字只有下面这层浮标，避免浮层半透明底色透出输入框文字形成重影 -->
    <el-input ref="inputRef" :data-testid="`shortcut-${props.shortcutKey}`" readonly @keydown="handleKeydown" />
    <p class="kb-shortcut-tip">{{ shown }}</p>
    <el-tooltip :content="showsReset ? '重置快捷键' : '取消快捷键'" placement="top">
      <span
        class="kb-shortcut-action"
        :data-testid="showsReset ? `shortcut-revert-${props.shortcutKey}` : `shortcut-cancel-${props.shortcutKey}`"
        @click.stop="handleActionClick"
      >
        <UiIcon :icon="showsReset ? 'ph:arrow-counter-clockwise' : 'ph:x'" :width="14" :height="14" />
      </span>
    </el-tooltip>
  </div>
</template>

<style>
/* shortcut-module_inputWrapper / inputTip / setToDefault / inputIcon 段 */
.kb-shortcut-input {
  position: relative;
}

.kb-shortcut-input .kb-shortcut-tip {
  background: var(--kb-fill-muted);
  border: 1px solid var(--kb-border);
  bottom: 0;
  cursor: pointer;
  left: 0;
  margin: 0;
  position: absolute;
  right: 0;
  text-align: center;
  top: 0;
}

.kb-shortcut-input .kb-shortcut-action {
  border-left: 1px solid var(--kb-border);
  cursor: pointer;
  display: block;
  height: 100%;
  position: absolute;
  right: 0;
  text-align: center;
  top: 0;
  width: 30px;
}

.kb-shortcut-input.is-disabled .kb-shortcut-tip,
.kb-shortcut-input.is-disabled .kb-shortcut-action {
  cursor: not-allowed;
}

.kb-shortcut-input.is-disabled {
  opacity: 0.55;
}
</style>

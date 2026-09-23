<script setup lang="ts">
/**
 * 输入对话框（对齐语雀：标题 + 输入框 + 取消/确定，无角标与填充文案）。
 *
 * T8 起内脏为裸 el-dialog（计划文档决策 6：业务语义组件保留壳、换内脏；对外
 * props/emits 契约与 AppDialog 时代逐条保真，7 处调用点零改动）：
 * - 行为收编走 composables/use-dialog-behavior.ts（滚动锁计数 / data-autofocus
 *   宏任务聚焦——el-input 的 data-autofocus 标记经 EP attrs 透传落在原生 input
 *   上（T5 起的过渡期契约）/ IME 组词 Esc 守卫 / dialog-stack 维护）；
 * - 基线经 AppDialog 默认值生效的 closeOnOverlay=true 与 showCloseButton=true
 *   在此落成直传 close-on-click-modal / close-on-press-escape 与常驻关闭钮
 *   ——壳对外 API 零新增零删减；
 * - 语雀对话框 chrome 不在本组件——全局校准层 element-plus-calibration.css 的
 *   el-dialog 段；chrome 复合类 kb-dialog 与遮罩类 kb-dialog-overlay 由 bindings
 *   携带（T9 起，调用方只写 max-w-* 宽度档）；
 * - widthClass 映射：max-w-[400px] 直接落 .el-dialog 根 class（记档见计划文档）；
 * - 头部 markup（标题/描述 + 关闭钮）T9 起抽入 KbDialogHeader 共享片段；footer 按钮
 *   T10 起直写 el-button（色彩矩阵走全局校准层 el-button 段）。
 */
import { getCurrentInstance, ref, watch } from "vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import KbDialogHeader from "./KbDialogHeader.vue"
import { isImeComposing } from "@/utils/keyboard"

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: "update:open", val: boolean): void
  (e: "confirm", value: string): void
}>()

const inputValue = ref("")

watch(
  () => props.open,
  (val) => {
    if (val) inputValue.value = props.defaultValue || ""
  },
  // 挂载时 open 可能已为 true（父层 v-if 控制），immediate 保证 defaultValue 仍被应用
  { immediate: true },
)

/** 非受控模式的在途反馈：onConfirm 返回 Promise 则按钮 loading 且弹窗保持打开，
 * 拒绝不关窗（错误由调用方 toast）——异步创建失败时用户输入不再随关窗蒸发
 * （与 ConfirmDialog 同款模式） */
const confirming = ref(false)
const instance = getCurrentInstance()

const handleConfirm = () => {
  const v = inputValue.value.trim()
  if (!v || confirming.value) return

  const handler = instance?.vnode.props?.onConfirm
  if (typeof handler !== "function") {
    emit("confirm", v)
    emit("update:open", false)
    return
  }

  const result = handler(v)
  if (result instanceof Promise) {
    confirming.value = true
    result
      .then(() => {
        confirming.value = false
        emit("update:open", false)
      })
      .catch((error) => {
        confirming.value = false
        console.error("[InputDialog] 确认操作失败", error)
      })
    return
  }

  emit("confirm", v)
  emit("update:open", false)
}

/** 输入法组词期间的 Enter 是「确认候选」，不能当作提交 */
const handleEnter = (event: KeyboardEvent) => {
  if (isImeComposing(event)) {
    return
  }

  handleConfirm()
}

const closeDialog = () => {
  emit("update:open", false)
}

const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-[400px]"
    :model-value="open"
    :title="title"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && closeDialog()"
  >
    <template #header>
      <KbDialogHeader :title="title" :description="description" @close="closeDialog" />
    </template>

    <el-input
      v-model="inputValue"
      :placeholder="placeholder"
      data-autofocus
      @keydown.enter="handleEnter($event as KeyboardEvent)"
    />

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button
          plain
          class="h-8 rounded-kb-md px-4 py-0 gap-1.5 text-[13px] [line-height:inherit] font-semibold"
          @click="closeDialog"
          ><span class="truncate">取消</span></el-button
        >
        <el-button
          type="primary"
          class="h-8 rounded-kb-md px-4 py-0 gap-1.5 text-[13px] [line-height:inherit] font-semibold"
          :disabled="!inputValue.trim()"
          :loading="confirming"
          @click="handleConfirm"
          ><span class="truncate">确定</span></el-button
        >
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 确认对话框（对齐语雀：标题 + 一句话说明 + 取消/确定，危险操作红色强调）。
 *
 * T8 起内脏为裸 el-dialog（计划文档决策 6：业务语义组件保留壳、换内脏；对外
 * props/emits/插槽契约与 AppDialog 时代逐条保真，7 处调用点零改动）：
 * - 行为收编走 composables/use-dialog-behavior.ts（滚动锁计数 / data-autofocus
 *   宏任务聚焦 / IME 组词 Esc 守卫 / dialog-stack 维护），Esc 栈顶与焦点还原
 *   接受 EP 原生（T1 实测与基线一致）；
 * - 基线经 AppDialog 默认值生效的 closeOnOverlay=true（遮罩点击/Esc 可关）与
 *   showCloseButton=true（头部关闭钮）在此落成直传 close-on-click-modal /
 *   close-on-press-escape 与常驻关闭钮——壳对外 API 零新增零删减；
 * - 语雀对话框 chrome（8px 圆角/描边/--kb-modal-shadow 三层阴影/头尾带底色分隔）不在本组件——全局校准
 *   层 element-plus-calibration.css 的 el-dialog 段；chrome 复合类 kb-dialog 与
 *   遮罩类 kb-dialog-overlay 由 bindings 携带（T9 起，调用方只写 max-w-* 宽度档）；
 * - widthClass 映射：基线面板 max-w-[400px] + w-full 直接落 .el-dialog 根 class
 *   （utilities 层语义与基线同源，盒宽逐像素等价，记档见计划文档 T8 节）；
 * - 头部 markup（标题 + 关闭钮）T9 起抽入 KbDialogHeader 共享片段；footer 与头部
 *   关闭钮 T10 起直写 el-button（色彩矩阵走全局校准层 el-button 段）。
 */
import { computed, getCurrentInstance, ref } from "vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import UiIcon from "./UiIcon.vue"
import KbDialogHeader from "./KbDialogHeader.vue"

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    /** null：确认后立即关闭（旧行为）；boolean：受控模式，确认只 emit 不关窗，由父组件在异步完成后关闭 */
    loading?: boolean | null
  }>(),
  {
    title: "",
    confirmText: "",
    cancelText: "",
    danger: false,
    loading: null,
  }
)

const emit = defineEmits<{
  (e: "update:open", val: boolean): void
  (e: "confirm"): void
  (e: "cancel"): void
}>()

const dialogTitle = computed(() => props.title || (props.danger ? "确认危险操作" : "确认操作"))

const isControlledLoading = () => props.loading !== null

/**
 * 非受控模式下的在途反馈：onConfirm 返回 Promise 时按钮进入 loading 并保持
 * 弹窗打开，完成后关窗；拒绝时保持打开（错误提示由调用方 toast），避免用户
 * 在请求进行中重复确认。同步处理器保持旧行为（确认即关窗）。
 */
const confirming = ref(false)
const instance = getCurrentInstance()

const handleConfirm = () => {
  if (confirming.value || (isControlledLoading() && props.loading)) {
    return
  }

  if (isControlledLoading()) {
    emit("confirm")
    return
  }

  // 非受控模式：直接调用 onConfirm（emit 会二次触发同一处理器），按返回值分流
  const handler = instance?.vnode.props?.onConfirm
  if (typeof handler !== "function") {
    emit("confirm")
    emit("update:open", false)
    return
  }

  const result = handler()
  if (result instanceof Promise) {
    confirming.value = true
    result
      .then(() => {
        confirming.value = false
        emit("update:open", false)
      })
      .catch(error => {
        confirming.value = false
        // 拒绝时保持弹窗打开（调用方负责 toast），但不能再静默吞掉错误
        console.error("[ConfirmDialog] 确认操作失败", error)
      })
    return
  }

  emit("update:open", false)
}

const handleCancel = () => {
  emit("cancel")
  emit("update:open", false)
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
    :title="dialogTitle"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="value => !value && closeDialog()"
  >
    <template #header>
      <KbDialogHeader :title="dialogTitle" @close="closeDialog" />
    </template>

    <p class="text-[14px] leading-6" :class="danger ? 'text-error' : 'text-ink'">{{ message }}</p>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button plain class="h-8 rounded-kb-md py-0 gap-1.5 text-[13px] [line-height:inherit]" @click="handleCancel">
          <span class="truncate">{{ cancelText || "取消" }}</span>
        </el-button>
        <el-button
          :type="danger ? 'danger' : 'primary'"
          class="h-8 rounded-kb-md py-0 gap-1.5 text-[13px] [line-height:inherit]"
          :loading="props.loading === true || confirming"
          @click="handleConfirm"
        >
          <template #loading>
            <UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" />
          </template>
          <span class="truncate">{{ confirmText || "确定" }}</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

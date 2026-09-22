<script setup lang="ts">
/**
 * 对话框组件：新建知识库（名称必填 + 描述选填，对齐语雀创建流程）。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / data-autofocus 宏任务聚焦 / IME Esc 守卫）走 composable；chrome 类
 * 由 bindings 携带，语雀对话框观感在全局校准层 el-dialog 段；头部 markup 走
 * KbDialogHeader 共享片段。
 */
import { ref, watch } from "vue"
import UiIcon from "@/components/common/UiIcon.vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { createKnowledgeBase, type KnowledgeBaseItem } from "@/services/knowledge-base"
import { getApiErrorMessage } from "@/services/http-client"
import { isImeComposing } from "@/utils/keyboard"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  "update:open": [value: boolean]
  created: [knowledgeBase: KnowledgeBaseItem]
}>()

const name = ref("")
const description = ref("")
const submitting = ref(false)
const errorMessage = ref("")

const canSubmit = () => name.value.trim().length > 0 && !submitting.value

const close = () => {
  emit("update:open", false)
}

const submit = async () => {
  if (!canSubmit()) {
    return
  }

  submitting.value = true
  errorMessage.value = ""

  try {
    const knowledgeBase = await createKnowledgeBase({
      name: name.value.trim(),
      description: description.value.trim() || undefined,
    })

    emit("created", knowledgeBase)
    close()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "创建知识库失败。")
  } finally {
    submitting.value = false
  }
}

/** 输入法组词期间的 Enter 是「确认候选」，不能当作提交 */
const handleEnter = (event: KeyboardEvent) => {
  if (isImeComposing(event)) {
    return
  }

  void submit()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = ""
      description.value = ""
      errorMessage.value = ""
      submitting.value = false
    }
  },
)
const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-md"
    :model-value="open"
    title="新建知识库"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && emit('update:open', false)"
  >
    <template #header>
      <KbDialogHeader title="新建知识库" @close="close" />
    </template>

    <div class="space-y-4">
      <label class="block">
        <span class="text-[13px] font-medium text-ink">知识库名称</span>
        <el-input
          v-model="name"
          type="text"
          maxlength="50"
          data-autofocus
          class="mt-1.5"
          placeholder="例如：产品资料库"
          @keydown.enter="handleEnter($event as KeyboardEvent)"
        />
      </label>

      <label class="block">
        <span class="text-[13px] font-medium text-ink">知识库描述</span>
        <el-input
          v-model="description"
          type="textarea"
          :rows="3"
          maxlength="200"
          class="mt-1.5 w-full resize-none overflow-hidden leading-5"
          placeholder="简单介绍这个知识库的用途（选填）"
        />
      </label>

      <p v-if="errorMessage" class="text-[12px] text-error">{{ errorMessage }}</p>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <el-button plain @click="close"><span class="truncate">取消</span> </el-button>
        <el-button type="primary" :disabled="!canSubmit()" :loading="submitting" @click="submit"
          ><template #loading
            ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">创建</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

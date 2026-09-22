<script setup lang="ts">
/**
 * 对话框组件，负责知识设置AddMember的确认、输入与提交流程。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / data-autofocus 宏任务聚焦 / IME Esc 守卫）走 composable；chrome 类
 * 由 bindings 携带，语雀对话框观感在全局校准层 el-dialog 段；头部（标题 + 描述 +
 * 关闭钮）走 KbDialogHeader。
 */
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { ChevronDown } from "lucide-vue-next"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

type RoleOption = {
  value: "admin" | "editor" | "reader"
  label: string
  description: string
}

const props = defineProps<{
  open: boolean
  email: string
  role: "admin" | "editor" | "reader"
  addingMember: boolean
  roleOptions: readonly RoleOption[]
}>()

const emit = defineEmits<{
  "update:open": [value: boolean]
  "update:email": [value: string]
  "update:role": [value: "admin" | "editor" | "reader"]
  submit: []
}>()

const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-xl"
    :model-value="props.open"
    title="添加成员"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="value => !value && emit('update:open', false)"
  >
    <template #header>
      <KbDialogHeader
        title="添加成员"
        description="通过邮箱邀请成员加入当前知识库，并为其分配角色。"
        @close="emit('update:open', false)"
      />
    </template>

    <div class="space-y-4">
      <label class="block">
        <span class="mb-1.5 block text-[13px] font-medium text-ink-secondary">邮箱地址</span>
        <el-input
          :model-value="props.email"
          type="email"
          placeholder="user@example.com"
          data-autofocus
          class="w-full"
          @update:model-value="emit('update:email', $event)"
        />
      </label>

      <label class="block">
        <span class="mb-1.5 block text-[13px] font-medium text-ink-secondary">角色</span>
        <el-select
          :model-value="props.role"
          :options="props.roleOptions.map(item => ({ label: item.label, value: item.value }))"
          :offset="6"
          :show-arrow="false"
          :suffix-icon="ChevronDown"
          class="w-full"
          @update:model-value="emit('update:role', $event as 'admin' | 'editor' | 'reader')"
        />
        <p class="mt-2 text-sm leading-6 text-ink-tertiary">
          {{ props.roleOptions.find(item => item.value === props.role)?.description }}
        </p>
      </label>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <el-button plain class="border-line bg-surface py-2 text-ink-secondary" @click="emit('update:open', false)"
          ><span class="truncate">取消</span>
        </el-button>
        <el-button type="primary" class="py-2" :disabled="props.addingMember" @click="emit('submit')"
          ><span class="truncate">{{ props.addingMember ? "添加中…" : "添加成员" }}</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

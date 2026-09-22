<script setup lang="ts">
/**
 * 对话框组件：新建文档 / 分组 / 画板（对齐语雀「新建文档」弹层）。
 *
 * 结构：名称输入 + 所属目录选择 + 可折叠「高级选项」（编辑器类型），
 * 底部仅一个「新建」主按钮（关闭走 ×/遮罩/Esc）。目录选项由调用方
 * 传入（根目录 + 各级目录，带路径缩进 label）。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / data-autofocus 宏任务聚焦 / IME Esc 守卫）走 composable；chrome 类
 * 由 bindings 携带，语雀对话框观感在全局校准层 el-dialog 段；头部 markup 走
 * KbDialogHeader 共享片段。
 */
import { computed, ref, watch } from "vue"
import { ChevronDown } from "lucide-vue-next"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import Icon from "@/components/common/UiIcon.vue"
import { isImeComposing } from "@/utils/keyboard"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

type DocCreateEditorType = "richText" | "board" | "datatable" | "sheet" | "mindmap"

/**
 * el-select 直用后的「根目录」哨兵（T6，空值哨兵唯一用户，方案②）：EP 把 value=""
 * 视为空值走占位分支（不回显、选中不触发 update），会丢掉基线「根目录可选中、可回显」
 * ——目录选项在传给 el-select 前把 "" 映射为本哨兵，confirm 提交时映射回 ""。哨兵只在
 * 本弹层内部流转：folders prop / confirm payload 的对外契约（根目录 id=""）不变，
 * use-tree-node-actions 的 targetParentId || null 消费点零改动。
 */
const ROOT_FOLDER_SENTINEL = "__root__"

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    defaultValue?: string
    /** 名称输入占位（对齐语雀：与标题同名） */
    placeholder?: string
    /** 目录选项：[{ id: "" 为根目录, label 带路径 }] */
    folders?: Array<{ id: string; label: string }>
    defaultFolderId?: string
    /** 菜单直达类型时的预选（B7 入口补全）；缺省 richText */
    defaultEditorType?: DocCreateEditorType
  }>(),
  {
    defaultValue: "",
    placeholder: "",
    folders: () => [],
    defaultFolderId: "",
    defaultEditorType: "richText",
  }
)

const emit = defineEmits<{
  "update:open": [value: boolean]
  confirm: [payload: { title: string; parentId: string; editorType: DocCreateEditorType }]
}>()

const name = ref("")
// 初始即哨兵：默认根目录（defaultFolderId 为 "" 时空值映射见 open 钩子），保证首次
// 渲染即可回显「根目录」（EP 直用后 "" 走占位分支）
const parentId = ref(ROOT_FOLDER_SENTINEL)
const advancedOpen = ref(false)
const editorType = ref<DocCreateEditorType>("richText")

const canSubmit = computed(() => name.value.trim().length > 0)

/** 「高级选项」编辑器类型口径（DocCreateEditorType 镜像为选项；与
 *  use-tree-node-actions 顶部镜像注释同理，SFC 局部类型不可 import） */
const EDITOR_TYPE_OPTIONS: Array<{ label: string; value: DocCreateEditorType }> = [
  { label: "富文本", value: "richText" },
  { label: "画板", value: "board" },
  { label: "数据表", value: "datatable" },
  { label: "表格", value: "sheet" },
  { label: "思维导图", value: "mindmap" },
]

/** 目录选项转 el-select options；根目录 id="" 映射为哨兵（见 ROOT_FOLDER_SENTINEL 说明） */
const folderItems = computed(() =>
  (props.folders ?? []).map(folder => ({
    label: folder.label,
    value: folder.id === "" ? ROOT_FOLDER_SENTINEL : folder.id,
  }))
)

watch(
  () => props.open,
  open => {
    if (open) {
      name.value = props.defaultValue || ""
      // defaultFolderId ""（根目录）映射为哨兵；真实目录 id 原样回显
      parentId.value = props.defaultFolderId || ROOT_FOLDER_SENTINEL
      editorType.value = props.defaultEditorType
      // 菜单直达非富文本类型时展开高级选项，让用户看到当前类型
      advancedOpen.value = props.defaultEditorType !== "richText"
    }
  },
  // 挂载时 open 可能已为 true（父层 v-if 控制），immediate 保证默认值/预选目录生效
  { immediate: true }
)

const submit = () => {
  if (!canSubmit.value) {
    return
  }

  emit("confirm", {
    title: name.value.trim(),
    // 哨兵映射回基线契约的 ""（根目录），消费点 targetParentId || null 语义不变
    parentId: parentId.value === ROOT_FOLDER_SENTINEL ? "" : parentId.value,
    editorType: editorType.value,
  })
  emit("update:open", false)
}

/** 输入法组词期间的 Enter 是「确认候选」，不能当作提交（el-input keydown 载荷含
    合成事件，先 instanceof 收窄——与 SpaceMembersDialog/DocumentAiPanel 同款守卫） */
const handleEnter = (event: KeyboardEvent | Event) => {
  if (!(event instanceof KeyboardEvent) || isImeComposing(event)) {
    return
  }

  submit()
}
const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-md"
    :model-value="open"
    :title="title"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="value => !value && emit('update:open', false)"
  >
    <template #header>
      <KbDialogHeader :title="title" @close="emit('update:open', false)" />
    </template>

    <div class="space-y-4">
      <!-- 名称输入：占位与标题同名（对齐语雀）；Enter 提交（IME 组词守卫在 handleEnter），
           data-autofocus 由 useDialogBehavior 宏任务聚焦（verify-t6 以 input[data-autofocus] 定位） -->
      <el-input
        v-model="name"
        type="text"
        data-autofocus
        :placeholder="placeholder || title"
        @keydown.enter.prevent="handleEnter"
      />

      <!-- 所属目录：根目录 + 各级目录（folderItems 已把根 "" 映射为哨兵，见
           ROOT_FOLDER_SENTINEL 说明）；label 包裹为弹层既有形态（verify-t6 记档），
           select 直用校准见全局校准层 el-select 段 -->
      <label class="block">
        <span class="mb-2 block text-[13px] font-medium text-ink-secondary">所属目录</span>
        <el-select
          v-model="parentId"
          class="w-full"
          :options="folderItems"
          :offset="6"
          :show-arrow="false"
          :suffix-icon="ChevronDown"
        />
      </label>

      <!-- 可折叠「高级选项」：编辑器类型（菜单直达非富文本类型时 open 钩子已自动展开） -->
      <div>
        <button
          type="button"
          class="flex items-center gap-1 text-[13px] text-ink-tertiary transition hover:text-ink-secondary"
          :aria-expanded="advancedOpen"
          @click="advancedOpen = !advancedOpen"
        >
          <span>高级选项</span>
          <Icon
            icon="ph:caret-down"
            :width="12"
            :height="12"
            class="transition-transform"
            :class="advancedOpen ? 'rotate-180' : ''"
          />
        </button>

        <div v-show="advancedOpen" class="mt-3">
          <span class="mb-2 block text-[13px] font-medium text-ink-secondary">编辑器类型</span>
          <el-segmented
            :model-value="editorType"
            :options="EDITOR_TYPE_OPTIONS"
            @update:model-value="editorType = $event as DocCreateEditorType"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <!-- 底部仅一个「新建」主按钮（关闭走 ×/遮罩/Esc，见文件头） -->
      <div class="flex justify-end">
        <el-button type="primary" :disabled="!canSubmit" @click="submit">
          <span class="truncate">新建</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

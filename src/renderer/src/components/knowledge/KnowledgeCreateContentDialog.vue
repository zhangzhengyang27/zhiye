<script setup lang="ts">
/**
 * 新建内容「选择知识库」弹层（对齐语雀桌面端「+ → 文档」的居中选库流程）。
 *
 * 语雀交互（2026-09-23 真机/用户截图实测）：点库即在该库即时创建并打开，
 * 无命名弹窗；弹层 = 标题 + 「选择一个知识库」说明 + 库名搜索 + 库列表
 * （图标 + 名称，hover 高亮，关键词实时过滤）。本组件只负责选库，
 * 创建动作由宿主沿既有 intent 链路完成（跳目标库工作台首页触发 createNode）。
 */
import { computed, ref, watch } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"

const props = defineProps<{
  open: boolean
  /** 弹层标题（随创建类型变化：新建文档/新建表格/新建画板/新建数据表/新建思维导图） */
  title: string
  /** 可选的知识库全集（宿主传入侧栏已加载列表，避免重复请求） */
  knowledgeBases: KnowledgeBaseItem[]
  /** 提交中禁点列表 */
  submitting?: boolean
}>()

const emit = defineEmits<{
  "update:open": [value: boolean]
  /** 选中知识库：宿主在该库创建对应类型内容 */
  select: [kbId: string]
}>()

const keyword = ref("")

watch(
  () => props.open,
  (open) => {
    if (open) {
      keyword.value = ""
    }
  },
)

const filteredKbList = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) {
    return props.knowledgeBases
  }
  return props.knowledgeBases.filter((item) => item.name.toLowerCase().includes(kw))
})

const handleSelect = (kbId: string) => {
  if (props.submitting) {
    return
  }
  emit("update:open", false)
  emit("select", kbId)
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
    class="max-w-[520px]"
    :model-value="open"
    :title="title"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && closeDialog()"
  >
    <template #header>
      <KbDialogHeader :title="title" @close="closeDialog" />
    </template>

    <div class="space-y-3">
      <p class="text-[13px] text-ink-secondary">选择一个知识库</p>

      <div class="relative">
        <el-input
          v-model="keyword"
          type="text"
          data-autofocus
          placeholder="请输入知识库名称进行搜索"
          class="py-2 pl-9"
        />
        <Icon
          icon="ph:magnifying-glass"
          :width="14"
          :height="14"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-quaternary"
        />
      </div>

      <div
        class="max-h-[320px] overflow-y-auto rounded-kb-2xl border border-line bg-surface-soft p-1.5"
      >
        <button
          v-for="item in filteredKbList"
          :key="item.id"
          type="button"
          class="flex h-10 w-full items-center gap-2.5 rounded-kb-md px-2.5 text-left text-[13px] text-ink transition hover:bg-fill-muted"
          @click="handleSelect(item.id)"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-kb-sm bg-brand-faint text-brand"
          >
            <Icon icon="ph:book-open-text" :width="14" :height="14" />
          </span>
          <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
        </button>

        <div
          v-if="filteredKbList.length === 0"
          class="px-3 py-8 text-center text-[13px] text-ink-quaternary"
        >
          没有匹配的知识库
        </div>
      </div>
    </div>
  </el-dialog>
</template>

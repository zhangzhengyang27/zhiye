<script setup lang="ts">
/**
 * 知识网络弹窗（B2b 第一批，弱引用 v1）。
 * 语雀形态（09-16 基线 §0-10）为大幅弹窗：左图谱画布 + 右侧文档卡片（被引用/引用了
 * 两 tab）。本批实现右侧卡片流 + 双 tab，图谱画布后置（登记偏差）。
 * 点击卡片跳转对应文档（路由内跳转，编辑器按 docId 重载）。
 */
import { computed, ref, watch } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { formatDateTime } from "@/utils/date-format"
import { requestKbDriveApi } from "@/services/kb-drive-http"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

/**
 * 知识网络卡片（后端 KnowledgeLinkDocCard，updatedAt 为 JSON 序列化的 ISO 串；
 * 形状对齐 xiaoye-server/src/modules/documents/documents-knowledge-links.service.ts）。
 */
interface KnowledgeLinkDocCard {
  id: string
  title: string
  updatedAt: string
  creatorName: string | null
}

/*
 * 恢复批注：服务层封装 getKnowledgeDocumentLinks 未随删除事故恢复件找回
 * （@/services/knowledge-documents 现无该导出）。这里按 kb-drive-http 统一入口内联
 * 补齐，端点按后端 DocumentsKnowledgeLinksService.listLinks 语义取
 * GET /knowledge/documents/:id/links；注意后端 controller 目前未挂该路由
 * （service 已在 module 注册、缺 @Get(':id/links')），接通前弹层走错误态兜底。
 */

/** 双向链接列表（backlinks=被引用 / forwardLinks=引用了，弱引用 v1）。 */
const getKnowledgeDocumentLinks = (documentId: string, token?: string | null) =>
  requestKbDriveApi<{ backlinks: KnowledgeLinkDocCard[]; forwardLinks: KnowledgeLinkDocCard[] }>(
    `/knowledge/documents/${documentId}/links`,
    undefined,
    token,
  )

type NetworkTab = "backlinks" | "forwardLinks"

const props = defineProps<{
  visible: boolean
  documentId: string
  token?: string | null
}>()

const emit = defineEmits<{
  close: []
  "open-doc": [docId: string]
}>()

const loading = ref(false)
const errorMessage = ref("")
const activeTab = ref<NetworkTab>("backlinks")
const backlinks = ref<KnowledgeLinkDocCard[]>([])
const forwardLinks = ref<KnowledgeLinkDocCard[]>([])

const dialog = useDialogBehavior({
  open: () => props.visible,
})

const currentList = computed(() =>
  activeTab.value === "backlinks" ? backlinks.value : forwardLinks.value,
)

const loadLinks = async () => {
  loading.value = true
  errorMessage.value = ""
  try {
    const result = await getKnowledgeDocumentLinks(props.documentId, props.token ?? undefined)
    backlinks.value = result.backlinks ?? []
    forwardLinks.value = result.forwardLinks ?? []
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "知识网络加载失败，请稍后重试。"
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      activeTab.value = "backlinks"
      void loadLinks()
    }
  },
  { immediate: true },
)

const emptyText = computed(() =>
  activeTab.value === "backlinks" ? "本文档暂未被其他文档引用" : "本文档暂未引用其他文档",
)

const openDoc = (docId: string) => {
  emit("open-doc", docId)
}

const handleClose = () => {
  emit("close")
}
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-3xl"
    :model-value="visible"
    title="知识网络"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && handleClose()"
  >
    <template #header>
      <KbDialogHeader
        title="知识网络"
        description="基于文档间的链接引用生成，双击卡片可打开对应文档。"
        @close="handleClose"
      />
    </template>

    <div class="min-h-[24rem]">
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-full border px-3 py-1.5 text-[12px] font-medium transition"
          :class="
            activeTab === 'backlinks'
              ? 'border-brand bg-brand-faint text-brand'
              : 'border-line bg-muted text-ink-secondary hover:border-brand-lighter hover:text-brand'
          "
          @click="activeTab = 'backlinks'"
        >
          被引用 ({{ backlinks.length }})
        </button>
        <button
          type="button"
          class="rounded-full border px-3 py-1.5 text-[12px] font-medium transition"
          :class="
            activeTab === 'forwardLinks'
              ? 'border-brand bg-brand-faint text-brand'
              : 'border-line bg-muted text-ink-secondary hover:border-brand-lighter hover:text-brand'
          "
          @click="activeTab = 'forwardLinks'"
        >
          引用了 ({{ forwardLinks.length }})
        </button>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-2 py-16 text-ink-tertiary">
        <UiIcon icon="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
        <span class="text-[13px]">正在加载知识网络…</span>
      </div>

      <div
        v-else-if="errorMessage"
        class="mt-6 rounded-kb-xl border border-error-light bg-error-bg px-4 py-3 text-sm text-error"
      >
        {{ errorMessage }}
      </div>

      <div
        v-else-if="currentList.length === 0"
        class="mt-6 rounded-kb-xl border border-line bg-muted px-6 py-12 text-center"
      >
        <AppIcon name="i-lucide-network" class="mx-auto h-10 w-10 text-ink-quaternary" />
        <p class="mt-3 text-sm text-ink-tertiary">{{ emptyText }}</p>
      </div>

      <ul v-else class="mt-4 space-y-2">
        <li v-for="item in currentList" :key="item.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-4 rounded-kb-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-brand-lighter hover:bg-muted"
            @dblclick="openDoc(item.id)"
            @click.exact="openDoc(item.id)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">{{
                item.title || "未命名文档"
              }}</span>
              <span class="mt-0.5 block truncate text-[12px] text-ink-tertiary">
                {{ item.creatorName || "未知用户" }} · 更新于 {{ formatDateTime(item.updatedAt) }}
              </span>
            </span>
            <AppIcon name="i-lucide-chevron-right" class="h-4 w-4 shrink-0 text-ink-quaternary" />
          </button>
        </li>
      </ul>
    </div>
  </el-dialog>
</template>

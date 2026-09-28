<script setup lang="ts">
/**
 * 知识库文档管理卡片（对齐语雀「文档管理」）：
 * 平铺列出知识库内全部文档（含分组层级缩进），支持排序、批量移入回收站、
 * 目录默认展开级别设置（B4 #16）；树数据由工作区上下文提供，删除后由父级刷新。
 */
import { formatDateTime } from "@/utils/date-format"
import { computed, ref } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import {
  trashKnowledgeDocument,
  type KnowledgeDocumentTreeNode,
} from "@/services/knowledge-documents"
import { updateKnowledgeBasePreferences, type KnowledgeBaseItem } from "@/services/knowledge-base"

const props = defineProps<{
  nodes: KnowledgeDocumentTreeNode[]
  canTrash: boolean
  knowledgeBase: KnowledgeBaseItem
}>()

const emit = defineEmits<{
  docTrashed: []
  preferencesUpdated: [kb: KnowledgeBaseItem]
  notify: [message: string, type?: "success" | "error" | "info"]
}>()

interface FlatDoc {
  id: string
  title: string
  depth: number
  type: string
  editorType?: string
  status: string
  updatedAt: string
}

const flatten = (nodes: KnowledgeDocumentTreeNode[], depth = 0): FlatDoc[] =>
  nodes.flatMap((node) => [
    {
      id: node.id,
      title: node.title,
      depth,
      type: node.type,
      editorType: node.editorType,
      status: node.status,
      updatedAt: node.updatedAt,
    },
    ...flatten(node.children ?? [], depth + 1),
  ])

const docs = computed(() => flatten(props.nodes))
const keyword = ref("")
/** 排序口径（B4 #16）：树序=默认平铺序；更新时间/标题为客户端排序 */
const sortOrder = ref<"tree" | "updatedAt" | "title">("tree")
const filteredDocs = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  const list = query
    ? docs.value.filter((doc) => doc.title.toLowerCase().includes(query))
    : docs.value

  if (sortOrder.value === "updatedAt") {
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  if (sortOrder.value === "title") {
    return [...list].sort((a, b) => (a.title || "").localeCompare(b.title || "", "zh-Hans-CN"))
  }
  return list
})

// ==================== 批量移入回收站（B4 #16） ====================
const batchMode = ref(false)
const checkedIds = ref<Set<string>>(new Set())
const batchTrashing = ref(false)

const toggleChecked = (id: string, checked: boolean) => {
  const next = new Set(checkedIds.value)
  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }
  checkedIds.value = next
}

const allChecked = computed(
  () =>
    filteredDocs.value.length > 0 &&
    filteredDocs.value.every((doc) => checkedIds.value.has(doc.id)),
)

const toggleAllChecked = (checked: boolean) => {
  checkedIds.value = checked ? new Set(filteredDocs.value.map((doc) => doc.id)) : new Set()
}

const exitBatchMode = () => {
  batchMode.value = false
  checkedIds.value = new Set()
}

const batchTrashConfirmOpen = ref(false)

const handleBatchTrash = async () => {
  if (batchTrashing.value || checkedIds.value.size === 0) return

  batchTrashing.value = true
  try {
    const ids = [...checkedIds.value]
    const results = await Promise.allSettled(ids.map((id) => trashKnowledgeDocument(id)))
    const failed = results.filter((result) => result.status === "rejected").length
    if (failed > 0) {
      emit("notify", `${ids.length - failed} 篇已移入回收站，${failed} 篇失败。`, "info")
    } else {
      emit("notify", `已将 ${ids.length} 篇移入回收站。`, "success")
    }
    exitBatchMode()
    emit("docTrashed")
  } finally {
    batchTrashing.value = false
  }
}

// ==================== 目录默认展开级别（B4 #16） ====================
const expandLevel = ref<number | null>(props.knowledgeBase.settings?.defaultExpandLevel ?? null)
const expandLevelSaving = ref(false)

const handleExpandLevelChange = async (value: number | null) => {
  if (expandLevelSaving.value) return
  expandLevelSaving.value = true
  try {
    const updated = await updateKnowledgeBasePreferences(props.knowledgeBase.id, {
      defaultExpandLevel: value,
    })
    emit("preferencesUpdated", updated)
    emit(
      "notify",
      value === null ? "已恢复默认（目录全部折叠）。" : `目录默认展开至第 ${value} 级。`,
      "success",
    )
  } catch (error) {
    expandLevel.value = props.knowledgeBase.settings?.defaultExpandLevel ?? null
    emit("notify", error instanceof Error ? error.message : "保存默认展开级别失败", "error")
  } finally {
    expandLevelSaving.value = false
  }
}

const pendingTrashDoc = ref<FlatDoc | null>(null)
const confirmOpen = ref(false)

const typeLabel = (doc: FlatDoc) => {
  if (doc.type === "folder") return "分组"
  if (doc.type === "template") return "模板"
  // 画板文档的 type 是 "doc"、以 editorType 区分
  if (doc.editorType === "board") return "画板"
  return "文档"
}

const typeIcon = (doc: FlatDoc) => {
  if (doc.type === "folder") return "i-lucide-folder"
  if (doc.editorType === "board") return "i-lucide-image"
  if (doc.type === "template") return "i-lucide-book-marked"
  return "i-lucide-file-text"
}

const statusLabel = (status: string) =>
  status === "published" ? "已发布" : status === "archived" ? "已归档" : "草稿"

const requestTrash = (doc: FlatDoc) => {
  pendingTrashDoc.value = doc
  confirmOpen.value = true
}

const trashConfirmMessage = computed(
  () => `确认将「${pendingTrashDoc.value?.title || "无标题"}」移入回收站吗？`,
)

const trashing = ref(false)

const handleConfirmTrash = async () => {
  const doc = pendingTrashDoc.value
  if (!doc || trashing.value) return

  trashing.value = true

  try {
    await trashKnowledgeDocument(doc.id)
    emit("notify", `「${doc.title || "无标题"}」已移入回收站。`, "success")
    emit("docTrashed")
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "移入回收站失败", "error")
  } finally {
    trashing.value = false
    pendingTrashDoc.value = null
  }
}
</script>

<template>
  <section class="kb-section-shell p-4">
    <!-- 标题与描述由设置页页头承担，卡内只留工具行 -->
    <div class="flex flex-wrap items-center justify-end gap-3 px-2 pt-2">
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-fill-muted px-3 py-1 text-xs font-medium text-ink-tertiary">
          {{ filteredDocs.length }} 个
        </span>
        <el-select
          v-model="sortOrder"
          class="w-32"
          :offset="6"
          :show-arrow="false"
          title="排序方式"
        >
          <el-option label="按树序" value="tree" />
          <el-option label="按更新时间" value="updatedAt" />
          <el-option label="按标题" value="title" />
        </el-select>
        <el-select
          :model-value="expandLevel"
          class="w-40"
          :offset="6"
          :show-arrow="false"
          title="目录默认展开级别"
          :loading="expandLevelSaving"
          @update:model-value="
            (value) => handleExpandLevelChange(Number(value) === 0 ? null : Number(value))
          "
        >
          <el-option label="默认展开：第 1 级" :value="1" />
          <el-option label="默认展开：第 2 级" :value="2" />
          <el-option label="默认展开：第 3 级" :value="3" />
          <el-option label="默认展开：全部折叠" :value="0" />
        </el-select>
        <el-input v-model="keyword" type="text" placeholder="按标题筛选" class="w-48" />
        <el-button
          v-if="canTrash"
          plain
          size="small"
          class="rounded-kb-lg"
          @click="batchMode = !batchMode"
        >
          <span class="truncate">{{ batchMode ? "退出批量" : "批量管理" }}</span>
        </el-button>
      </div>
    </div>

    <div
      v-if="batchMode && canTrash && filteredDocs.length > 0"
      class="mt-3 flex items-center gap-3 px-2"
    >
      <el-checkbox
        :model-value="allChecked"
        label="全选"
        @update:model-value="(value) => toggleAllChecked(Boolean(value))"
      />
      <span class="text-[12px] text-ink-tertiary">已选 {{ checkedIds.size }} 项</span>
      <el-button
        type="danger"
        plain
        size="small"
        class="rounded-kb-lg"
        :disabled="checkedIds.size === 0"
        :loading="batchTrashing"
        @click="batchTrashConfirmOpen = true"
        ><template #loading
          ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
        /></template>
        <span class="truncate">移入回收站</span>
      </el-button>
    </div>

    <div class="mt-4 px-2 pb-2">
      <p v-if="filteredDocs.length === 0" class="py-10 text-center text-sm text-ink-tertiary">
        {{ docs.length === 0 ? "知识库内还没有文档。" : "没有匹配的文档。" }}
      </p>

      <ul v-else class="overflow-hidden rounded-kb-xl border border-line">
        <li
          v-for="doc in filteredDocs"
          :key="doc.id"
          class="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-muted"
        >
          <el-checkbox
            v-if="batchMode && canTrash"
            :model-value="checkedIds.has(doc.id)"
            class="shrink-0"
            :aria-label="`选择 ${doc.title || '无标题'}`"
            @update:model-value="(value) => toggleChecked(doc.id, Boolean(value))"
          />
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md bg-brand-faint text-brand"
            :style="{ marginLeft: `${doc.depth * 16}px` }"
          >
            <AppIcon :name="typeIcon(doc)" class="h-3.5 w-3.5" />
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] text-ink-secondary" :title="doc.title">
            {{ doc.title || "无标题" }}
          </span>
          <el-tag disable-transitions class="shrink-0">
            {{ typeLabel(doc) }}
          </el-tag>
          <el-tag
            disable-transitions
            :type="doc.status === 'published' ? 'success' : undefined"
            effect="plain"
            class="shrink-0"
          >
            {{ statusLabel(doc.status) }}
          </el-tag>
          <span class="w-36 shrink-0 text-right text-[11px] text-ink-quaternary">
            {{ formatDateTime(doc.updatedAt) }}
          </span>
          <el-button
            v-if="canTrash"
            text
            size="small"
            class="shrink-0 text-ink-tertiary hover:text-error"
            title="移入回收站"
            @click="requestTrash(doc)"
            ><AppIcon name="i-lucide-trash-2" class="h-3.5 w-3.5" />
            <span class="truncate"></span>
          </el-button>
        </li>
      </ul>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :message="trashConfirmMessage"
      danger
      confirm-text="删除"
      @confirm="handleConfirmTrash"
    />

    <ConfirmDialog
      v-model:open="batchTrashConfirmOpen"
      :message="`确认将已选的 ${checkedIds.size} 篇移入回收站吗？`"
      danger
      confirm-text="删除"
      @confirm="handleBatchTrash"
    />
  </section>
</template>

<!-- 组件说明：KnowledgeTrashView 组件，负责回收站页面展示与交互。 -->
<script setup lang="ts">
/** 页面组件，负责知识库回收站页面展示与交互流程。 */
import { formatDateTime } from "@/utils/date-format"
import { computed, onMounted, ref } from "vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import KnowledgeContentHeader from "@/components/knowledge/KnowledgeContentHeader.vue"
import KnowledgeTrashDocList from "@/components/knowledge/trash/KnowledgeTrashDocList.vue"
import KnowledgeTrashKbList from "@/components/knowledge/trash/KnowledgeTrashKbList.vue"
import KnowledgeTrashToolbar from "@/components/knowledge/trash/KnowledgeTrashToolbar.vue"
import {
  listKnowledgeBaseTrash,
  listKnowledgeBases,
  restoreKnowledgeBase,
  type KnowledgeBaseItem,
} from "@/services/knowledge-base"
import {
  hardDeleteKnowledgeDocument,
  hardDeleteKnowledgeDocuments,
  listKnowledgeDocumentTrash,
  restoreKnowledgeDocument,
  restoreKnowledgeDocuments,
  clearKnowledgeDocumentTrash,
} from "@/services/knowledge-documents"
import { getApiErrorMessage } from "@/services/http-client"
import { useTransientToast } from "@/composables/use-transient-toast"
import { getKnowledgeDocumentEditorLabel } from "@/utils/knowledge-document"

const { showToastMessage } = useTransientToast()
const ALL_KB_VALUE = "__all_kb__"
const tab = ref<"docs" | "kbs">("docs")
const loading = ref(false)
const errorMessage = ref("")
const searchKeyword = ref("")

const kbOptions = ref<KnowledgeBaseItem[]>([])
const selectedKbId = ref(ALL_KB_VALUE)

const docTrash = ref<{
  items: Array<{
    id: string
    title: string
    editorType?: string
    kbId: string
    updatedAt: string
    deletedAt: string
    kb: {
      id: string
      name: string
    }
  }>
  total: number
  page: number
  pageSize: number
} | null>(null)

const kbTrash = ref<{
  items: KnowledgeBaseItem[]
  total: number
  page: number
  pageSize: number
} | null>(null)

const selectedDocIds = ref<string[]>([])
const submitting = ref(false)
const confirmDialog = ref<{ open: boolean; message: string; onConfirm: () => void }>({
  open: false,
  message: "",
  onConfirm: () => {},
})

const knowledgeBaseItems = computed(() => [
  { label: "全部知识库", value: ALL_KB_VALUE },
  ...kbOptions.value.map(item => ({ label: item.name, value: item.id })),
])

const filteredDocItems = computed(() => {
  const normalizedKeyword = searchKeyword.value.trim().toLowerCase()

  return (docTrash.value?.items ?? []).filter(item => {
    if (!normalizedKeyword) {
      return true
    }

    return [item.title, item.kb.name].some(field => field.toLowerCase().includes(normalizedKeyword))
  })
})

const filteredKbItems = computed(() => {
  const normalizedKeyword = searchKeyword.value.trim().toLowerCase()

  return (kbTrash.value?.items ?? []).filter(item => {
    if (!normalizedKeyword) {
      return true
    }

    return item.name.toLowerCase().includes(normalizedKeyword)
  })
})

const resolveEditorLabel = (editorType?: string | null) => getKnowledgeDocumentEditorLabel(editorType)

const selectAll = computed(() => {
  if (filteredDocItems.value.length === 0) {
    return false
  }

  return filteredDocItems.value.every(item => selectedDocIds.value.includes(item.id))
})

const selectIndeterminate = computed(() => {
  if (filteredDocItems.value.length === 0) {
    return false
  }

  const selectedVisibleCount = filteredDocItems.value.filter(item => selectedDocIds.value.includes(item.id)).length
  return selectedVisibleCount > 0 && selectedVisibleCount < filteredDocItems.value.length
})

const trashListCount = computed(() =>
  tab.value === "docs" ? (docTrash.value?.total ?? 0) : (kbTrash.value?.total ?? 0)
)

const TRASH_PAGE_SIZE = 100
const docTrashPage = ref(1)
const kbTrashPage = ref(1)
const loadingMore = ref(false)
// 筛选/切 tab 的过期序号守卫：慢响应晚归不得覆盖当前视角的列表
let trashLoadSeq = 0

const hasMoreDocTrash = computed(() => (docTrash.value?.total ?? 0) > (docTrash.value?.items?.length ?? 0))
const hasMoreKbTrash = computed(() => (kbTrash.value?.total ?? 0) > (kbTrash.value?.items?.length ?? 0))

const loadDocTrash = async () => {
  const seq = ++trashLoadSeq
  const result = await listKnowledgeDocumentTrash({
    kbId: selectedKbId.value === ALL_KB_VALUE ? undefined : selectedKbId.value,
    page: 1,
    pageSize: TRASH_PAGE_SIZE,
  })

  if (seq !== trashLoadSeq) {
    return
  }

  docTrashPage.value = 1
  docTrash.value = result
  const validIds = new Set(result.items.map(item => item.id))
  selectedDocIds.value = selectedDocIds.value.filter(id => validIds.has(id))
}

const loadKbTrash = async () => {
  const seq = ++trashLoadSeq
  const result = await listKnowledgeBaseTrash({
    page: 1,
    pageSize: TRASH_PAGE_SIZE,
  })

  if (seq !== trashLoadSeq) {
    return
  }

  kbTrashPage.value = 1
  kbTrash.value = result
}

const loadMoreDocTrash = async () => {
  if (loadingMore.value || !docTrash.value || !hasMoreDocTrash.value) {
    return
  }

  const seq = trashLoadSeq
  const requestedKbId = selectedKbId.value

  loadingMore.value = true
  try {
    const result = await listKnowledgeDocumentTrash({
      kbId: requestedKbId === ALL_KB_VALUE ? undefined : requestedKbId,
      page: docTrashPage.value + 1,
      pageSize: TRASH_PAGE_SIZE,
    })

    if (seq !== trashLoadSeq || requestedKbId !== selectedKbId.value) {
      return
    }

    docTrashPage.value += 1
    docTrash.value = {
      ...result,
      items: [...(docTrash.value?.items ?? []), ...result.items],
    }
  } catch (error) {
    if (seq !== trashLoadSeq || requestedKbId !== selectedKbId.value) {
      return
    }
    showToastMessage(getApiErrorMessage(error, "加载更多失败。"), "error")
  } finally {
    // 无条件复位：请求期间被重新加载抢先刷新时序号已过期，条件复位会让按钮永久卡在加载中
    loadingMore.value = false
  }
}

const loadMoreKbTrash = async () => {
  if (loadingMore.value || !kbTrash.value || !hasMoreKbTrash.value) {
    return
  }

  const seq = trashLoadSeq

  loadingMore.value = true
  try {
    const result = await listKnowledgeBaseTrash({
      page: kbTrashPage.value + 1,
      pageSize: TRASH_PAGE_SIZE,
    })

    if (seq !== trashLoadSeq) {
      return
    }

    kbTrashPage.value += 1
    kbTrash.value = {
      ...result,
      items: [...(kbTrash.value?.items ?? []), ...result.items],
    }
  } catch (error) {
    if (seq !== trashLoadSeq) {
      return
    }
    showToastMessage(getApiErrorMessage(error, "加载更多失败。"), "error")
  } finally {
    // 同 loadMoreDocTrash：无条件复位，避免过期分支把 loadingMore 卡死
    loadingMore.value = false
  }
}

const load = async () => {
  loading.value = true
  errorMessage.value = ""

  try {
    if (kbOptions.value.length === 0) {
      kbOptions.value = await listKnowledgeBases()
    }

    if (tab.value === "docs") {
      await loadDocTrash()
      return
    }

    await loadKbTrash()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载回收站失败。"
  } finally {
    loading.value = false
  }
}

const changeTab = async (nextTab: "docs" | "kbs") => {
  tab.value = nextTab
  searchKeyword.value = ""
  selectedDocIds.value = []
  await load()
}

const toggleSelectDoc = (id: string) => {
  if (selectedDocIds.value.includes(id)) {
    selectedDocIds.value = selectedDocIds.value.filter(item => item !== id)
    return
  }

  selectedDocIds.value = [...selectedDocIds.value, id]
}

const toggleSelectAll = () => {
  if (filteredDocItems.value.length === 0) {
    return
  }

  if (selectAll.value) {
    const visibleIds = new Set(filteredDocItems.value.map(item => item.id))
    selectedDocIds.value = selectedDocIds.value.filter(id => !visibleIds.has(id))
    return
  }

  const merged = new Set([...selectedDocIds.value, ...filteredDocItems.value.map(item => item.id)])
  selectedDocIds.value = Array.from(merged)
}

const restoreSingleDoc = async (id: string) => {
  submitting.value = true

  try {
    await restoreKnowledgeDocument(id)
    await loadDocTrash()
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "恢复文档失败。"), "error")
  } finally {
    submitting.value = false
  }
}

const hardDeleteSingleDoc = (id: string) => {
  confirmDialog.value = {
    open: true,
    message: "确认彻底删除该文档吗？该操作不可恢复。",
    onConfirm: async () => {
      submitting.value = true
      try {
        await hardDeleteKnowledgeDocument(id)
        await loadDocTrash()
      } catch (error) {
        showToastMessage(getApiErrorMessage(error, "彻底删除文档失败。"), "error")
      } finally {
        submitting.value = false
      }
    },
  }
}

const restoreSelectedDocs = async () => {
  if (selectedDocIds.value.length === 0) {
    return
  }

  submitting.value = true

  try {
    await restoreKnowledgeDocuments(selectedDocIds.value)
    selectedDocIds.value = []
    await loadDocTrash()
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "批量恢复文档失败。"), "error")
  } finally {
    submitting.value = false
  }
}

const hardDeleteSelectedDocs = () => {
  if (selectedDocIds.value.length === 0) {
    return
  }

  confirmDialog.value = {
    open: true,
    message: "确认彻底删除选中文档吗？该操作不可恢复。",
    onConfirm: async () => {
      submitting.value = true
      try {
        await hardDeleteKnowledgeDocuments(selectedDocIds.value)
        selectedDocIds.value = []
        await loadDocTrash()
      } catch (error) {
        showToastMessage(getApiErrorMessage(error, "批量彻底删除文档失败。"), "error")
      } finally {
        submitting.value = false
      }
    },
  }
}

const restoreSingleKb = async (id: string) => {
  submitting.value = true

  try {
    await restoreKnowledgeBase(id)
    await loadKbTrash()
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "恢复知识库失败。"), "error")
  } finally {
    submitting.value = false
  }
}

const clearAllDocs = () => {
  // 文案与实际作用范围一致：按知识库筛选时只清空该库的回收站
  const scopeText =
    selectedKbId.value === ALL_KB_VALUE
      ? "所有已删除文档"
      : `「${knowledgeBaseItems.value.find(item => item.value === selectedKbId.value)?.label ?? "当前知识库"}」内已删除的文档`

  confirmDialog.value = {
    open: true,
    message: `确认清空文档回收站吗？${scopeText}将被彻底删除，不可恢复。`,
    onConfirm: async () => {
      submitting.value = true
      try {
        await clearKnowledgeDocumentTrash(selectedKbId.value === ALL_KB_VALUE ? undefined : selectedKbId.value)
        selectedDocIds.value = []
        await loadDocTrash()
      } catch (error) {
        showToastMessage(getApiErrorMessage(error, "清空回收站失败。"), "error")
      } finally {
        submitting.value = false
      }
    },
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <KnowledgePageShell active-menu="trash">
    <div class="flex h-full min-h-0 flex-col bg-surface">
      <KnowledgeContentHeader
        :title="tab === 'docs' ? '文档回收站' : '知识库回收站'"
        :meta="`共 ${trashListCount} 条记录`"
      />

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="mx-auto w-full max-w-(--kb-content-max-width) space-y-4">
          <KnowledgeTrashToolbar
            :active-tab="tab"
            :can-clear-docs="Boolean(docTrash?.total) && !submitting"
            :loading="loading"
            :search-keyword="searchKeyword"
            :selected-kb-id="selectedKbId"
            :knowledge-base-items="knowledgeBaseItems"
            @change-tab="changeTab"
            @clear-docs="clearAllDocs"
            @refresh="load"
            @update:search-keyword="searchKeyword = $event"
            @update:selected-kb-id="selectedKbId = $event"
            @kb-filter-change="load"
          />

          <p v-if="errorMessage" class="px-1 text-kb-sm text-error">{{ errorMessage }}</p>

          <div v-else-if="loading" class="space-y-0.5">
            <div
              v-for="index in 8"
              :key="index"
              class="h-(--kb-row-height-doc) animate-pulse rounded-kb-sm bg-grey-200"
            />
          </div>

          <KnowledgeTrashDocList
            v-else-if="tab === 'docs'"
            :items="filteredDocItems"
            :selected-doc-ids="selectedDocIds"
            :total="docTrash?.total || 0"
            :select-all="selectAll"
            :select-indeterminate="selectIndeterminate"
            :submitting="submitting"
            :format-date-time="formatDateTime"
            :resolve-editor-label="resolveEditorLabel"
            @toggle-select-all="toggleSelectAll"
            @toggle-select-doc="toggleSelectDoc"
            @restore-single-doc="restoreSingleDoc"
            @hard-delete-single-doc="hardDeleteSingleDoc"
            @restore-selected-docs="restoreSelectedDocs"
            @hard-delete-selected-docs="hardDeleteSelectedDocs"
          />

          <KnowledgeTrashKbList
            v-else
            :items="filteredKbItems"
            :submitting="submitting"
            :format-date-time="formatDateTime"
            @restore-single-kb="restoreSingleKb"
          />

          <!-- 加载更多：独立于上方 loading/空态/列表的条件链 -->
          <div v-if="tab === 'docs' && hasMoreDocTrash" class="flex justify-center pb-6">
            <el-button
              plain
              size="small"
              class="rounded-[10px] border-line bg-surface px-4 text-[13px] text-ink-secondary font-semibold"
              :disabled="loadingMore"
              @click="loadMoreDocTrash"
              >{{ loadingMore ? "加载中…" : `加载更多（共 ${docTrash?.total ?? 0} 条）` }}</el-button
            >
          </div>
          <div v-else-if="tab === 'kbs' && hasMoreKbTrash" class="flex justify-center pb-6">
            <el-button
              plain
              size="small"
              class="rounded-[10px] border-line bg-surface px-4 text-[13px] text-ink-secondary font-semibold"
              :disabled="loadingMore"
              @click="loadMoreKbTrash"
              >{{ loadingMore ? "加载中…" : `加载更多（共 ${kbTrash?.total ?? 0} 条）` }}</el-button
            >
          </div>
        </div>
      </div>
    </div>
  </KnowledgePageShell>

  <ConfirmDialog
    v-model:open="confirmDialog.open"
    :message="confirmDialog.message"
    danger
    confirm-text="删除"
    @confirm="confirmDialog.onConfirm"
  />
</template>

<script setup lang="ts">
/**
 * 页面组件，负责「画板」聚合页展示与交互流程。
 *
 * 结构与「最近」页一致（顶栏 + 筛选工具条 + 行式列表），数据来自最近访问接口
 * 按画板类型过滤，作为全局画板入口的第一版聚合视图。
 */
import { formatShortDate } from "@/utils/date-format"
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import KnowledgeContentHeader from "@/components/knowledge/KnowledgeContentHeader.vue"
import KnowledgeDocList, { type DocListItem } from "@/components/knowledge/KnowledgeDocList.vue"
import KnowledgeFilterToolbar from "@/components/knowledge/KnowledgeFilterToolbar.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import { listKnowledgeBases, type KnowledgeBaseItem } from "@/services/knowledge-base"
import {
  listRecentKnowledgeDocuments,
  listRecentKnowledgeDocumentsAll,
  type KnowledgeRecentDocumentItem,
} from "@/services/knowledge-documents"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"

const BOARD_EDITOR_TYPE = "board"

const router = useRouter()
const loading = ref(false)
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const keyword = ref("")
const ALL_KB_VALUE = "__all_kb__"
const selectedKbId = ref(ALL_KB_VALUE)
const items = ref<KnowledgeRecentDocumentItem[]>([])
const errorMessage = ref("")

const knowledgeBaseItems = computed(() => [
  { label: "全部知识库", value: ALL_KB_VALUE },
  ...knowledgeBases.value.map((item) => ({ label: item.name, value: item.id })),
])

const boardItems = computed(() =>
  items.value.filter((item) => item.editorType === BOARD_EDITOR_TYPE),
)

const filteredItems = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()

  return boardItems.value.filter((item) => {
    if (!normalizedKeyword) {
      return true
    }

    return [item.title, item.kb?.name || ""].some((field) =>
      field.toLowerCase().includes(normalizedKeyword),
    )
  })
})

const listItems = computed<DocListItem[]>(() =>
  filteredItems.value.map((item) => ({
    id: item.id,
    title: item.title,
    icon: "ph:frame-corners",
    badges: item.kb?.name ? [{ label: item.kb.name }] : undefined,
    meta: ["画板"],
    time: formatShortDate(item.lastViewedAt || item.updatedAt),
  })),
)

const summary = computed(() => `${filteredItems.value.length} 块画板`)

const openBoardById = (item: DocListItem) => {
  const matched = filteredItems.value.find((entry) => entry.id === item.id)

  if (!matched) {
    return
  }

  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: matched.kbId,
      docId: matched.id,
      editorType: matched.editorType,
    }),
  )
}

// 筛选切换的过期序号守卫：慢响应晚归不得覆盖当前筛选的列表
let loadSeq = 0

const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  errorMessage.value = ""

  try {
    if (knowledgeBases.value.length === 0) {
      knowledgeBases.value = await listKnowledgeBases()
    }

    if (selectedKbId.value !== ALL_KB_VALUE) {
      const loaded = await listRecentKnowledgeDocuments({
        kbId: selectedKbId.value,
        limit: 120,
      })
      if (seq !== loadSeq) return
      items.value = loaded
      return
    }

    const loaded = await listRecentKnowledgeDocumentsAll({
      limit: 120,
    })
    if (seq !== loadSeq) return
    items.value = loaded
  } catch (error) {
    if (seq === loadSeq) {
      errorMessage.value = error instanceof Error ? error.message : "加载画板列表失败。"
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <KnowledgePageShell active-menu="boards">
    <div class="flex h-full min-h-0 flex-col bg-surface">
      <KnowledgeContentHeader title="画板" :meta="summary" />

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="mx-auto w-full max-w-(--kb-content-max-width) space-y-4">
          <KnowledgeFilterToolbar
            v-model="keyword"
            :filters="knowledgeBaseItems"
            :filter-value="selectedKbId"
            placeholder="按画板标题或知识库名称筛选"
            :loading="loading"
            @update:filter-value="
              (value) => {
                selectedKbId = value
                load()
              }
            "
            @refresh="load"
          />

          <p v-if="errorMessage" class="px-1 text-kb-sm text-error">{{ errorMessage }}</p>

          <KnowledgeDocList
            title="全部画板"
            :items="listItems"
            :loading="loading"
            empty-title="暂无画板"
            empty-description="打开或新建画板后，这里会汇总你能访问的全部画板。"
            @select="openBoardById"
          />
        </div>
      </div>
    </div>
  </KnowledgePageShell>
</template>

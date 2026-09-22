<script setup lang="ts">
/**
 * 页面组件，负责「最近」页面展示与交互流程。
 *
 * 结构对齐语雀列表页：顶栏（标题 + 统计）→ 紧凑筛选工具条 → 扁平行式文档列表。
 * 旧版的大块 Hero 统计卡与卡片网格移除，信息密度向语雀靠拢。
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
import { getKnowledgeDocumentEditorLabel, getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"

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
  ...knowledgeBases.value.map(item => ({ label: item.name, value: item.id })),
])

const filteredItems = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()

  return items.value.filter(item => {
    if (!normalizedKeyword) {
      return true
    }

    return [item.title, item.kb?.name || ""].some(field => field.toLowerCase().includes(normalizedKeyword))
  })
})

const listItems = computed<DocListItem[]>(() =>
  filteredItems.value.map(item => ({
    id: item.id,
    title: item.title,
    icon: "ph:file-text",
    badges: item.kb?.name ? [{ label: item.kb.name }] : undefined,
    meta: [getKnowledgeDocumentEditorLabel(item.editorType)],
    time: formatShortDate(item.lastViewedAt),
  }))
)

const summary = computed(() => {
  const today = new Date().toDateString()
  const todayCount = filteredItems.value.filter(item => new Date(item.lastViewedAt).toDateString() === today).length

  return `${filteredItems.value.length} 篇 · 今日 ${todayCount} 篇`
})

const openDocById = (item: DocListItem) => {
  const matched = filteredItems.value.find(entry => entry.id === item.id)

  if (!matched) {
    return
  }

  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: matched.kbId,
      docId: matched.id,
      editorType: matched.editorType,
    })
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
      const result = await listRecentKnowledgeDocuments({
        kbId: selectedKbId.value,
        limit: 80,
      })

      if (seq !== loadSeq) {
        return
      }
      items.value = result
      return
    }

    const result = await listRecentKnowledgeDocumentsAll({
      limit: 80,
    })

    if (seq !== loadSeq) {
      return
    }
    items.value = result
  } catch (error) {
    if (seq !== loadSeq) {
      return
    }
    errorMessage.value = error instanceof Error ? error.message : "加载最近访问失败。"
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
  <KnowledgePageShell active-menu="recent">
    <div class="flex h-full min-h-0 flex-col bg-surface">
      <KnowledgeContentHeader title="最近" :meta="summary" />

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="mx-auto w-full max-w-(--kb-content-max-width) space-y-4">
          <KnowledgeFilterToolbar
            v-model="keyword"
            :filters="knowledgeBaseItems"
            :filter-value="selectedKbId"
            placeholder="按文档标题或知识库名称筛选"
            :loading="loading"
            @update:filter-value="
              value => {
                selectedKbId = value
                load()
              }
            "
            @refresh="load"
          />

          <p v-if="errorMessage" class="px-1 text-kb-sm text-error">{{ errorMessage }}</p>

          <KnowledgeDocList
            title="最近浏览"
            :items="listItems"
            :loading="loading"
            empty-title="暂无最近访问记录"
            empty-description="开始浏览文档后，这里会自动沉淀你的最近工作轨迹。"
            @select="openDocById"
          />
        </div>
      </div>
    </div>
  </KnowledgePageShell>
</template>

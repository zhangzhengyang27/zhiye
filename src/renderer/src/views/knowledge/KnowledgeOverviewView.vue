<script setup lang="ts">
/**
 * 页面组件，负责知识库概览页展示与交互流程。
 *
 * 结构对齐语雀 Dashboard「开始」页：轻量顶栏（面包屑 + 工具）→ 快速操作卡 →
 * 带 Tab 筛选的扁平行式文档列表。相比旧的卡片网格，信息密度更高、视觉噪音更少。
 */
import { computed, inject, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeContentHeader from "@/components/knowledge/KnowledgeContentHeader.vue"
import KnowledgeQuickActions, { type QuickActionItem } from "@/components/knowledge/KnowledgeQuickActions.vue"
import KnowledgeDocList, { type DocListItem, type DocListTab } from "@/components/knowledge/KnowledgeDocList.vue"
import { listRecentKnowledgeDocuments } from "@/services/knowledge-documents"
import { getKnowledgeDocumentEditorLabel, getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { formatShortDate } from "@/utils/date-format"
import { knowledgeWorkspaceContextKey, type KnowledgeWorkspaceContext } from "./workspace-context"

type OverviewRecentItem = {
  id: string
  title: string
  kbId: string
  editorType?: string
  updatedAt: string
  lastViewedAt: string
}

type FlatDoc = {
  id: string
  title: string
  editorType?: string
  updatedAt: string
}

const router = useRouter()
const workspaceContext = inject(knowledgeWorkspaceContextKey)

if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

const activeTab = ref("recent")
const recentItems = ref<OverviewRecentItem[]>([])

const canEdit = computed(() => workspaceContext.permissions.value?.canEdit ?? false)
const workspaceName = computed(() => workspaceContext.knowledgeBase.value?.name || "知识库")

const flattenDocs = (): FlatDoc[] => {
  const result: FlatDoc[] = []

  const walk = (nodes: KnowledgeWorkspaceContext["treeNodes"]["value"]) => {
    nodes.forEach(node => {
      if (node.type === "doc") {
        result.push({
          id: node.id,
          title: node.title,
          editorType: node.editorType,
          updatedAt: node.updatedAt,
        })
      }

      if (node.children.length > 0) {
        walk(node.children)
      }
    })
  }

  walk(workspaceContext.treeNodes.value)

  return result
}

const flatDocs = computed(flattenDocs)

const docTabs = computed<DocListTab[]>(() => [
  { label: "最近访问", value: "recent" },
  { label: "最近更新", value: "updated" },
  { label: "全部文档", value: "all" },
])

const statsHint = computed(() => {
  const docs = flatDocs.value.length

  return `${docs} 篇文档 · ${workspaceContext.permissions.value?.canEdit ? "可编辑" : "只读"}`
})

const listItems = computed<DocListItem[]>(() => {
  if (activeTab.value === "recent") {
    return recentItems.value.map(item => ({
      id: item.id,
      title: item.title,
      icon: "ph:file-text",
      meta: [getKnowledgeDocumentEditorLabel(item.editorType)],
      time: formatShortDate(item.lastViewedAt),
    }))
  }

  const source = [...flatDocs.value].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  )
  const target = activeTab.value === "updated" ? source.slice(0, 20) : source

  return target.map(item => ({
    id: item.id,
    title: item.title,
    icon: "ph:file-text",
    meta: [getKnowledgeDocumentEditorLabel(item.editorType)],
    time: formatShortDate(item.updatedAt),
  }))
})

const emptyTitle = computed(() => {
  if (activeTab.value === "recent") {
    return "暂无最近访问记录"
  }

  return "当前知识库还没有文档"
})

const emptyDescription = computed(() => {
  if (activeTab.value === "recent") {
    return "浏览文档后，这里会自动沉淀你的最近工作轨迹。"
  }

  return canEdit.value ? "用上方的快速操作新建第一篇文档。" : "当前角色仅可查看，待成员创建内容后可在这里浏览。"
})

const quickActions = computed<QuickActionItem[]>(() => [
  {
    id: "doc",
    label: "新建文档",
    icon: "ph:file-plus",
    description: "空白文档",
    disabled: !canEdit.value,
  },
  {
    id: "folder",
    label: "新建分组",
    icon: "ph:folder-simple-plus",
    description: "组织文档结构",
    disabled: !canEdit.value,
  },
  {
    id: "board",
    label: "新建画板",
    icon: "ph:clipboard-text",
    description: "可视化白板",
    disabled: !canEdit.value,
  },
  {
    id: "template",
    label: "从模板创建",
    icon: "ph:layout",
    description: "套用现成结构",
    disabled: !canEdit.value,
  },
])

const openDoc = (item: DocListItem) => {
  const editorType =
    activeTab.value === "recent"
      ? recentItems.value.find(entry => entry.id === item.id)?.editorType
      : flatDocs.value.find(entry => entry.id === item.id)?.editorType

  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: workspaceContext.kbId.value,
      docId: item.id,
      editorType,
    })
  )
}

const handleQuickAction = (item: QuickActionItem) => {
  if (item.id === "template") {
    workspaceContext.openTemplateLibrary()
    return
  }

  workspaceContext.createNode(item.id as "doc" | "folder" | "board")
}

const openSearch = () => {
  router.push({
    name: "knowledge-search",
    params: { kbId: workspaceContext.kbId.value },
  })
}

const openFavorites = () => {
  router.push({ name: "knowledge-favorites" })
}

const openSettings = () => {
  router.push({
    name: "knowledge-settings",
    params: { kbId: workspaceContext.kbId.value },
  })
}

const loadRecentItems = async () => {
  const requestedKbId = workspaceContext.kbId.value

  try {
    const result = await listRecentKnowledgeDocuments({
      kbId: requestedKbId,
      limit: 12,
    })

    // 切库后旧请求晚归不能覆盖新库的概览
    if (requestedKbId !== workspaceContext.kbId.value) {
      return
    }
    recentItems.value = result
  } catch {
    if (requestedKbId !== workspaceContext.kbId.value) {
      return
    }
    recentItems.value = []
  }
}

watch(
  () => workspaceContext.kbId.value,
  () => {
    void loadRecentItems()
  },
  { immediate: true }
)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface">
    <KnowledgeContentHeader :crumbs="[{ label: workspaceName }]" :meta="statsHint">
      <template #actions>
        <el-button
          text
          class="h-8 w-8 p-0 text-ink-tertiary hover:bg-grey-200 hover:text-brand gap-1.5 font-semibold"
          title="搜索内容"
          @click="openSearch"
          ><span class="truncate"><Icon icon="ph:magnifying-glass" :width="16" :height="16" /></span>
        </el-button>
        <el-button
          text
          class="h-8 w-8 p-0 text-ink-tertiary hover:bg-grey-200 hover:text-brand gap-1.5 font-semibold"
          title="收藏"
          @click="openFavorites"
          ><span class="truncate"><Icon icon="ph:star" :width="16" :height="16" /></span>
        </el-button>
        <el-button
          text
          class="h-8 w-8 p-0 text-ink-tertiary hover:bg-grey-200 hover:text-brand gap-1.5 font-semibold"
          title="知识库设置"
          @click="openSettings"
          ><span class="truncate"><Icon icon="ph:gear" :width="16" :height="16" /></span>
        </el-button>
      </template>
    </KnowledgeContentHeader>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <div class="mx-auto w-full max-w-(--kb-content-max-width) space-y-6">
        <KnowledgeQuickActions :items="quickActions" @select="handleQuickAction" />

        <KnowledgeDocList
          v-model:active-tab="activeTab"
          title="文档"
          title-hint="按最近访问与时间排序"
          :items="listItems"
          :tabs="docTabs"
          :empty-title="emptyTitle"
          :empty-description="emptyDescription"
          @select="openDoc"
        />
      </div>
    </div>
  </div>
</template>

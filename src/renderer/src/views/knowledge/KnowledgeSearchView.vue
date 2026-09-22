<script setup lang="ts">
/**
 * 页面组件，负责知识库搜索页展示与交互流程。
 *
 * 结构：Hero 头部（空间 / 范围 / 筛选状态）→ 搜索工具条（关键词、范围、筛选）→
 * 结果区（空闲引导 / 命中列表 / 空态）。关键词与搜索范围通过路由 query（q / scope）
 * 同步，刷新或返回时仍能恢复搜索现场；恢复期重建，中段与模板原文保留。
 */
import { computed, inject, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import KnowledgeSearchEmptyState from "@/components/knowledge/search/KnowledgeSearchEmptyState.vue"
import KnowledgeSearchHeroSection from "@/components/knowledge/search/KnowledgeSearchHeroSection.vue"
import KnowledgeSearchIdleState from "@/components/knowledge/search/KnowledgeSearchIdleState.vue"
import KnowledgeSearchResultList from "@/components/knowledge/search/KnowledgeSearchResultList.vue"
import KnowledgeSearchToolbar from "@/components/knowledge/search/KnowledgeSearchToolbar.vue"
import {
  searchKnowledgeDocuments,
  type KnowledgeDocumentSearchResult,
  type KnowledgePublicShareItem,
  type KnowledgeSearchScope,
} from "@/services/knowledge-documents"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { knowledgeWorkspaceContextKey } from "./workspace-context"

/** 快捷建议项（与搜索子组件的 SuggestedQuery 形状一致）。 */
type SuggestedQuery = {
  label: string
  keyword: string
  scope: KnowledgeSearchScope
  description: string
}

const router = useRouter()
const route = useRoute()
const workspaceContext = inject(knowledgeWorkspaceContextKey)

if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

const keyword = ref("")
const scope = ref<KnowledgeSearchScope>("all")
const loading = ref(false)
const errorMessage = ref("")
const searchItems = ref<KnowledgeDocumentSearchResult["items"]>([])
const resultTotal = ref(0)
/** 站内公开分享聚合（B3 #22）：仅检索词非空时由服务端附带，最多展示 5 条 */
const publicShares = ref<KnowledgePublicShareItem[]>([])
const visiblePublicShares = computed(() => publicShares.value.slice(0, 5))
const filterStatus = ref("all")
const filterDateFrom = ref("")
const filterDateTo = ref("")

const scopeOptions: Array<{ id: KnowledgeSearchScope; label: string }> = [
  { id: "all", label: "全部" },
  { id: "title", label: "仅标题" },
  { id: "content", label: "仅正文" },
]

const statusOptions: Array<{ label: string; value: string }> = [
  { label: "全部状态", value: "all" },
  { label: "已发布", value: "published" },
  { label: "待审核", value: "pending" },
  { label: "已归档", value: "archived" },
  { label: "草稿", value: "draft" },
]

/** 状态筛选值的展示名（筛选标签与空态共用）。 */
const statusLabelOf = (value: string) =>
  statusOptions.find((option) => option.value === value)?.label ?? value

const recommendedQueries: SuggestedQuery[] = [
  {
    label: "找规范文档",
    keyword: "规范",
    scope: "title",
    description: "在标题中检索规范类文档，快速定位流程与约定。",
  },
  {
    label: "查会议记录",
    keyword: "会议",
    scope: "content",
    description: "在正文中检索会议记录，回顾结论与待办。",
  },
  {
    label: "搜复盘总结",
    keyword: "复盘",
    scope: "all",
    description: "全文检索复盘总结，沉淀经验教训。",
  },
]

const currentScopeLabel = computed(() => {
  if (scope.value === "title") {
    return "仅标题"
  }

  if (scope.value === "content") {
    return "仅正文"
  }

  return "标题与正文"
})

/** 状态与创建时间筛选由前端在搜索结果上过滤（搜索接口只支持关键词与范围）。 */
const hasActiveFilters = computed(
  () =>
    filterStatus.value !== "all" || Boolean(filterDateFrom.value) || Boolean(filterDateTo.value),
)

const activeFilterCount = computed(() => {
  let count = 0

  if (filterStatus.value !== "all") {
    count += 1
  }

  if (filterDateFrom.value || filterDateTo.value) {
    count += 1
  }

  return count
})

const activeFilterLabels = computed(() => {
  const labels: string[] = []

  if (filterStatus.value !== "all") {
    labels.push(`状态：${statusLabelOf(filterStatus.value)}`)
  }

  if (filterDateFrom.value || filterDateTo.value) {
    labels.push(`创建时间：${filterDateFrom.value || "…"} ~ ${filterDateTo.value || "…"}`)
  }

  return labels
})

const filteredItems = computed(() =>
  searchItems.value.filter((item) => {
    if (filterStatus.value !== "all" && (item.status ?? "draft") !== filterStatus.value) {
      return false
    }

    // createdAt / updatedAt 均为 ISO 字符串，取日期段直接做字典序比较即可
    const createdDay = (item.createdAt || item.updatedAt).slice(0, 10)

    if (filterDateFrom.value && createdDay < filterDateFrom.value) {
      return false
    }

    if (filterDateTo.value && createdDay > filterDateTo.value) {
      return false
    }

    return true
  }),
)

/** 服务端已有原始命中，但被前端筛选条件全部排除时，空态要给出针对性提示。 */
const hasSuppressedMatches = computed(
  () => searchItems.value.length > 0 && filteredItems.value.length === 0,
)

const insightCards = computed(() => [
  {
    label: "命中结果",
    value: resultTotal.value,
    hint: keyword.value.trim()
      ? `关键词“${keyword.value.trim()}”的命中数量`
      : "输入关键词后开始第一次检索",
  },
  {
    label: "当前范围",
    value: currentScopeLabel.value,
    hint: "可按标题或正文收窄搜索范围",
  },
  {
    label: "启用筛选",
    value: activeFilterCount.value,
    hint: hasActiveFilters.value ? "叠加状态与创建时间条件" : "暂未叠加额外筛选条件",
  },
])

/** 从路由 query 还原关键词（缺省视为未输入）。 */
const getRouteKeyword = () => (typeof route.query.q === "string" ? route.query.q : "")

/** 从路由 query 还原搜索范围（非法值回落到全文检索）。 */
const getRouteScope = (): KnowledgeSearchScope => {
  const value = route.query.scope

  return value === "title" || value === "content" ? value : "all"
}

/**
 * 把当前关键词与范围写回路由 query（q / scope）。
 * 返回路由是否变化：变化时 watch 会触发 runSearch，调用方无需重复请求。
 */
const updateRouteQuery = async () => {
  const trimmedKeyword = keyword.value.trim()
  const nextQuery: Record<string, string> = {}

  if (trimmedKeyword) {
    nextQuery.q = trimmedKeyword
  }

  if (scope.value !== "all") {
    nextQuery.scope = scope.value
  }

  if (getRouteKeyword() === trimmedKeyword && getRouteScope() === scope.value) {
    return false
  }

  await router.replace({ query: nextQuery })

  return true
}

// 搜索请求的过期序号守卫：切库或连续搜索时，晚归的旧响应不得覆盖当前结果（恢复期重建）
let searchSeq = 0

const runSearch = async () => {
  const seq = ++searchSeq
  const requestedKbId = workspaceContext.kbId.value
  const trimmedKeyword = keyword.value.trim()

  if (!trimmedKeyword) {
    searchItems.value = []
    resultTotal.value = 0
    publicShares.value = []
    errorMessage.value = ""
    return
  }

  loading.value = true
  errorMessage.value = ""

  try {
    const result = await searchKnowledgeDocuments({
      kbId: requestedKbId,
      q: trimmedKeyword,
      scope: scope.value,
      pageSize: 50,
    })

    if (seq !== searchSeq || requestedKbId !== workspaceContext.kbId.value) {
      return
    }

    searchItems.value = result.items
    resultTotal.value = result.total
    publicShares.value = result.publicShares ?? []
  } catch (error) {
    if (seq !== searchSeq) {
      return
    }

    searchItems.value = []
    resultTotal.value = 0
    publicShares.value = []
    errorMessage.value = error instanceof Error ? error.message : "搜索失败，请稍后重试。"
  } finally {
    if (seq === searchSeq) {
      loading.value = false
    }
  }
}

const handleSearch = async () => {
  const routeChanged = await updateRouteQuery()

  if (!routeChanged) {
    await runSearch()
  }
}

const clearFilters = () => {
  filterStatus.value = "all"
  filterDateFrom.value = ""
  filterDateTo.value = ""
}

const goToOverview = () => {
  router.push({
    name: "knowledge-overview",
    params: { kbId: workspaceContext.kbId.value },
  })
}

const goToSettings = () => {
  router.push({
    name: "knowledge-settings",
    params: { kbId: workspaceContext.kbId.value },
  })
}

const openDoc = (docId: string, editorType?: string) => {
  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: workspaceContext.kbId.value,
      docId,
      editorType,
    }),
  )
}

/** 站内公开分享结果点击：独立窗口打开公开分享页（不经登录态） */
const openPublicShare = (share: KnowledgePublicShareItem) => {
  window.open(`/share/${share.shareKey}`, "_blank", "noopener,noreferrer")
}

const resetSearch = async () => {
  keyword.value = ""
  scope.value = "all"
  clearFilters()

  const routeChanged = await updateRouteQuery()

  if (!routeChanged) {
    await runSearch()
  }
}

const applySuggestedSearch = async (
  nextKeyword: string,
  nextScope: KnowledgeSearchScope = scope.value,
) => {
  keyword.value = nextKeyword
  scope.value = nextScope
  await handleSearch()
}

watch(
  [() => workspaceContext.kbId.value, () => route.query.q, () => route.query.scope],
  () => {
    keyword.value = getRouteKeyword()
    scope.value = getRouteScope()
    void runSearch()
  },
  { immediate: true },
)
</script>

<template>
  <div class="kb-search-page h-full overflow-y-auto bg-[var(--kb-muted-bg)] p-5 sm:p-6 lg:p-8">
    <KnowledgeSearchHeroSection
      :workspace-name="workspaceContext.knowledgeBase.value?.name || '知识库'"
      :current-scope-label="currentScopeLabel"
      :has-active-filters="hasActiveFilters"
      :active-filter-count="activeFilterCount"
      :insight-cards="insightCards"
      @back-overview="goToOverview"
      @open-settings="goToSettings"
    />

    <KnowledgeSearchToolbar
      :keyword="keyword"
      :scope="scope"
      :scope-options="scopeOptions"
      :status-options="statusOptions"
      :loading="loading"
      :recommended-queries="recommendedQueries"
      :filter-status="filterStatus"
      :filter-date-from="filterDateFrom"
      :filter-date-to="filterDateTo"
      :has-active-filters="hasActiveFilters"
      @update:keyword="keyword = $event"
      @update:scope="scope = $event"
      @update:filter-status="filterStatus = $event"
      @update:filter-date-from="filterDateFrom = $event"
      @update:filter-date-to="filterDateTo = $event"
      @search="handleSearch"
      @clear-filters="clearFilters"
      @apply-suggested="
        ({ keyword: nextKeyword, scope: nextScope }) => applySuggestedSearch(nextKeyword, nextScope)
      "
    />

    <div
      v-if="errorMessage"
      class="mt-6 rounded-kb-xl border border-error-light bg-error-bg px-4 py-3 text-sm text-error"
    >
      {{ errorMessage }}
    </div>

    <section
      class="mt-6 overflow-hidden rounded-[28px] bg-surface shadow-[var(--kb-surface-shadow)]"
    >
      <header
        class="flex items-center justify-between border-b border-line px-5 py-4 text-sm text-ink-tertiary"
      >
        <div>
          <h2 class="text-base font-semibold text-ink">匹配结果</h2>
          <p class="mt-1 text-xs text-ink-quaternary">按搜索范围与筛选条件呈现命中的文档</p>
        </div>
        <span class="text-xs text-ink-quaternary">
          {{ keyword.trim() ? `共命中 ${resultTotal} 条` : "尚未发起搜索" }}
        </span>
      </header>

      <KnowledgeSearchIdleState
        v-if="!keyword.trim()"
        :recommended-queries="recommendedQueries"
        @apply-suggested-search="applySuggestedSearch"
        @reset-search="resetSearch"
        @back-overview="goToOverview"
      />

      <KnowledgeSearchResultList
        v-else-if="filteredItems.length > 0"
        :filtered-items="filteredItems"
        :result-total="resultTotal"
        :keyword="keyword"
        :current-scope-label="currentScopeLabel"
        :active-filter-labels="activeFilterLabels"
        @refresh="runSearch"
        @open-doc="openDoc"
      />

      <KnowledgeSearchEmptyState
        v-else
        :keyword="keyword"
        :scope="scope"
        :current-scope-label="currentScopeLabel"
        :has-active-filters="hasActiveFilters"
        :active-filter-count="activeFilterCount"
        :active-filter-labels="activeFilterLabels"
        :has-suppressed-matches="hasSuppressedMatches"
        :recommended-queries="recommendedQueries"
        @clear-filters="clearFilters"
        @apply-suggested-search="applySuggestedSearch"
        @reset-search="resetSearch"
      />

      <!-- 站内公开分享分组（B3 #22）：检索词非空且有公开分享命中时，挂在结果尾部 -->
      <div v-if="keyword.trim() && visiblePublicShares.length > 0">
        <header
          class="flex items-center justify-between border-t border-line px-5 py-4 text-sm text-ink-tertiary"
        >
          <div>
            <h2 class="text-base font-semibold text-ink">站内公开分享</h2>
            <p class="mt-1 text-xs text-ink-quaternary">
              与「{{ keyword.trim() }}」相关的站内公开分享内容
            </p>
          </div>
          <span class="text-xs text-ink-quaternary">共 {{ visiblePublicShares.length }} 条</span>
        </header>

        <ul class="border-t border-line">
          <li
            v-for="share in visiblePublicShares"
            :key="share.shareKey"
            class="cursor-pointer px-5 py-3.5 transition-colors duration-100 hover:bg-grey-100"
            @click="openPublicShare(share)"
          >
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="min-w-0 truncate text-[14px] font-medium text-ink">
                {{ share.title || "无标题文档" }}
              </span>
              <span
                v-if="share.kbName"
                class="shrink-0 rounded-full bg-fill-muted px-2 py-0.5 text-[11px] font-medium text-ink-secondary"
              >
                {{ share.kbName }}
              </span>
              <span
                class="shrink-0 rounded-full bg-brand-faint px-2 py-0.5 text-[11px] font-medium text-brand"
              >
                来自公开分享
              </span>
            </div>
            <p
              v-if="share.snippet"
              class="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-tertiary"
            >
              {{ share.snippet }}
            </p>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

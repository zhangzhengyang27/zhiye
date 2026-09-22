<!-- 组件说明：KnowledgeStartView 组件，负责「开始」聚合页的展示与交互。 -->
<script setup lang="ts">
/**
 * 页面组件：对齐语雀「开始」页——顶部快捷卡 + 视角胶囊 tab + 行式文档列表。
 * 视角与数据来源：编辑过/我评论的/分享中的/邀我协作走 dashboard 接口，
 * 浏览过复用 recent-all；提到我/我点赞的暂无对应数据模型，不提供。
 */
import { formatShortDate } from "@/utils/date-format"
import { computed, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeCreateKbDialog from "@/components/knowledge/KnowledgeCreateKbDialog.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import { DROPDOWN_POPPER_OPTIONS, useDropdownMenu } from "@/composables/use-dropdown-menu"
import { listKnowledgeBases, type KnowledgeBaseItem } from "@/services/knowledge-base"
import {
  listDashboardKnowledgeDocuments,
  listRecentKnowledgeDocumentsAll,
  type KnowledgeDashboardDocumentItem,
  type KnowledgeDashboardSource,
} from "@/services/knowledge-documents"
import { useAuthStore } from "@/stores/auth"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"

const LAST_ACTIVE_KB_STORAGE_KEY = "knowledge:last-active-kb-id"

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const errorMessage = ref("")
const items = ref<KnowledgeDashboardDocumentItem[]>([])
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const selectedKbId = ref("__all_kb__")
const selectedType = ref("__all__")
const selectedCreator = ref("__all__")

// T7 解散 AppDropdownMenu 后直用 el-dropdown：三个筛选各持一份 composable（Esc 截停
// + 触发器焦点归还走收编清单 a；键盘导航/鼠标打开不聚焦首项接受 EP 默认，差异记档见
// docs/EP直用改造与适配层解散实施计划-2026-09-14.md T7 节）
const typeMenu = useDropdownMenu()
const kbMenu = useDropdownMenu()
const creatorMenu = useDropdownMenu()

const START_PAGE_LIMIT = 60

/** 每个视角的标题/说明/时间字段，浏览过走 recent-all */
const tabDefinitions = [
  {
    label: "编辑过",
    value: "edited" as KnowledgeDashboardSource | "viewed",
    source: "edited" as KnowledgeDashboardSource,
    markerLabel: "编辑于",
    markerField: "lastEditedAt" as const,
    emptyTitle: "还没有编辑记录",
    emptyDescription: "编辑文档后，这里会沉淀你最近的写作轨迹。",
  },
  {
    label: "浏览过",
    value: "viewed" as KnowledgeDashboardSource | "viewed",
    source: null,
    markerLabel: "浏览于",
    markerField: "lastViewedAt" as const,
    emptyTitle: "暂无浏览记录",
    emptyDescription: "开始浏览文档后，这里会自动沉淀你的最近轨迹。",
  },
  {
    label: "提到我",
    value: "mentioned" as KnowledgeDashboardSource | "viewed",
    source: "mentioned" as KnowledgeDashboardSource,
    markerLabel: "提及于",
    markerField: "lastMentionedAt" as const,
    emptyTitle: "暂无提到我的文档",
    emptyDescription: "当他人在文档中 @ 你时，相关文档会出现在这里。",
  },
  {
    label: "我点赞的",
    value: "liked" as KnowledgeDashboardSource | "viewed",
    source: "liked" as KnowledgeDashboardSource,
    markerLabel: "点赞于",
    markerField: "lastLikedAt" as const,
    emptyTitle: "还没有点赞的文档",
    emptyDescription: "点赞文档后，这里会汇总你标记过的内容。",
  },
  {
    label: "我评论过",
    value: "commented" as KnowledgeDashboardSource | "viewed",
    source: "commented" as KnowledgeDashboardSource,
    markerLabel: "评论于",
    markerField: "lastCommentedAt" as const,
    emptyTitle: "还没有评论记录",
    emptyDescription: "参与文档讨论后，相关文档会出现在这里。",
  },
  {
    label: "邀我协作",
    value: "collaborative" as KnowledgeDashboardSource | "viewed",
    source: "collaborative" as KnowledgeDashboardSource,
    markerLabel: "",
    markerField: null,
    emptyTitle: "暂无协作文档",
    emptyDescription: "被加入知识库协作后，这里会展示相关文档。",
  },
  {
    label: "分享中的",
    value: "shared" as KnowledgeDashboardSource | "viewed",
    source: "shared" as KnowledgeDashboardSource,
    markerLabel: "分享于",
    markerField: "lastSharedAt" as const,
    emptyTitle: "还没有分享中的文档",
    emptyDescription: "创建公开分享链接后，对应文档会汇总在这里。",
  },
]

const activeTab = ref<(typeof tabDefinitions)[number]["value"]>("edited")

/** activeTab 恒为 tabDefinitions 中的合法值，find 不会落空；索引兜底交给运行时恒真分支 */
const activeDefinition = computed(() => {
  const matched = tabDefinitions.find((tab) => tab.value === activeTab.value)
  if (matched) {
    return matched
  }

  const [first] = tabDefinitions
  if (!first) {
    throw new Error("开始页视角定义不能为空")
  }

  return first
})

/** 新建文档的目标知识库：优先上次活跃的知识库，否则取列表第一个 */
const createDocTargetKbId = computed(() => {
  const stored =
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(LAST_ACTIVE_KB_STORAGE_KEY) ?? "")
  if (stored && knowledgeBases.value.some((item) => item.id === stored)) {
    return stored
  }

  return knowledgeBases.value[0]?.id ?? ""
})

/** 语雀式筛选：类型（文档/画板）+ 归属（知识库） */
const kbFilterOptions = computed(() => [
  { label: "归属：全部知识库", value: "__all_kb__" },
  ...knowledgeBases.value.map((item) => ({ label: `归属：${item.name}`, value: item.id })),
])

const typeFilterOptions = [
  { label: "全部", value: "__all__" },
  { label: "文档", value: "doc" },
  { label: "画板", value: "board" },
]

const creatorFilterOptions = [
  { label: "创建者：全部", value: "__all__" },
  { label: "创建者：我", value: "me" },
]

const visibleItems = computed(() =>
  items.value.filter((item) => {
    if (selectedKbId.value !== "__all_kb__" && item.kbId !== selectedKbId.value) {
      return false
    }

    if (selectedCreator.value === "me" && item.creator?.id !== authStore.user?.id) {
      return false
    }

    if (selectedType.value === "__all__") {
      return true
    }

    return selectedType.value === "board"
      ? item.editorType === "board"
      : item.editorType !== "board"
  }),
)

// 对齐语雀：日期列为短格式（MM-DD HH:mm），不带动作前缀
const markerText = (item: KnowledgeDashboardDocumentItem) => {
  const field = activeDefinition.value.markerField
  if (!field) {
    return ""
  }
  return formatShortDate(item[field])
}

const openDoc = (item: KnowledgeDashboardDocumentItem) => {
  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: item.kbId,
      docId: item.id,
      editorType: item.editorType,
    }),
  )
}

const goCreateDocument = () => {
  if (createDocTargetKbId.value) {
    void router.push({
      name: "knowledge-workspace-home",
      params: { kbId: createDocTargetKbId.value },
    })
    return
  }

  void router.push({ name: "knowledge" })
}

/** 模板中心 / AI 写作在项目内尚无独立页面，先落地到最近活跃知识库（可手动新建或后续接入）。 */
const goToRecentWorkspace = () => {
  if (createDocTargetKbId.value) {
    void router.push({
      name: "knowledge-workspace-home",
      params: { kbId: createDocTargetKbId.value },
    })
    return
  }

  void router.push({ name: "knowledge" })
}

/** 对齐语雀开始页：横向描边功能卡（新建文档▾ / 新建知识库 / 模板中心 / AI 帮你写） */
type StartQuickItem = {
  id: "doc" | "kb" | "template" | "ai"
  title: string
  subtitle: string
  icon: string
}

const startCards: StartQuickItem[] = [
  { id: "doc", title: "新建文档", subtitle: "文档、表格、画板、数据表", icon: "ph:file-plus" },
  { id: "kb", title: "新建知识库", subtitle: "使用知识库整理知识", icon: "ph:books" },
  { id: "template", title: "模板中心", subtitle: "从模板中获取灵感", icon: "ph:layout" },
  { id: "ai", title: "AI 帮你写", subtitle: "AI 助手帮你一键生成文档", icon: "ph:sparkle" },
]

/** 模板中心：进入最近活跃知识库的模板中心页（未识别到知识库时退回列表）。 */
const goToTemplateCenter = () => {
  if (createDocTargetKbId.value) {
    void router.push({
      name: "knowledge-templates",
      params: { kbId: createDocTargetKbId.value },
    })
    return
  }

  void router.push({ name: "knowledge" })
}

const createKbDialogOpen = ref(false)
const handleQuickSelect = (item: StartQuickItem) => {
  if (item.id === "doc") {
    goCreateDocument()
    return
  }

  if (item.id === "kb") {
    createKbDialogOpen.value = true
    return
  }

  if (item.id === "template") {
    goToTemplateCenter()
    return
  }

  goToRecentWorkspace()
}

const handleKbCreated = (kb: KnowledgeBaseItem) => {
  createKbDialogOpen.value = false
  void router.push({ name: "knowledge-workspace-home", params: { kbId: kb.id } })
}

// tab 快速切换时的过期序号守卫：慢请求晚归不得覆盖当前视角的列表
let loadSeq = 0

const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  errorMessage.value = ""

  try {
    const { source } = activeDefinition.value

    const loaded = source
      ? await listDashboardKnowledgeDocuments({ source, limit: START_PAGE_LIMIT })
      : await listRecentKnowledgeDocumentsAll({ limit: START_PAGE_LIMIT })

    if (seq !== loadSeq) {
      return
    }

    items.value = loaded
  } catch (error) {
    if (seq !== loadSeq) {
      return
    }
    errorMessage.value = error instanceof Error ? error.message : "加载开始页失败。"
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

watch(activeTab, () => {
  void load()
})

onMounted(() => {
  void load()
  void listKnowledgeBases()
    .then((bases) => {
      knowledgeBases.value = bases
    })
    .catch(() => {
      // 快捷卡的目标知识库仅为导航提效，加载失败时回退到知识库列表页
    })
})
</script>

<template>
  <KnowledgePageShell active-menu="start">
    <div class="kb-page-scroll kb-fade-in">
      <div class="kb-content-wrap">
        <!-- 页头：对齐语雀开始页（「开始」标题 + 横向描边功能卡） -->
        <h1 class="text-[24px] font-semibold leading-8 text-ink">开始</h1>

        <div class="mt-4 grid max-w-[860px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="item in startCards"
            :key="item.id"
            type="button"
            class="group flex items-center gap-3 rounded-[12px] border border-line bg-surface px-4 py-3.5 text-left transition duration-150 hover:border-brand-lighter hover:shadow-[var(--kb-panel-shadow)]"
            @click="handleQuickSelect(item)"
          >
            <Icon :icon="item.icon" :width="22" :height="22" class="shrink-0 text-ink-secondary" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] font-medium text-ink" :title="item.title">{{
                item.title
              }}</span>
              <span
                class="block truncate text-[12px] leading-4 text-ink-tertiary"
                :title="item.subtitle"
                >{{ item.subtitle }}</span
              >
            </span>
            <Icon
              v-if="item.id === 'doc'"
              icon="ph:caret-down"
              :width="14"
              :height="14"
              class="shrink-0 text-ink-quaternary"
            />
          </button>
        </div>

        <!-- 文档列表 -->
        <h2 class="mt-8 text-[18px] font-semibold leading-7 text-ink">文档</h2>

        <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div
            class="inline-flex items-center gap-0.5 rounded-[8px] bg-black/5 p-0.5 dark:bg-white/10"
          >
            <button
              v-for="tab in tabDefinitions"
              :key="tab.value"
              type="button"
              class="h-8 rounded-kb-sm px-3 text-kb-sm transition duration-150"
              :class="
                activeTab === tab.value
                  ? 'bg-surface font-medium text-ink shadow-(--kb-hover-shadow)'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              "
              @click="activeTab = tab.value"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="flex items-center gap-2">
            <!-- 类型筛选：对齐语雀下拉形态（类型 ▾）。T7 解散 AppDropdownMenu 后直用
                 el-dropdown：单组平铺无子菜单，键盘导航接受 EP 默认（ArrowDown 开、
                 roving 循环、禁用项跳过、Enter 触发自动关，T1 实测）；Esc 截停走
                 useDropdownMenu（基线「Esc 只关菜单并归还触发器焦点」）；弹层几何
                 （placement/6px 间距/无箭头/510px 面板封顶）与壳逐参等价（T7 评审补：
                 壳组件级 max-height 对全部实例生效，解散后逐调用点透传）。触发器按钮
                 类与迁移前逐类相同。 -->
            <el-dropdown
              :ref="typeMenu.dropdownRef"
              trigger="click"
              placement="bottom-end"
              :popper-options="DROPDOWN_POPPER_OPTIONS"
              :show-arrow="false"
              :max-height="'min(510px, calc(80vh - 10px))'"
              @command="(value: string) => (selectedType = value)"
              @visible-change="typeMenu.handleVisibleChange"
            >
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[13px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink-secondary"
              >
                类型
                <Icon icon="ph:caret-down" :width="12" :height="12" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="option in typeFilterOptions"
                    :key="option.value"
                    :command="option.value"
                  >
                    {{ option.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <el-dropdown
              :ref="kbMenu.dropdownRef"
              trigger="click"
              placement="bottom-end"
              :popper-options="DROPDOWN_POPPER_OPTIONS"
              :show-arrow="false"
              :max-height="'min(510px, calc(80vh - 10px))'"
              @command="(value: string) => (selectedKbId = value)"
              @visible-change="kbMenu.handleVisibleChange"
            >
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[13px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink-secondary"
              >
                归属
                <Icon icon="ph:caret-down" :width="12" :height="12" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="option in kbFilterOptions"
                    :key="option.value"
                    :command="option.value"
                  >
                    {{ option.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <el-dropdown
              :ref="creatorMenu.dropdownRef"
              trigger="click"
              placement="bottom-end"
              :popper-options="DROPDOWN_POPPER_OPTIONS"
              :show-arrow="false"
              :max-height="'min(510px, calc(80vh - 10px))'"
              @command="(value: string) => (selectedCreator = value)"
              @visible-change="creatorMenu.handleVisibleChange"
            >
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[13px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink-secondary"
              >
                创建者
                <Icon icon="ph:caret-down" :width="12" :height="12" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="option in creatorFilterOptions"
                    :key="option.value"
                    :command="option.value"
                  >
                    {{ option.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <div v-if="errorMessage" class="mt-4 text-sm text-error">
          {{ errorMessage }}
        </div>

        <div v-else-if="loading" class="mt-4 divide-y divide-line border-b border-line">
          <div v-for="index in 6" :key="index" class="flex items-center gap-3 py-5">
            <div class="h-6 w-6 shrink-0 animate-pulse rounded-kb-sm bg-grey-200" />
            <div class="h-4 w-1/3 animate-pulse rounded bg-grey-200" />
            <div class="ml-auto h-4 w-24 animate-pulse rounded bg-grey-200" />
          </div>
        </div>

        <div
          v-else-if="items.length === 0"
          class="flex min-h-[300px] flex-col items-center justify-center py-12 text-center text-ink-tertiary"
        >
          <Icon icon="ph:files" :width="42" :height="42" class="mb-4 text-ink-quaternary" />
          <p class="text-base font-medium text-ink-secondary">{{ activeDefinition.emptyTitle }}</p>
          <p class="mt-2 max-w-sm text-sm leading-6 text-ink-tertiary">
            {{ activeDefinition.emptyDescription }}
          </p>
        </div>

        <!-- 有数据但被类型/归属/创建者筛空时给出独立提示 -->
        <div
          v-else-if="visibleItems.length === 0"
          class="flex min-h-[240px] flex-col items-center justify-center py-12 text-center text-ink-tertiary"
        >
          <Icon icon="ph:funnel" :width="36" :height="36" class="mb-4 text-ink-quaternary" />
          <p class="text-base font-medium text-ink-secondary">没有符合筛选条件的文档</p>
          <p class="mt-2 max-w-sm text-sm leading-6 text-ink-tertiary">
            调整类型、归属或创建者筛选后即可看到结果。
          </p>
        </div>

        <div v-else class="mt-1 divide-y divide-line border-b border-line">
          <div
            v-for="item in visibleItems"
            :key="`${activeTab}:${item.kbId}:${item.id}`"
            class="group grid cursor-pointer grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_128px] items-center gap-3 pl-1 pr-6 py-3 transition-colors duration-100 hover:bg-grey-100"
            @click="openDoc(item)"
          >
            <span class="flex min-w-0 items-center gap-2.5">
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--kb-blue-500)]"
              >
                <Icon
                  :icon="item.editorType === 'board' ? 'ph:frame-corners' : 'ph:file-text'"
                  :width="20"
                  :height="20"
                />
              </span>
              <span class="min-w-0 truncate text-[14px] text-ink">
                {{ item.title || "无标题文档" }}
              </span>
            </span>
            <span class="hidden min-w-0 truncate text-[13px] text-ink-tertiary sm:block">
              <template v-if="item.creator"
                >{{ item.creator.displayName }} / {{ item.kb?.name || "知识库" }}</template
              >
              <template v-else>{{ item.kb?.name || "知识库" }}</template>
            </span>
            <span class="shrink-0 text-right text-[13px] text-ink-quaternary">
              {{ markerText(item) || formatShortDate(item.updatedAt) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </KnowledgePageShell>

  <KnowledgeCreateKbDialog v-model:open="createKbDialogOpen" @created="handleKbCreated" />
</template>

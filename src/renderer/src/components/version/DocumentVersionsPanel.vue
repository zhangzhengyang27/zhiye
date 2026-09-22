<script setup lang="ts">
/**
 * 面板组件：文档「历史记录」面板（按语雀真机 2026-09-21 取证对齐）。
 *
 * 语雀真机结构（证据见 docs/历史记录面板对齐-2026-09-21.md）：
 * - 头部：标题「历史记录」+「恢复此{N}」按钮（按 tab 变文案：恢复此记录/恢复此版本/恢复此本地缓存，
 *   未选中行时禁用）；
 * - tab 为 radio 语义：全部记录 / 版本 / 本地缓存；
 * - 过滤：仅显示已发布的历史记录 + 显示所有本地存储版本（默认勾选，全部记录页）；
 * - 列表行极简：版本名（如有）+ 时间 + 状态标签（已发布/草稿/离线保存）+ 作者，
 *   无勾选框、无批量操作；点击行 = 选中，头部「恢复」按钮作用于选中行；
 * - 选中行下方出该版本只读预览。
 * 批量删除/全选在语雀不存在，已按用户决策移除。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { formatDateTime } from "@/utils/date-format"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { renderKnowledgeDocumentBody } from "@/utils/knowledge-markdown"
import DocumentSidePanelTabs from "@/components/editor/DocumentSidePanelTabs.vue"
import DocumentVersionRow from "@/components/version/DocumentVersionRow.vue"
import type { KnowledgeDocumentVersionItem } from "@/services/knowledge-documents"
import type { DocumentLocalSnapshot } from "@/utils/document-local-cache"

type HistoryTab = "records" | "versions" | "local"

/** 列表行视图模型：统一服务端版本与本地快照两种来源 */
export type HistoryRowVm = {
  key: string
  kind: "version" | "local"
  /** version 行 = 版本 id；local 行 = 快照时间戳 */
  id: string
  at: number
  versionName?: string
  statusLabel: string
  author: string
  timeText: string
}

export type HistorySelection =
  { kind: "version"; id: string } | { kind: "local"; at: number } | null

const props = defineProps<{
  open: boolean
  activeTab?: "versions"
  versionsLoading: boolean
  versions: KnowledgeDocumentVersionItem[]
  localSnapshots?: DocumentLocalSnapshot[]
  deletingVersionId: string | null
  /** 当前选中行（由编辑器持有，跨 tab 过滤变化时校正） */
  selection: HistorySelection
  /** 恢复操作进行中 */
  restoreBusy: boolean
  /** 选中版本的预览（version 行才有；{loading, scheme, value}，local 行为 null） */
  preview: { loading: boolean; scheme: string; value: string } | null
}>()

const emit = defineEmits<{
  close: []
  "switch-tab": [tab: "search" | "comments" | "versions" | "info" | "style" | "ai"]
  "selection-change": [selection: HistorySelection]
  "restore-selected": []
  "delete-version": [versionId: string]
  "compare-version": [versionId: string]
  "save-as-version": [name: string]
  "restore-snapshot": [snapshot: DocumentLocalSnapshot]
  "clear-snapshots": []
}>()

const historyTab = ref<HistoryTab>("records")
const publishedOnly = ref(false)
const includeLocalSnapshots = ref(true)
const saveOpen = ref(false)
const saveName = ref("")
const saveSubmitting = ref(false)
const rowMenuKey = ref<string | null>(null)

const historyTabs: Array<{ key: HistoryTab; label: string }> = [
  { key: "records", label: "全部记录" },
  { key: "versions", label: "版本" },
  { key: "local", label: "本地缓存" },
]

/** 头部「恢复此{N}」按钮文案随 tab 变化（语雀真机：恢复此记录/恢复此版本/恢复此本地缓存） */
const restoreLabel = computed(() =>
  historyTab.value === "records"
    ? "恢复此记录"
    : historyTab.value === "versions"
      ? "恢复此版本"
      : "恢复此本地缓存",
)

/** 相对时间（快照用）：分钟/小时/天，超过 7 天退回绝对时间 */
const formatSnapshotTime = (at: number) => {
  const diff = Date.now() - at
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "刚刚"
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDateTime(new Date(at).toISOString())
}

/** 全部记录 = 服务端全部保存记录（可过滤已发布）+（可选）本地快照并入 */
const recordRows = computed<HistoryRowVm[]>(() => {
  const versionRows: HistoryRowVm[] = props.versions
    .filter((version) => (publishedOnly.value ? version.status === "published" : true))
    .map((version) => ({
      key: `version:${version.id}`,
      kind: "version" as const,
      id: version.id,
      at: new Date(version.createdAt).getTime() || 0,
      versionName: version.versionName || undefined,
      statusLabel:
        version.status === "published"
          ? "已发布"
          : version.status === "draft"
            ? "草稿"
            : String(version.status ?? ""),
      author: version.author?.name || "未知用户",
      timeText: formatDateTime(version.createdAt),
    }))

  const localRows: HistoryRowVm[] =
    includeLocalSnapshots.value && historyTab.value === "records"
      ? (props.localSnapshots ?? []).map((snapshot) => ({
          key: `local:${snapshot.at}`,
          kind: "local" as const,
          id: String(snapshot.at),
          at: snapshot.at,
          statusLabel: "离线保存",
          author: "本机",
          timeText: formatSnapshotTime(snapshot.at),
        }))
      : []

  return [...localRows, ...versionRows].sort((left, right) => right.at - left.at)
})

/** 版本 tab = 命名版本（保存时填写了版本名） */
const namedVersionRows = computed<HistoryRowVm[]>(() =>
  props.versions
    .filter((version) => Boolean(version.versionName))
    .map((version) => ({
      key: `version:${version.id}`,
      kind: "version" as const,
      id: version.id,
      at: new Date(version.createdAt).getTime() || 0,
      versionName: version.versionName || undefined,
      statusLabel: version.status === "published" ? "已发布" : "草稿",
      author: version.author?.name || "未知用户",
      timeText: formatDateTime(version.createdAt),
    })),
)

const localRows = computed<HistoryRowVm[]>(() =>
  (props.localSnapshots ?? []).map((snapshot) => ({
    key: `local:${snapshot.at}`,
    kind: "local" as const,
    id: String(snapshot.at),
    at: snapshot.at,
    statusLabel: "离线保存",
    author: "本机",
    timeText: formatSnapshotTime(snapshot.at),
  })),
)

const currentRows = computed<HistoryRowVm[]>(() =>
  historyTab.value === "records"
    ? recordRows.value
    : historyTab.value === "versions"
      ? namedVersionRows.value
      : localRows.value,
)

const selectedKey = computed(() => {
  const selection = props.selection
  if (!selection) return ""
  return selection.kind === "version" ? `version:${selection.id}` : `local:${selection.at}`
})

/** 预览正文：markdown 转 HTML、html 归一，统一走 knowledge-markdown 的 DOMPurify 消毒出口 */
const previewHtml = computed(() => {
  const preview = props.preview
  if (!preview || preview.loading || !preview.value) {
    return ""
  }
  return renderKnowledgeDocumentBody(
    preview.value,
    preview.scheme === "text/html" ? "html" : "markdown",
  )
})

const selectRow = (row: HistoryRowVm) => {
  emit(
    "selection-change",
    row.kind === "version"
      ? { kind: "version", id: row.id }
      : { kind: "local", at: Number(row.id) },
  )
}

const toggleRowMenu = (key: string) => {
  rowMenuKey.value = rowMenuKey.value === key ? null : key
}

const handleDocumentClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.closest("[data-version-row-menu]")) {
    return
  }

  rowMenuKey.value = null
}

/** 打开期间按 Esc 关闭（遮罩点击之外的第二关闭路径）；对话框压顶时让位 */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !props.open) return
  if (hasOpenDialog()) return
  if (saveOpen.value) {
    saveOpen.value = false
    return
  }
  emit("close")
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener("keydown", handleKeydown)
      window.addEventListener("click", handleDocumentClick)
    } else {
      window.removeEventListener("keydown", handleKeydown)
      window.removeEventListener("click", handleDocumentClick)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
  window.removeEventListener("click", handleDocumentClick)
})

const submitSaveAsVersion = () => {
  const name = saveName.value.trim()
  if (!name || saveSubmitting.value) {
    return
  }
  saveSubmitting.value = true
  emit("save-as-version", name)
}

/** 编辑器保存完成后调用：收起输入并清空（由父级经 defineExpose 触发） */
const closeSaveForm = () => {
  saveOpen.value = false
  saveName.value = ""
  saveSubmitting.value = false
}

defineExpose({ closeSaveForm })
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-200"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-200"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="open"
      class="kb-panel-shell fixed inset-y-4 right-4 z-[var(--kb-z-side-panel)] flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden"
    >
      <!-- 头部：标题「历史记录」+ 恢复此{N}（对齐语雀真机；去掉自创 hero 文案） -->
      <div class="border-b border-line px-5 pb-3 pt-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2">
            <h3 class="truncate text-[15px] font-semibold text-ink">历史记录</h3>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <el-button
              v-if="historyTab !== 'local'"
              size="small"
              class="rounded-kb-xl bg-brand-faint text-brand hover:bg-brand-light kb-btn-soft"
              :disabled="!selection || restoreBusy"
              :title="selection ? restoreLabel : '先在列表中选择一条记录'"
              @click="emit('restore-selected')"
              ><span class="truncate">{{ restoreLabel }}</span>
            </el-button>
            <el-button
              text
              size="small"
              aria-label="关闭历史面板"
              class="rounded-kb-xl border border-line-input bg-surface text-ink-tertiary hover:border-brand-lighter hover:text-brand aspect-square p-0"
              @click="emit('close')"
              ><UiIcon icon="i-lucide-x" class="h-[1.2em] w-[1.2em] shrink-0" />
            </el-button>
          </div>
        </div>

        <!-- 保存为版本：行内展开（对齐语雀「保存为版本」能力，命名后随本次保存沉淀版本） -->
        <div v-if="saveOpen && historyTab !== 'local'" class="mt-3 flex items-center gap-2">
          <el-input
            v-model="saveName"
            size="small"
            maxlength="40"
            placeholder="输入版本名称"
            data-autofocus
            @keydown.enter="submitSaveAsVersion"
          />
          <el-button size="small" class="shrink-0" @click="saveOpen = false"
            ><span class="truncate">取消</span></el-button
          >
          <el-button
            type="primary"
            size="small"
            class="shrink-0"
            :loading="saveSubmitting"
            @click="submitSaveAsVersion"
            ><template #loading
              ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
            /></template>
            <span class="truncate">保存</span>
          </el-button>
        </div>

        <div class="mt-3">
          <DocumentSidePanelTabs
            :active-tab="activeTab || 'versions'"
            @switch-tab="emit('switch-tab', $event)"
          />
        </div>

        <!-- tab（radio 语义，对齐语雀：全部记录/版本/本地缓存） -->
        <div class="mt-3 flex items-center gap-4 border-b border-line px-1">
          <button
            v-for="tab in historyTabs"
            :key="tab.key"
            type="button"
            role="radio"
            :aria-checked="historyTab === tab.key"
            class="relative -mb-px pb-2 text-[13px] transition"
            :class="
              historyTab === tab.key ? 'font-medium text-brand' : 'text-ink-tertiary hover:text-ink'
            "
            @click="historyTab = tab.key"
          >
            {{ tab.label }}
            <span
              v-if="historyTab === tab.key"
              class="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-brand"
            />
          </button>
        </div>

        <!-- 过滤（全部记录页；对齐语雀两个 checkbox） -->
        <div
          v-if="historyTab === 'records'"
          class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <el-checkbox v-model="publishedOnly" class="text-[12px] text-ink-secondary">
            仅显示已发布的历史记录
          </el-checkbox>
          <el-checkbox v-model="includeLocalSnapshots" class="text-[12px] text-ink-secondary">
            显示所有本地存储版本
          </el-checkbox>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-auto bg-muted px-3 py-3">
        <div v-if="historyTab !== 'local' && versionsLoading" class="space-y-2">
          <div v-for="i in 6" :key="i" class="h-14 animate-pulse rounded-kb-xl bg-surface" />
        </div>

        <div v-else-if="currentRows.length === 0" class="flex h-full items-center justify-center">
          <div class="rounded-kb-3xl bg-surface px-6 py-10 text-center">
            <AppIcon name="i-lucide-history" class="mx-auto h-10 w-10 text-ink-quaternary" />
            <p class="mt-3 text-sm font-medium text-ink-secondary">
              {{
                historyTab === "versions"
                  ? "暂无版本记录"
                  : historyTab === "local"
                    ? "暂无本地缓存"
                    : "暂无历史版本"
              }}
            </p>
            <p v-if="historyTab === 'versions'" class="mt-2 text-xs leading-5 text-ink-quaternary">
              保存文档时填写版本名，命名的版本会沉淀在这里。
            </p>
          </div>
        </div>

        <template v-else>
          <div class="space-y-1" role="radiogroup" aria-label="历史记录列表">
            <DocumentVersionRow
              v-for="row in currentRows"
              :key="row.key"
              :row="row"
              :selected="selectedKey === row.key"
              :deleting="row.kind === 'version' && deletingVersionId === row.id"
              :menu-open="rowMenuKey === row.key"
              @select="selectRow(row)"
              @toggle-menu="toggleRowMenu(row.key)"
              @compare="emit('compare-version', row.id)"
              @delete="emit('delete-version', row.id)"
            />
          </div>

          <!-- 选中版本预览（只读；对齐语雀行选中即预览） -->
          <div
            v-if="selection && selection.kind === 'version'"
            class="mt-3 overflow-hidden rounded-kb-xl border border-line bg-surface"
          >
            <div class="flex items-center justify-between border-b border-line px-3 py-2">
              <p class="text-xs font-medium text-ink-tertiary">版本预览</p>
              <span v-if="preview?.loading" class="text-xs text-ink-quaternary">加载中…</span>
            </div>
            <div class="max-h-64 overflow-auto px-3 py-2">
              <pre
                v-if="preview && preview.scheme === 'text/markdown'"
                class="whitespace-pre-wrap break-words font-sans text-[12px] leading-5 text-ink-secondary"
                >{{ preview.value || "（空内容）" }}</pre>
              <!-- previewHtml 已走 renderKnowledgeDocumentBody 的 DOMPurify 消毒出口 -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                v-else-if="previewHtml"
                class="kb-version-preview text-[12px] leading-5 text-ink-secondary"
                v-html="previewHtml"
              />
              <p v-else class="py-4 text-center text-xs text-ink-quaternary">
                该版本暂无可预览内容。
              </p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>

  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-[var(--kb-z-side-panel-overlay)] bg-black/20"
      @click="emit('close')"
    />
  </Transition>
</template>

<style>
/* 版本预览的只读 HTML：正文由本站编辑器产出，样式按文档排版最小呈现。
   写在 unlayered（对齐坑 6/13：要压过 antd.css 对排版元素的劫持） */
.kb-version-preview h1,
.kb-version-preview h2,
.kb-version-preview h3 {
  font-weight: 600;
  color: var(--kb-text);
  margin: 0.6em 0 0.3em;
}
.kb-version-preview p {
  margin: 0.35em 0;
}
.kb-version-preview ul,
.kb-version-preview ol {
  padding-left: 1.4em;
  margin: 0.35em 0;
}
.kb-version-preview img {
  max-width: 100%;
}
</style>

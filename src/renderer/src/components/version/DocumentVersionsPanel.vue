<script setup lang="ts">
/**
 * 文档「历史记录」面板内容（按语雀真机 2026-09-21 取证对齐）。
 *
 * 外壳（标题/关闭/宽度动画/Esc）由 DocSidePanelShell 统一承担；「保存为版本 /
 * 恢复此{N}」按钮经壳头部 actions 插槽渲染在视图侧（历史 tab 经 v-model 上抛）。
 *
 * 语雀真机结构（证据见 docs/历史记录面板对齐-2026-09-21.md）：
 * - tab 为 radio 语义：全部记录 / 版本 / 本地缓存；
 * - 过滤：仅显示已发布的历史记录 + 显示所有本地存储版本（默认勾选，全部记录页）；
 * - 列表行极简：版本名（如有）+ 时间 + 状态标签（已发布/草稿/离线保存）+ 作者，
 *   无勾选框、无批量操作；点击行 = 选中，头部「恢复」按钮作用于选中行；
 * - 选中行下方出该版本只读预览。
 * 批量删除/全选在语雀不存在，已按用户决策移除。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { formatDateTime } from "@/utils/date-format"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"
import { renderKnowledgeDocumentBody } from "@/utils/knowledge-markdown"
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
  versionsLoading: boolean
  versions: KnowledgeDocumentVersionItem[]
  localSnapshots?: DocumentLocalSnapshot[]
  deletingVersionId: string | null
  /** 当前选中行（由编辑器持有，跨 tab 过滤变化时校正） */
  selection: HistorySelection
  /** 选中版本的预览（version 行才有；{loading, scheme, value}，local 行为 null） */
  preview: { loading: boolean; scheme: string; value: string } | null
}>()

const emit = defineEmits<{
  "selection-change": [selection: HistorySelection]
  "delete-version": [versionId: string]
  "compare-version": [versionId: string]
  "save-as-version": [name: string]
  "restore-snapshot": [snapshot: DocumentLocalSnapshot]
  "clear-snapshots": []
}>()

/** 历史 tab 归视图持有（壳头部「恢复此{N}」按钮按 tab 变文案/显隐） */
const historyTab = defineModel<HistoryTab>("historyTab", { default: "records" })

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

/**
 * Esc 先收面板内部浮层（保存表单/行菜单），收不掉的交给壳关闭整组侧栏。
 * 捕获阶段拦截：壳的 Esc 监听在冒泡阶段，内部已消费时 stopPropagation 让壳收不到；
 * 对话框压顶时让位（对话框家族走自己的 Esc 链路）。
 */
const handleKeydownCapture = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || isImeComposing(event) || hasOpenDialog()) {
    return
  }
  if (saveOpen.value) {
    saveOpen.value = false
    event.stopPropagation()
    return
  }
  if (rowMenuKey.value) {
    rowMenuKey.value = null
    event.stopPropagation()
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydownCapture, true)
  window.addEventListener("click", handleDocumentClick)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydownCapture, true)
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

/** 打开「保存为版本」行内表单（壳头部按钮经 defineExpose 触发，对齐语雀顶栏入口） */
const openSaveForm = () => {
  saveOpen.value = true
}

/** 编辑器保存完成后调用：收起输入并清空（由父级经 defineExpose 触发） */
const closeSaveForm = () => {
  saveOpen.value = false
  saveName.value = ""
  saveSubmitting.value = false
}

defineExpose({ openSaveForm, closeSaveForm })
</script>

<template>
  <div class="min-h-full bg-muted px-3 py-3">
    <!-- 保存为版本：行内展开（对齐语雀「保存为版本」能力，命名后随本次保存沉淀版本） -->
    <div v-if="saveOpen && historyTab !== 'local'" class="mb-3 flex items-center gap-2">
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

    <!-- tab（radio 语义，对齐语雀：全部记录/版本/本地缓存） -->
    <div class="flex items-center gap-4 border-b border-line px-1">
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
    <div v-if="historyTab === 'records'" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <el-checkbox v-model="publishedOnly" class="text-[12px] text-ink-secondary">
        仅显示已发布的历史记录
      </el-checkbox>
      <el-checkbox v-model="includeLocalSnapshots" class="text-[12px] text-ink-secondary">
        显示所有本地存储版本
      </el-checkbox>
    </div>

    <div class="mt-3">
      <div v-if="historyTab !== 'local' && versionsLoading" class="space-y-2">
        <div v-for="i in 6" :key="i" class="h-14 animate-pulse rounded-kb-xl bg-surface" />
      </div>

      <div v-else-if="currentRows.length === 0" class="flex min-h-48 items-center justify-center">
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

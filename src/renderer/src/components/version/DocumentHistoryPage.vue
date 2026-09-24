<script setup lang="ts">
/**
 * 文档「历史记录」全页视图（2026-09-24 语雀桌面端真机取证对齐，替代原侧栏面板）。
 *
 * 真机形态：顶栏「< 历史记录」+ 右上「保存为版本」（次级）「恢复此{N}」（品牌实心）；
 * 左栏 ≈324px：下划线 tab（全部记录/版本/本地缓存）+ 两个过滤 checkbox + 记录列表
 * （时间 + 状态 pill，下行作者；点行即选中）；右栏：对比条「{时间} 与 [请选择历史⌄] 对比」
 * + 选中记录只读预览卡。
 *
 * 「对比」下拉选另一条记录后交由父级打开 VersionCompareDialog（diff 能力复用既有对话框）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"
import { renderKnowledgeDocumentBody } from "@/utils/knowledge-markdown"
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
  close: []
  "selection-change": [selection: HistorySelection]
  "restore-selected": []
  "delete-version": [versionId: string]
  /** 触发与另一条记录的对比（父级打开 VersionCompareDialog） */
  "compare-version": [versionId: string]
  "save-as-version": [name: string]
  "restore-snapshot": [snapshot: DocumentLocalSnapshot]
  "clear-snapshots": []
}>()

/** 历史 tab 归父级持有（跨开关保留浏览位置） */
const historyTab = defineModel<HistoryTab>("historyTab", { default: "records" })

const publishedOnly = ref(false)
const includeLocalSnapshots = ref(true)
const saveOpen = ref(false)
const saveName = ref("")
const saveSubmitting = ref(false)
const compareOpen = ref(false)

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

/** 真机列表时间为「MM-DD HH:mm」短格式（跨年记录退回全量时间） */
const formatShortTime = (at: number) => {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, "0")
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const short = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return sameYear ? short : `${date.getFullYear()} ${short}`
}

const versionRow = (version: KnowledgeDocumentVersionItem, statusLabel?: string): HistoryRowVm => ({
  key: `version:${version.id}`,
  kind: "version",
  id: version.id,
  at: new Date(version.createdAt).getTime() || 0,
  versionName: version.versionName || undefined,
  statusLabel: statusLabel ?? (version.status === "published" ? "已发布" : "草稿"),
  author: version.author?.name || "未知用户",
  timeText: formatShortTime(new Date(version.createdAt).getTime() || 0),
})

const localRow = (snapshot: DocumentLocalSnapshot): HistoryRowVm => ({
  key: `local:${snapshot.at}`,
  kind: "local",
  id: String(snapshot.at),
  at: snapshot.at,
  statusLabel: "离线保存",
  author: "本机",
  timeText: formatShortTime(snapshot.at),
})

/** 全部记录 = 服务端全部保存记录（可过滤已发布）+（可选）本地快照并入 */
const recordRows = computed<HistoryRowVm[]>(() => {
  const versionRows = props.versions
    .filter((version) => (publishedOnly.value ? version.status === "published" : true))
    .map((version) => versionRow(version))
  const localRows =
    includeLocalSnapshots.value && historyTab.value === "records"
      ? (props.localSnapshots ?? []).map(localRow)
      : []
  return [...localRows, ...versionRows].sort((left, right) => right.at - left.at)
})

/** 版本 tab = 命名版本（保存时填写了版本名） */
const namedVersionRows = computed<HistoryRowVm[]>(() =>
  props.versions
    .filter((version) => Boolean(version.versionName))
    .map((version) => versionRow(version, version.status === "published" ? "已发布" : "草稿")),
)

const localRows = computed<HistoryRowVm[]>(() => (props.localSnapshots ?? []).map(localRow))

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

const selectedRow = computed(
  () => currentRows.value.find((row) => row.key === selectedKey.value) ?? null,
)

/** 对比下拉候选：除当前选中外的服务端版本 */
const compareCandidates = computed<HistoryRowVm[]>(() =>
  props.versions
    .filter((version) => `version:${version.id}` !== selectedKey.value)
    .map((version) => versionRow(version))
    .sort((left, right) => right.at - left.at),
)

const comparePick = ref<HistoryRowVm | null>(null)

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

/** 对比条下拉选中（多语句禁写内联 handler：prettier 去分号会产生非法表达式） */
const pickCompare = (row: HistoryRowVm) => {
  comparePick.value = row
  compareOpen.value = false
}

const handleDocumentClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  if (target?.closest("[data-history-compare-popover]")) {
    return
  }
  compareOpen.value = false
}

/** Esc 关闭全页；对话框压顶时让位；输入法组词中的 Esc 是取消候选 */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || isImeComposing(event) || hasOpenDialog()) {
    return
  }
  if (saveOpen.value) {
    saveOpen.value = false
    return
  }
  if (compareOpen.value) {
    compareOpen.value = false
    return
  }
  emit("close")
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown)
  window.addEventListener("click", handleDocumentClick)
})

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

const openSaveForm = () => {
  saveOpen.value = true
}

/** 保存完成后由父级经 defineExpose 触发：收起表单并清空 */
const closeSaveForm = () => {
  saveOpen.value = false
  saveName.value = ""
  saveSubmitting.value = false
}

defineExpose({ openSaveForm, closeSaveForm })
</script>

<template>
  <div
    class="fixed inset-0 z-[var(--kb-z-overlay)] flex flex-col bg-surface"
    role="dialog"
    aria-label="历史记录"
  >
    <!-- 顶栏：返回 + 标题 + 保存为版本/恢复此{N}（对齐语雀真机） -->
    <header class="flex h-14 shrink-0 items-center gap-2 border-b border-line px-5">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-kb-md p-1 text-ink-secondary transition hover:bg-fill-muted hover:text-ink"
        title="返回文档"
        @click="emit('close')"
      >
        <UiIcon icon="i-lucide-chevron-left" class="h-5 w-5" />
      </button>
      <h2 class="text-[16px] font-semibold text-ink">历史记录</h2>

      <div class="ml-auto flex items-center gap-2">
        <el-button
          size="small"
          plain
          class="border-line-input bg-surface px-3 text-[13px] text-ink hover:bg-muted"
          @click="openSaveForm"
          ><span class="truncate">保存为版本</span>
        </el-button>
        <el-button
          v-if="historyTab !== 'local'"
          size="small"
          class="border border-brand bg-brand px-3 text-[13px] text-on-brand! hover:bg-brand-hover"
          :disabled="!selection"
          :title="selection ? restoreLabel : '先在列表中选择一条记录'"
          @click="emit('restore-selected')"
          ><span class="truncate">{{ restoreLabel }}</span>
        </el-button>
      </div>
    </header>

    <!-- 保存为版本：行内展开表单 -->
    <div v-if="saveOpen" class="flex shrink-0 items-center gap-2 border-b border-line px-5 py-2.5">
      <span class="text-[13px] text-ink-secondary">版本名称</span>
      <el-input
        v-model="saveName"
        size="small"
        class="max-w-xs"
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

    <div class="flex min-h-0 flex-1">
      <!-- 左栏：tab + 过滤 + 记录列表 -->
      <aside class="flex w-[324px] shrink-0 flex-col border-r border-line bg-surface">
        <div class="flex items-center gap-5 border-b border-line px-4">
          <button
            v-for="tab in historyTabs"
            :key="tab.key"
            type="button"
            class="relative -mb-px py-3 text-[13px] transition"
            :class="
              historyTab === tab.key
                ? 'font-semibold text-ink'
                : 'text-ink-tertiary hover:text-ink-secondary'
            "
            @click="historyTab = tab.key"
          >
            {{ tab.label }}
            <span
              v-if="historyTab === tab.key"
              class="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-ink"
            />
          </button>
        </div>

        <div v-if="historyTab === 'records'" class="space-y-1 px-4 pt-3">
          <el-checkbox v-model="publishedOnly" class="text-[12px] text-ink-secondary">
            仅显示已发布的历史记录
          </el-checkbox>
          <el-checkbox v-model="includeLocalSnapshots" class="flex text-[12px] text-ink-secondary">
            显示所有本地存储版本
          </el-checkbox>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto pb-4">
          <div v-if="historyTab !== 'local' && versionsLoading" class="space-y-2 px-3 pt-3">
            <div v-for="i in 6" :key="i" class="h-12 animate-pulse rounded-kb-xl bg-muted" />
          </div>

          <div v-else-if="currentRows.length === 0" class="px-6 pt-16 text-center">
            <UiIcon icon="i-lucide-history" class="mx-auto h-9 w-9 text-ink-quaternary" />
            <p class="mt-3 text-[13px] font-medium text-ink-secondary">
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

          <ul v-else class="mt-1 px-2" role="radiogroup" aria-label="历史记录列表">
            <li v-for="row in currentRows" :key="row.key">
              <button
                type="button"
                class="group relative w-full rounded-kb-lg px-3 py-2.5 text-left transition"
                :class="selectedKey === row.key ? 'bg-muted' : 'hover:bg-fill-subtle'"
                :aria-checked="selectedKey === row.key"
                role="radio"
                @click="selectRow(row)"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {{ row.versionName || row.timeText }}
                  </span>
                  <span
                    class="shrink-0 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-tertiary"
                    >{{ row.statusLabel }}</span
                  >
                </span>
                <span class="mt-0.5 flex items-center gap-2 text-[12px] text-ink-quaternary">
                  <span class="truncate">{{ row.author }}</span>
                  <span v-if="row.versionName" class="truncate">{{ row.timeText }}</span>
                </span>

                <!-- 行悬停操作：对比/删除（版本行） -->
                <span
                  v-if="row.kind === 'version'"
                  class="absolute inset-y-0 right-2 hidden items-center gap-0.5 group-hover:flex"
                >
                  <button
                    type="button"
                    class="rounded-kb-md bg-surface p-1 text-ink-tertiary shadow-[var(--kb-surface-shadow)] transition hover:text-brand"
                    title="与当前版本对比"
                    @click.stop="emit('compare-version', row.id)"
                  >
                    <UiIcon icon="i-lucide-git-compare" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="rounded-kb-md bg-surface p-1 text-ink-tertiary shadow-[var(--kb-surface-shadow)] transition hover:text-error"
                    title="删除此版本"
                    :disabled="deletingVersionId === row.id"
                    @click.stop="emit('delete-version', row.id)"
                  >
                    <UiIcon
                      :icon="
                        deletingVersionId === row.id ? 'i-lucide-loader-circle' : 'i-lucide-trash-2'
                      "
                      :class="deletingVersionId === row.id ? 'animate-spin' : ''"
                      class="h-3.5 w-3.5"
                    />
                  </button>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 右栏：对比条 + 只读预览 -->
      <section class="flex min-w-0 flex-1 flex-col bg-surface-soft">
        <div class="flex shrink-0 items-center gap-2 px-6 pt-4">
          <template v-if="selectedRow">
            <span
              class="rounded-kb-md border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-secondary"
              >{{ selectedRow.versionName || selectedRow.timeText }}</span
            >
            <span class="text-[12px] text-ink-tertiary">与</span>
            <div class="relative" data-history-compare-popover>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-kb-md border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
                :disabled="compareCandidates.length === 0"
                @click="compareOpen = !compareOpen"
              >
                {{ comparePick ? comparePick.versionName || comparePick.timeText : "请选择历史" }}
                <UiIcon icon="ph:caret-down" :width="11" :height="11" />
              </button>
              <div
                v-if="compareOpen"
                class="absolute left-0 top-[calc(100%+4px)] z-10 max-h-64 w-56 overflow-y-auto rounded-kb-xl border border-line bg-surface py-1 shadow-[var(--kb-surface-shadow)]"
              >
                <button
                  v-for="candidate in compareCandidates"
                  :key="candidate.key"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] text-ink transition hover:bg-fill-muted"
                  @click.stop="pickCompare(candidate)"
                >
                  <span class="min-w-0 flex-1 truncate">
                    {{ candidate.versionName || candidate.timeText }}
                  </span>
                  <span class="shrink-0 text-[11px] text-ink-quaternary">{{
                    candidate.statusLabel
                  }}</span>
                </button>
              </div>
            </div>
            <button
              type="button"
              class="text-[12px] text-brand transition hover:underline disabled:cursor-not-allowed disabled:opacity-55"
              :disabled="!comparePick"
              @click="comparePick && emit('compare-version', comparePick.id)"
            >
              对比
            </button>
          </template>
          <p v-else class="text-[12px] text-ink-quaternary">在左侧选择一条记录后可预览与对比。</p>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-6">
          <div
            v-if="preview?.loading"
            class="space-y-3 rounded-kb-2xl border border-line bg-surface p-6"
          >
            <div v-for="i in 4" :key="i" class="h-4 animate-pulse rounded-kb-md bg-muted" />
          </div>

          <div
            v-else-if="preview && (previewHtml || preview.scheme === 'text/markdown')"
            class="rounded-kb-2xl border border-line bg-surface p-6"
          >
            <pre
              v-if="preview.scheme === 'text/markdown'"
              class="whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-ink-secondary"
              >{{ preview.value || "（空内容）" }}</pre>
            <!-- previewHtml 已走 renderKnowledgeDocumentBody 的 DOMPurify 消毒出口 -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              v-else
              class="kb-version-preview text-[13px] leading-6 text-ink-secondary"
              v-html="previewHtml"
            />
          </div>

          <div
            v-else-if="selection"
            class="rounded-kb-2xl border border-line bg-surface px-6 py-16 text-center"
          >
            <p class="text-[13px] text-ink-tertiary">该记录暂无可预览内容。</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

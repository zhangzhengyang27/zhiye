<script setup lang="ts">
/** 面板组件，负责文档版本的内容展示与交互操作（对齐语雀：全部记录 / 版本 / 本地缓存 三分区）。 */
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { formatDateTime } from "@/utils/date-format"
import { hasOpenDialog } from "@/composables/dialog-stack"
import DocumentSurfaceContextCard from "@/components/editor/DocumentSurfaceContextCard.vue"
import DocumentSidePanelTabs from "@/components/editor/DocumentSidePanelTabs.vue"
import DocumentVersionRow from "@/components/version/DocumentVersionRow.vue"
import DocumentVersionsBatchActions from "@/components/version/DocumentVersionsBatchActions.vue"
import type { KnowledgeDocumentVersionItem } from "@/services/knowledge-documents"

type VersionsLocalCacheItem = {
  key: string
  title: string
  detail: string
  tone?: "default" | "warning"
}

type HistoryTab = "records" | "versions" | "local"

const props = defineProps<{
  open: boolean
  activeTab?: "versions"
  documentTitle: string
  workspaceName: string
  documentModeLabel: string
  documentSchemeLabel: string
  documentStatusLabel: string
  saveStatusLabel?: string
  versionsLoading: boolean
  versions: KnowledgeDocumentVersionItem[]
  localCacheItems?: VersionsLocalCacheItem[]
  compareDisabledReason?: string
  selectedVersionIds: string[]
  selectedVersionCount: number
  allVersionsSelected: boolean
  versionDeleteBusy: boolean
  deletingVersionId: string | null
  batchDeletingVersions: boolean
}>()

const emit = defineEmits<{
  close: []
  "open-compare": []
  "toggle-all": []
  "delete-selected": []
  "clear-selection": []
  "toggle-version": [versionId: string]
  "delete-version": [versionId: string]
  "rollback-version": [versionId: string]
  "switch-tab": [tab: "search" | "comments" | "versions" | "info" | "ai"]
}>()

const historyTab = ref<HistoryTab>("records")
const publishedOnly = ref(false)

/** 全部记录 = 全部保存记录；版本 = 命名版本（保存时填写了版本名） */
const recordsList = computed(() =>
  publishedOnly.value ? props.versions.filter(version => version.status === "published") : props.versions
)
const namedVersionsList = computed(() => props.versions.filter(version => Boolean(version.versionName)))

const currentList = computed(() => (historyTab.value === "versions" ? namedVersionsList.value : recordsList.value))

const historyTabs: Array<{ key: HistoryTab; label: string }> = [
  { key: "records", label: "全部记录" },
  { key: "versions", label: "版本" },
  { key: "local", label: "本地缓存" },
]

/** 打开期间按 Esc 关闭（遮罩点击之外的第二关闭路径）；对话框压顶时让位 */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !props.open) return
  if (hasOpenDialog()) return
  emit("close")
}

watch(
  () => props.open,
  open => {
    if (open) {
      window.addEventListener("keydown", handleKeydown)
    } else {
      window.removeEventListener("keydown", handleKeydown)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
})
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
      <div class="border-b border-line px-5 py-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div
              class="inline-flex items-center gap-2 rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary"
            >
              历史版本
            </div>
            <h3 class="mt-3 text-[18px] font-semibold tracking-[-0.02em] text-ink">回看文档演进</h3>
            <p class="mt-1 text-xs leading-5 text-ink-tertiary">适合查找保存节点、对比改动和快速回滚。</p>
          </div>

          <div class="flex items-center gap-2">
            <el-button
              v-if="historyTab !== 'local' && versions.length >= 2"
              type="primary"
              size="small"
              class="rounded-kb-xl kb-btn-soft"
              :disabled="Boolean(compareDisabledReason)"
              :title="compareDisabledReason || '打开版本对比'"
              @click="emit('open-compare')"
              ><UiIcon icon="i-lucide-git-compare" class="h-[1.2em] w-[1.2em] shrink-0" />
              <span class="truncate">对比</span>
            </el-button>
            <el-button
              text
              size="small"
              aria-label="关闭版本面板"
              class="rounded-kb-xl border border-line-input bg-surface text-ink-tertiary hover:border-brand-lighter hover:text-brand aspect-square p-0"
              @click="emit('close')"
              ><UiIcon icon="i-lucide-x" class="h-[1.2em] w-[1.2em] shrink-0" />
            </el-button>
          </div>
        </div>

        <div class="mt-4">
          <DocumentSidePanelTabs :active-tab="activeTab || 'versions'" @switch-tab="emit('switch-tab', $event)" />
        </div>

        <!-- 历史记录内部分区：全部记录 / 版本 / 本地缓存（对齐语雀历史面板） -->
        <div class="mt-4 flex items-center gap-4 border-b border-line px-1">
          <button
            v-for="tab in historyTabs"
            :key="tab.key"
            type="button"
            class="relative -mb-px pb-2 text-[13px] transition"
            :class="historyTab === tab.key ? 'font-medium text-brand' : 'text-ink-tertiary hover:text-ink'"
            @click="historyTab = tab.key"
          >
            {{ tab.label }}
            <span v-if="historyTab === tab.key" class="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-brand" />
          </button>
        </div>

        <div class="mt-4">
          <DocumentSurfaceContextCard
            :document-title="documentTitle"
            :workspace-name="workspaceName"
            :mode-label="documentModeLabel"
            :scheme-label="documentSchemeLabel"
            :status-label="documentStatusLabel"
            :save-status-label="saveStatusLabel"
          />
        </div>

        <div v-if="historyTab === 'records'" class="mt-3">
          <el-checkbox v-model="publishedOnly" class="text-[12px] text-ink-secondary">
            仅显示已发布的历史记录
          </el-checkbox>
        </div>

        <div v-if="historyTab !== 'local'" class="mt-3 flex flex-wrap items-center gap-2">
          <el-tag disable-transitions> 共 {{ currentList.length }} 条 </el-tag>
          <el-tag disable-transitions> 已选 {{ selectedVersionCount }} 项 </el-tag>
        </div>
      </div>

      <div v-if="historyTab !== 'local' && currentList.length > 0" class="border-b border-line px-4 py-4">
        <DocumentVersionsBatchActions
          :selected-version-count="selectedVersionCount"
          :all-versions-selected="allVersionsSelected"
          :version-delete-busy="versionDeleteBusy"
          :batch-deleting-versions="batchDeletingVersions"
          @toggle-all="emit('toggle-all')"
          @delete-selected="emit('delete-selected')"
          @clear-selection="emit('clear-selection')"
        />
      </div>

      <div class="flex-1 overflow-auto bg-muted px-3 py-3">
        <template v-if="historyTab === 'local'">
          <div v-if="(localCacheItems ?? []).length === 0" class="flex h-full items-center justify-center">
            <div class="rounded-kb-3xl bg-surface px-6 py-10 text-center">
              <AppIcon name="i-lucide-hard-drive" class="mx-auto h-12 w-12 text-ink-quaternary" />
              <p class="mt-3 text-sm font-medium text-ink-secondary">暂无本地缓存</p>
              <p class="mt-2 text-xs leading-5 text-ink-quaternary">
                离线编辑或保存失败的内容会先缓存在本地编辑器，恢复后自动同步。
              </p>
            </div>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="item in localCacheItems"
              :key="item.key"
              class="rounded-kb-xl border bg-surface p-3.5"
              :class="item.tone === 'warning' ? 'border-warning/40' : 'border-line'"
            >
              <div class="flex items-center gap-2">
                <UiIcon
                  :icon="item.tone === 'warning' ? 'ph:warning-circle' : 'ph:hard-drive'"
                  :width="15"
                  :height="15"
                  :class="item.tone === 'warning' ? 'shrink-0 text-warning' : 'shrink-0 text-ink-tertiary'"
                />
                <p class="text-[13px] font-medium text-ink">{{ item.title }}</p>
              </div>
              <p class="mt-1.5 text-xs leading-5 text-ink-tertiary">{{ item.detail }}</p>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="versionsLoading" class="space-y-3">
            <div
              v-for="i in 6"
              :key="i"
              class="animate-pulse rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]"
            >
              <div class="mb-3 flex items-center gap-3">
                <div class="h-4 w-4 rounded bg-grey-100" />
                <div class="h-4 w-3/4 rounded bg-grey-100" />
              </div>
              <div class="h-3 w-1/2 rounded bg-grey-100" />
              <div class="mt-2 h-3 w-2/3 rounded bg-grey-100" />
            </div>
          </div>

          <div v-else-if="currentList.length === 0" class="flex h-full items-center justify-center">
            <div class="rounded-kb-3xl bg-surface px-6 py-10 text-center">
              <AppIcon name="i-lucide-history" class="mx-auto h-12 w-12 text-ink-quaternary" />
              <p class="mt-3 text-sm font-medium text-ink-secondary">
                {{ historyTab === "versions" ? "暂无命名版本" : "暂无历史记录" }}
              </p>
              <p class="mt-2 text-xs leading-5 text-ink-quaternary">
                {{
                  historyTab === "versions"
                    ? "保存文档时填写版本名，命名的版本会沉淀在这里。"
                    : "后续保存后会逐步积累可回看的版本节点。"
                }}
              </p>
            </div>
          </div>

          <div v-else class="space-y-2">
            <DocumentVersionRow
              v-for="version in currentList"
              :key="version.id"
              :version="version"
              :selected="selectedVersionIds.includes(version.id)"
              :version-delete-busy="versionDeleteBusy"
              :deleting="deletingVersionId === version.id"
              :format-date-time="formatDateTime"
              @toggle-version="emit('toggle-version', $event)"
              @delete-version="emit('delete-version', $event)"
              @rollback-version="emit('rollback-version', $event)"
            />
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
    <div v-if="open" class="fixed inset-0 z-[var(--kb-z-side-panel-overlay)] bg-black/20" @click="emit('close')" />
  </Transition>
</template>

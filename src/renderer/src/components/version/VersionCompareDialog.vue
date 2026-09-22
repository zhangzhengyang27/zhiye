<script setup lang="ts">
/**
 * 对话框组件，负责版本比较的确认、输入与提交流程。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / IME Esc 守卫）走 composable；chrome 类由 bindings 携带，语雀对话框
 * 观感在全局校准层 el-dialog 段；头部（标题 + 描述 + 关闭钮）走 KbDialogHeader。
 */
import { formatDateTime } from "@/utils/date-format"
import { ChevronDown } from "lucide-vue-next"
import { ElMessage } from "element-plus"
import { computed, ref, watch } from "vue"
import { diffLines, type Change } from "diff"
import DocumentSurfaceContextCard from "@/components/editor/DocumentSurfaceContextCard.vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import type { KnowledgeDocumentVersionItem } from "@/services/knowledge-documents"
import { getKnowledgeDocumentVersion } from "@/services/knowledge-documents"
import { isBoardContent } from "@/utils/knowledge-document"
import { logger } from "@/utils/logger"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

const props = defineProps<{
  visible: boolean
  documentId: string
  documentTitle: string
  workspaceName: string
  documentModeLabel: string
  documentSchemeLabel: string
  documentStatusLabel: string
  saveStatusLabel?: string
  versions: KnowledgeDocumentVersionItem[]
  compareDisabledReason?: string
  deletingVersionId?: string | null
}>()

const emit = defineEmits<{
  close: []
  "delete-version": [versionId: string]
}>()

const loading = ref(false)
const selectedVersion1 = ref<string>("")
const selectedVersion2 = ref<string>("")
const diffResult = ref<Change[]>([])

const isCompareDisabled = computed(() => Boolean(props.compareDisabledReason))
const canCompare = computed(() => {
  return (
    !isCompareDisabled.value &&
    selectedVersion1.value &&
    selectedVersion2.value &&
    selectedVersion1.value !== selectedVersion2.value
  )
})

const versionIds = computed(() => props.versions.map(version => version.id))

const versionOptions = computed(() => {
  return props.versions.map(v => ({
    value: v.id,
    label: `${v.versionName || v.message || "自动保存版本"} - ${formatDateTime(v.createdAt)}`,
  }))
})

const loadVersionContent = async (versionId: string): Promise<string> => {
  try {
    const version = await getKnowledgeDocumentVersion(props.documentId, versionId)

    if (!version.content || isBoardContent(version.content)) {
      return ""
    }

    if (typeof version.content.value !== "string") {
      return ""
    }

    // HTML scheme（TipTap 时代存量）按原文 diff 会满屏标签，先转 markdown 再比
    //（与导出 .md 同源转换）；转换失败回退原文，保证对比不中断。
    if (version.content.scheme === "text/html") {
      try {
        const { htmlToMarkdown } = await import("@/utils/document-export")
        return htmlToMarkdown(version.content.value)
      } catch {
        return version.content.value
      }
    }

    return version.content.value
  } catch (error) {
    logger.error("VersionCompareDialog", "Failed to load version:", error)
    return ""
  }
}

const resetCompareResult = () => {
  diffResult.value = []
}

const syncSelectedVersions = () => {
  if (!props.visible) {
    return
  }

  if (props.versions.length < 2) {
    selectedVersion1.value = ""
    selectedVersion2.value = props.versions[0]?.id || ""
    resetCompareResult()
    return
  }

  const hasVersion1 = versionIds.value.includes(selectedVersion1.value)
  const hasVersion2 = versionIds.value.includes(selectedVersion2.value)

  if (!hasVersion2) {
    selectedVersion2.value = props.versions[0]?.id || ""
  }

  if (!hasVersion1 || selectedVersion1.value === selectedVersion2.value) {
    selectedVersion1.value = props.versions.find(version => version.id !== selectedVersion2.value)?.id || ""
  }

  if (selectedVersion1.value === selectedVersion2.value) {
    selectedVersion2.value = props.versions.find(version => version.id !== selectedVersion1.value)?.id || ""
  }

  resetCompareResult()
}

const compareVersions = async () => {
  if (!canCompare.value) {
    return
  }

  loading.value = true

  try {
    const [content1, content2] = await Promise.all([
      loadVersionContent(selectedVersion1.value),
      loadVersionContent(selectedVersion2.value),
    ])

    // 生成差异
    diffResult.value = diffLines(content1, content2)
  } catch (error) {
    logger.error("VersionCompareDialog", "Failed to compare versions:", error)
    diffResult.value = []
    ElMessage.error("版本内容加载失败，请稍后重试。")
  } finally {
    loading.value = false
  }
}

const requestDeleteVersion = (versionId: string) => {
  emit("delete-version", versionId)
}

const handleClose = () => {
  emit("close")
  // 重置状态
  selectedVersion1.value = ""
  selectedVersion2.value = ""
  resetCompareResult()
}

/**
 * 预选最新两版（T6 遗留风险 #1，fix/ep-leftovers 修复）：versions 按创建时间倒序，
 * versions[0] 最新 → 版本 2（新版本），versions[1] 次新 → 版本 1（旧版本）。
 *
 * immediate 必须带：本组件经 defineAsyncComponent 懒加载，且调用方以
 * v-if="docId && showVersionCompare" 挂载（KnowledgeDocEditorView）——首次打开即以
 * visible=true 挂载，watch 无变化可观测、从不触发（预选一直是死代码，基线壳时代同为
 * 「选择版本」占位）。immediate 让回调在 setup 时以当前 visible 值执行，覆盖懒加载
 * 首挂场景；未来若改为常挂载 + visible 翻转，false→true 变化路径仍由本 watch 承担。
 * 版本数 < 2 时守卫跳过（回落「选择版本」占位，不报错）；对话框打开期间版本列表变化
 * （如删除版本）由下方 watch(versionIds) → syncSelectedVersions 接管。
 */
watch(
  () => props.visible,
  visible => {
    if (visible && props.versions.length >= 2) {
      // 默认选择最新的两个版本
      selectedVersion1.value = props.versions[1]?.id || ""
      selectedVersion2.value = props.versions[0]?.id || ""
      resetCompareResult()
    }
  },
  { immediate: true }
)

watch(versionIds, () => {
  syncSelectedVersions()
})

const dialog = useDialogBehavior({
  open: () => props.visible,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-6xl"
    :model-value="visible"
    title="版本对比"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="value => !value && handleClose()"
  >
    <template #header>
      <KbDialogHeader
        title="版本对比"
        :description="isCompareDisabled ? props.compareDisabledReason : '选择两个历史版本并查看内容差异。'"
        @close="handleClose"
      />
    </template>

    <div class="space-y-6">
      <DocumentSurfaceContextCard
        :document-title="documentTitle"
        :workspace-name="workspaceName"
        :mode-label="documentModeLabel"
        :scheme-label="documentSchemeLabel"
        :status-label="documentStatusLabel"
        :save-status-label="saveStatusLabel"
      />

      <div v-if="isCompareDisabled" class="mt-6 rounded-kb-3xl border border-line bg-muted px-6 py-8 text-center">
        <AppIcon name="i-lucide-ban" class="mx-auto h-12 w-12 text-ink-quaternary" />
        <p class="mt-4 text-base font-semibold text-ink-secondary">当前文档暂不支持文本对比</p>
        <p class="mt-2 text-sm leading-6 text-ink-tertiary">
          {{ props.compareDisabledReason }}
        </p>
      </div>

      <!-- 版本选择 -->
      <div v-else class="mb-6 mt-6 grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-ink-secondary mb-2">版本 1（旧版本）</label>
          <el-select
            v-model="selectedVersion1"
            :options="versionOptions"
            placeholder="选择版本"
            :offset="6"
            :show-arrow="false"
            :suffix-icon="ChevronDown"
            :class="{ 'kb-select-empty': !selectedVersion1 }"
          />
          <div class="mt-3 flex justify-end">
            <el-button
              type="danger"
              text
              size="small"
              :disabled="!selectedVersion1 || loading || !!deletingVersionId"
              :loading="deletingVersionId === selectedVersion1"
              @click="requestDeleteVersion(selectedVersion1)"
              ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
              <span class="truncate">删除此版本</span>
            </el-button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-ink-secondary mb-2">版本 2（新版本）</label>
          <el-select
            v-model="selectedVersion2"
            :options="versionOptions"
            placeholder="选择版本"
            :offset="6"
            :show-arrow="false"
            :suffix-icon="ChevronDown"
            :class="{ 'kb-select-empty': !selectedVersion2 }"
          />
          <div class="mt-3 flex justify-end">
            <el-button
              type="danger"
              text
              size="small"
              :disabled="!selectedVersion2 || loading || !!deletingVersionId"
              :loading="deletingVersionId === selectedVersion2"
              @click="requestDeleteVersion(selectedVersion2)"
              ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
              <span class="truncate">删除此版本</span>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 对比按钮 -->
      <div v-if="!isCompareDisabled" class="mb-6">
        <el-button type="primary" :disabled="!canCompare || loading" :loading="loading" @click="compareVersions"
          ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
          <span class="truncate">{{ loading ? "对比中…" : "开始对比" }}</span>
        </el-button>
      </div>

      <!-- 差异显示 -->
      <div v-if="!isCompareDisabled && diffResult.length > 0" class="border border-line rounded-kb-md overflow-hidden">
        <div class="bg-muted px-4 py-2 border-b border-line">
          <span class="text-sm font-medium text-ink-secondary">差异对比</span>
        </div>
        <div class="max-h-[500px] overflow-auto bg-surface">
          <table class="w-full text-sm font-mono">
            <tbody>
              <tr
                v-for="(change, index) in diffResult"
                :key="index"
                :class="{
                  'bg-error-bg': change.removed,
                  'bg-success-bg': change.added,
                }"
              >
                <td class="px-4 py-1 text-ink-tertiary text-right w-12 border-r border-line select-none">
                  {{ index + 1 }}
                </td>
                <td class="px-4 py-1 whitespace-pre-wrap break-all">
                  <span v-if="change.removed" class="text-error">- {{ change.value }}</span>
                  <span v-else-if="change.added" class="text-success">+ {{ change.value }}</span>
                  <span v-else class="text-ink-secondary">{{ change.value }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!isCompareDisabled && !loading" class="text-center py-12 text-ink-tertiary">
        <AppIcon name="i-lucide-git-compare" class="h-16 w-16 mx-auto mb-3 text-ink-quaternary" />
        <p>选择两个版本并点击“开始对比”查看差异</p>
      </div>
    </div>
  </el-dialog>
</template>


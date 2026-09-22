<script setup lang="ts">
/**
 * 文档分享对话框：创建与管理文档分享链接。
 *
 * 全部状态与流程由 use-document-share-dialog 承载（加载/创建/删除/复制/统计），
 * 本组件负责组装：左列为统计（ShareStatsGrid）与已有链接列表（ShareLinksList），
 * 右列为创建表单（ShareCreateForm，创建按钮由本组件提供）。删除走受控
 * ConfirmDialog（pendingDeleteShareId 非空即弹出，deleting 期间按钮 loading），
 * 二维码由 ShareQrDialog 呈现。
 */
import { computed, ref } from "vue"
import { useDocumentShareDialog } from "@/composables/use-document-share-dialog"
import { useTransientToast } from "@/composables/use-transient-toast"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import ShareCreateForm from "./ShareCreateForm.vue"
import ShareLinksList from "./ShareLinksList.vue"
import ShareQrDialog from "./ShareQrDialog.vue"
import ShareStatsGrid from "./ShareStatsGrid.vue"
import type { DocumentShare } from "@/services/document-share"

const props = withDefaults(
  defineProps<{
    documentId: string
    visible: boolean
    documentTitle: string
    workspaceName?: string
    documentModeLabel?: string
    documentSchemeLabel?: string
    documentStatusLabel?: string
    saveStatusLabel?: string
    allowEditPermission?: boolean
  }>(),
  {
    workspaceName: "",
    documentModeLabel: "",
    documentSchemeLabel: "",
    documentStatusLabel: "",
    saveStatusLabel: "",
    allowEditPermission: undefined,
  }
)

const emit = defineEmits<{
  close: []
}>()

const { showToastMessage } = useTransientToast()

const dialog = useDialogBehavior({
  open: () => props.visible,
})

const share = useDocumentShareDialog({
  documentId: () => props.documentId,
  documentTitle: () => props.documentTitle,
  visible: () => props.visible,
  allowEditPermission: () => props.allowEditPermission,
  showToastMessage,
})

const {
  permission,
  password,
  usePassword,
  expiresIn,
  expiryOptions,
  permissionOptions,
  canCreateShare,
  shareStats,
  creationSummary,
  shareTips,
  sortedShares,
  latestShareSummary,
  sortedShares,
  loading,
  creating,
  getShareUrl,
  getSharePermissionLabel,
  getShareExpiryText,
  formatDate,
  handleCreateShare,
  requestDeleteShare,
  cancelDeleteShare,
  confirmDeleteShare,
  pendingDeleteShareId,
  deleting,
  copyToClipboard,
  copyShareMarkdownLink,
} = share

const qrShare = ref<DocumentShare | null>(null)

const metaChips = computed(() =>
  [props.workspaceName, props.documentModeLabel, props.documentSchemeLabel, props.documentStatusLabel, props.saveStatusLabel].filter(
    Boolean
  )
)

const latestShareCreatedAt = computed(() => {
  const latest = sortedShares.value[0]
  return latest ? formatDate(latest.createdAt) : "还没有分享链接"
})

const copyShareLink = (target: DocumentShare) => {
  copyToClipboard(getShareUrl(target.shareKey), "链接已复制。")
}

const handleShowQr = (target: DocumentShare) => {
  qrShare.value = target
}

const handleDeleteShare = (shareId: string) => {
  requestDeleteShare(shareId)
}
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-[920px]"
    :model-value="visible"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="value => !value && emit('close')"
  >
    <template #header>
      <KbDialogHeader
        title="分享文档"
        :description="`「${documentTitle}」创建公开链接，拿到链接的人按权限访问。`"
        @close="emit('close')"
      />
    </template>

    <div v-if="metaChips.length" class="flex flex-wrap items-center gap-1.5">
      <el-tag v-for="chip in metaChips" :key="chip" size="small" type="info" disable-transitions>{{ chip }}</el-tag>
    </div>

    <div class="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <!-- 左列：统计 + 已有链接列表 -->
      <div class="min-w-0">
        <ShareStatsGrid :items="shareStats" />

        <div class="mt-4">
          <ShareLinksList
            :loading="loading"
            :shares="sortedShares"
            :get-share-url="getShareUrl"
            :get-share-permission-label="getSharePermissionLabel"
            :get-share-expiry-text="getShareExpiryText"
            :format-date="formatDate"
            @copy-link="copyShareLink"
            @copy-markdown="copyShareMarkdownLink"
            @show-qr="handleShowQr"
            @delete="handleDeleteShare"
          />
        </div>

        <p class="mt-2 text-[12px] leading-5 text-ink-quaternary">{{ latestShareSummary }}</p>
      </div>

      <!-- 右列：创建表单（ShareCreateForm 不含创建按钮，提交由本组件提供） -->
      <div class="min-w-0">
        <ShareCreateForm
          v-model:permission="permission"
          v-model:use-password="usePassword"
          v-model:password="password"
          v-model:expires-in="expiresIn"
          :permission-options="permissionOptions"
          :expiry-options="expiryOptions"
          :allow-edit-permission="allowEditPermission"
          :creation-summary="creationSummary"
          :latest-share-created-at="latestShareCreatedAt"
          :share-tips="shareTips"
        />

        <div class="mt-4 flex justify-end">
          <el-button type="primary" :loading="creating" :disabled="!canCreateShare" @click="handleCreateShare">
            创建链接
          </el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <el-button @click="emit('close')">完成</el-button>
      </div>
    </template>
  </el-dialog>

  <ConfirmDialog
    :open="pendingDeleteShareId !== null"
    title="删除分享链接"
    message="删除后该链接立即失效，已分享的对象将无法继续访问。确定删除吗？"
    confirm-text="删除"
    danger
    :loading="deleting"
    @confirm="confirmDeleteShare"
    @cancel="cancelDeleteShare"
    @update:open="value => !value && cancelDeleteShare()"
  />

  <ShareQrDialog
    :open="qrShare !== null"
    :url="qrShare ? getShareUrl(qrShare.shareKey) : ''"
    :document-title="documentTitle"
    @close="qrShare = null"
  />
</template>

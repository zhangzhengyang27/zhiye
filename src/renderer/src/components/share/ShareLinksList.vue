<script setup lang="ts">
/** 列表组件，负责分享Links集合渲染与批量交互。 */
import type { DocumentShare } from "@/services/document-share"
import ShareLinkRow from "@/components/share/ShareLinkRow.vue"

defineProps<{
  loading: boolean
  shares: DocumentShare[]
  getShareUrl: (shareKey: string) => string
  getSharePermissionLabel: (permission: DocumentShare["permission"]) => string
  getShareExpiryText: (expiresAt: string | null) => string
  formatDate: (dateString: string) => string
}>()

const emit = defineEmits<{
  copyLink: [share: DocumentShare]
  copyMarkdown: [share: DocumentShare]
  showQr: [share: DocumentShare]
  delete: [shareId: string]
}>()
</script>

<template>
  <!-- 原 UCard + :ui 定制（root/header/body），替换为普通 div 结构（样式等价） -->
  <div class="rounded-kb-3xl border border-line bg-muted">
    <div class="px-5 pt-5 pb-0">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-ink-secondary">当前分享链接</p>
          <p class="mt-1 text-[12px] leading-5 text-ink-quaternary">
            保留现有流转地址，支持复制和删除。
          </p>
        </div>
        <el-tag disable-transitions> {{ shares.length }} 条 </el-tag>
      </div>
    </div>

    <div class="px-5 py-5">
      <div v-if="loading" class="space-y-3">
        <div
          v-for="index in 3"
          :key="index"
          class="h-[98px] animate-pulse rounded-kb-3xl bg-surface"
        />
      </div>

      <div v-else-if="shares.length === 0" class="rounded-kb-3xl bg-surface px-5 py-10 text-center">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-kb-2xl bg-brand-faint text-brand"
        >
          <AppIcon name="i-lucide-copy" class="h-5 w-5" />
        </div>
        <p class="mt-4 text-[15px] font-medium text-ink-secondary">还没有分享链接</p>
        <p class="mt-2 text-[12px] leading-6 text-ink-tertiary">
          先在右侧配置权限和有效期，再创建第一条分享地址。
        </p>
      </div>

      <div v-else class="space-y-3">
        <ShareLinkRow
          v-for="share in shares"
          :key="share.id"
          :share="share"
          :get-share-url="getShareUrl"
          :get-share-permission-label="getSharePermissionLabel"
          :get-share-expiry-text="getShareExpiryText"
          :format-date="formatDate"
          @copy-link="emit('copyLink', $event)"
          @copy-markdown="emit('copyMarkdown', $event)"
          @show-qr="emit('showQr', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 行组件，负责分享链接单项展示与行内操作。 */
import { computed } from "vue"
import type { DocumentShare } from "@/services/document-share"

const props = defineProps<{
  share: DocumentShare
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

const shareUrl = computed(() => props.getShareUrl(props.share.shareKey))

const permissionBadgeType = computed(() => (props.share.permission === "edit" ? "success" : undefined))

const metaBadges = computed(() => [
  `访问 ${props.share.viewCount} 次`,
  props.getShareExpiryText(props.share.expiresAt),
  `创建于 ${props.formatDate(props.share.createdAt)}`,
])
</script>

<template>
  <!-- 原 UCard + :ui 定制（root/body），替换为普通 div（样式等价） -->
  <div class="rounded-kb-3xl border border-line bg-surface px-4 py-4 shadow-[var(--kb-surface-shadow)]">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <el-tag disable-transitions>
            {{ props.share.shareKey }}
          </el-tag>
          <el-tag disable-transitions :type="permissionBadgeType" effect="plain">
            {{ props.getSharePermissionLabel(props.share.permission) }}
          </el-tag>
          <el-tag v-if="props.share.hasPassword" disable-transitions type="warning" effect="plain">
            <AppIcon name="i-lucide-lock" class="mr-1 h-3 w-3" />
            有密码
          </el-tag>
        </div>

        <p class="mt-3 break-all text-[13px] leading-6 text-ink-secondary">
          {{ shareUrl }}
        </p>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <el-tag v-for="item in metaBadges" :key="item" disable-transitions class="text-ink-tertiary">
            {{ item }}
          </el-tag>
        </div>
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <el-button plain size="small" class="rounded-kb-xl" @click="emit('copyLink', props.share)"
          ><span class="truncate">复制链接</span>
        </el-button>
        <el-button text size="small" class="rounded-kb-xl" @click="emit('copyMarkdown', props.share)"
          ><span class="truncate">复制 Markdown</span>
        </el-button>
        <el-button text size="small" class="rounded-kb-xl" title="扫码访问" @click="emit('showQr', props.share)"
          ><AppIcon name="i-lucide-qr-code" class="h-3.5 w-3.5" />
        </el-button>
        <el-button
          text
          size="small"
          aria-label="删除分享链接"
          class="rounded-kb-xl text-error"
          @click="emit('delete', props.share.id)"
          ><AppIcon name="i-lucide-trash-2" class="h-3.5 w-3.5" aria-hidden="true" />
        </el-button>
      </div>
    </div>
  </div>
</template>

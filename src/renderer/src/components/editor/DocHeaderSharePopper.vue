<script setup lang="ts">
/**
 * 顶栏「分享」浮层内容(对齐语雀真机 2026-09-21):
 * 顶部私密/公开状态说明 +「添加协作者」行(右侧 复制链接/协作者 圆钮)+「链接公开」开关行
 * + 底部「更多分享设置」小字入口(打开原 ShareDialog 承接密码/有效期/二维码等高级能力)。
 * 语雀第二行是「互联网公开(会员)」;本产品无会员体系,如实映射为「链接公开」开关,不造假徽标。
 * 壳(定位/动画/Esc)由 DocHeaderPopper 承担。
 */
import { computed, onMounted, ref } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import {
  createDocumentShare,
  deleteDocumentShare,
  getDocumentShares,
  type DocumentShare,
} from "@/services/document-share"
import { resolveWebBaseUrl } from "@/services/desktop-bridge"
import Icon from "@/components/common/UiIcon.vue"
import { useTransientToast } from "@/composables/use-transient-toast"

const props = defineProps<{
  documentId: string
}>()

const emit = defineEmits<{
  close: []
  "open-collaborators": []
  "open-advanced": []
}>()

const { showToastMessage } = useTransientToast()

const shares = ref<DocumentShare[]>([])
const loading = ref(false)
const loadError = ref(false)
const toggling = ref(false)

const activeShare = computed(() => shares.value[0] ?? null)
const isPublic = computed(() => Boolean(activeShare.value))

const statusText = computed(() =>
  isPublic.value
    ? "当前文档已开启链接公开，获得链接的人可以阅读。"
    : "当前文档为私密，仅自己和协作者可访问。",
)

const shareUrl = computed(() => {
  if (!activeShare.value) {
    return ""
  }
  return `${resolveWebBaseUrl()}/share/${activeShare.value.shareKey}`
})

const loadShares = async () => {
  loading.value = true
  loadError.value = false
  try {
    shares.value = await getDocumentShares(props.documentId)
  } catch {
    shares.value = []
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const handleTogglePublic = async (enabled: boolean) => {
  if (toggling.value) {
    return
  }
  toggling.value = true
  try {
    if (!enabled) {
      if (activeShare.value) {
        await deleteDocumentShare(activeShare.value.id)
        shares.value = []
      }
      showToastMessage("已关闭链接公开。", "success")
      return
    }
    const share = await createDocumentShare(props.documentId, { permission: "view" })
    shares.value = [share]
    showToastMessage("链接公开已开启，复制链接即可分享。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "更新分享状态失败。", "error")
  } finally {
    toggling.value = false
  }
}

const handleCopyLink = async () => {
  if (!activeShare.value) {
    emit("open-advanced")
    return
  }
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    showToastMessage("分享链接已复制。", "success")
  } catch {
    showToastMessage("复制分享链接失败，请稍后重试。", "error")
  }
}

onMounted(() => {
  void loadShares()
})
</script>

<template>
  <div class="select-none px-4 pb-3 pt-3.5">
    <div v-if="loading" class="space-y-2 py-1">
      <div class="h-10 animate-pulse rounded-kb-lg bg-muted" />
      <div class="h-10 animate-pulse rounded-kb-lg bg-muted" />
    </div>

    <p v-else-if="loadError" class="flex flex-col items-start gap-2 py-1">
      <span class="text-[13px] text-ink-tertiary">分享状态加载失败。</span>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-kb-md border border-line px-2 py-1 text-[12px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
        @click.stop="loadShares"
      >
        <AppIcon name="i-lucide-refresh-cw" class="h-3 w-3" />
        重新加载
      </button>
    </p>

    <template v-else>
      <p class="text-[13px] leading-5 text-ink-secondary">{{ statusText }}</p>

      <button
        type="button"
        class="mt-3 flex w-full items-center gap-3 rounded-kb-lg px-1 py-2 text-left transition hover:bg-fill-muted"
        @click.stop="emit('open-collaborators')"
      >
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-kb-lg bg-brand-faint text-brand"
        >
          <Icon icon="i-lucide-user-plus" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[14px] font-medium text-ink">添加协作者</span>
          <span class="mt-0.5 block text-[12px] text-ink-tertiary">通过链接，邀请对方加入协作</span>
        </span>
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
          title="复制邀请链接"
          @click.stop="handleCopyLink"
        >
          <Icon icon="i-lucide-link" class="h-4 w-4" />
        </span>
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
          title="文档协作者"
          @click.stop="emit('open-collaborators')"
        >
          <Icon icon="i-lucide-user-round" class="h-4 w-4" />
        </span>
      </button>

      <div class="mt-1 flex items-center gap-3 rounded-kb-lg px-1 py-2">
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-kb-lg bg-brand-faint text-brand"
          :class="isPublic ? '' : 'opacity-90'"
        >
          <Icon :icon="isPublic ? 'i-lucide-lock-open' : 'i-lucide-lock'" class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[14px] font-medium text-ink">链接公开</span>
          <span class="mt-0.5 block text-[12px] leading-4 text-ink-tertiary">
            开启后，任何获得链接的人都可以阅读此文档
          </span>
        </span>
        <el-switch
          :model-value="isPublic"
          :loading="toggling"
          @change="(value) => handleTogglePublic(Boolean(value))"
        />
      </div>

      <div class="mt-2 border-t border-line pt-2">
        <button
          type="button"
          class="text-[12px] text-ink-tertiary transition hover:text-brand"
          @click.stop="emit('open-advanced')"
        >
          更多分享设置
        </button>
      </div>
    </template>
  </div>
</template>

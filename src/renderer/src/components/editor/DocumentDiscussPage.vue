<script setup lang="ts">
/**
 * 文档「讨论」全页视图（2026-09-24 语雀桌面端真机取证对齐）。
 *
 * 真机形态：左上角文档名小字 + 内容列超大标题 + 筛选（全部评论 (N) / 全部人员⌄）
 * + 评论列表（头像/名/时间/内容/「正文」定位/回复 (N)）。评论列表在真机渲染于
 * 独立层，此处按 AX 结构 + 阅读态评论行样式重建；IP 属地我们不采集，不渲染。
 *
 * 顶栏「讨论」按钮（easel 图标）打开本层；「查看正文」关闭本层并滚动定位到锚点。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"
import type { DocCommentItem } from "./DocumentCommentsPanel.vue"

const props = defineProps<{
  documentTitle: string
  comments: DocCommentItem[]
  currentUserId: string
}>()

const emit = defineEmits<{
  close: []
  /** 「正文」定位：父级关闭本层并滚动到评论锚点 */
  "scroll-to": [id: string]
  reply: [parentId: string, content: string]
}>()

const replyDrafts = ref<Record<string, string>>({})
const replyingId = ref<string | null>(null)
const authorFilter = ref<string>("__all__")
const authorFilterOpen = ref(false)

/** 全部评论 = 未解决在前、按时间；人员筛选按作者（真机「全部人员」下拉） */
const authors = computed(() => {
  const seen = new Map<string, string>()
  for (const item of props.comments) {
    seen.set(item.authorName, item.authorName)
    for (const reply of item.replies) {
      seen.set(reply.authorName, reply.authorName)
    }
  }
  return [...seen.values()]
})

const filteredComments = computed(() => {
  if (authorFilter.value === "__all__") {
    return props.comments
  }
  return props.comments.filter((item) => item.authorName === authorFilter.value)
})

/** 人员筛选选中（多语句禁写内联 handler：prettier 去分号会产生非法表达式） */
const pickAuthor = (author: string) => {
  authorFilter.value = author
  authorFilterOpen.value = false
}

const submitReply = (parentId: string) => {
  const content = (replyDrafts.value[parentId] ?? "").trim()
  if (!content) return
  emit("reply", parentId, content)
  replyDrafts.value = { ...replyDrafts.value, [parentId]: "" }
  replyingId.value = null
}

const handleReplyKeydown = (parentId: string) => (event: KeyboardEvent) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submitReply(parentId)
  }
}

/** Esc 关闭全页（对话框压顶让位；输入法组词中的 Esc 是取消候选） */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || isImeComposing(event) || hasOpenDialog()) {
    return
  }
  if (authorFilterOpen.value) {
    authorFilterOpen.value = false
    return
  }
  emit("close")
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
  <div
    class="fixed inset-0 z-[var(--kb-z-overlay)] overflow-y-auto bg-surface"
    role="dialog"
    aria-label="讨论"
  >
    <!-- 左上角文档名小字（对齐语雀真机）；点击即返回 -->
    <button
      type="button"
      class="fixed left-5 top-4 z-10 flex items-center gap-1 rounded-kb-md px-1.5 py-1 text-[12px] text-ink-tertiary transition hover:bg-fill-muted hover:text-ink-secondary"
      title="返回文档"
      @click="emit('close')"
    >
      <UiIcon icon="i-lucide-chevron-left" class="h-3.5 w-3.5" />
      <span class="max-w-[280px] truncate">{{ documentTitle }}</span>
    </button>
    <button
      type="button"
      class="fixed right-5 top-4 z-10 rounded-kb-md p-1.5 text-ink-tertiary transition hover:bg-fill-muted hover:text-ink-secondary"
      title="关闭讨论"
      @click="emit('close')"
    >
      <UiIcon icon="i-lucide-x" class="h-4 w-4" />
    </button>

    <div class="mx-auto w-full max-w-[820px] px-8 pb-20 pt-20 sm:px-12">
      <!-- 大标题（对齐语雀讨论页的超大文档标题） -->
      <h1 class="truncate text-[34px] font-bold leading-tight text-ink">
        {{ documentTitle || "无标题文档" }}
      </h1>

      <!-- 筛选行：全部评论 (N) + 全部人员⌄ -->
      <div class="mt-8 flex items-center gap-4 border-b border-line pb-3">
        <span
          class="relative pb-3 text-[13px] font-semibold text-ink"
          role="radio"
          aria-checked="true"
        >
          全部评论 ({{ comments.length }})
          <span class="absolute inset-x-0 -bottom-3 h-[2px] rounded-full bg-ink" />
        </span>
        <div class="relative ml-auto">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-kb-md border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
            @click="authorFilterOpen = !authorFilterOpen"
          >
            {{ authorFilter === "__all__" ? "全部人员" : authorFilter }}
            <UiIcon icon="ph:caret-down" :width="11" :height="11" />
          </button>
          <div
            v-if="authorFilterOpen"
            class="absolute right-0 top-[calc(100%+4px)] z-10 w-44 rounded-kb-xl border border-line bg-surface py-1 shadow-[var(--kb-surface-shadow)]"
          >
            <button
              type="button"
              class="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-ink transition hover:bg-fill-muted"
              @click="pickAuthor('__all__')"
            >
              全部人员
            </button>
            <button
              v-for="author in authors"
              :key="author"
              type="button"
              class="flex w-full items-center px-3 py-1.5 text-left text-[12px] text-ink transition hover:bg-fill-muted"
              @click="pickAuthor(author)"
            >
              <span class="min-w-0 flex-1 truncate">{{ author }}</span>
              <UiIcon
                v-if="authorFilter === author"
                icon="i-lucide-check"
                class="h-3.5 w-3.5 shrink-0 text-brand"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 评论列表 -->
      <div v-if="filteredComments.length > 0" class="mt-6 space-y-8">
        <article v-for="item in filteredComments" :key="item.id">
          <div class="flex items-start gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted text-[12px] font-semibold text-ink-secondary"
            >
              <img
                v-if="item.authorAvatar"
                :src="item.authorAvatar"
                :alt="item.authorName"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ item.authorName.slice(0, 1).toUpperCase() }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="text-[13px] font-medium text-ink">{{ item.authorName }}</span>
                <span class="text-[11px] text-ink-quaternary">{{ item.createdAtText }}</span>
                <span
                  v-if="item.resolved"
                  class="rounded-full border border-success-light bg-success-bg px-2 py-0.5 text-[10px] text-success"
                  >已解决</span
                >
              </div>

              <button
                v-if="item.quote"
                type="button"
                class="mt-2 block w-full rounded-kb-md border-l-2 border-warning bg-warning-bg px-2.5 py-1.5 text-left text-[12px] leading-5 text-ink-secondary transition hover:border-warning-hover"
                :title="item.quote"
                @click="emit('scroll-to', item.id)"
              >
                <span class="line-clamp-3">{{ item.quote }}</span>
              </button>

              <p class="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-ink">
                {{ item.content }}
              </p>

              <div class="mt-2 flex items-center gap-3">
                <button
                  v-if="item.quote"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-kb-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
                  title="跳到正文对应位置"
                  @click="emit('scroll-to', item.id)"
                >
                  <UiIcon icon="i-lucide-crosshair" class="h-3 w-3" />
                  正文
                </button>
                <button
                  type="button"
                  class="text-[12px] text-ink-tertiary transition hover:text-brand"
                  @click="replyingId = replyingId === item.id ? null : item.id"
                >
                  回复{{ item.replies.length > 0 ? ` (${item.replies.length})` : "" }}
                </button>
              </div>

              <div
                v-if="item.replies.length > 0"
                class="mt-3 space-y-3 border-l-2 border-line pl-3"
              >
                <div v-for="reply in item.replies" :key="reply.id">
                  <p class="text-[12px] text-ink-secondary">
                    <span class="font-medium text-ink">{{ reply.authorName }}</span>
                    <span class="ml-2 text-[11px] text-ink-quaternary">{{
                      reply.createdAtText
                    }}</span>
                  </p>
                  <p
                    class="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-ink-secondary"
                  >
                    {{ reply.content }}
                  </p>
                </div>
              </div>

              <div v-if="replyingId === item.id" class="mt-3">
                <el-input
                  v-model="replyDrafts[item.id]"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  class="resize-none overflow-hidden text-[12px]"
                  placeholder="写下回复…（⌘/Ctrl + Enter 发送）"
                  @keydown="handleReplyKeydown(item.id)"
                />
                <div class="mt-1 flex justify-end">
                  <el-button
                    type="primary"
                    size="small"
                    class="px-3"
                    :disabled="!(replyDrafts[item.id] ?? '').trim()"
                    @click="submitReply(item.id)"
                    ><span class="truncate">发送</span>
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- 空态 -->
      <div v-else class="pt-16 text-center">
        <UiIcon icon="i-lucide-message-circle" class="mx-auto h-9 w-9 text-ink-quaternary" />
        <p class="mt-3 text-[13px] text-ink-secondary">还没有讨论</p>
        <p class="mt-1 text-[12px] text-ink-quaternary">在正文中划选内容即可发起针对内容的讨论。</p>
      </div>
    </div>
  </div>
</template>

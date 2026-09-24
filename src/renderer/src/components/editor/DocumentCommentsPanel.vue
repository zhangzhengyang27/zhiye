<script setup lang="ts">
/**
 * 文档评论侧栏面板内容（划词评论的展示与回复入口）。
 *
 * 外壳（标题/关闭/宽度动画/Esc）由 DocSidePanelShell 统一承担，本组件只做：
 * 列表展示 / 撰写 / 回复 / 解决 / 删除 / 滚动定位联动。
 * 数据由父级（文档编辑视图）从服务端加载并映射为展示模型；
 * 高亮渲染由编辑器核心的 CommentManager 负责。
 */
import { computed, nextTick, ref, watch } from "vue"
import UiIcon from "@/components/common/UiIcon.vue"
import AppIcon from "@/components/common/AppIcon.vue"

export interface DocCommentReplyItem {
  id: string
  content: string
  authorName: string
  createdAtText: string
}

export interface DocCommentItem {
  id: string
  content: string
  authorName: string
  authorAvatar: string | null
  createdAtText: string
  resolved: boolean
  quote: string | null
  replies: DocCommentReplyItem[]
}

const props = withDefaults(
  defineProps<{
    comments: DocCommentItem[]
    currentUserId: string
    /** 待提交的划词引用（选区捕获成功后非空，进入撰写态） */
    composeQuote?: string | null
    submitting?: boolean
    loading?: boolean
    /** 回复/解决请求进行中，禁用相关按钮防连点 */
    actionBusy?: boolean
  }>(),
  {
    composeQuote: null,
    submitting: false,
    loading: false,
    actionBusy: false,
  },
)

const emit = defineEmits<{
  submit: [content: string]
  "cancel-compose": []
  resolve: [id: string]
  unresolve: [id: string]
  delete: [id: string]
  reply: [parentId: string, content: string]
  "scroll-to": [id: string]
  hover: [id: string]
  leave: []
}>()

const draft = ref("")
const draftInputRef = ref<{ focus: () => void } | null>(null)
const replyDrafts = ref<Record<string, string>>({})
const replyingId = ref<string | null>(null)

const canSubmit = computed(() => draft.value.trim().length > 0)

watch(
  () => props.composeQuote,
  (quote) => {
    if (quote != null) {
      void nextTick(() => draftInputRef.value?.focus())
    }
  },
)

const submitCompose = () => {
  if (!canSubmit.value) return
  emit("submit", draft.value.trim())
  draft.value = ""
}

/** ⌘/Ctrl + Enter 提交（撰写框） */
const handleComposeKeydown = (event: KeyboardEvent | Event) => {
  if (!(event instanceof KeyboardEvent)) {
    return
  }
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submitCompose()
  }
}

const submitReply = (parentId: string) => {
  const content = (replyDrafts.value[parentId] ?? "").trim()
  if (!content) return
  emit("reply", parentId, content)
  replyDrafts.value = { ...replyDrafts.value, [parentId]: "" }
  replyingId.value = null
}

/** 条件事件名在模板 emit 类型推导下不好表达，收敛为函数 */
const toggleResolved = (item: DocCommentItem) => {
  if (item.resolved) {
    emit("unresolve", item.id)
  } else {
    emit("resolve", item.id)
  }
}

/** ⌘/Ctrl + Enter 提交（回复框） */
const handleReplyKeydown = (parentId: string) => (event: KeyboardEvent) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submitReply(parentId)
  }
}
</script>

<template>
  <div class="min-h-full px-4 py-4" aria-label="评论面板">
    <!-- 撰写态：划词评论草稿 -->
    <div
      v-if="composeQuote != null"
      class="rounded-kb-xl border border-brand-lighter bg-brand-faint p-3"
    >
      <p class="text-[12px] font-medium text-brand">评论选中的内容</p>
      <p
        class="mt-2 line-clamp-3 rounded-kb-md bg-surface px-2.5 py-2 text-[12px] leading-5 text-ink-secondary"
      >
        「{{ composeQuote }}」
      </p>
      <el-input
        ref="draftInputRef"
        v-model="draft"
        type="textarea"
        :rows="3"
        resize="none"
        placeholder="写下你的评论…（⌘/Ctrl + Enter 发送）"
        class="mt-2 resize-none overflow-hidden"
        @keydown="handleComposeKeydown"
      />
      <div class="mt-2 flex items-center justify-end gap-2">
        <el-button text size="small" @click="emit('cancel-compose')"
          ><span class="truncate">取消</span>
        </el-button>
        <el-button
          type="primary"
          size="small"
          class="px-3"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="submitCompose"
          ><template #loading
            ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">发布评论</span>
        </el-button>
      </div>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="index in 3" :key="index" class="h-24 animate-pulse rounded-kb-xl bg-muted" />
    </div>

    <div
      v-else-if="comments.length === 0 && composeQuote == null"
      class="py-16 text-center text-ink-tertiary"
    >
      <AppIcon name="i-lucide-message-circle" class="mx-auto h-8 w-8 text-ink-quaternary" />
      <p class="mt-3 text-sm">还没有讨论</p>
      <p class="mt-1 text-[12px] text-ink-quaternary">划选正文内容即可发起针对内容的讨论。</p>
    </div>

    <article
      v-for="item in comments"
      :key="item.id"
      class="rounded-kb-xl border border-line bg-surface p-3 transition hover:border-brand-lighter"
      :class="item.resolved ? 'opacity-70' : ''"
      @mouseenter="emit('hover', item.id)"
      @mouseleave="emit('leave')"
    >
      <div class="flex items-center gap-2">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted text-[10px] font-semibold text-ink-secondary"
        >
          <img
            v-if="item.authorAvatar"
            :src="item.authorAvatar"
            :alt="item.authorName"
            class="h-full w-full object-cover"
          />
          <span v-else>{{ item.authorName.slice(0, 1).toUpperCase() }}</span>
        </span>
        <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-secondary">
          {{ item.authorName }}
        </span>
        <span
          v-if="item.resolved"
          class="rounded-full border border-success-light bg-success-bg px-2 py-0.5 text-[10px] text-success"
        >
          已解决
        </span>
      </div>

      <button
        v-if="item.quote"
        type="button"
        class="mt-2 block w-full rounded-kb-md border-l-2 border-warning bg-warning-bg px-2.5 py-1.5 text-left text-[12px] leading-5 text-ink-secondary transition hover:border-warning-hover"
        :title="item.quote"
        @click="emit('scroll-to', item.id)"
      >
        <span class="line-clamp-2">{{ item.quote }}</span>
      </button>

      <p class="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-ink">{{ item.content }}</p>

      <div class="mt-2 flex flex-wrap items-center gap-1">
        <el-button
          text
          size="small"
          class="text-[11px] text-ink-tertiary [line-height:inherit]"
          @click="replyingId = replyingId === item.id ? null : item.id"
          ><span class="truncate"
            >回复{{ item.replies.length > 0 ? ` (${item.replies.length})` : "" }}</span
          >
        </el-button>
        <el-button
          text
          size="small"
          class="text-[11px] text-ink-tertiary [line-height:inherit]"
          :disabled="actionBusy"
          @click="toggleResolved(item)"
          ><span class="truncate">{{ item.resolved ? "取消解决" : "标记解决" }}</span>
        </el-button>
        <el-button
          text
          size="small"
          class="text-[11px] text-ink-tertiary hover:text-error [line-height:inherit]"
          @click="emit('delete', item.id)"
          ><span class="truncate">删除</span>
        </el-button>
        <span class="ml-auto text-[11px] text-ink-quaternary">{{ item.createdAtText }}</span>
      </div>

      <div v-if="item.replies.length > 0" class="mt-2 space-y-2 border-t border-line pt-2">
        <div v-for="reply in item.replies" :key="reply.id" class="flex items-start gap-2">
          <AppIcon
            name="i-lucide-corner-down-right"
            class="mt-1 h-3 w-3 shrink-0 text-ink-quaternary"
          />
          <div class="min-w-0 flex-1">
            <p class="text-[12px] leading-5 text-ink-secondary">
              <span class="font-medium">{{ reply.authorName }}</span>
              <span class="ml-2 text-[11px] text-ink-quaternary">{{ reply.createdAtText }}</span>
            </p>
            <p class="whitespace-pre-wrap text-[12px] leading-5 text-ink-secondary">
              {{ reply.content }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="replyingId === item.id" class="mt-2">
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
            :disabled="actionBusy || !(replyDrafts[item.id] ?? '').trim()"
            @click="submitReply(item.id)"
            ><span class="truncate">发送</span>
          </el-button>
        </div>
      </div>
    </article>
  </div>
</template>

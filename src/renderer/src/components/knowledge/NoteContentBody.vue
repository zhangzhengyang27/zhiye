<script setup lang="ts">
/**
 * 小记富内容渲染（#17 markdown-lite）：待办（可勾选回写）/ 图片缩略 / 附件链接 /
 * 纯文本。解析见 utils/notes-markdown.ts；勾选切换由父级负责持久化。
 */
import { computed } from "vue"
import { parseNoteSegments } from "@/utils/notes-markdown"

const props = defineProps<{
  content: string
}>()

const emit = defineEmits<{
  "toggle-todo": [lineIndex: number]
}>()

const segments = computed(() => parseNoteSegments(props.content))

/** 附件链接只放行 http/https：小记内容是自由文本，javascript: 等协议不可进入 href */
const isSafeAttachmentUrl = (url: string) => /^https?:\/\//i.test(url)
</script>

<template>
  <div class="mt-2 space-y-1">
    <template v-for="segment in segments" :key="segment.lineIndex">
      <label v-if="segment.kind === 'todo'" class="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          class="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--kb-brand)]"
          :checked="segment.checked"
          @change="emit('toggle-todo', segment.lineIndex)"
        />
        <span
          class="text-[13px] leading-6 text-ink-secondary"
          :class="segment.checked ? 'line-through opacity-55' : ''"
          >{{ segment.text }}</span
        >
      </label>

      <img
        v-else-if="segment.kind === 'image'"
        :src="segment.url"
        alt="小记图片"
        class="max-h-44 max-w-full rounded-kb-lg border border-line object-cover"
        loading="lazy"
      />

      <!-- 非法协议的附件地址降级为纯文本展示（不生成可点击链接） -->
      <a
        v-else-if="segment.kind === 'attachment' && isSafeAttachmentUrl(segment.url)"
        :href="segment.url"
        target="_blank"
        rel="noopener"
        class="inline-flex max-w-full items-center gap-1.5 rounded-kb-md bg-muted px-2 py-1 text-[12px] text-brand transition hover:bg-brand-faint"
      >
        <Icon icon="ph:paperclip" :width="12" :height="12" class="shrink-0" />
        <span class="truncate">{{ segment.label }}</span>
      </a>

      <span
        v-else-if="segment.kind === 'attachment'"
        class="inline-flex max-w-full items-center gap-1.5 rounded-kb-md bg-muted px-2 py-1 text-[12px] text-ink-tertiary"
        :title="segment.url"
      >
        <Icon icon="ph:paperclip" :width="12" :height="12" class="shrink-0" />
        <span class="truncate">{{ segment.label }}</span>
      </span>

      <p
        v-else-if="segment.text.trim()"
        class="whitespace-pre-wrap break-words text-[13px] leading-6 text-ink-secondary"
      >
        {{ segment.text }}
      </p>
    </template>
  </div>
</template>

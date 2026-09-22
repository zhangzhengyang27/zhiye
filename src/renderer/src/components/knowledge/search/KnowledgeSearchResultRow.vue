<script setup lang="ts">
/** 行组件，负责知识库搜索Result单项展示与行内操作。 */
import { computed } from "vue"
import { formatDateTime } from "@/utils/date-format"
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeDocumentSearchResult } from "@/services/knowledge-documents"
import { getKnowledgeDocumentEditorLabel } from "@/utils/knowledge-document"

type KnowledgeSearchItem = KnowledgeDocumentSearchResult["items"][number]

type HighlightSegment = {
  text: string
  highlighted: boolean
}

const props = defineProps<{
  item: KnowledgeSearchItem
  keyword: string
}>()

const emit = defineEmits<{
  open: [docId: string, editorType?: string]
}>()

const getHighlightedSegments = (text: string, keyword: string): HighlightSegment[] => {
  if (!text) {
    return []
  }

  const normalizedKeyword = keyword.trim()

  if (!normalizedKeyword) {
    return [{ text, highlighted: false }]
  }

  const regex = new RegExp(normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
  const segments: HighlightSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(regex)) {
    const matchedText = match[0] || ""
    const matchIndex = match.index ?? -1

    if (!matchedText || matchIndex < 0) {
      continue
    }

    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        highlighted: false,
      })
    }

    segments.push({
      text: matchedText,
      highlighted: true,
    })

    lastIndex = matchIndex + matchedText.length
  }

  if (segments.length === 0) {
    return [{ text, highlighted: false }]
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      highlighted: false,
    })
  }

  return segments
}

const handleOpen = () => {
  emit("open", props.item.id, props.item.editorType)
}

// 高亮分段缓存为 computed：避免每次渲染都重建正则并重新切分文本
const titleSegments = computed(() => getHighlightedSegments(props.item.title, props.keyword))
const snippetSegments = computed(() => getHighlightedSegments(props.item.snippet ?? "", props.keyword))
</script>

<template>
  <article
    class="kb-list-row group flex cursor-pointer items-start justify-between gap-4 rounded-kb-lg px-4 py-4 transition-colors duration-150 hover:bg-grey-100"
  >
    <button type="button" class="flex min-w-0 flex-1 items-start gap-3 text-left" @click="handleOpen">
      <span
        class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-kb-2xl border border-info-light bg-info-bg text-info"
      >
        <Icon icon="ph:file-text" :width="18" :height="18" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-sm font-semibold text-ink">
            <template v-for="(segment, index) in titleSegments" :key="`${props.item.id}-title-${index}`">
              <mark v-if="segment.highlighted" class="rounded bg-warning-light px-0.5 text-ink">
                {{ segment.text }}
              </mark>
              <span v-else>{{ segment.text }}</span>
            </template>
          </h3>
          <span
            v-if="props.item.status && props.item.status !== 'draft'"
            class="shrink-0 rounded-full px-2 py-0.5 text-xs"
            :class="{
              'bg-success-bg text-success': props.item.status === 'published',
              'bg-warning-bg text-warning': props.item.status === 'pending',
              'bg-grey-200 text-ink-tertiary': props.item.status === 'archived',
            }"
          >
            {{ props.item.status === "published" ? "已发布" : props.item.status === "pending" ? "待审核" : "已归档" }}
          </span>
        </div>
        <p v-if="props.item.snippet" class="mt-2 line-clamp-2 text-sm leading-6 text-ink-secondary">
          <template v-for="(segment, index) in snippetSegments" :key="`${props.item.id}-snippet-${index}`">
            <mark v-if="segment.highlighted" class="rounded bg-warning-light px-0.5 text-ink">
              {{ segment.text }}
            </mark>
            <span v-else>{{ segment.text }}</span>
          </template>
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-quaternary">
          <span class="inline-flex items-center gap-1">
            <Icon icon="ph:clock-counter-clockwise" :width="12" :height="12" />
            {{ formatDateTime(props.item.updatedAt) }}
          </span>
          <span>{{ getKnowledgeDocumentEditorLabel(props.item.editorType) }}</span>
        </div>
      </div>
    </button>

    <el-button type="primary" class="bg-brand-faint text-brand gap-1.5 px-3 py-1.5 kb-btn-soft" @click="handleOpen"
      ><span class="truncate">打开</span>
    </el-button>
  </article>
</template>

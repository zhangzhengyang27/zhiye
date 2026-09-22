<script setup lang="ts">
/**
 * 文档列表组件（对齐语雀 Dashboard 的扁平行式列表）。
 *
 * 与旧的卡片网格（kb-section-card）区别：
 * - 行高固定 40px，靠 hover 浅底反馈，不用卡片边框和阴影
 * - 左侧图标 + 标题，右侧元信息与时间，结构与语雀「文档」列表一致
 * - 内置 Tab 筛选（语雀的「编过 / 浏览过 / 我点赞的」）
 */
import Icon from "@/components/common/UiIcon.vue"
import { RouterLink } from "vue-router"
import type { RouteLocationRaw } from "vue-router"

export interface DocListTab {
  label: string
  value: string
}

export interface DocListBadge {
  label: string
  icon?: string
  class?: string
}

export interface DocListItem {
  id: string
  title: string
  /** 左侧图标名（Iconify），默认按文档图标兜底 */
  icon?: string
  iconClass?: string
  /** 标题前的标签，如「最近访问」「所属知识库」 */
  badges?: DocListBadge[]
  /** 标题下方的补充说明 */
  subtitle?: string
  /** 行尾元信息，按顺序展示，靠右对齐 */
  meta?: string[]
  /** 行尾时间，展示在元信息之后 */
  time?: string
  disabled?: boolean
  to?: RouteLocationRaw
}

const props = withDefaults(
  defineProps<{
    items: DocListItem[]
    /** 区块标题，为空则不渲染标题行 */
    title?: string
    titleHint?: string
    tabs?: DocListTab[]
    activeTab?: string
    loading?: boolean
    skeletonRows?: number
    emptyTitle?: string
    emptyDescription?: string
  }>(),
  {
    title: "",
    titleHint: "",
    tabs: undefined,
    activeTab: "",
    loading: false,
    skeletonRows: 6,
    emptyTitle: "暂无内容",
    emptyDescription: "",
  }
)

const emit = defineEmits<{
  select: [item: DocListItem]
  "update:activeTab": [value: string]
}>()

const handleSelect = (item: DocListItem) => {
  if (item.disabled) {
    return
  }

  emit("select", item)
}
</script>

<template>
  <section class="flex min-h-0 flex-col">
    <header v-if="props.title || props.tabs?.length || $slots.actions" class="px-1 pb-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-baseline gap-2">
          <h2 v-if="props.title" class="text-kb-md font-semibold text-ink">{{ props.title }}</h2>
          <!-- titleHint 与行内 meta/时间同为可读文字：D1 巡检暗色从 quaternary 提到 tertiary -->
          <span v-if="props.titleHint" class="text-kb-xs text-ink-tertiary">{{ props.titleHint }}</span>
        </div>

        <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
          <slot name="actions" />
        </div>
      </div>

      <div v-if="props.tabs?.length" class="mt-3">
        <div class="inline-flex items-center gap-0.5 rounded-kb-md bg-black/5 p-0.5 dark:bg-white/10">
          <button
            v-for="tab in props.tabs"
            :key="tab.value"
            type="button"
            class="h-8 rounded-kb-sm px-3 text-kb-sm transition duration-150"
            :class="
              props.activeTab === tab.value
                ? 'bg-surface font-medium text-ink shadow-(--kb-hover-shadow)'
                : 'text-ink-tertiary hover:text-ink-secondary'
            "
            @click="emit('update:activeTab', tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="props.loading" class="space-y-0.5">
      <div
        v-for="index in props.skeletonRows"
        :key="`doc-list-skeleton-${index}`"
        class="h-(--kb-row-height-doc) animate-pulse rounded-kb-sm bg-grey-200"
      />
    </div>

    <div v-else-if="props.items.length === 0" class="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon icon="ph:file-text" :width="36" :height="36" class="text-ink-quaternary" />
      <p class="mt-3 text-kb-base font-medium text-ink-secondary">{{ props.emptyTitle }}</p>
      <p v-if="props.emptyDescription" class="mt-1.5 max-w-sm text-kb-xs leading-5 text-ink-tertiary">
        {{ props.emptyDescription }}
      </p>
      <slot name="empty" />
    </div>

    <ul v-else class="space-y-0.5">
      <li v-for="item in props.items" :key="item.id">
        <!-- RouterLink 不认 disabled：禁用行必须退回 button，否则点击仍会导航 -->
        <component
          :is="item.to && !item.disabled ? RouterLink : 'button'"
          v-bind="item.to && !item.disabled ? { to: item.to } : { type: 'button' }"
          :disabled="item.disabled"
          class="group flex h-(--kb-row-height-doc) w-full items-center gap-2.5 rounded-kb-sm px-2.5 text-left transition-colors duration-150 hover:bg-grey-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
          @click="handleSelect(item)"
        >
          <Icon
            :icon="item.icon || 'ph:file-text'"
            :width="16"
            :height="16"
            class="shrink-0 text-ink-tertiary"
            :class="item.iconClass"
          />

          <span
            v-for="badge in item.badges || []"
            :key="badge.label"
            class="inline-flex shrink-0 items-center gap-1 rounded-kb-xs border border-line px-1.5 py-0.5 text-[11px] leading-none"
            :class="badge.class || 'bg-surface text-ink-tertiary'"
          >
            <Icon v-if="badge.icon" :icon="badge.icon" :width="11" :height="11" />
            {{ badge.label }}
          </span>

          <span
            class="min-w-0 flex-1 truncate text-kb-base text-ink transition-colors duration-150 group-hover:text-brand"
          >
            {{ item.title }}
          </span>

          <span
            v-for="(metaItem, metaIndex) in item.meta || []"
            :key="`${item.id}-meta-${metaIndex}`"
            class="hidden shrink-0 text-kb-xs text-ink-tertiary md:inline"
          >
            {{ metaItem }}
          </span>

          <span v-if="item.time" class="w-24 shrink-0 text-right text-kb-xs text-ink-tertiary">
            {{ item.time }}
          </span>

          <slot name="row-actions" :item="item" />
        </component>
      </li>
    </ul>
  </section>
</template>

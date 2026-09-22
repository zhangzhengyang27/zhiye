<script setup lang="ts">
/**
 * 内容区顶栏（对齐语雀内容区顶部的面包屑 + 右侧工具条）。
 *
 * 语雀的内容区在标题上方有一条轻量顶栏：左侧面包屑定位当前位置，
 * 右侧放分享、更多、头像等操作。此前项目内容区直接从标题开始，
 * 进入文档后缺少「我在哪个知识库的哪篇文档」的定位信息。
 */
import Icon from "@/components/common/UiIcon.vue"
import { RouterLink } from "vue-router"
import type { RouteLocationRaw } from "vue-router"

export interface ContentCrumb {
  label: string
  to?: RouteLocationRaw
}

const props = withDefaults(
  defineProps<{
    crumbs?: ContentCrumb[]
    /** 面包屑右侧的元信息，如「已保存 · 10:24」 */
    meta?: string
    /** 面包屑下方的主标题，留空则不渲染（避免与页面自带标题重复） */
    title?: string
    /** 标题区是否可滚动吸顶 */
    sticky?: boolean
  }>(),
  {
    crumbs: () => [],
    meta: "",
    title: "",
    sticky: false,
  },
)
</script>

<template>
  <header class="border-b border-line bg-surface" :class="props.sticky ? 'sticky top-0 z-10' : ''">
    <div class="flex items-center gap-3 px-6 py-2.5">
      <nav aria-label="面包屑" class="flex min-w-0 flex-1 items-center gap-1.5 text-kb-xs">
        <template v-for="(crumb, index) in props.crumbs" :key="`${crumb.label}-${index}`">
          <Icon
            v-if="index > 0"
            icon="ph:caret-right"
            :width="11"
            :height="11"
            class="shrink-0 text-ink-quaternary"
          />
          <component
            :is="crumb.to ? RouterLink : 'span'"
            :to="crumb.to"
            class="min-w-0 truncate transition-colors duration-150"
            :class="
              crumb.to
                ? 'text-ink-tertiary hover:text-brand'
                : index === props.crumbs.length - 1
                  ? 'font-medium text-ink-secondary'
                  : 'text-ink-tertiary'
            "
          >
            {{ crumb.label }}
          </component>
        </template>

        <!-- meta 是「N 篇 · 今日 N 篇」这类计数类可读文字：D1 巡检要求暗色提到 tertiary 档
             （quaternary 暗侧压卡底不足 4.5 比 1），亮暗同步换档 -->
        <span v-if="props.meta" class="ml-2 shrink-0 text-ink-tertiary">{{ props.meta }}</span>
      </nav>

      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="props.title || $slots.meta" class="flex items-center gap-3 px-6 pb-3">
      <h1 class="min-w-0 flex-1 truncate text-kb-xl font-semibold text-ink">{{ props.title }}</h1>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="meta" />
      </div>
    </div>
  </header>
</template>

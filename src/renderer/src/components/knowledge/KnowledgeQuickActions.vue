<script setup lang="ts">
/**
 * 快速操作卡（对齐语雀「开始」页顶部的 4 个并排入口）。
 *
 * 语雀的形态是横向等分的低矮卡片：图标在上、标题在下、居中排布，
 * 常态只有 1px 淡边框，hover 才浮现品牌色边框与轻阴影。
 * 与旧的 kb-section-card 相比更矮、更密、不抢内容区的视觉重心。
 */
import Icon from "@/components/common/UiIcon.vue"

export interface QuickActionItem {
  id: string
  label: string
  icon: string
  description?: string
  disabled?: boolean
  /** 对齐语雀「新建文档」卡：右侧浮现 ⌄ 下拉提示 */
  caret?: boolean
  /** 图标样式变体：default 灰底灰图 / colorful 彩色图标 / ai 绿底白图 */
  variant?: "default" | "colorful" | "ai"
}

const props = withDefaults(
  defineProps<{
    items: QuickActionItem[]
    columns?: 2 | 3 | 4
  }>(),
  {
    columns: 4,
  }
)

const emit = defineEmits<{
  select: [item: QuickActionItem]
}>()

const gridClass = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const

const getIconWrapClass = (variant?: string) => {
  if (variant === "ai") {
    return "bg-brand text-white group-hover:bg-brand"
  }
  if (variant === "colorful") {
    return "bg-transparent text-transparent group-hover:bg-transparent"
  }
  return "bg-grey-100 text-ink-secondary group-hover:bg-brand-light group-hover:text-brand"
}

const handleSelect = (item: QuickActionItem) => {
  if (item.disabled) {
    return
  }

  emit("select", item)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3" :class="gridClass[props.columns]">
    <button
      v-for="item in props.items"
      :key="item.id"
      type="button"
      :disabled="item.disabled"
      class="group flex items-center gap-2.5 rounded-kb-md border border-line/70 bg-surface px-2.5 py-2 text-left transition duration-150 hover:border-brand-lighter hover:bg-grey-100 hover:shadow-(--kb-hover-shadow) disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line/70 disabled:hover:bg-surface disabled:hover:shadow-none"
      @click="handleSelect(item)"
    >
      <span
        class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-kb-sm transition-colors duration-150"
        :class="getIconWrapClass(item.variant)"
      >
        <!-- 彩色模板中心图标：红黄蓝三色拼图 -->
        <svg
          v-if="item.variant === 'colorful'"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="3" y="3" width="8" height="8" rx="2" fill="#FF6B6B" />
          <rect x="13" y="3" width="8" height="8" rx="2" fill="#FFD93D" />
          <rect x="3" y="13" width="8" height="8" rx="2" fill="#4ECDC4" />
          <rect x="13" y="13" width="8" height="8" rx="2" fill="#5B8DEF" />
        </svg>
        <Icon v-else :icon="item.icon" :width="20" :height="20" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="block truncate text-kb-base font-medium leading-5 text-ink">{{ item.label }}</span>
        <!-- 描述是可读文字：D1 巡检暗色从 quaternary 提到 tertiary（概览页可读性提档） -->
        <span v-if="item.description" class="mt-0.5 block truncate text-kb-xs leading-4 text-ink-tertiary">
          {{ item.description }}
        </span>
      </span>

      <Icon
        v-if="item.caret"
        icon="ph:caret-down"
        :width="12"
        :height="12"
        class="shrink-0 text-ink-quaternary transition-colors duration-150 group-hover:text-ink-tertiary"
      />
    </button>
  </div>
</template>

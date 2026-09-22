<script setup lang="ts">
/** 组件，负责知识库侧栏Nav相关界面展示与交互（对齐语雀：单色图标、灰色选中底）。 */
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeSidebarNavItem } from "@/types/knowledge-sidebar"

const props = defineProps<{
  items: KnowledgeSidebarNavItem[]
  activeMenu: string | null
}>()

const getSidebarNavItemClass = (active: boolean) => {
  if (active) {
    return "group flex h-8 items-center gap-2.5 rounded-kb-md bg-grey-400 px-3 text-[14px] font-medium text-ink transition-colors duration-150 dark:bg-grey-500"
  }

  return "group flex h-8 items-center gap-2.5 rounded-kb-md px-3 text-[14px] text-ink transition-colors duration-150 hover:bg-grey-300 dark:hover:bg-grey-400"
}

const getIconClass = (active: boolean) => {
  // 对齐语雀桌面端：导航图标使用品牌绿，与文字颜色解耦
  return active
    ? "shrink-0 text-brand"
    : "shrink-0 text-brand/75 transition-colors duration-150 group-hover:text-brand"
}
</script>

<template>
  <div class="space-y-0.5">
    <RouterLink
      v-for="item in props.items"
      :key="item.key"
      :to="item.to"
      :class="getSidebarNavItemClass(props.activeMenu === item.key)"
    >
      <Icon
        :icon="item.icon"
        :width="16"
        :height="16"
        :class="getIconClass(props.activeMenu === item.key)"
      />
      <span class="flex-1 truncate">{{ item.label }}</span>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
/** 组件，负责分享统计网格相关界面展示与交互。 */
interface ShareStatItem {
  label: string
  value: string
  hint: string
}

defineProps<{
  items: ShareStatItem[]
}>()
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-3">
    <!-- 原 UCard + :ui 定制（root/body），替换为普通 div（样式等价） -->
    <div
      v-for="item in items"
      :key="item.label"
      class="rounded-kb-3xl border border-line bg-muted px-4 py-4"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] font-medium text-ink-quaternary">{{ item.label }}</p>
          <p class="mt-1 text-[20px] font-semibold text-ink">{{ item.value }}</p>
          <p class="mt-1 text-[11px] leading-5 text-ink-quaternary">{{ item.hint }}</p>
        </div>
        <el-tag disable-transitions>
          {{ item.label }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

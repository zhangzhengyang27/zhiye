<script setup lang="ts">
/** 头部组件，负责知识Page概览信息展示。 */
type KnowledgePageHeroStat = {
  key?: string
  label: string
  value: string | number
  active?: boolean
  clickable?: boolean
}

const props = defineProps<{
  badgeLabel: string
  badgeIcon?: string
  badgeClass: string
  title: string
  description: string
  stats: KnowledgePageHeroStat[]
}>()

const emit = defineEmits<{
  statClick: [item: KnowledgePageHeroStat]
}>()

const handleStatClick = (item: KnowledgePageHeroStat) => {
  if (!item.clickable) {
    return
  }

  emit("statClick", item)
}
</script>

<template>
  <section class="kb-section-shell kb-fade-in p-6">
    <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div class="min-w-0">
        <div
          class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm"
          :class="props.badgeClass"
        >
          <AppIcon v-if="props.badgeIcon" :name="props.badgeIcon" class="h-3.5 w-3.5" />
          {{ props.badgeLabel }}
        </div>
        <h1 class="mt-4 text-2xl font-bold tracking-tight text-ink">
          {{ props.title }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--kb-text-tertiary)]">
          {{ props.description }}
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="item in props.stats"
          :key="item.key || item.label"
          type="button"
          class="kb-stat-card text-left transition-all duration-200"
          :class="
            item.clickable
              ? item.active
                ? 'cursor-pointer border-[var(--kb-brand-lighter)] bg-[var(--kb-brand-ultra-light)] shadow-[0_14px_32px_rgba(0,185,107,0.12)]'
                : 'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--kb-brand-lighter)] hover:bg-surface'
              : 'cursor-default'
          "
          @click="handleStatClick(item)"
        >
          <p class="text-[11px] uppercase tracking-[0.18em] text-[var(--kb-text-quaternary)]">{{ item.label }}</p>
          <p class="mt-2 text-lg font-bold text-ink">{{ item.value }}</p>
        </button>
      </div>
    </div>
  </section>
</template>

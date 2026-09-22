<script setup lang="ts">
/** 卡片组件，负责文档界面上下文信息展示与局部操作。 */
defineProps<{
  documentTitle: string
  workspaceName: string
  modeLabel: string
  schemeLabel: string
  statusLabel: string
  saveStatusLabel?: string
}>()
</script>

<template>
  <div
    class="rounded-kb-3xl border border-line bg-[linear-gradient(180deg,var(--color-muted),var(--color-grey-200))] px-4 py-4"
  >
    <div class="flex flex-wrap items-center gap-2">
      <span class="kb-meta-chip">{{ workspaceName }}</span>
      <span class="kb-meta-chip">{{ modeLabel }}</span>
    </div>

    <p class="mt-2 line-clamp-2 text-sm font-semibold text-ink">
      {{ documentTitle }}
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="kb-soft-chip text-ink-secondary">
        {{ schemeLabel }}
      </span>
      <span class="kb-soft-chip text-ink-secondary">
        {{ statusLabel }}
      </span>
      <span v-if="saveStatusLabel" class="kb-soft-chip text-ink-tertiary">
        {{ saveStatusLabel }}
      </span>
    </div>
  </div>
</template>

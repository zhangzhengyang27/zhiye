<script setup lang="ts">
/**
 * 行组件：历史记录列表的单行（对齐语雀真机行结构）。
 *
 * 语雀行极简：版本名（如有）为主行文本，次行为 时间 + 状态标签 + 作者；
 * 无勾选框；行可点选中；行尾 hover 浮现 ⋯ 菜单（对比… / 删除该版本）。
 */
import { computed } from "vue"
import type { HistoryRowVm } from "./DocumentVersionsPanel.vue"

const props = defineProps<{
  row: HistoryRowVm
  selected: boolean
  deleting: boolean
  menuOpen: boolean
}>()

const emit = defineEmits<{
  select: []
  "toggle-menu": []
  compare: []
  delete: []
}>()

const rowStateClass = computed(() =>
  props.selected
    ? "bg-grey-300 text-ink dark:bg-grey-400"
    : "text-ink-secondary hover:bg-grey-200 dark:hover:bg-grey-400",
)
</script>

<template>
  <div
    role="radio"
    :aria-checked="selected"
    tabindex="0"
    class="group relative flex cursor-pointer items-start gap-2 rounded-kb-lg px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-lighter"
    :class="rowStateClass"
    @click="emit('select')"
    @keydown.enter.prevent="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <div class="min-w-0 flex-1">
      <p
        v-if="row.versionName"
        class="truncate text-[13px] font-medium leading-5 text-ink"
        :title="row.versionName"
      >
        {{ row.versionName }}
      </p>
      <div
        class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-ink-tertiary"
      >
        <span>{{ row.timeText }}</span>
        <span
          class="inline-flex items-center rounded-kb-sm bg-fill-muted px-1.5 py-0.5 text-[11px] leading-4 text-ink-tertiary"
          >{{ row.statusLabel }}</span
        >
        <span class="truncate">{{ row.author }}</span>
      </div>
    </div>

    <!-- 行尾 ⋯：仅版本行有（本地快照行不提供对比/删除） -->
    <div v-if="row.kind === 'version'" class="relative shrink-0" data-version-row-menu>
      <button
        type="button"
        class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary opacity-0 transition group-hover:opacity-100 hover:text-ink-secondary focus-visible:opacity-100"
        :class="menuOpen ? 'opacity-100' : ''"
        title="更多操作"
        :aria-label="`版本 ${row.timeText} 更多操作`"
        @click.stop="emit('toggle-menu')"
      >
        <UiIcon icon="ph:dots-three-bold" :width="13" :height="13" />
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-[calc(100%+4px)] z-30 w-32 rounded-kb-lg border border-line bg-surface p-1 shadow-[var(--kb-float-shadow)]"
        @click.stop
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-kb-md px-2.5 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted hover:text-ink"
          @click="emit('compare')"
        >
          <UiIcon
            icon="i-lucide-git-compare"
            :width="13"
            :height="13"
            class="shrink-0 text-ink-tertiary"
          />
          <span>对比…</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-kb-md px-2.5 py-1.5 text-left text-[13px] text-error transition hover:bg-muted"
          :disabled="deleting"
          @click="emit('delete')"
        >
          <UiIcon icon="ph:trash-simple" :width="13" :height="13" class="shrink-0" />
          <span>{{ deleting ? "删除中…" : "删除该版本" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

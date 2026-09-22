<script setup lang="ts">
/** 卡片组件，负责知识设置Visibility信息展示与局部操作。 */
import Icon from "@/components/common/UiIcon.vue"

type VisibilityOption = {
  value: "public" | "private"
  label: string
  icon: string
  description: string
}

const props = defineProps<{
  visibility: "public" | "private"
  visibilityOptions: readonly VisibilityOption[]
  canChangeVisibility: boolean
  updatingVisibility: boolean
}>()

const emit = defineEmits<{
  updateVisibility: [value: "public" | "private"]
}>()
</script>

<template>
  <div class="kb-section-card p-6">
    <div class="flex items-start gap-4">
      <span
        class="flex h-12 w-12 items-center justify-center rounded-kb-2xl bg-brand-faint text-brand"
      >
        <Icon icon="ph:shield-check" :width="22" :height="22" />
      </span>
      <div>
        <h2 class="text-lg font-semibold text-ink">访问与可见性</h2>
        <p class="mt-1 text-sm leading-6 text-ink-tertiary">
          控制谁能看见这个知识库，以及外部成员进入空间后的默认访问范围。
        </p>
      </div>
    </div>

    <div class="mt-6 grid gap-3">
      <button
        v-for="option in props.visibilityOptions"
        :key="option.value"
        type="button"
        class="flex items-start gap-4 rounded-kb-3xl border px-5 py-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
        :class="
          props.visibility === option.value
            ? 'border-brand-lighter bg-brand-faint shadow-[var(--kb-glow-brand-faint)]'
            : 'border-transparent bg-muted hover:border-line hover:bg-surface'
        "
        :disabled="!props.canChangeVisibility || props.updatingVisibility"
        @click="emit('updateVisibility', option.value)"
      >
        <Icon
          :icon="option.icon"
          :width="20"
          :height="20"
          :class="props.visibility === option.value ? 'text-brand' : 'text-ink-quaternary'"
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-sm font-semibold text-ink">{{ option.label }}</div>
            <span
              v-if="props.visibility === option.value"
              class="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-brand"
            >
              当前设置
            </span>
          </div>
          <div class="mt-2 text-sm leading-6 text-ink-tertiary">{{ option.description }}</div>
        </div>
      </button>
    </div>

    <div class="mt-5 rounded-kb-3xl bg-muted px-5 py-4 text-sm leading-6 text-ink-quaternary">
      <p class="font-medium text-ink-secondary">权限说明</p>
      <p class="mt-2">
        公开仅影响访问范围，不会自动开放编辑权限。建议在对外开放前先梳理成员角色、目录结构与敏感内容。
      </p>
    </div>

    <p v-if="!props.canChangeVisibility" class="mt-4 text-sm text-warning-hover">
      只有所有者可以修改可见性设置。
    </p>
  </div>
</template>

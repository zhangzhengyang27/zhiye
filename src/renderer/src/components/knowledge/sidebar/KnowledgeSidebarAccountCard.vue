<script setup lang="ts">
/** 卡片组件，负责知识库侧栏账号信息展示与局部操作。 */
import UiIcon from "@/components/common/UiIcon.vue"

interface AccountInfoItem {
  label: string
  value: string
}

const props = defineProps<{
  expanded: boolean
  currentUserLabel: string
  currentUserEmail: string
  currentUserEmailDetail: string
  currentUserRole: string
  currentUserAvatar: string
  currentUserInitials: string
  accountInfoItems: AccountInfoItem[]
}>()

const emit = defineEmits<{
  toggle: []
  "avatar-error": []
  "open-account": []
  logout: []
}>()
</script>

<template>
  <div class="border-t border-line px-4 py-3">
    <div class="overflow-hidden rounded-[10px] border border-line bg-surface">
      <button
        type="button"
        aria-label="当前账号"
        class="group w-full bg-surface px-4 py-3 text-left transition hover:bg-grey-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lighter"
        @click="emit('toggle')"
      >
        <div class="flex items-center gap-3">
          <div class="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-brand-faint">
            <img
              v-if="props.currentUserAvatar"
              :src="props.currentUserAvatar"
              :alt="props.currentUserLabel"
              class="h-full w-full object-cover"
              @error="emit('avatar-error')"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center bg-brand text-sm font-semibold tracking-wide text-white"
            >
              {{ props.currentUserInitials }}
            </div>
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ink">{{ props.currentUserLabel }}</p>
            <p class="mt-1 truncate text-xs text-ink-tertiary">{{ props.currentUserEmail }}</p>
            <p class="mt-1 text-[11px] text-ink-quaternary">{{ props.currentUserEmailDetail }}</p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-2">
            <AppBadge color="success" variant="soft" class="rounded-[6px] px-2 py-0.5 text-[11px] font-medium">
              {{ props.currentUserRole }}
            </AppBadge>
            <div
              class="flex h-7 w-7 items-center justify-center rounded-[6px] bg-grey-200 text-ink-tertiary transition group-hover:bg-brand-faint group-hover:text-brand"
            >
              <UiIcon
                icon="ph:caret-down"
                :width="14"
                :height="14"
                class="transition-transform duration-200"
                :class="props.expanded ? 'rotate-180' : 'rotate-0'"
              />
            </div>
          </div>
        </div>
      </button>

      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-1 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-1 opacity-0"
      >
        <div v-show="props.expanded" class="space-y-3 border-t border-line px-4 py-4">
          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="item in props.accountInfoItems"
              :key="item.label"
              class="rounded-[8px] border border-grey-200 bg-grey-100 px-3 py-2"
            >
              <p class="text-[11px] uppercase tracking-[0.16em] text-ink-quaternary">{{ item.label }}</p>
              <p class="mt-1 break-all text-sm font-medium text-ink-secondary">{{ item.value }}</p>
            </div>
          </div>

          <div
            class="flex items-start gap-2 rounded-[8px] border border-grey-200 bg-grey-100 px-3 py-2.5 text-xs text-ink-tertiary"
          >
            <UiIcon icon="ph:user-circle" :width="16" :height="16" class="mt-0.5 shrink-0 text-ink-quaternary" />
            <span>该账号会作为当前知识库的操作身份，用于编辑、协作和历史记录归属。</span>
          </div>

          <AppButton
            type="button"
            color="primary"
            variant="solid"
            class="w-full justify-center rounded-[8px] border-0 px-4 py-2.5 shadow-none transition duration-150 bg-brand text-white hover:bg-brand-hover"
            @click="emit('open-account')"
          >
            <template #leading>
              <UiIcon icon="ph:gear" :width="16" :height="16" />
            </template>
            进入账号设置
          </AppButton>

          <AppButton
            type="button"
            color="neutral"
            variant="outline"
            class="w-full justify-center rounded-[8px] px-4 py-2.5 shadow-none transition duration-150 border-line-input text-ink-secondary hover:border-brand hover:text-brand-hover"
            @click="emit('logout')"
          >
            <template #leading>
              <UiIcon icon="ph:sign-out" :width="16" :height="16" />
            </template>
            退出登录
          </AppButton>
        </div>
      </transition>
    </div>
  </div>
</template>

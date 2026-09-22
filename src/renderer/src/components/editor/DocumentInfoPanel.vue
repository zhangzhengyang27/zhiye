<script setup lang="ts">
/** 面板组件，负责文档信息的内容展示与交互操作。 */
import { computed, onBeforeUnmount, watch } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import { hasOpenDialog } from "@/composables/dialog-stack"
import DocumentSurfaceContextCard from "./DocumentSurfaceContextCard.vue"
import DocumentSidePanelTabs from "./DocumentSidePanelTabs.vue"
import DocumentInfoOverviewCard from "./info/DocumentInfoOverviewCard.vue"
import DocumentInfoQuickActionsCard from "./info/DocumentInfoQuickActionsCard.vue"
import type { DocumentInfoAction } from "./info/DocumentInfoQuickActionsCard.vue"

type DocumentSidePanelTab = "search" | "comments" | "versions" | "info" | "ai"

type OutlineItem = {
  id: string
  text: string
  depth: number
}

type CollaboratorItem = {
  id: string
  label: string
  role: string
  avatar?: string | null
}

type ShortcutItem = {
  id: string
  label: string
  keys: string[]
  description?: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    activeTab: "info"
    documentTitle: string
    workspaceName: string
    documentModeLabel: string
    documentSchemeLabel: string
    documentStatusLabel: string
    saveStatusLabel?: string
    outlineItems: OutlineItem[]
    collaborators: CollaboratorItem[]
    stats: Array<{ label: string; value: string }>
    favorite: boolean
    availableTabs?: DocumentSidePanelTab[]
    visibleActions?: DocumentInfoAction[]
    actionsBadgeLabel?: string | null
    shortcuts?: ShortcutItem[]
    /** 创建者 / 创建时间 / 更新时间等元信息行（对齐语雀信息面板） */
    meta?: Array<{ label: string; value: string }>
  }>(),
  {
    availableTabs: () => ["versions", "info"],
    visibleActions: () => ["copy-link", "open-share", "open-history", "toggle-favorite"],
    actionsBadgeLabel: null,
    saveStatusLabel: undefined,
    shortcuts: () => [],
    meta: () => [],
  }
)

const emit = defineEmits<{
  close: []
  "switch-tab": [tab: DocumentSidePanelTab]
  "jump-outline": [itemId: string]
  "copy-link": []
  "toggle-favorite": []
  "open-share": []
  "open-history": []
  "open-template-library": []
  "insert-emoji": []
  "enter-reading": []
}>()

/** 打开期间按 Esc 关闭（遮罩点击之外的第二关闭路径）；对话框压顶时让位 */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !props.open) return
  if (hasOpenDialog()) return
  emit("close")
}

watch(
  () => props.open,
  open => {
    if (open) {
      window.addEventListener("keydown", handleKeydown)
    } else {
      window.removeEventListener("keydown", handleKeydown)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
})

const quickActions = computed(() => {
  const actionMap: Array<{ id: DocumentInfoAction; label: string }> = [
    { id: "enter-reading", label: "进入阅读模式" },
    { id: "copy-link", label: "复制链接" },
    { id: "open-share", label: "打开分享" },
    { id: "open-history", label: "历史版本" },
    { id: "open-template-library", label: "模板库" },
    { id: "toggle-favorite", label: props.favorite ? "取消收藏" : "收藏文档" },
  ]

  return actionMap.filter(action => props.visibleActions.includes(action.id))
})

/**
 * 徽章配色（T4 评审 I-2 基线保真）：壳时代 AppBadge 的 toneClass bg-muted
 * （dark=grey-100→rgb(20,20,20)）压过本处调用点的 bg-grey-200（dark=#1f1f1f），
 * muted 为基线渲染真值；解散后冲突消失、grey-200 胜出导致暗底 +11/通道
 * （info-dark pixdiff 775 major）——故移除 bg-grey-200，底色交由校准段
 * .el-tag 基准（muted）承担。备选（暗色更可见）属产品决策，留待用户拍板。
 */
const quickActionsBadge = computed(() => {
  if (props.actionsBadgeLabel) {
    return {
      label: props.actionsBadgeLabel,
      className: "text-ink-tertiary",
    }
  }

  if (props.visibleActions.includes("toggle-favorite")) {
    return props.favorite
      ? {
          label: "已收藏",
          className: "bg-warning-bg text-warning-hover",
        }
      : {
          label: "未收藏",
          className: "text-ink-tertiary",
        }
  }

  return {
    label: "快捷操作",
    className: "text-ink-tertiary",
  }
})

const handleQuickAction = (action: DocumentInfoAction) => {
  if (action === "enter-reading") {
    emit("enter-reading")
    return
  }

  if (action === "copy-link") {
    emit("copy-link")
    return
  }

  if (action === "open-share") {
    emit("open-share")
    return
  }

  if (action === "open-history") {
    emit("open-history")
    return
  }

  if (action === "open-template-library") {
    emit("open-template-library")
    return
  }

  emit("toggle-favorite")
}
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-200"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-200"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="open"
      class="kb-panel-shell fixed inset-y-4 right-4 z-[var(--kb-z-side-panel)] flex w-[25rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden"
    >
      <div class="border-b border-line px-5 py-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div
              class="inline-flex items-center gap-2 rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-secondary"
            >
              文档信息
            </div>
            <h3 class="mt-3 text-[18px] font-semibold tracking-[-0.02em] text-ink">大纲与元信息</h3>
            <p class="mt-1 text-xs leading-5 text-ink-tertiary">在一处查看当前文档结构、协作成员和快捷操作。</p>
          </div>

          <el-button
            text
            aria-label="关闭信息面板"
            class="border border-line-input bg-surface text-ink-tertiary hover:border-brand-lighter hover:text-brand gap-1.5 px-3 py-1.5"
            @click="emit('close')"
            ><span class="truncate"><Icon icon="ph:x" :width="18" :height="18" /></span>
          </el-button>
        </div>

        <div class="mt-4">
          <DocumentSidePanelTabs
            :active-tab="activeTab"
            :tabs="availableTabs"
            @switch-tab="emit('switch-tab', $event)"
          />
        </div>

        <div class="mt-4">
          <DocumentSurfaceContextCard
            :document-title="documentTitle"
            :workspace-name="workspaceName"
            :mode-label="documentModeLabel"
            :scheme-label="documentSchemeLabel"
            :status-label="documentStatusLabel"
            :save-status-label="saveStatusLabel"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto bg-surface-soft px-4 py-4">
        <DocumentInfoQuickActionsCard
          v-if="quickActions.length > 0"
          :quick-actions="quickActions"
          :badge="quickActionsBadge"
          @trigger-action="handleQuickAction"
        />

        <DocumentInfoOverviewCard class="mt-4" :stats="stats" :meta="meta" />

        <section class="mt-4 rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-ink">内容大纲</p>
              <p class="mt-1 text-xs text-ink-quaternary">快速跳到对应标题附近。</p>
            </div>
            <span class="rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary">
              {{ outlineItems.length }} 个标题
            </span>
          </div>

          <div v-if="outlineItems.length === 0" class="mt-4 rounded-kb-2xl bg-muted px-4 py-6 text-center">
            <p class="text-sm font-medium text-ink-tertiary">还没有可用的大纲</p>
            <p class="mt-1 text-xs leading-5 text-ink-quaternary">插入 H1-H4 标题后，这里会自动生成结构。</p>
          </div>

          <div v-else class="mt-4 space-y-1.5">
            <button
              v-for="item in outlineItems"
              :key="item.id"
              type="button"
              class="flex h-7 w-full items-center gap-2 rounded-kb-sm px-2 text-left text-kb-sm text-ink-secondary transition-colors hover:bg-grey-200 hover:text-brand"
              :style="{ paddingLeft: `${12 + item.depth * 14}px` }"
              @click="emit('jump-outline', item.id)"
            >
              <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
              <span class="truncate">{{ item.text }}</span>
            </button>
          </div>
        </section>

        <section class="mt-4 rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-ink">协作成员</p>
              <p class="mt-1 text-xs text-ink-quaternary">当前工作区里最近会参与这篇文档的成员。</p>
            </div>
            <span class="rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary">
              {{ collaborators.length }} 人
            </span>
          </div>

          <div v-if="collaborators.length === 0" class="mt-4 rounded-kb-2xl bg-muted px-4 py-6 text-center">
            <p class="text-sm font-medium text-ink-tertiary">还没有协作成员信息</p>
          </div>

          <div v-else class="mt-4 space-y-2">
            <div
              v-for="member in collaborators"
              :key="member.id"
              class="flex items-center gap-3 rounded-kb-2xl bg-muted px-3 py-3"
            >
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted text-[12px] font-semibold text-ink-secondary"
              >
                <img v-if="member.avatar" :src="member.avatar" :alt="member.label" class="h-full w-full object-cover" />
                <span v-else>{{ member.label.slice(0, 1).toUpperCase() }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13px] font-medium text-ink">{{ member.label }}</p>
                <p class="mt-0.5 text-[11px] text-ink-tertiary">{{ member.role }}</p>
              </div>
            </div>
          </div>
        </section>

        <section
          v-if="shortcuts.length > 0"
          class="mt-4 rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-ink">快捷键</p>
              <p class="mt-1 text-xs text-ink-quaternary">把高频操作保持在稳定的按键路径里。</p>
            </div>
            <span class="rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary">
              {{ shortcuts.length }} 项
            </span>
          </div>

          <div class="mt-4 space-y-2">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.id"
              class="rounded-kb-2xl border border-line bg-muted px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[13px] font-medium text-ink">{{ shortcut.label }}</p>
                  <p v-if="shortcut.description" class="mt-1 text-[11px] leading-5 text-ink-tertiary">
                    {{ shortcut.description }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <span
                    v-for="key in shortcut.keys"
                    :key="key"
                    class="inline-flex items-center rounded-kb-lg border border-line-input bg-surface px-2 py-1 text-[11px] font-medium text-ink-tertiary"
                  >
                    {{ key }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>

  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="open" class="fixed inset-0 z-[var(--kb-z-side-panel-overlay)] bg-black/20" @click="emit('close')" />
  </Transition>
</template>

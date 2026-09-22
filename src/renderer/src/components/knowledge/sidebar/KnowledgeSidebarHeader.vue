<script setup lang="ts">
/** 头部组件，负责知识库侧栏标题、搜索入口与用户头像展示（对齐语雀桌面端布局）。 */
import { ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import yuqueLogo from "@/assets/yuque-logo.png"

defineProps<{
  /** 当前用户头像 URL；为空时展示首字母兜底 */
  avatar?: string
  /** 头像兜底展示的用户名 */
  userLabel?: string
  /** 是否有可新建内容的知识库上下文；有则「新建」展开菜单，无则回退为跳转行为 */
  hasActiveKb?: boolean
}>()

/** 新建菜单两段式的动作全集（对齐语雀：上段内容类型、下段流转入口）。 */
type SidebarCreateAction =
  "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"

const emit = defineEmits<{
  "open-account": []
  "open-search": []
  "open-create": []
  "avatar-error": []
  create: [action: SidebarCreateAction]
  import: [kind: "md" | "docx" | "lake" | "any"]
  /** 「+」菜单中的创建知识库（由父级打开创建对话框） */
  "create-kb": []
  /** 上段菜单直达：小记 / AI 帮你写（页面级导航由父级处理） */
  "open-notes": []
  "open-ai-writing": []
}>()

const createMenuOpen = ref(false)

const toggleCreateMenu = () => {
  createMenuOpen.value = !createMenuOpen.value
}

const handleCreateAction = (action: SidebarCreateAction) => {
  createMenuOpen.value = false
  emit("create", action)
}

const handleImportAction = (kind: "md" | "docx" | "lake" | "any") => {
  createMenuOpen.value = false
  emit("import", kind)
}

const handleCreateKb = () => {
  createMenuOpen.value = false
  emit("create-kb")
}

const handleOpenNotes = () => {
  createMenuOpen.value = false
  emit("open-notes")
}

const handleOpenAiWriting = () => {
  createMenuOpen.value = false
  emit("open-ai-writing")
}

const fallbackInitial = (label?: string) => {
  const source = (label ?? "").trim()
  if (!source) {
    return "U"
  }
  return source.slice(0, 1).toUpperCase()
}
</script>

<template>
  <div class="px-4 pb-2 pt-[var(--kb-column-header-top)]">
    <div class="flex items-center justify-between gap-2 py-1">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 rounded-kb-md py-1 pr-2 text-left transition duration-150 hover:bg-grey-200"
        @click="emit('open-account')"
      >
        <img :src="yuqueLogo" alt="语雀" class="h-6.5 w-6.5 shrink-0 rounded-kb-sm" />
        <span class="truncate text-[15px] font-semibold tracking-tight text-ink">语雀</span>
        <Icon icon="ph:caret-down" :width="12" :height="12" class="shrink-0 text-ink-tertiary" />
      </button>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted transition duration-150 hover:opacity-85"
          :title="userLabel"
          @click="emit('open-account')"
        >
          <img
            v-if="avatar"
            :src="avatar"
            :alt="userLabel"
            class="h-full w-full object-cover"
            @error="emit('avatar-error')"
          />
          <span v-else class="text-[13px] font-medium text-ink-secondary">{{
            fallbackInitial(userLabel)
          }}</span>
        </button>
      </div>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <button
        type="button"
        class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-kb-md bg-grey-300 px-2.5 text-left text-[13px] text-ink-tertiary transition duration-150 hover:bg-grey-400/50 hover:text-ink-secondary"
        @click="emit('open-search')"
      >
        <Icon icon="ph:magnifying-glass" :width="14" :height="14" class="shrink-0" />
        <span class="min-w-0 flex-1 truncate">搜索</span>
        <span class="shrink-0 text-[11px] text-ink-quaternary">⌘ J</span>
      </button>

      <div class="relative shrink-0">
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-kb-md bg-grey-300 text-ink-secondary transition duration-150 hover:bg-grey-400/50 hover:text-ink"
          title="新建"
          @click="toggleCreateMenu"
        >
          <Icon icon="ph:plus" :width="15" :height="15" />
        </button>

        <div v-if="createMenuOpen" class="fixed inset-0 z-10" @click="createMenuOpen = false" />
        <div
          v-if="createMenuOpen"
          class="absolute right-0 top-[calc(100%+8px)] z-20 w-45 rounded-kb-xl border border-line bg-surface p-1.5 shadow-[var(--kb-float-shadow)]"
        >
          <!-- 上段：内容类型（对齐语雀「新建」下拉第一组；小记为页面直达） -->
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleOpenNotes"
          >
            <Icon icon="ph:feather" :width="15" :height="15" class="text-ink-tertiary" />
            <span>小记</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('doc')"
          >
            <Icon icon="ph:file-plus" :width="15" :height="15" class="text-ink-tertiary" />
            <span class="flex-1">新建文档</span>
            <span class="shrink-0 text-[11px] text-ink-quaternary">⌘ N</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('sheet')"
          >
            <Icon icon="ph:grid-nine" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建表格</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('board')"
          >
            <Icon icon="ph:frame-corners" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建画板</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('datatable')"
          >
            <Icon icon="ph:table" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建数据表</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('mindmap')"
          >
            <Icon icon="ph:tree-structure" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建思维导图</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateKb"
          >
            <Icon icon="ph:book-open-text" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建知识库</span>
          </button>

          <div class="my-1 h-px bg-grey-200" />

          <!-- 下段：流转入口（对齐语雀「新建」下拉第二组） -->
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('template')"
          >
            <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />
            <span>从模板新建…</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleOpenAiWriting"
          >
            <Icon icon="ph:sparkle" :width="15" :height="15" class="text-ink-tertiary" />
            <span>AI 帮你写</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleImportAction('any')"
          >
            <Icon icon="ph:download-simple" :width="15" :height="15" class="text-ink-tertiary" />
            <span>导入…</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

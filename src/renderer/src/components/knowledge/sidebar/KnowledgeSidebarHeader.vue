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

const emit = defineEmits<{
  "open-account": []
  "open-search": []
  "open-create": []
  "avatar-error": []
  create: [action: "doc" | "folder" | "template"]
  import: [kind: "md" | "docx" | "lake"]
  /** 「+」菜单中的创建知识库（由父级打开创建对话框） */
  "create-kb": []
}>()

const createMenuOpen = ref(false)

const toggleCreateMenu = () => {
  createMenuOpen.value = !createMenuOpen.value
}

const handleCreateAction = (action: "doc" | "folder" | "template") => {
  createMenuOpen.value = false
  emit("create", action)
}

const handleImportAction = (kind: "md" | "docx" | "lake") => {
  createMenuOpen.value = false
  emit("import", kind)
}

const handleCreateKb = () => {
  createMenuOpen.value = false
  emit("create-kb")
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
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('doc')"
          >
            <Icon icon="ph:file-plus" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建文档</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('folder')"
          >
            <Icon icon="ph:folder-simple-plus" :width="15" :height="15" class="text-ink-tertiary" />
            <span>新建目录</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateAction('template')"
          >
            <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />
            <span>从模板创建</span>
          </button>
          <div class="my-1 h-px bg-grey-200" />
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleImportAction('md')"
          >
            <Icon icon="ph:file-md" :width="15" :height="15" class="text-ink-tertiary" />
            <span>导入 Markdown</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleImportAction('docx')"
          >
            <Icon icon="ph:file-doc" :width="15" :height="15" class="text-ink-tertiary" />
            <span>导入 Word</span>
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleImportAction('lake')"
          >
            <Icon icon="ph:file-code" :width="15" :height="15" class="text-ink-tertiary" />
            <span>导入语雀文档 (.lake)</span>
          </button>
          <div class="my-1 h-px bg-grey-200" />
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
            @click="handleCreateKb"
          >
            <Icon icon="ph:book-open-text" :width="15" :height="15" class="text-ink-tertiary" />
            <span>创建知识库</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

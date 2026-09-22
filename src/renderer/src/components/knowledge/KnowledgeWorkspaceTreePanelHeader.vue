<script setup lang="ts">
/**
 * 知识库工作区目录树面板头部：返回/库名/新建菜单 + 首页/目录切换 + 展开/刷新/设置。
 *
 * 新建菜单的开合状态内聚在此；布局需要强制关闭时（打开右键菜单、Escape）调用
 * closeCreateMenu()。新建动作与视图切换通过事件交还布局处理。
 */
import { onBeforeUnmount, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"

/** 目录列的视图模式：tree = 目录树；flat = 全部文档（跨目录平铺） */
export type TreeViewMode = "tree" | "flat"

const props = defineProps<{
  /** 知识库名称为空时展示兜底文案 */
  kbName?: string
  canEdit: boolean
  /** 当前是否在知识库首页路由（首页/目录 tab 的高亮态） */
  isHome: boolean
  /** 当前目录视图模式（切换菜单的勾选态） */
  viewMode: TreeViewMode
  /** 是否所有文件夹都已展开（保留 prop 以兼容，当前模板未使用） */
  allFoldersExpanded?: boolean
}>()

const emit = defineEmits<{
  "open-home": []
  "open-settings": []
  "view-mode-change": [mode: TreeViewMode]
  /** 展开/收起所有目录节点 */
  "toggle-all-folders": []
  create: [action: "doc" | "folder" | "template" | "link"]
  /** 导入本地文档（md / docx / lake） */
  import: [kind: "md" | "docx" | "lake"]
}>()

const router = useRouter()

const createMenuOpen = ref(false)
const switcherOpen = ref(false)

const selectViewMode = (mode: TreeViewMode) => {
  switcherOpen.value = false
  emit("view-mode-change", mode)
}

const closeSwitcher = (event: MouseEvent) => {
  const target = event.target instanceof HTMLElement ? event.target : null

  if (target?.closest("[data-tree-switcher], [data-tree-switcher-trigger]")) {
    return
  }

  switcherOpen.value = false
}

onMounted(() => window.addEventListener("click", closeSwitcher))
onBeforeUnmount(() => window.removeEventListener("click", closeSwitcher))

const toggleCreateMenu = () => {
  if (!props.canEdit) {
    return
  }

  createMenuOpen.value = !createMenuOpen.value
}

const handleCreateAction = (action: "doc" | "folder" | "template" | "link") => {
  createMenuOpen.value = false
  emit("create", action)
}

const handleImportAction = (kind: "md" | "docx" | "lake") => {
  createMenuOpen.value = false
  emit("import", kind)
}

const closeCreateMenu = () => {
  createMenuOpen.value = false
}

defineExpose({
  closeCreateMenu,
})
</script>

<template>
  <div class="relative border-b border-line px-3 pb-2 pt-[var(--kb-column-header-top)]">
    <div class="kb-window-drag-band" />
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
          title="返回"
          @click="router.back()"
        >
          <Icon icon="ph:caret-left" :width="15" :height="15" />
        </button>
        <Icon icon="ph:book-open-text" :width="18" :height="18" class="shrink-0 text-ink-tertiary" />
        <button
          type="button"
          class="min-w-0 flex-1 truncate text-left text-[16px] font-semibold text-ink transition hover:text-brand"
          :title="props.kbName || '知识库'"
          @click="emit('open-home')"
        >
          {{ props.kbName || "知识库" }}
        </button>
        <div v-if="props.canEdit" class="relative shrink-0">
          <button
            type="button"
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md bg-brand text-white transition hover:bg-brand-hover"
            title="新建内容"
            @click.stop="toggleCreateMenu"
          >
            <Icon icon="ph:plus" :width="15" :height="15" />
          </button>

          <div
            v-if="createMenuOpen"
            class="absolute right-0 top-[calc(100%+8px)] z-20 w-45 rounded-kb-lg border border-line bg-surface p-1.5 shadow-[var(--kb-float-shadow)]"
            @click.stop
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
              <span>新建分组</span>
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
              @click="handleCreateAction('template')"
            >
              <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />
              <span>从模板创建</span>
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
              @click="handleCreateAction('link')"
            >
              <Icon icon="ph:link-simple" :width="15" :height="15" class="text-ink-tertiary" />
              <span>添加链接</span>
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
          </div>
        </div>
      </div>
    </div>

    <!-- 对齐语雀：首页/目录为两条堆叠整行导航，选中灰底；动作收在行尾 -->
    <nav class="mt-2 space-y-0.5">
      <div class="flex items-center gap-1 rounded-kb-md" :class="props.isHome ? 'bg-grey-300' : ''">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 rounded-kb-md px-2.5 py-1.5 text-left text-[14px] font-medium transition"
          :class="props.isHome ? 'text-ink' : 'text-ink-secondary hover:bg-grey-200 hover:text-ink'"
          @click="emit('open-home')"
        >
          <Icon icon="ph:house-simple" :width="15" :height="15" class="shrink-0" />
          <span>首页</span>
        </button>
        <!-- 对齐语雀真机：行尾动作仅在该行激活时显示（首页行=设置⋯；目录行=展开/收起） -->
        <button
          v-if="props.isHome"
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
          title="知识库设置"
          @click="emit('open-settings')"
        >
          <Icon icon="ph:dots-three-bold" :width="14" :height="14" />
        </button>
      </div>
      <div class="relative flex items-center gap-1 rounded-kb-md" :class="props.isHome ? '' : 'bg-grey-300'">
        <button
          type="button"
          data-tree-switcher-trigger
          class="flex min-w-0 flex-1 items-center gap-2 rounded-kb-md px-2.5 py-1.5 text-left text-[14px] font-medium transition"
          :class="props.isHome ? 'text-ink-secondary hover:bg-grey-200 hover:text-ink' : 'text-ink hover:bg-grey-200'"
          title="切换目录视图"
          @click="switcherOpen = !switcherOpen"
        >
          <Icon
            :icon="props.viewMode === 'tree' ? 'ph:list-dashes' : 'ph:list-checks'"
            :width="15"
            :height="15"
            class="shrink-0"
          />
          <span>{{ props.viewMode === "tree" ? "目录" : "全部文档" }}</span>
        </button>
        <button
          v-if="!props.isHome"
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
          title="展开/收起所有目录"
          @click="emit('toggle-all-folders')"
        >
          <Icon icon="ph:caret-up-down" :width="14" :height="14" />
        </button>

        <!-- 视图切换菜单：目录 / 全部文档（对齐语雀，当前项打勾） -->
        <div
          v-if="switcherOpen"
          data-tree-switcher
          class="absolute left-0 top-[calc(100%+8px)] z-30 w-56 rounded-kb-lg border border-line bg-surface p-1.5 shadow-[var(--kb-float-shadow)]"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[14px] text-ink transition hover:bg-grey-200"
            @click="selectViewMode('tree')"
          >
            <Icon icon="ph:list-dashes" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
            <span class="flex-1">目录</span>
            <Icon v-if="props.viewMode === 'tree'" icon="ph:check-bold" :width="13" :height="13" class="text-ink" />
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[14px] text-ink transition hover:bg-grey-200"
            @click="selectViewMode('flat')"
          >
            <Icon icon="ph:list-checks" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
            <span class="flex-1">全部文档</span>
            <Icon v-if="props.viewMode === 'flat'" icon="ph:check-bold" :width="13" :height="13" class="text-ink" />
          </button>
        </div>
      </div>
    </nav>
  </div>
</template>

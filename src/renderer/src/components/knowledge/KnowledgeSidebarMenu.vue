<script setup lang="ts">
/** 组件，负责知识库侧栏菜单相关界面展示与交互（结构对齐语雀：导航/知识库分区/底部更多）。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeCommandPalette from "@/components/knowledge/KnowledgeCommandPalette.vue"
import KnowledgeCreateKbDialog from "@/components/knowledge/KnowledgeCreateKbDialog.vue"
import NotificationBell from "@/components/knowledge/NotificationBell.vue"
import KnowledgeSidebarHeader from "@/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
import KnowledgeSidebarKnowledgeBasesSection from "@/components/knowledge/sidebar/KnowledgeSidebarKnowledgeBasesSection.vue"
import KnowledgeSidebarNav from "@/components/knowledge/sidebar/KnowledgeSidebarNav.vue"
import { listKnowledgeBases, updateKnowledgeBaseSortOrder, type KnowledgeBaseItem } from "@/services/knowledge-base"
import { openSettingsWindow } from "@/services/desktop-bridge"
import { IN_APP_COMMAND_EVENT } from "@/composables/use-in-app-shortcuts"
import { useAuthStore } from "@/stores/auth"
import type { KnowledgeSidebarMenuKey, KnowledgeSidebarNavItem } from "@/types/knowledge-sidebar"

const LAST_ACTIVE_KB_STORAGE_KEY = "knowledge:last-active-kb-id"

const props = withDefaults(
  defineProps<{
    activeMenu?: KnowledgeSidebarMenuKey
    activeKbId?: string | null
    refreshKey?: number
  }>(),
  {
    activeMenu: undefined,
    activeKbId: null,
    refreshKey: 0,
  }
)

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const loadingKnowledgeBases = ref(false)
const knowledgeMenuExpanded = ref(true)
const loadError = ref("")
const avatarLoadFailed = ref(false)

const resolvedActiveMenu = computed<KnowledgeSidebarMenuKey | null>(() => {
  if (props.activeMenu) {
    return props.activeMenu
  }

  if (route.name === "knowledge-start") return "start"
  if (route.name === "knowledge-recent") return "recent"
  if (route.name === "knowledge-boards") return "boards"
  if (route.name === "knowledge-favorites") return "favorites"
  if (route.name === "knowledge-trash") return "trash"

  return null
})

const resolvedActiveKbId = computed(() => {
  if (props.activeKbId) {
    return props.activeKbId
  }

  if (typeof route.params.kbId === "string") {
    return route.params.kbId
  }

  return ""
})

const currentUserLabel = computed(() => {
  const user = authStore.user

  if (!user) {
    return "未登录"
  }

  return user.displayName || user.email || user.phone || "未命名用户"
})

const currentUserAvatar = computed(() => {
  if (avatarLoadFailed.value) {
    return ""
  }

  return authStore.user?.avatar || ""
})

const navItems = computed<KnowledgeSidebarNavItem[]>(() => [
  {
    key: "start",
    label: "开始",
    icon: "ph:rocket-launch",
    to: { name: "knowledge-start" },
  },
  {
    key: "ai-writing",
    label: "AI 写作",
    icon: "ph:sparkle",
    to: { name: "knowledge-ai-writing" },
  },
  {
    key: "notes",
    label: "小记",
    icon: "ph:feather",
    to: { name: "knowledge-notes" },
  },
  {
    key: "recent",
    label: "最近",
    icon: "ph:clock-counter-clockwise",
    to: { name: "knowledge-recent" },
  },
  {
    key: "boards",
    label: "画板",
    icon: "ph:palette",
    to: { name: "knowledge-boards" },
  },
  {
    key: "favorites",
    label: "收藏",
    icon: "ph:star",
    to: { name: "knowledge-favorites" },
  },
])

const toggleKnowledgeMenu = () => {
  knowledgeMenuExpanded.value = !knowledgeMenuExpanded.value
}

/** ⌘J 命令面板（对齐语雀桌面端搜索弹层），侧栏搜索按钮与快捷键共用 */
const commandPaletteOpen = ref(false)

const openSearch = async () => {
  commandPaletteOpen.value = true
}

const openCreateEntry = async () => {
  if (resolvedActiveKbId.value) {
    await router.push({
      name: "knowledge-workspace-home",
      params: {
        kbId: resolvedActiveKbId.value,
      },
    })
    return
  }

  await router.push({ name: "knowledge" })
}

/** 侧栏「新建」菜单：跳到目标库工作台首页并携带意图，由工作台布局壳消费（createNode/导入均为对话框，挂载后触发安全） */
const sidebarCreateIntents: Record<"doc" | "folder" | "template", string> = {
  doc: "create-doc",
  folder: "create-folder",
  template: "create-template",
}

/**
 * 目标知识库：优先当前激活库；在知识库列表页等无激活库的场景，
 * 回落到最近使用的库（对齐开始页快捷入口的取法），保证菜单项处处可用。
 */
const resolveCreateTargetKbId = () => {
  if (resolvedActiveKbId.value) {
    return resolvedActiveKbId.value
  }

  let stored = ""

  try {
    stored = window.localStorage.getItem(LAST_ACTIVE_KB_STORAGE_KEY) || ""
  } catch {
    stored = ""
  }

  if (stored && knowledgeBases.value.some(item => item.id === stored)) {
    return stored
  }

  return knowledgeBases.value[0]?.id ?? ""
}

const handleSidebarCreate = async (action: "doc" | "folder" | "template") => {
  const targetKbId = resolveCreateTargetKbId()

  if (!targetKbId) {
    await router.push({ name: "knowledge" })
    return
  }

  await router.push({
    name: "knowledge-workspace-home",
    params: { kbId: targetKbId },
    query: { intent: sidebarCreateIntents[action] },
  })
}

const handleSidebarImport = async (kind: "md" | "docx" | "lake") => {
  const targetKbId = resolveCreateTargetKbId()

  if (!targetKbId) {
    await router.push({ name: "knowledge" })
    return
  }

  await router.push({
    name: "knowledge-workspace-home",
    params: { kbId: targetKbId },
    query: { intent: `import-${kind}` },
  })
}

const handleOpenAccount = async () => {
  await router.push({ name: "account" })
}

/** 偏好设置入口（与菜单/托盘同一个函数：桌面端开独立窗口，Web 端开新窗口） */
const handleOpenSettings = () => {
  openSettingsWindow()
}

/** 应用内快捷键由 use-in-app-shortcuts 广播，落到本组件已有的命令面板/新建意图上 */
const handleInAppCommand = (event: Event) => {
  const command = (event as CustomEvent<string>).detail

  if (command === "open-search") {
    void openSearch()
  } else if (command === "create-doc") {
    void handleSidebarCreate("doc")
  }
}

onMounted(() => {
  window.addEventListener(IN_APP_COMMAND_EVENT, handleInAppCommand)
})

onBeforeUnmount(() => {
  window.removeEventListener(IN_APP_COMMAND_EVENT, handleInAppCommand)
})

/** 新建知识库（分区头「+」入口）：创建成功后刷新列表并进入新库工作台 */
const createKbDialogOpen = ref(false)

const handleKbCreated = async (kb: KnowledgeBaseItem) => {
  await loadKnowledgeBases()
  await router.push({ name: "knowledge-workspace-home", params: { kbId: kb.id } })
}

/** 更多分区展开态（对齐语雀：点击后内联展开回收站等条目） */
const moreExpanded = ref(false)

const goTrash = async () => {
  await router.push({ name: "knowledge-trash" })
}

const handleAvatarError = () => {
  avatarLoadFailed.value = true
}

const loadKnowledgeBases = async () => {
  loadingKnowledgeBases.value = true
  loadError.value = ""

  try {
    knowledgeBases.value = await listKnowledgeBases()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "加载知识库列表失败。"
  } finally {
    loadingKnowledgeBases.value = false
  }
}

const handleReorder = async (items: { id: string; sortOrder: number }[]) => {
  // 乐观更新：先更新本地列表
  const sorted = [...knowledgeBases.value].sort((a, b) => {
    const aOrder = items.find(i => i.id === a.id)?.sortOrder ?? 0
    const bOrder = items.find(i => i.id === b.id)?.sortOrder ?? 0
    return aOrder - bOrder
  })
  knowledgeBases.value = sorted

  try {
    await updateKnowledgeBaseSortOrder(items)
  } catch {
    // 失败则回滚
    await loadKnowledgeBases()
  }
}

watch(
  () => props.refreshKey,
  () => {
    void loadKnowledgeBases()
  },
  { immediate: true }
)

watch(
  () => authStore.user?.avatar,
  () => {
    avatarLoadFailed.value = false
  },
  { immediate: true }
)

watch(
  resolvedActiveKbId,
  kbId => {
    if (typeof window === "undefined" || !kbId) {
      return
    }

    try {
      window.localStorage.setItem(LAST_ACTIVE_KB_STORAGE_KEY, kbId)
      const matchedKb = knowledgeBases.value.find(item => item.id === kbId)

      if (matchedKb) {
        window.localStorage.setItem("knowledge:last-active-kb-name", matchedKb.name)
      }
    } catch {
      // ignore localStorage write errors
    }
  },
  { immediate: true }
)
</script>

<template>
  <aside
    class="kb-sidebar relative flex min-h-0 flex-col border-r border-line bg-grey-100 transition-colors duration-300"
  >
    <div class="kb-window-drag-band" />
    <KnowledgeSidebarHeader
      :avatar="currentUserAvatar"
      :user-label="currentUserLabel"
      :has-active-kb="!!resolvedActiveKbId"
      @open-account="handleOpenAccount"
      @open-search="openSearch"
      @open-create="openCreateEntry"
      @create="handleSidebarCreate"
      @import="handleSidebarImport"
      @create-kb="createKbDialogOpen = true"
      @avatar-error="handleAvatarError"
    />

    <div class="kb-sidebar-scroll min-h-0 flex-1 overflow-hidden px-3 pb-3">
      <div class="flex h-full min-h-0 flex-col">
        <KnowledgeSidebarNav :items="navItems" :active-menu="resolvedActiveMenu" />
        <KnowledgeSidebarKnowledgeBasesSection
          :expanded="knowledgeMenuExpanded"
          :knowledge-bases="knowledgeBases"
          :loading="loadingKnowledgeBases"
          :load-error="loadError"
          :active-kb-id="resolvedActiveKbId"
          @toggle="toggleKnowledgeMenu"
          @retry="loadKnowledgeBases"
          @reorder="handleReorder"
          @create="createKbDialogOpen = true"
        />
      </div>
    </div>

    <KnowledgeCreateKbDialog v-model:open="createKbDialogOpen" @created="handleKbCreated" />

    <div class="border-t border-line px-3 py-2">
      <div class="flex items-center">
        <div class="grid flex-1">
          <!-- 对齐语雀：更多为内联展开分区，条目带说明副标题 -->
          <button
            type="button"
            class="group flex h-8 w-full items-center gap-2.5 rounded-kb-md px-3 text-[14px] text-ink-secondary transition-colors duration-150 hover:bg-grey-200 hover:text-ink"
            :aria-expanded="moreExpanded"
            @click="moreExpanded = !moreExpanded"
          >
            <Icon
              icon="ph:dots-three-circle"
              :width="16"
              :height="16"
              class="shrink-0 text-ink-tertiary transition-colors duration-150 group-hover:text-ink-secondary"
            />
            <span class="flex-1 truncate text-left">更多</span>
            <Icon
              icon="ph:caret-down"
              :width="12"
              :height="12"
              class="shrink-0 text-ink-quaternary transition-transform duration-150"
              :class="moreExpanded ? 'rotate-180' : ''"
            />
          </button>
        </div>
        <!-- 通知入口从侧栏头部移至此处（语雀头部无铃铛），保留未读角标与面板 -->
        <NotificationBell class="ml-1 shrink-0" />
      </div>

      <div v-if="moreExpanded" class="mt-1 space-y-0.5">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-kb-md px-3 py-1.5 text-left transition hover:bg-grey-200"
          @click="goTrash"
        >
          <Icon icon="ph:trash-simple" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
          <span class="min-w-0">
            <span class="block truncate text-[13px] leading-5 text-ink-secondary">回收站</span>
            <span class="block truncate text-[11px] leading-4 text-ink-quaternary">找回删除的文档与内容</span>
          </span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2.5 rounded-kb-md px-3 py-1.5 text-left transition hover:bg-grey-200"
          @click="handleOpenSettings"
        >
          <Icon icon="ph:gear" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
          <span class="min-w-0">
            <span class="block truncate text-[13px] leading-5 text-ink-secondary">偏好设置</span>
            <span class="block truncate text-[11px] leading-4 text-ink-quaternary">主题、快捷键与代理</span>
          </span>
        </button>
      </div>
    </div>

    <KnowledgeCommandPalette v-model:open="commandPaletteOpen" :kb-id="resolvedActiveKbId" />
  </aside>
</template>

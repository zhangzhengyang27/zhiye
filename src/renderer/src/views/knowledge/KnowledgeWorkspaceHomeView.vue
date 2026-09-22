<script setup lang="ts">
/**
 * 页面组件，负责知识库工作区首页展示与交互流程。
 *
 * 结构 1:1 对齐语雀桌面端知识库首页：
 * 浅灰页面上一张白色圆角卡片 → 标题行（大图标 + KB 名 + 收藏/分享/⋯）→
 * 大数字统计 + 创建者头像 → 目录式点线列表（文件夹行无点线，文档行「标题 ······ 时间」）。
 */
import { computed, inject, nextTick, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import { deleteKnowledgeBase, updateKnowledgeBase } from "@/services/knowledge-base"
import {
  addKnowledgeBaseFavorite,
  checkKnowledgeBaseFavorite,
  removeKnowledgeBaseFavorite,
} from "@/services/knowledge-favorites"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { resolveWebBaseUrl } from "@/services/desktop-bridge"
import { formatNumber, formatShortDate } from "@/utils/date-format"
import { knowledgeWorkspaceContextKey, type KnowledgeWorkspaceContext } from "./workspace-context"

type OutlineRow = {
  id: string
  title: string
  editorType?: string
  updatedAt: string
  depth: number
  isFolder: boolean
  hasChildren: boolean
}

const router = useRouter()
const workspaceContext = inject(knowledgeWorkspaceContextKey)

if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

const expandedFolderIds = ref<string[]>([])
const favoriteToast = ref("")
const kbFavorited = ref(false)
const togglingFavorite = ref(false)

const canEdit = computed(() => workspaceContext.permissions.value?.canEdit ?? false)
const canManage = computed(() => workspaceContext.permissions.value?.canManage ?? false)
const workspaceName = computed(() => workspaceContext.knowledgeBase.value?.name || "未命名知识库")
const workspaceStats = computed(() => workspaceContext.knowledgeBase.value?.stats)
const creatorName = computed(() => workspaceContext.knowledgeBase.value?.creator?.displayName || "")
const creatorAvatar = computed(() => workspaceContext.knowledgeBase.value?.creator?.avatar || "")

/**
 * 构建目录式行序列：顶层默认折叠，点击文件夹行内展开，子级行缩进。
 */
const outlineRows = computed<OutlineRow[]>(() => {
  const rows: OutlineRow[] = []

  const walk = (nodes: KnowledgeWorkspaceContext["treeNodes"]["value"], depth: number) => {
    nodes.forEach((node) => {
      const isFolder = node.type === "folder"
      const hasChildren = node.children.length > 0

      rows.push({
        id: node.id,
        title: node.title,
        editorType: node.editorType,
        updatedAt: node.updatedAt,
        depth,
        isFolder,
        hasChildren,
      })

      if (isFolder && hasChildren && expandedFolderIds.value.includes(node.id)) {
        walk(node.children, depth + 1)
      }
    })
  }

  walk(workspaceContext.treeNodes.value, 0)

  return rows
})

const countSummary = computed(() => {
  let folder = 0
  let doc = 0

  const walk = (nodes: KnowledgeWorkspaceContext["treeNodes"]["value"]) => {
    nodes.forEach((node) => {
      if (node.type === "folder") {
        folder += 1
      } else if (node.type === "doc") {
        // 只统计文档节点，与后端 stats.docCount 同口径（template 等其他类型不计）
        doc += 1
      }

      if (node.children.length > 0) {
        walk(node.children)
      }
    })
  }

  walk(workspaceContext.treeNodes.value)

  return { doc, folder }
})

const toggleFolder = (row: OutlineRow) => {
  if (!row.isFolder || !row.hasChildren) {
    return
  }

  expandedFolderIds.value = expandedFolderIds.value.includes(row.id)
    ? expandedFolderIds.value.filter((id) => id !== row.id)
    : [...expandedFolderIds.value, row.id]
}

const openRow = (row: OutlineRow) => {
  if (row.isFolder) {
    toggleFolder(row)
    return
  }

  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: workspaceContext.kbId.value,
      docId: row.id,
      editorType: row.editorType,
    }),
  )
}

const showToastThenClear = (message: string) => {
  favoriteToast.value = message

  window.setTimeout(() => {
    favoriteToast.value = ""
  }, 2400)
}

const syncFavoriteState = async () => {
  try {
    const result = await checkKnowledgeBaseFavorite(workspaceContext.kbId.value)
    kbFavorited.value = result.favorited
  } catch {
    kbFavorited.value = false
  }
}

const handleFavorite = async () => {
  if (togglingFavorite.value) {
    return
  }

  togglingFavorite.value = true

  try {
    if (kbFavorited.value) {
      await removeKnowledgeBaseFavorite(workspaceContext.kbId.value)
      kbFavorited.value = false
      showToastThenClear("已取消收藏知识库。")
    } else {
      await addKnowledgeBaseFavorite(workspaceContext.kbId.value)
      kbFavorited.value = true
      showToastThenClear("已收藏知识库，可在「收藏」页回顾。")
    }
  } catch (error) {
    showToastThenClear(error instanceof Error ? error.message : "收藏操作失败，请稍后重试。")
  } finally {
    togglingFavorite.value = false
  }
}

watch(
  [() => workspaceContext.kbId.value, workspaceName],
  ([kbId, name]) => {
    void syncFavoriteState()

    if (kbId && name && name !== "未命名知识库") {
      window.localStorage.setItem("knowledge:last-active-kb-name", name)
    }
  },
  { immediate: true },
)

const handleShare = async () => {
  // 桌面端 location.href 是 app://bundle/... ，分享出去对收件人无效
  const link = `${resolveWebBaseUrl()}${
    router.resolve({
      name: "knowledge-workspace-home",
      params: { kbId: workspaceContext.kbId.value },
    }).href
  }`

  try {
    await navigator.clipboard.writeText(link)
    showToastThenClear("知识库链接已复制，快分享给协作者吧。")
  } catch {
    showToastThenClear("复制失败，请手动复制地址栏链接。")
  }
}

const openSettings = () => {
  // 对齐语雀：更多设置在新窗口打开**只含设置功能**的独立窗口（无工作台外壳）
  const path = `/kb-settings/${workspaceContext.kbId.value}`
  const desktopOpener = window.xiaoyeDesktop?.openDocumentInNewWindow

  if (desktopOpener) {
    desktopOpener(path)
    return
  }

  const opened = window.open(resolveWebBaseUrl() + path, "_blank")
  if (!opened) {
    router.push({
      name: "knowledge-settings",
      params: { kbId: workspaceContext.kbId.value },
    })
  }
}

// ==================== ⋯ 菜单命令分发（重命名 / 更多设置 / 删除） ====================
const handleMoreCommand = (command: string) => {
  if (command === "rename") {
    if (!canEdit.value) {
      return
    }
    startRename()
    return
  }

  if (command === "settings") {
    openSettings()
    return
  }

  if (command === "delete") {
    if (!canManage.value) {
      return
    }
    deleteDialogOpen.value = true
  }
}

// ==================== 重命名：标题行内切输入框，Enter/失焦提交、Esc 取消 ====================
const renameMode = ref(false)
const renameBusy = ref(false)
const renameValue = ref("")
const renameInputRef = ref<HTMLInputElement | null>(null)

const startRename = () => {
  renameValue.value = workspaceContext.knowledgeBase.value?.name ?? ""
  renameMode.value = true
  void nextTick(() => {
    renameInputRef.value?.focus()
  })
}

const handleRenameKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault()
    void submitRename()
  } else if (event.key === "Escape") {
    event.preventDefault()
    renameMode.value = false
  }
}

const submitRename = async () => {
  if (!renameMode.value || renameBusy.value) {
    return
  }

  const name = renameValue.value.trim()

  // 名称为空或未变化直接退出编辑态，不打请求
  if (!name || name === workspaceName.value) {
    renameMode.value = false
    return
  }

  renameBusy.value = true

  try {
    const updated = await updateKnowledgeBase(workspaceContext.kbId.value, { name })
    // 同步上下文里的知识库对象，头部与侧栏展示即时跟随
    if (workspaceContext.knowledgeBase.value) {
      workspaceContext.knowledgeBase.value = { ...workspaceContext.knowledgeBase.value, ...updated }
    }
    showToastThenClear("知识库名称已更新。")
    renameMode.value = false
  } catch (error) {
    showToastThenClear(error instanceof Error ? error.message : "重命名失败，请稍后重试。")
  } finally {
    renameBusy.value = false
  }
}

// ==================== 删除知识库：确认弹层走 ConfirmDialog（受控 loading） ====================
const deleteDialogOpen = ref(false)
const deleteBusy = ref(false)

const confirmDeleteKb = async () => {
  if (deleteBusy.value) {
    return
  }

  deleteBusy.value = true

  try {
    await deleteKnowledgeBase(workspaceContext.kbId.value)
    deleteDialogOpen.value = false
    // 库已删除，当前工作区无处可驻留，回知识库列表
    router.push({ name: "knowledge" })
  } catch (error) {
    deleteDialogOpen.value = false
    showToastThenClear(error instanceof Error ? error.message : "删除知识库失败，请稍后重试。")
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <!-- 对齐语雀：浅灰页面上浮一张白色圆角卡片，正文内容都在卡片内 -->
  <div class="h-full min-h-0 overflow-y-auto bg-grey-200 p-4">
    <div class="min-h-[calc(100%-0px)] rounded-kb-xl bg-surface px-10 pb-12 pt-9">
      <section class="flex items-start justify-between gap-6">
        <div class="flex min-w-0 items-center gap-4">
          <span
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-kb-lg bg-[var(--kb-blue-50)] text-[var(--kb-blue-500)]"
          >
            <Icon icon="ph:book-open-text" :width="24" :height="24" />
          </span>
          <input
            v-if="renameMode"
            ref="renameInputRef"
            v-model="renameValue"
            type="text"
            class="h-10 w-[360px] max-w-full rounded-kb-md border border-info bg-surface px-3 text-[22px] font-semibold text-ink outline-none! transition disabled:opacity-55"
            :disabled="renameBusy"
            aria-label="重命名知识库"
            @keydown="handleRenameKeydown"
            @blur="submitRename"
          />
          <h1 v-else class="min-w-0 truncate text-[26px] font-semibold leading-tight text-ink">
            {{ workspaceName }}
          </h1>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-kb-sm border bg-surface px-3 text-[13px] transition"
            :class="
              kbFavorited
                ? 'border-warning-light bg-warning-bg text-warning'
                : 'border-line text-ink-secondary hover:border-brand-lighter hover:text-brand'
            "
            :title="kbFavorited ? '取消收藏知识库' : '收藏知识库'"
            @click="handleFavorite"
          >
            <Icon :icon="kbFavorited ? 'ph:star-fill' : 'ph:star'" :width="13" :height="13" />
            {{ kbFavorited ? "已收藏" : "收藏" }}
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-kb-sm border border-line bg-surface px-3 text-[13px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
            title="分享知识库"
            @click="handleShare"
          >
            <Icon icon="ph:share-fat" :width="13" :height="13" />
            分享
          </button>
          <el-dropdown trigger="click" popper-class="kb-kb-more-menu" @command="handleMoreCommand">
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-kb-sm border border-line bg-surface text-ink-tertiary transition hover:text-ink"
              title="更多"
              @click.stop
            >
              <Icon icon="ph:dots-three-bold" :width="14" :height="14" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="canEdit" command="rename">
                  <span class="inline-flex items-center gap-2.5">
                    <Icon icon="ph:pencil-simple" :width="15" :height="15" />
                    重命名
                  </span>
                </el-dropdown-item>
                <el-dropdown-item command="settings">
                  <span class="inline-flex items-center gap-2.5">
                    <Icon icon="ph:gear" :width="15" :height="15" />
                    更多设置
                  </span>
                </el-dropdown-item>
                <el-dropdown-item v-if="canManage" command="delete" class="kb-danger">
                  <span class="inline-flex items-center gap-2.5">
                    <Icon icon="ph:trash" :width="15" :height="15" />
                    删除
                  </span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </section>

      <div class="mt-3 flex flex-wrap items-center gap-5 pl-16">
        <span class="inline-flex items-baseline gap-1.5">
          <span class="text-[20px] font-semibold leading-none text-ink">{{
            formatNumber(countSummary.doc)
          }}</span>
          <span class="text-[13px] text-ink-tertiary">文档</span>
        </span>
        <span
          v-if="workspaceStats"
          class="inline-flex items-baseline gap-1.5"
          title="按正文纯文本字数统计"
        >
          <span class="text-[20px] font-semibold leading-none text-ink">{{
            formatNumber(workspaceStats.wordCount)
          }}</span>
          <span class="text-[13px] text-ink-tertiary">字</span>
          <Icon icon="ph:info" :width="13" :height="13" class="self-center text-ink-quaternary" />
        </span>
      </div>

      <div v-if="creatorAvatar || creatorName" class="mt-4 pl-16" :title="creatorName">
        <img
          v-if="creatorAvatar"
          :src="creatorAvatar"
          :alt="creatorName"
          class="h-8 w-8 rounded-full object-cover"
        />
        <span
          v-else
          class="flex h-8 w-8 items-center justify-center rounded-full bg-fill-muted text-[12px] font-medium text-ink-secondary dark:text-ink"
        >
          {{ creatorName.slice(0, 1).toUpperCase() }}
        </span>
      </div>

      <section class="mt-12">
        <div
          v-if="outlineRows.length === 0"
          class="flex flex-col items-center justify-center px-6 py-14 text-center"
        >
          <Icon icon="ph:files" :width="36" :height="36" class="text-ink-quaternary" />
          <p class="mt-3 text-kb-base font-medium text-ink-secondary">当前知识库还没有内容</p>
          <p class="mt-1.5 max-w-sm text-kb-xs leading-5 text-ink-tertiary">
            {{
              canEdit
                ? "从左侧目录列的「+」新建第一篇文档或分组。"
                : "待成员创建内容后可在这里浏览。"
            }}
          </p>
        </div>

        <ul v-else class="space-y-0.5">
          <li v-for="row in outlineRows" :key="row.id">
            <button
              type="button"
              class="group flex h-11 w-full items-center gap-2 rounded-kb-md px-2 text-left transition-colors duration-150 hover:bg-grey-100"
              :style="{ paddingLeft: `${8 + row.depth * 20}px` }"
              @click="openRow(row)"
            >
              <span class="flex h-4 w-4 shrink-0 items-center justify-center text-ink-tertiary">
                <Icon
                  v-if="row.isFolder && row.hasChildren"
                  :icon="expandedFolderIds.includes(row.id) ? 'ph:caret-down' : 'ph:caret-right'"
                  :width="14"
                  :height="14"
                />
              </span>

              <span
                class="shrink-0 text-[16px] text-ink transition-colors duration-150 group-hover:text-brand"
              >
                {{ row.title }}
              </span>

              <span
                v-if="!row.isFolder"
                class="mx-2 min-w-3 flex-1 border-b border-dashed border-line group-hover:border-grey-400"
              />

              <span
                v-if="!row.isFolder"
                class="shrink-0 text-[13px] tabular-nums text-ink-tertiary"
              >
                {{ formatShortDate(row.updatedAt) }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <ConfirmDialog
      :open="deleteDialogOpen"
      title="删除知识库"
      message="确认删除该知识库吗？库内全部文档与数据将被清除，此操作不可恢复。"
      danger
      confirm-text="删除知识库"
      :loading="deleteBusy ? true : null"
      @update:open="(value) => !value && (deleteDialogOpen = false)"
      @confirm="confirmDeleteKb"
    />

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="translate-y-2 opacity-0"
      >
        <div
          v-if="favoriteToast"
          class="fixed bottom-8 left-1/2 z-[var(--kb-z-toast)] -translate-x-1/2 rounded-kb-lg border border-line bg-surface px-4 py-2.5 text-kb-sm text-ink shadow-[var(--kb-float-shadow)]"
        >
          {{ favoriteToast }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* ⋯ 菜单（kb-kb-more-menu）：对齐语雀详情页下拉——项高 40px、图标文字 13px、
   删除危险项红字且 hover 走 danger 底；popper 几何/圆角/阴影由校准层 dropdown 段承担 */
.kb-kb-more-menu .el-dropdown-menu__item {
  height: 40px;
  padding: 0 16px;
  font-size: 13px;
}

.kb-kb-more-menu .el-dropdown-menu__item.kb-danger {
  color: var(--kb-error);
}

.kb-kb-more-menu .el-dropdown-menu__item.kb-danger:not(.is-disabled):hover,
.kb-kb-more-menu .el-dropdown-menu__item.kb-danger:not(.is-disabled):focus {
  color: var(--kb-error);
  background-color: var(--kb-error-bg);
}
</style>

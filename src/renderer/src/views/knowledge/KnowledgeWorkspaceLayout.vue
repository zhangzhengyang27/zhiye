<!-- 组件说明：KnowledgeWorkspaceLayout 组件，负责页面展示与交互逻辑。 -->
<script setup lang="ts">
/** 页面布局组件，负责编排知识库工作区的上下文、骨架与路由承载。 */
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
} from "vue"
import { RouterView, useRoute, useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeInlineTitleInput from "@/components/knowledge/KnowledgeInlineTitleInput.vue"
import KnowledgeTreeBranch from "@/components/knowledge/KnowledgeTreeBranch.vue"
import KnowledgeTreeNodeMenu from "@/components/knowledge/KnowledgeTreeNodeMenu.vue"
import {
  type TreeNodeMenuPayload,
  type TreeNodeMenuState,
} from "@/components/knowledge/tree-node-menu"
import KnowledgeWorkspaceTreePanelHeader, {
  type TreeViewMode,
} from "@/components/knowledge/KnowledgeWorkspaceTreePanelHeader.vue"
import KnowledgeMoveNodeDialog from "@/components/knowledge/KnowledgeMoveNodeDialog.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { importDocxFile, importLakeFile, importMarkdownFile } from "@/services/document-import"
import KnowledgeAddLinkDialog from "@/components/knowledge/KnowledgeAddLinkDialog.vue"
import { createKnowledgeDocument } from "@/services/knowledge-documents"
import { useTreeDrag } from "@/components/knowledge/use-tree-drag"
import {
  findTreeNode,
  collectFolderIds,
  collectFolderIdsUpToDepth,
} from "@/components/knowledge/tree-utils"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { knowledgeWorkspaceContextKey, type KnowledgeWorkspaceContext } from "./workspace-context"
import { useTreePanelResize } from "./use-tree-panel-resize"
import { useWorkspacePersistence } from "./use-workspace-persistence"
import { useTreeFocus } from "./use-tree-focus"
import { useWorkspaceLoader } from "./use-workspace-loader"
import { useTreeNodeActions } from "./use-tree-node-actions"

const TemplateSelectDialog = defineAsyncComponent(
  () => import("@/components/knowledge/TemplateSelectDialog.vue"),
)
const KnowledgeDocCreateDialog = defineAsyncComponent(
  () => import("@/components/knowledge/KnowledgeDocCreateDialog.vue"),
)
const ConfirmDialog = defineAsyncComponent(() => import("@/components/common/ConfirmDialog.vue"))

const route = useRoute()
const router = useRouter()

/**
 * 工作区主状态负责承载知识库信息、目录树、拖拽上下文和右键菜单交互。
 * 这些引用会被树渲染、路由联动和创建/移动节点流程共同依赖。
 */
const treeNodes = ref<KnowledgeDocumentTreeNode[]>([])
const workspaceLayoutRef = ref<HTMLElement | null>(null)
const treePanelScrollRef = ref<HTMLElement | null>(null)
const expandedFolderIds = ref<string[]>([])
const reorderingTree = ref(false)
const treeNodeMenu = ref<TreeNodeMenuState | null>(null)
const treeNodeMenuComponent = ref<InstanceType<typeof KnowledgeTreeNodeMenu> | null>(null)

const {
  focusedNodeId,
  clearTreeTypeahead,
  focusTreeNode,
  getFocusedTreeNode,
  ensureNodeAncestorsExpanded,
  ensureFocusedNode,
  getTreeNodeRowElement,
  isTreeTypeaheadActive,
  handleTreeTypeahead,
  handleTreeNavigationShortcut,
} = useTreeFocus({
  treeNodes,
  expandedFolderIds,
  isMenuOpen: () => Boolean(treeNodeMenu.value),
  toggleFolder: (id) => toggleFolder(id),
  openDoc: (docId, editorType) => openDoc(docId, editorType),
})

const { showToastMessage } = useTransientToast()

const kbId = computed(() => {
  if (typeof route.params.kbId === "string") {
    return route.params.kbId
  }

  return ""
})

const activeDocId = computed(() => {
  if (route.name !== "knowledge-doc-editor" && route.name !== "knowledge-board-editor") {
    return null
  }

  if (typeof route.params.docId === "string") {
    return route.params.docId
  }

  return null
})

const { hasStoredExpandedFolderIds } = useWorkspacePersistence({
  kbId,
  expandedFolderIds,
  focusedNodeId,
})

const {
  resizingTreePanel,
  workspaceGridStyle: baseWorkspaceGridStyle,
  startTreePanelResize,
} = useTreePanelResize({
  kbId,
  layoutRef: workspaceLayoutRef,
})

const workspaceGridStyle = computed(() => {
  if (treePanelCollapsed.value) {
    return {
      gridTemplateColumns: "0px 0px minmax(0, 1fr)",
    }
  }

  return baseWorkspaceGridStyle.value
})

const {
  knowledgeBase,
  permissions,
  loadingTree,
  errorMessage,
  resetWorkspaceState,
  refreshTree,
  refreshPermissions,
  refreshWorkspace,
} = useWorkspaceLoader({
  kbId,
  treeNodes,
  expandedFolderIds,
  hasStoredExpandedFolderIds,
  focusedNodeId,
  ensureNodeAncestorsExpanded,
  ensureFocusedNode,
  showToastMessage,
})

const canEdit = computed(() => permissions.value?.canEdit ?? false)
const isWorkspaceHomeRoute = computed(() => route.name === "knowledge-workspace-home")

// ==================== 默认展开级别（#16，KB 偏好 settings.defaultExpandLevel） ====================
// 从未持久化过展开态的库，按偏好级别初始化展开目录（根为 1 级，展开深度 < level）；
// 缺省/非法时不动 loader 的「全展开」兜底，用户手动改过（有存档）后也不再干预
watch([knowledgeBase, treeNodes, hasStoredExpandedFolderIds], () => {
  if (hasStoredExpandedFolderIds.value) {
    return
  }

  const level = knowledgeBase.value?.settings?.defaultExpandLevel
  if (typeof level !== "number" || !Number.isFinite(level) || level <= 0) {
    return
  }

  expandedFolderIds.value = collectFolderIdsUpToDepth(treeNodes.value, level)
})

const treePanelHeaderRef = ref<InstanceType<typeof KnowledgeWorkspaceTreePanelHeader> | null>(null)
/** 目录栏收起态与视图模式（目录树 / 全部文档），对齐语雀目录列的切换与收起 */
const treePanelCollapsed = ref(false)
const treeViewMode = ref<TreeViewMode>("tree")
const flatDocRows = computed(() => {
  const docs: KnowledgeDocumentTreeNode[] = []

  const walk = (nodes: KnowledgeDocumentTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.type !== "folder") {
        docs.push(node)
      }

      if (node.children.length > 0) {
        walk(node.children)
      }
    })
  }

  walk(treeNodes.value)

  return docs
})

const treeDragDisabled = computed(() => !canEdit.value || loadingTree.value || reorderingTree.value)

const {
  treeDropTarget,
  draggingNodeId,
  registerTreeRow,
  unregisterTreeRow,
  beginDrag,
  resetTreeDragState,
  isDescendantNode,
} = useTreeDrag({
  kbId,
  treeNodes,
  expandedFolderIds,
  scrollRef: treePanelScrollRef,
  disabled: () => treeDragDisabled.value,
  reordering: reorderingTree,
  refreshTree,
  ensureFocusedNode,
})

const openNodeMenu = (payload: TreeNodeMenuPayload) => {
  focusTreeNode(payload.node)
  closeRootCreateMenu()
  treeNodeMenuComponent.value?.open(payload)
}

const closeNodeMenu = () => {
  treeNodeMenuComponent.value?.close()
}

const openNodeMenuByFocusedNode = (node: KnowledgeDocumentTreeNode) => {
  const rowElement = getTreeNodeRowElement(node.id)

  if (!rowElement) {
    const centerX = typeof window === "undefined" ? 320 : window.innerWidth / 2
    const centerY = typeof window === "undefined" ? 240 : window.innerHeight / 2

    openNodeMenu({
      node,
      x: centerX,
      y: centerY,
      mode: "actions",
    })
    return
  }

  const rect = rowElement.getBoundingClientRect()

  openNodeMenu({
    node,
    x: rect.right + 6,
    y: rect.top + rect.height - 4,
    mode: "actions",
  })
}

const toggleFolder = (id: string) => {
  const isExpanded = expandedFolderIds.value.includes(id)

  if (isExpanded) {
    expandedFolderIds.value = expandedFolderIds.value.filter((item) => item !== id)

    const currentFocusedId = focusedNodeId.value

    if (currentFocusedId && currentFocusedId !== id && isDescendantNode(id, currentFocusedId)) {
      focusedNodeId.value = id
    }

    return
  }

  expandedFolderIds.value = [...expandedFolderIds.value, id]
}

const toggleAllFolders = () => {
  const allFolderIds = collectFolderIds(treeNodes.value)
  const allExpanded = allFolderIds.every((id) => expandedFolderIds.value.includes(id))

  if (allExpanded) {
    expandedFolderIds.value = []
  } else {
    expandedFolderIds.value = allFolderIds
  }
}

const openDoc = (docId: string, editorType?: string | null) => {
  focusedNodeId.value = docId
  ensureNodeAncestorsExpanded(docId)

  const resolvedNode = findTreeNode(treeNodes.value, docId)

  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: kbId.value,
      docId,
      editorType: editorType ?? resolvedNode?.editorType,
    }),
  )
}

/** 目录行 👁 按钮：以阅读模式（只读）打开文档 */
const openDocPreview = (node: KnowledgeDocumentTreeNode) => {
  focusedNodeId.value = node.id
  ensureNodeAncestorsExpanded(node.id)

  router.push({
    name: node.editorType === "board" ? "knowledge-board-editor" : "knowledge-doc-editor",
    params: { kbId: kbId.value, docId: node.id },
    query: { preview: "1" },
  })
}

const openWorkspaceHome = () => {
  router.push({
    name: "knowledge-workspace-home",
    params: { kbId: kbId.value },
  })
}

const openWorkspaceSettings = () => {
  router.push({
    name: "knowledge-settings",
    params: { kbId: kbId.value },
  })
}

const handleTreeNodeDragStart = (payload: {
  node: KnowledgeDocumentTreeNode
  event: PointerEvent
}) => {
  if (treeDragDisabled.value) {
    return
  }

  closeNodeMenu()
  focusTreeNode(payload.node)
  beginDrag(payload)
}
const moveNodeDialogRef = ref<InstanceType<typeof KnowledgeMoveNodeDialog> | null>(null)

const openMoveDialog = (node: KnowledgeDocumentTreeNode) => {
  moveNodeDialogRef.value?.open(node)
}

const {
  inputDialog,
  confirmDialog,
  showTemplateDialog,
  templateDialogParentId,
  createNode,
  openTemplateLibrary,
  renamingNodeId,
  finishRename,
  deleteNode,
  resolveActionNode,
  handleTreeNodeCopyLink,
  handleRootCreateMenuAction,
  treeNodeMenuGroups,
  handleMenuShortcut,
} = useTreeNodeActions({
  kbId,
  menu: treeNodeMenu,
  activeDocId,
  treeNodes,
  router,
  canEdit: () => canEdit.value,
  getFocusedTreeNode,
  focusTreeNode,
  closeNodeMenu,
  refreshTree,
  openDoc,
  openMoveDialog,
  refocusNodeRow: (nodeId) => getTreeNodeRowElement(nodeId)?.focus(),
  showToastMessage,
})

const closeRootCreateMenu = () => {
  // 只关树头创建菜单；模板弹窗是 EP 遮罩式弹层，内部点击会冒泡到 window，
  // 在这里连动关闭会导致「弹窗内任意点击即关」「概览页从模板创建打不开」
  treePanelHeaderRef.value?.closeCreateMenu()
}

/** 本地文档导入（md / docx / lake / any 多格式）：先选文件，再解析为知识库文档。 */
const importFileInputRef = ref<HTMLInputElement | null>(null)
const importKind = ref<"md" | "docx" | "lake" | "any">("md")
const importAccept = computed(() =>
  importKind.value === "md"
    ? ".md,.markdown,text/markdown"
    : importKind.value === "lake"
      ? ".lake,application/json"
      : importKind.value === "docx"
        ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : // any：侧栏/开始页「导入…」统一入口，accept 交多格式（importLocalDocumentFiles 按扩展名分发）
          ".md,.markdown,.txt,.docx,.lake,.zip",
)

// ==================== 添加链接（B3c 外链树节点） ====================
const addLinkDialogOpen = ref(false)
const addingLink = ref(false)

/** 目录列头「+」菜单分流：添加链接走独立弹窗，其余沿用既有新建动作 */
const handleHeaderCreateAction = (
  action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap",
) => {
  if (action === "link") {
    if (!canEdit.value) {
      return
    }
    addLinkDialogOpen.value = true
    return
  }

  handleRootCreateMenuAction(action)
}

const handleAddLinkConfirm = async ({ title, url }: { title: string; url: string }) => {
  if (addingLink.value) {
    return
  }

  addingLink.value = true
  try {
    await createKnowledgeDocument({
      kbId: kbId.value,
      title,
      type: "link",
      status: "draft",
      content: { scheme: "text/uri", value: url },
    })
    addLinkDialogOpen.value = false
    showToastMessage(`已添加链接「${title}」`, "success")
    await refreshTree()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "添加链接失败。", "error")
  } finally {
    addingLink.value = false
  }
}

/** flat「全部文档」视图激活：外链节点新窗口打开，文档进编辑器 */
const handleFlatActivate = (doc: KnowledgeDocumentTreeNode) => {
  if (doc.type === "link") {
    if (doc.url) {
      window.open(doc.url, "_blank", "noopener")
    }
    return
  }

  openDoc(doc.id, doc.editorType)
}

const handleImportAction = (kind: "md" | "docx" | "lake" | "any") => {
  importKind.value = kind
  importFileInputRef.value?.click()
}

/** 侧栏「新建」菜单通过路由意图触发工作台创建/导入；任意页面均可发起，落到当前库工作台首页执行 */
const sidebarIntentHandlers: Record<string, () => void> = {
  "create-doc": () => handleRootCreateMenuAction("doc"),
  "create-folder": () => handleRootCreateMenuAction("folder"),
  "create-template": () => handleRootCreateMenuAction("template"),
  "create-board": () => handleRootCreateMenuAction("board"),
  "create-datatable": () => handleRootCreateMenuAction("datatable"),
  "create-sheet": () => handleRootCreateMenuAction("sheet"),
  "create-mindmap": () => handleRootCreateMenuAction("mindmap"),
  "import-md": () => handleImportAction("md"),
  "import-docx": () => handleImportAction("docx"),
  "import-lake": () => handleImportAction("lake"),
  "import-any": () => handleImportAction("any"),
}

const pendingSidebarIntent = ref<string | null>(null)

const consumeSidebarCreateIntent = () => {
  const intent = route.query.intent
  if (typeof intent !== "string" || !sidebarIntentHandlers[intent]) {
    return
  }

  const restQuery = { ...route.query }
  delete restQuery.intent
  void router.replace({ query: restQuery })

  // 权限/模板未就绪时先挂起，待加载完成再触发，避免误报「无权限」或文件选择器取不到 ref
  if (permissions.value) {
    sidebarIntentHandlers[intent]()
  } else {
    pendingSidebarIntent.value = intent
  }
}

watch(
  () => route.query.intent,
  () => consumeSidebarCreateIntent(),
  { immediate: true },
)

watch(permissions, (loaded) => {
  if (!loaded || !pendingSidebarIntent.value) {
    return
  }

  const handler = sidebarIntentHandlers[pendingSidebarIntent.value]
  pendingSidebarIntent.value = null
  handler?.()
})

const onImportFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file) {
    return
  }

  const kind = importKind.value
  const importingMessage =
    kind === "md"
      ? "正在导入 Markdown…"
      : kind === "lake"
        ? "正在导入语雀文档…"
        : kind === "docx"
          ? "正在导入 Word…"
          : "正在导入文档…"
  showToastMessage(importingMessage, "info")

  try {
    const document =
      kind === "md"
        ? await importMarkdownFile(file, kbId.value)
        : kind === "lake"
          ? await importLakeFile(file, kbId.value)
          : await importDocxFile(file, kbId.value)
    showToastMessage(`已导入「${document.title}」`, "success")
    await refreshTree()
    void router.push({
      name: "knowledge-doc-editor",
      params: { kbId: kbId.value, docId: document.id },
    })
  } catch (error) {
    console.error("[knowledge] 导入文档失败", error)
    showToastMessage("导入失败，请检查文件格式后重试", "error")
  }
}
watch(
  kbId,
  (currentKbId) => {
    closeNodeMenu()
    resetTreeDragState()
    clearTreeTypeahead()
    // 行内改名也是瞬时树态：旧库的编辑位不该跟到新库
    renamingNodeId.value = null
    // 先清掉旧库的树/权限，加载窗口内不再展示可点击的旧数据
    resetWorkspaceState()

    if (!currentKbId) {
      return
    }

    void refreshWorkspace()
  },
  { immediate: true },
)

watch(activeDocId, (docId) => {
  if (!docId) {
    return
  }

  const matchedNode = findTreeNode(treeNodes.value, docId)

  if (matchedNode) {
    focusedNodeId.value = matchedNode.id
    ensureNodeAncestorsExpanded(matchedNode.id)
  }
})

const isTypingTarget = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target : null

  if (!element) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  const tagName = element.tagName
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    if (draggingNodeId.value && !reorderingTree.value) {
      resetTreeDragState()
    }

    clearTreeTypeahead()
    closeNodeMenu()
    closeRootCreateMenu()
    return
  }

  if (isTypingTarget(event.target)) {
    return
  }

  if (treeNodeMenuComponent.value?.handleNavigation(event)) {
    return
  }

  // 焦点不在目录树面板内时不处理树快捷键：focusedNodeId 会长期保留，
  // 若不限定范围，在编辑器工具栏等处按 Backspace/Enter 会误触树节点的删除确认/打开文档
  const treeContainer = treePanelScrollRef.value
  const activeElement = document.activeElement
  if (
    !treeContainer ||
    !(activeElement instanceof Node) ||
    !treeContainer.contains(activeElement)
  ) {
    return
  }

  const targetNode = resolveActionNode()

  if (!targetNode) {
    return
  }

  if (!treeNodeMenu.value) {
    const typeaheadActive = isTreeTypeaheadActive()

    if (handleTreeTypeahead(event)) {
      return
    }

    // 速查串进行中但本次未命中：吞掉单字母键，避免 m/n/b 误触移动/新建/置顶弹窗
    if (
      typeaheadActive &&
      event.key.length === 1 &&
      event.key.trim() &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault()
      return
    }
  }

  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault()
    openNodeMenuByFocusedNode(targetNode)
    return
  }

  if (!treeNodeMenu.value && handleTreeNavigationShortcut(event, targetNode)) {
    return
  }

  handleMenuShortcut(event, targetNode)
}

const handleWindowClick = () => {
  closeRootCreateMenu()
}

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown)
  window.addEventListener("click", handleWindowClick)
})

onBeforeUnmount(() => {
  clearTreeTypeahead()
  window.removeEventListener("keydown", handleGlobalKeydown)
  window.removeEventListener("click", handleWindowClick)
})

const workspaceContext: KnowledgeWorkspaceContext = {
  kbId,
  knowledgeBase,
  treeNodes,
  permissions,
  refreshWorkspace,
  refreshTree,
  refreshPermissions,
  createNode,
  openTemplateLibrary,
  openDoc,
}

provide(knowledgeWorkspaceContextKey, workspaceContext)
</script>

<template>
  <KnowledgePageShell
    :active-kb-id="kbId"
    @sidebar-create="handleRootCreateMenuAction"
    @sidebar-import="handleImportAction"
  >
    <div
      ref="workspaceLayoutRef"
      class="grid h-full min-h-0 overflow-hidden"
      :style="workspaceGridStyle"
    >
      <aside
        :class="treePanelCollapsed ? 'invisible' : ''"
        class="relative flex min-h-0 flex-col border-r border-line bg-muted"
      >
        <!-- 目录栏右缘收起把手（对齐语雀：面板右边缘小箭头，点击收起） -->
        <button
          type="button"
          class="absolute right-0 top-44 z-20 flex h-11 w-3.5 items-center justify-center rounded-l-[6px] border border-r-0 border-line bg-surface text-ink-quaternary shadow-sm transition hover:text-brand"
          title="收起目录栏"
          @click="treePanelCollapsed = true"
        >
          <Icon icon="ph:caret-left" :width="10" :height="10" />
        </button>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <KnowledgeWorkspaceTreePanelHeader
            ref="treePanelHeaderRef"
            :kb-name="knowledgeBase?.name"
            :can-edit="canEdit"
            :is-home="isWorkspaceHomeRoute"
            :view-mode="treeViewMode"
            @open-home="openWorkspaceHome"
            @open-settings="openWorkspaceSettings"
            @view-mode-change="(mode) => (treeViewMode = mode)"
            @toggle-all-folders="toggleAllFolders"
            @create="handleHeaderCreateAction"
            @import="handleImportAction"
          />

          <div class="min-h-0 flex-1 px-2 pb-2">
            <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-kb-lg bg-transparent">
              <div ref="treePanelScrollRef" class="min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
                <div v-if="loadingTree" class="space-y-2 px-2 py-2">
                  <div
                    v-for="index in 8"
                    :key="index"
                    class="h-8 animate-pulse rounded-kb-sm bg-grey-200"
                  />
                </div>

                <!-- 加载失败（如知识库不存在）时不展示空态引导，避免与错误提示矛盾 -->
                <div
                  v-else-if="treeNodes.length === 0 && !errorMessage"
                  class="rounded-kb-lg border border-dashed border-line-input bg-surface px-4 py-10 text-center"
                >
                  <Icon
                    icon="ph:folder"
                    :width="32"
                    :height="32"
                    class="mx-auto text-ink-quaternary"
                  />
                  <p class="mt-3 text-sm font-medium text-ink-secondary">当前空间还没有目录内容</p>
                  <p class="mt-2 text-xs leading-5 text-ink-tertiary">
                    {{
                      canEdit
                        ? "可以先从顶部新增文档或文件夹，逐步搭出稳定的知识结构。"
                        : "当前角色没有创建权限，但仍可以浏览已有内容。"
                    }}
                  </p>
                  <div v-if="canEdit" class="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-kb-md bg-brand px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-hover"
                      @click="createNode('doc')"
                    >
                      <Icon icon="ph:file-text" :width="14" :height="14" />
                      新建文档
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-2 rounded-kb-md border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
                      @click="createNode('folder')"
                    >
                      <Icon icon="ph:folder" :width="14" :height="14" />
                      新建文件夹
                    </button>
                  </div>
                </div>

                <!-- 对齐语雀「全部文档」视图：标题+摘要平铺卡片、选中灰底、hover 行尾 ⋮（摘要行空不渲染） -->
                <div v-else-if="treeViewMode === 'flat'" class="space-y-1">
                  <div
                    v-for="doc in flatDocRows"
                    :key="doc.id"
                    role="button"
                    tabindex="0"
                    class="group flex cursor-pointer items-start gap-2 rounded-kb-md px-3 py-2.5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-light"
                    :class="doc.id === activeDocId ? 'bg-grey-300' : 'hover:bg-grey-100'"
                    @click="handleFlatActivate(doc)"
                    @keydown.enter.prevent="handleFlatActivate(doc)"
                  >
                    <div class="flex min-w-0 flex-1 items-start">
                      <div class="min-w-0 flex-1">
                        <!-- 重命名同样就地改，不开弹窗；卡片自身的 click/Enter 会激活文档，须吃掉 -->
                        <KnowledgeInlineTitleInput
                          v-if="renamingNodeId === doc.id"
                          :value="doc.title"
                          aria-label="重命名"
                          @click.stop
                          @keydown.stop
                          @finish="(payload) => finishRename({ node: doc, ...payload })"
                        />
                        <template v-else>
                          <p class="truncate text-[14px] font-medium text-ink">
                            {{ doc.title || "无标题文档" }}
                          </p>
                          <p
                            v-if="doc.summary"
                            class="mt-0.5 truncate text-[12px] leading-4 text-ink-tertiary"
                          >
                            {{ doc.summary }}
                          </p>
                        </template>
                      </div>
                    </div>
                    <button
                      v-if="renamingNodeId !== doc.id"
                      type="button"
                      class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-kb-sm text-ink-tertiary opacity-0 transition hover:bg-grey-200 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                      title="更多操作"
                      @click.stop="
                        openNodeMenu({
                          node: doc,
                          x: $event.clientX,
                          y: $event.clientY,
                          mode: 'actions',
                        })
                      "
                    >
                      <Icon icon="ph:dots-three-bold" :width="14" :height="14" />
                    </button>
                  </div>
                  <p
                    v-if="flatDocRows.length === 0 && !loadingTree"
                    class="px-2.5 py-6 text-[13px] text-ink-quaternary"
                  >
                    当前知识库还没有文档
                  </p>
                </div>

                <div v-else class="space-y-1.5">
                  <div
                    role="tree"
                    aria-label="知识库目录"
                    :aria-activedescendant="
                      focusedNodeId ? `knowledge-tree-node-${focusedNodeId}` : undefined
                    "
                    class="space-y-0.5"
                  >
                    <KnowledgeTreeBranch
                      :nodes="treeNodes"
                      :depth="0"
                      :parent-id="null"
                      :expanded-ids="expandedFolderIds"
                      :active-doc-id="activeDocId"
                      :selected-node-id="focusedNodeId"
                      :dragging-node-id="draggingNodeId"
                      :drop-target="treeDropTarget"
                      :drag-disabled="treeDragDisabled"
                      :can-edit="canEdit"
                      :renaming-node-id="renamingNodeId"
                      @toggle-folder="toggleFolder"
                      @open-doc="openDoc"
                      @focus-node="focusTreeNode"
                      @create-child="createNode($event.type, $event.parentId)"
                      @rename-finish="finishRename"
                      @move-node="openMoveDialog"
                      @delete-node="deleteNode"
                      @copy-link-node="handleTreeNodeCopyLink"
                      @preview-doc="openDocPreview"
                      @show-node-menu="openNodeMenu"
                      @drag-start-node="handleTreeNodeDragStart"
                      @register-row="registerTreeRow"
                      @unregister-row="unregisterTreeRow"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <button
        :class="treePanelCollapsed ? 'invisible' : ''"
        type="button"
        class="group relative z-10 -mx-1.5 cursor-col-resize bg-transparent outline-none touch-none"
        aria-label="调整目录栏宽度"
        @pointerdown.prevent="startTreePanelResize"
      >
        <!-- 与侧栏拖拽条同一套：0px 列 + 负外边距撑出 12px 命中面，指示条压在目录栏 border-r 上 -->
        <span
          class="absolute inset-y-0 left-[5px] w-[3px] rounded-full bg-transparent transition group-hover:bg-grey-400"
          :class="resizingTreePanel ? 'bg-grey-600!' : ''"
        />
      </button>

      <main class="relative min-w-0 overflow-hidden bg-surface">
        <!-- 目录栏收起后的恢复入口（对齐语雀左侧的展开把手） -->
        <button
          v-if="treePanelCollapsed"
          type="button"
          class="absolute left-0 top-1/2 z-30 flex h-14 w-5 -translate-y-1/2 items-center justify-center rounded-r-[8px] border border-l-0 border-line bg-surface text-ink-tertiary shadow-sm transition hover:text-brand"
          title="展开目录栏"
          @click="treePanelCollapsed = false"
        >
          <Icon icon="ph:caret-right" :width="12" :height="12" />
        </button>
        <div
          v-if="errorMessage"
          class="m-4 flex flex-wrap items-center justify-between gap-3 rounded-kb-xl border border-error-light bg-error-bg px-4 py-3 text-sm text-error shadow-sm"
        >
          <span>{{ errorMessage }}</span>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-kb-md border border-error-light bg-surface px-3 py-1.5 text-xs font-medium text-error transition hover:border-error hover:bg-error-bg"
            @click="router.push({ name: 'knowledge' })"
          >
            返回知识库列表
          </button>
        </div>
        <RouterView />
      </main>
    </div>

    <KnowledgeMoveNodeDialog
      ref="moveNodeDialogRef"
      :tree-nodes="treeNodes"
      :can-edit="canEdit"
      :refresh-tree="refreshTree"
    />

    <KnowledgeTreeNodeMenu
      ref="treeNodeMenuComponent"
      v-model:menu="treeNodeMenu"
      :groups="treeNodeMenuGroups"
    />

    <input
      ref="importFileInputRef"
      type="file"
      class="hidden"
      :accept="importAccept"
      @change="onImportFileChange"
    />

    <KnowledgeAddLinkDialog
      :open="addLinkDialogOpen"
      :submitting="addingLink"
      @update:open="(value) => (addLinkDialogOpen = value)"
      @confirm="handleAddLinkConfirm"
    />
    <TemplateSelectDialog
      v-if="showTemplateDialog"
      v-model:open="showTemplateDialog"
      :kb-id="kbId"
      :parent-id="templateDialogParentId"
      @created="
        (document) =>
          router.push({ name: 'knowledge-doc-editor', params: { kbId, docId: document.id } })
      "
    />
    <!-- 新建文档/文件夹/画板：对齐语雀「新建文档」弹层（名称/所属目录/高级选项）；
         重命名不开弹窗，走树行内编辑（renamingNodeId）；
         presetEditorType 供节点菜单直达专类时预选编辑器类型（D1/D2） -->
    <KnowledgeDocCreateDialog
      v-if="inputDialog.open"
      v-model:open="inputDialog.open"
      :title="inputDialog.title"
      :default-value="inputDialog.defaultValue"
      :folders="inputDialog.folders"
      :default-folder-id="inputDialog.defaultFolderId"
      :default-editor-type="inputDialog.presetEditorType"
      @confirm="
        (payload) => inputDialog.onConfirm(payload.title, payload.parentId, payload.editorType)
      "
    />
    <ConfirmDialog
      v-if="confirmDialog.open"
      v-model:open="confirmDialog.open"
      :message="confirmDialog.message"
      danger
      confirm-text="删除"
      @confirm="confirmDialog.onConfirm"
    />
  </KnowledgePageShell>
</template>

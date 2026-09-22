/**
 * 知识库文档树焦点与输入速查 composable。
 *
 * 从 KnowledgeWorkspaceLayout 抽出：聚焦节点状态、可见节点遍历、
 * 祖先展开保障、兄弟/边界聚焦、typeahead 速查、聚焦变化后的
 * 行焦点与滚动行为，以及方向键/Enter 等树导航快捷键。
 * 菜单打开时不抢行焦点由 isMenuOpen 注入判断。
 */
import { nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import { findTreeNode, normalizeNodeIds } from "@/components/knowledge/tree-utils"

export type VisibleTreeNode = {
  node: KnowledgeDocumentTreeNode
  depth: number
}

export const useTreeFocus = (options: {
  treeNodes: Ref<KnowledgeDocumentTreeNode[]>
  expandedFolderIds: Ref<string[]>
  /** 右键菜单打开时不抢行走焦点 */
  isMenuOpen: () => boolean
  /** 导航快捷键使用的业务动作（折叠/展开与打开文档） */
  toggleFolder: (id: string) => void
  openDoc: (docId: string, editorType?: string | null) => void
}) => {
  const { treeNodes, expandedFolderIds } = options

  const focusedNodeId = ref<string | null>(null)
  const treeTypeaheadQuery = ref("")
  const treeTypeaheadTimer = ref<number | null>(null)

  const getTreeNodeRowElement = (nodeId: string) => {
    if (typeof document === "undefined") {
      return null
    }

    return document.querySelector<HTMLElement>(`[data-knowledge-node-id="${nodeId}"]`)
  }

  const clearTreeTypeahead = () => {
    if (treeTypeaheadTimer.value !== null) {
      window.clearTimeout(treeTypeaheadTimer.value)
      treeTypeaheadTimer.value = null
    }

    treeTypeaheadQuery.value = ""
  }

  const focusTreeNode = (node: KnowledgeDocumentTreeNode) => {
    focusedNodeId.value = node.id
  }

  const getFocusedTreeNode = () => {
    if (!focusedNodeId.value) {
      return null
    }

    return findTreeNode(treeNodes.value, focusedNodeId.value)
  }

  const getVisibleTreeNodes = (): VisibleTreeNode[] => {
    const result: VisibleTreeNode[] = []

    const walk = (nodes: KnowledgeDocumentTreeNode[], depth: number) => {
      nodes.forEach((node) => {
        result.push({
          node,
          depth,
        })

        if (
          node.type === "folder" &&
          expandedFolderIds.value.includes(node.id) &&
          node.children.length > 0
        ) {
          walk(node.children, depth + 1)
        }
      })
    }

    walk(treeNodes.value, 0)

    return result
  }

  const ensureNodeAncestorsExpanded = (nodeId: string) => {
    const targetNode = findTreeNode(treeNodes.value, nodeId)

    if (!targetNode) {
      return
    }

    const ancestorFolderIds: string[] = []
    let currentParentId = targetNode.parentId

    while (currentParentId) {
      const parentNode = findTreeNode(treeNodes.value, currentParentId)

      if (!parentNode || parentNode.type !== "folder") {
        break
      }

      ancestorFolderIds.push(parentNode.id)
      currentParentId = parentNode.parentId
    }

    if (ancestorFolderIds.length === 0) {
      return
    }

    expandedFolderIds.value = normalizeNodeIds([...expandedFolderIds.value, ...ancestorFolderIds])
  }

  const ensureFocusedNode = () => {
    const visibleNodes = getVisibleTreeNodes()

    if (visibleNodes.length === 0) {
      focusedNodeId.value = null
      return
    }

    if (!focusedNodeId.value) {
      const firstNode = visibleNodes[0]
      focusedNodeId.value = firstNode ? firstNode.node.id : null
      return
    }

    const hasFocusedNode = visibleNodes.some((item) => item.node.id === focusedNodeId.value)

    if (!hasFocusedNode) {
      const firstNode = visibleNodes[0]
      focusedNodeId.value = firstNode ? firstNode.node.id : null
    }
  }

  const focusVisibleSibling = (currentNodeId: string, offset: -1 | 1) => {
    const visibleNodes = getVisibleTreeNodes()

    if (visibleNodes.length === 0) {
      return
    }

    const currentIndex = visibleNodes.findIndex((item) => item.node.id === currentNodeId)

    if (currentIndex < 0) {
      const firstNode = visibleNodes[0]
      focusedNodeId.value = firstNode ? firstNode.node.id : null
      return
    }

    const nextIndex = Math.max(0, Math.min(currentIndex + offset, visibleNodes.length - 1))
    const nextNode = visibleNodes[nextIndex]
    focusedNodeId.value = nextNode ? nextNode.node.id : null
  }

  const focusTreeBoundary = (position: "start" | "end") => {
    const visibleNodes = getVisibleTreeNodes()

    if (visibleNodes.length === 0) {
      return
    }

    const targetNode =
      position === "start" ? visibleNodes[0] : visibleNodes[visibleNodes.length - 1]
    focusedNodeId.value = targetNode?.node.id ?? null
  }

  const focusTreeNodeByTypeahead = (query: string) => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return false
    }

    const visibleNodes = getVisibleTreeNodes()

    if (visibleNodes.length === 0) {
      return false
    }

    const currentIndex = focusedNodeId.value
      ? visibleNodes.findIndex((item) => item.node.id === focusedNodeId.value)
      : -1
    const candidates =
      currentIndex >= 0
        ? [...visibleNodes.slice(currentIndex + 1), ...visibleNodes.slice(0, currentIndex + 1)]
        : visibleNodes

    const matchedNode =
      candidates.find((item) => item.node.title.trim().toLowerCase().startsWith(normalizedQuery)) ||
      candidates.find((item) => item.node.title.trim().toLowerCase().includes(normalizedQuery))

    if (!matchedNode) {
      return false
    }

    focusTreeNode(matchedNode.node)
    return true
  }

  /** typeahead 速查是否处于激活态（有未完成的查询串） */
  const isTreeTypeaheadActive = () => treeTypeaheadQuery.value.length > 0

  const handleTreeTypeahead = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return false
    }

    if (event.key.length !== 1 || !event.key.trim()) {
      return false
    }

    const nextQuery = `${treeTypeaheadQuery.value}${event.key.toLowerCase()}`
    const matched =
      focusTreeNodeByTypeahead(nextQuery) || focusTreeNodeByTypeahead(event.key.toLowerCase())

    clearTreeTypeahead()
    treeTypeaheadQuery.value = matched ? nextQuery : event.key.toLowerCase()
    treeTypeaheadTimer.value = window.setTimeout(() => {
      treeTypeaheadTimer.value = null
      treeTypeaheadQuery.value = ""
    }, 720)

    if (matched) {
      event.preventDefault()
    }

    return matched
  }

  const handleTreeNavigationShortcut = (
    event: KeyboardEvent,
    targetNode: KnowledgeDocumentTreeNode,
  ) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return false
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      focusVisibleSibling(targetNode.id, -1)
      return true
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusVisibleSibling(targetNode.id, 1)
      return true
    }

    if (event.key === "Home") {
      event.preventDefault()
      focusTreeBoundary("start")
      return true
    }

    if (event.key === "End") {
      event.preventDefault()
      focusTreeBoundary("end")
      return true
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()

      if (targetNode.type === "folder" && expandedFolderIds.value.includes(targetNode.id)) {
        options.toggleFolder(targetNode.id)
        return true
      }

      if (targetNode.parentId) {
        const parentNode = findTreeNode(treeNodes.value, targetNode.parentId)

        if (parentNode) {
          focusTreeNode(parentNode)
        }
      }

      return true
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()

      if (targetNode.type !== "folder") {
        return true
      }

      if (!expandedFolderIds.value.includes(targetNode.id)) {
        options.toggleFolder(targetNode.id)
        return true
      }

      if (targetNode.children.length > 0) {
        const firstChild = targetNode.children[0]

        if (firstChild) {
          focusTreeNode(firstChild)
        }
      }

      return true
    }

    if (event.key === "Enter") {
      event.preventDefault()

      if (targetNode.type === "doc") {
        options.openDoc(targetNode.id, targetNode.editorType)
      } else {
        options.toggleFolder(targetNode.id)
      }

      return true
    }

    if (event.key === " ") {
      event.preventDefault()

      if (targetNode.type === "doc") {
        options.openDoc(targetNode.id, targetNode.editorType)
      } else {
        options.toggleFolder(targetNode.id)
      }

      return true
    }

    return false
  }

  watch(
    () => focusedNodeId.value,
    async (nodeId) => {
      if (!nodeId) {
        return
      }

      await nextTick()
      const rowElement = getTreeNodeRowElement(nodeId)

      if (rowElement && !options.isMenuOpen()) {
        // focusVisible:false：程序化恢复焦点（持久化的选中节点）不以键盘焦点环呈现，
        // 避免进入工作区时首节点带 focus ring；键盘方向键导航仍会正常显示 ring。
        // focusVisible 是 Chromium 扩展属性，标准 FocusOptions 类型暂未收录
        rowElement.focus({
          preventScroll: true,
          focusVisible: false,
        } as FocusOptions & { focusVisible: false })

        // 聚焦跟随滚动（此前两个 watch 分别平滑/瞬时滚动同一目标，互相打断）
        rowElement.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        })
      }
    },
  )

  onBeforeUnmount(() => {
    clearTreeTypeahead()
  })

  return {
    focusedNodeId,
    clearTreeTypeahead,
    isTreeTypeaheadActive,
    focusTreeNode,
    getFocusedTreeNode,
    ensureNodeAncestorsExpanded,
    ensureFocusedNode,
    focusVisibleSibling,
    focusTreeBoundary,
    getTreeNodeRowElement,
    handleTreeTypeahead,
    handleTreeNavigationShortcut,
  }
}

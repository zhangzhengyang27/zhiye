import { computed, ref } from "vue"
import type { TreeDragSession, TreeDropTarget, TreeRowRegistryItem } from "@/components/knowledge/tree-dnd"
import { getAutoScrollVelocity, resolveDropPositionByRect } from "@/components/knowledge/tree-dnd"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

export function useTreeDnd(options: {
  canEdit: () => boolean
  loadingTree: () => boolean
  reorderingTree: () => boolean
  findTreeNode: (nodes: KnowledgeDocumentTreeNode[], id: string) => KnowledgeDocumentTreeNode | null
  isDescendantNode: (ancestorId: string, nodeId: string) => boolean
  treeNodes: () => KnowledgeDocumentTreeNode[]
}) {
  const treeDropTarget = ref<TreeDropTarget | null>(null)
  const treeDragBlockedReason = ref<string | null>(null)
  const treeDragSession = ref<TreeDragSession | null>(null)
  const draggingNodeId = computed(() => treeDragSession.value?.sourceNodeId ?? null)
  const treeRowRegistry = ref<TreeRowRegistryItem[]>([])
  const treeDragHoverExpandTimer = ref<number | null>(null)
  const treeDragHoverExpandNodeId = ref<string | null>(null)
  const treeAutoScrollRaf = ref<number | null>(null)
  const treeAutoScrollVelocity = ref(0)

  const resolveTreeDragInputMode = (event: PointerEvent): TreeDragSession["inputMode"] => {
    if (event.pointerType === "touch") {
      return "touch"
    }

    return "mouse"
  }

  const registerTreeRow = (payload: TreeRowRegistryItem) => {
    const index = treeRowRegistry.value.findIndex(r => r.nodeId === payload.nodeId)

    if (index >= 0) {
      treeRowRegistry.value[index] = payload
    } else {
      treeRowRegistry.value.push(payload)
    }
  }

  const unregisterTreeRow = (payload: { nodeId: string }) => {
    treeRowRegistry.value = treeRowRegistry.value.filter(r => r.nodeId !== payload.nodeId)
  }

  const getSortedTreeRows = () =>
    [...treeRowRegistry.value].sort((a, b) => {
      const aTop = a.element.getBoundingClientRect().top
      const bTop = b.element.getBoundingClientRect().top
      return aTop - bTop
    })

  const resolveTreeDropTargetFromPointer = (clientX: number, clientY: number): TreeDropTarget | null => {
    if (!draggingNodeId.value) {
      return null
    }

    const sortedRows = getSortedTreeRows()

    for (const row of sortedRows) {
      if (row.nodeId === draggingNodeId.value) {
        continue
      }

      const rect = row.element.getBoundingClientRect()

      if (clientY >= rect.top && clientY <= rect.bottom && clientX >= rect.left && clientX <= rect.right) {
        const position = resolveDropPositionByRect(clientY, rect, row.type === "folder")

        return {
          nodeId: row.nodeId,
          parentId: row.parentId,
          index: row.index,
          position,
          inputMode: "mouse",
        }
      }
    }

    return null
  }

  const getTreeDropTargetNode = (target: TreeDropTarget): KnowledgeDocumentTreeNode | null => {
    return options.findTreeNode(options.treeNodes(), target.nodeId ?? "")
  }

  const getTreeDropTargetParentNode = (target: TreeDropTarget): KnowledgeDocumentTreeNode | null => {
    if (target.position === "inside" || target.parentId === null) {
      return getTreeDropTargetNode(target)
    }

    return options.findTreeNode(options.treeNodes(), target.parentId ?? "")
  }

  const canDropTreeNode = (sourceNode: KnowledgeDocumentTreeNode, target: TreeDropTarget): boolean => {
    if (!target.nodeId) {
      return false
    }

    if (sourceNode.id === target.nodeId) {
      return false
    }

    if (options.isDescendantNode(sourceNode.id, target.nodeId)) {
      return false
    }

    if (target.position === "inside") {
      const dropTarget = options.findTreeNode(options.treeNodes(), target.nodeId)

      if (dropTarget?.type !== "folder") {
        return false
      }
    }

    return true
  }

  const clearTreeDragHoverExpand = () => {
    if (treeDragHoverExpandTimer.value !== null) {
      window.clearTimeout(treeDragHoverExpandTimer.value)
      treeDragHoverExpandTimer.value = null
    }
    treeDragHoverExpandNodeId.value = null
  }

  const stopTreeAutoScroll = () => {
    if (treeAutoScrollRaf.value !== null) {
      cancelAnimationFrame(treeAutoScrollRaf.value)
      treeAutoScrollRaf.value = null
    }
    treeAutoScrollVelocity.value = 0
  }

  const runTreeAutoScroll = (containerEl: HTMLElement) => {
    stopTreeAutoScroll()
    const velocity = treeAutoScrollVelocity.value

    if (velocity === 0) {
      return
    }

    const scroll = () => {
      containerEl.scrollTop += velocity
      treeAutoScrollRaf.value = requestAnimationFrame(scroll)
    }

    treeAutoScrollRaf.value = requestAnimationFrame(scroll)
  }

  const syncTreeAutoScroll = (clientY: number, containerEl: HTMLElement) => {
    const velocity = getAutoScrollVelocity(clientY, containerEl.getBoundingClientRect())
    treeAutoScrollVelocity.value = velocity

    if (velocity !== 0) {
      runTreeAutoScroll(containerEl)
    } else {
      stopTreeAutoScroll()
    }
  }

  const scheduleTreeDragHoverExpand = (nodeId: string, onExpand: () => void, delayMs = 800) => {
    clearTreeDragHoverExpand()
    treeDragHoverExpandNodeId.value = nodeId
    treeDragHoverExpandTimer.value = window.setTimeout(() => {
      onExpand()
      clearTreeDragHoverExpand()
    }, delayMs)
  }

  const resolveTreeDropBlockedReason = (
    sourceNode: KnowledgeDocumentTreeNode,
    target: TreeDropTarget
  ): string | null => {
    if (!canDropTreeNode(sourceNode, target)) {
      return "无法放置到该位置"
    }

    return null
  }

  const resetTreeDragState = () => {
    treeDropTarget.value = null
    treeDragBlockedReason.value = null
    treeDragSession.value = null
    clearTreeDragHoverExpand()
    stopTreeAutoScroll()
  }

  const collectDescendantIds = (node: KnowledgeDocumentTreeNode): string[] => {
    const ids: string[] = [node.id]

    if (node.children?.length) {
      for (const child of node.children) {
        ids.push(...collectDescendantIds(child))
      }
    }

    return ids
  }

  const treeDragDisabled = computed(() => !options.canEdit() || options.loadingTree() || options.reorderingTree())

  return {
    treeDropTarget,
    treeDragBlockedReason,
    treeDragSession,
    draggingNodeId,
    treeRowRegistry,
    treeDragHoverExpandTimer,
    treeDragHoverExpandNodeId,
    treeAutoScrollRaf,
    treeAutoScrollVelocity,
    treeDragDisabled,
    resolveTreeDragInputMode,
    registerTreeRow,
    unregisterTreeRow,
    getSortedTreeRows,
    resolveTreeDropTargetFromPointer,
    getTreeDropTargetNode,
    getTreeDropTargetParentNode,
    canDropTreeNode,
    clearTreeDragHoverExpand,
    stopTreeAutoScroll,
    runTreeAutoScroll,
    syncTreeAutoScroll,
    scheduleTreeDragHoverExpand,
    resolveTreeDropBlockedReason,
    resetTreeDragState,
    collectDescendantIds,
  }
}

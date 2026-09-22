/**
 * 知识库文档树拖拽 composable。
 *
 * 从 KnowledgeWorkspaceLayout 抽出：拖拽会话、行注册表、指针命中解析、
 * 放置校验、悬停自动展开、容器自动滚动，以及放置提交（乐观更新 +
 * reorder API + 失败回滚）。拖拽开始的业务副作用（关菜单、聚焦节点）
 * 由调用方在自己的 start 包装里处理。
 */
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import { reorderKnowledgeDocuments } from "@/services/knowledge-documents"
import { getApiErrorMessage } from "@/services/http-client"
import {
  getAutoScrollVelocity,
  resolveDropPositionByRect,
  type TreeDragSession,
  type TreeDropPosition,
  type TreeDropTarget,
  type TreeRowRegistryItem,
} from "@/components/knowledge/tree-dnd"
import {
  cloneTreeNodes,
  findTreeNode,
  normalizeNodeIds,
  removeTreeNode,
} from "@/components/knowledge/tree-utils"

export const useTreeDrag = (options: {
  /** 当前知识库 id（排序提交时使用） */
  kbId: Ref<string>
  /** 当前知识库文档树（响应式，拖拽命中校验与展开基于它） */
  treeNodes: Ref<KnowledgeDocumentTreeNode[]>
  /** 展开的文件夹 id 集合（悬停展开与提交后展开目标目录会写入） */
  expandedFolderIds: Ref<string[]>
  /** 树面板滚动容器（用于命中兜底与自动滚动） */
  scrollRef: Ref<HTMLElement | null>
  /** 拖拽是否被禁用（无编辑权限 / 加载中 / 提交中） */
  disabled: () => boolean
  /** 重排序提交中标记（composable 会写入 true/false，阻止取消与再次提交） */
  reordering: Ref<boolean>
  /** 拖入新目录展开后刷新文档树 */
  refreshTree: () => Promise<void>
  /** 回滚快照后修复聚焦节点 */
  ensureFocusedNode: () => void
}) => {
  const { treeNodes, expandedFolderIds, scrollRef } = options
  const { showToastMessage } = useTransientToast()

  const treeDragSession = ref<TreeDragSession | null>(null)
  const treeDropTarget = ref<TreeDropTarget | null>(null)
  const treeDragBlockedReason = ref<string | null>(null)
  // 未过位移阈值的手势不暴露为「拖拽中」，避免行高亮/把手样式误亮
  const draggingNodeId = computed(() =>
    treeDragSession.value?.active ? treeDragSession.value.sourceNodeId : null,
  )
  // Map 按 nodeId 存取，注册/注销 O(1)，避免整组 filter+replace 的 O(N²)
  const treeRowRegistry = ref(new Map<string, TreeRowRegistryItem>())
  const treeDragHoverExpandTimer = ref<number | null>(null)
  const treeDragHoverExpandNodeId = ref<string | null>(null)
  const treeAutoScrollRaf = ref<number | null>(null)
  const treeAutoScrollVelocity = ref(0)

  const registerTreeRow = (payload: {
    item: TreeRowRegistryItem
    parentId: string | null
    depth: number
    index: number
  }) => {
    const nextItem: TreeRowRegistryItem = {
      ...payload.item,
      parentId: payload.parentId,
      depth: payload.depth,
      index: payload.index,
    }
    treeRowRegistry.value.set(nextItem.nodeId, nextItem)
  }

  const unregisterTreeRow = (payload: { nodeId: string }) => {
    treeRowRegistry.value.delete(payload.nodeId)
  }

  const getSortedTreeRows = () => {
    return [...treeRowRegistry.value.values()].sort((left, right) => {
      const topDiff =
        left.element.getBoundingClientRect().top - right.element.getBoundingClientRect().top

      if (Math.abs(topDiff) > 0.5) {
        return topDiff
      }

      return left.depth - right.depth
    })
  }

  /** 拖拽激活的位移阈值：超过该距离才认定为拖拽手势 */
  const TREE_DRAG_ACTIVATION_DISTANCE_PX = 6

  const resolveTreeDragInputMode = (event: PointerEvent): TreeDragSession["inputMode"] => {
    return event.pointerType === "touch" ? "touch" : "mouse"
  }

  const resolveTreeDropTargetFromPointer = (
    clientY: number,
    inputMode: TreeDragSession["inputMode"],
  ): TreeDropTarget | null => {
    const rows = getSortedTreeRows()

    for (const row of rows) {
      const rect = row.element.getBoundingClientRect()

      if (clientY < rect.top || clientY > rect.bottom) {
        continue
      }

      // 分组与文档（挂子级，批次 B）都可进入 inside 命中带
      const position = resolveDropPositionByRect(
        clientY,
        rect,
        row.type === "folder" || row.type === "doc",
      )

      if (position === "inside") {
        return {
          nodeId: row.nodeId,
          parentId: row.nodeId,
          index: row.node.children.length,
          position,
          inputMode,
        }
      }

      return {
        nodeId: row.nodeId,
        parentId: row.parentId,
        index: row.index + (position === "after" ? 1 : 0),
        position,
        inputMode,
      }
    }

    const rootRows = rows.filter((item) => item.parentId === null)

    if (rootRows.length === 0) {
      return {
        nodeId: null,
        parentId: null,
        index: 0,
        position: "append",
        inputMode,
      }
    }

    const treeContainerRect = scrollRef.value?.getBoundingClientRect()

    if (
      !treeContainerRect ||
      clientY < treeContainerRect.top ||
      clientY > treeContainerRect.bottom
    ) {
      return null
    }

    return {
      nodeId: null,
      parentId: null,
      index: rootRows.length,
      position: "append",
      inputMode,
    }
  }

  const isDescendantNode = (ancestorId: string, nodeId: string) => {
    const ancestorNode = findTreeNode(treeNodes.value, ancestorId)

    if (!ancestorNode || ancestorNode.children.length === 0) {
      return false
    }

    const stack = [...ancestorNode.children]

    while (stack.length > 0) {
      const current = stack.pop()

      if (!current) {
        break
      }

      if (current.id === nodeId) {
        return true
      }

      if (current.children.length > 0) {
        stack.push(...current.children)
      }
    }

    return false
  }

  const getTreeDropTargetNode = (target: TreeDropTarget) => {
    if (!target.nodeId) {
      return null
    }

    return findTreeNode(treeNodes.value, target.nodeId)
  }

  const getTreeDropTargetParentNode = (target: TreeDropTarget) => {
    if (!target.parentId) {
      return null
    }

    return findTreeNode(treeNodes.value, target.parentId)
  }

  /** 计算「有效父级」类型：inside = 目标行自身；before/after = 目标行父级；根级 = null。
   *  与后端 parentRuleViolation 同源的深度/父级类型规则都以此为准。 */
  const resolveEffectiveParentType = (
    target: TreeDropTarget,
    targetNode: KnowledgeDocumentTreeNode | null,
  ) => {
    if (target.position === "inside") {
      return targetNode?.type ?? null
    }

    return target.parentId ? (findTreeNode(treeNodes.value, target.parentId)?.type ?? null) : null
  }

  const canDropTreeNode = (sourceNode: KnowledgeDocumentTreeNode, target: TreeDropTarget) => {
    const targetNode = getTreeDropTargetNode(target)
    const effectiveParentType = resolveEffectiveParentType(target, targetNode)

    if (targetNode && sourceNode.id === targetNode.id) {
      return false
    }

    // 有效父级必须是分组或文档——外链/模板行不能挂子级
    if (effectiveParentType && effectiveParentType !== "folder" && effectiveParentType !== "doc") {
      return false
    }

    // 分组不能挂到文档下；文档挂文档最多两级（源不得自带 doc 子级）
    if (effectiveParentType === "doc") {
      if (sourceNode.type === "folder") {
        return false
      }

      if (sourceNode.children.some((child) => child.type === "doc")) {
        return false
      }
    }

    if (!target.parentId) {
      return true
    }

    if (target.parentId === sourceNode.id) {
      return false
    }

    return !isDescendantNode(sourceNode.id, target.parentId)
  }

  const resolveTreeDropBlockedReason = (
    sourceNode: KnowledgeDocumentTreeNode,
    target: TreeDropTarget,
  ) => {
    const targetNode = getTreeDropTargetNode(target)
    const targetParentNode = getTreeDropTargetParentNode(target)
    const targetLabel = targetNode?.title.trim() || targetParentNode?.title.trim() || "当前位置"
    const sourceLabel = sourceNode.type === "folder" ? "分组" : "文档"
    const effectiveParentType = resolveEffectiveParentType(target, targetNode)

    if (targetNode && sourceNode.id === targetNode.id) {
      return "不能把当前节点拖到自己本身，请换到其他节点附近。"
    }

    if (effectiveParentType && effectiveParentType !== "folder" && effectiveParentType !== "doc") {
      return `「${targetLabel}」不能挂子级，请拖到它的上下边缘，或拖到分组中部。`
    }

    if (effectiveParentType === "doc" && sourceNode.type === "folder") {
      return "分组不能挂到文档下，请拖到分组或根级附近。"
    }

    if (
      effectiveParentType === "doc" &&
      sourceNode.children.some((child) => child.type === "doc")
    ) {
      return "文档嵌套最多两级（分组 > 文档 > 文档），请先移走它的子文档。"
    }

    if (
      target.parentId === sourceNode.id ||
      (target.parentId && isDescendantNode(sourceNode.id, target.parentId))
    ) {
      return `${sourceLabel}不能拖入自己或自己的子级，请改放到同级或父级附近。`
    }

    return "当前位置不可放置，请拖到节点上下边缘，或拖到分组中部。"
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
      window.cancelAnimationFrame(treeAutoScrollRaf.value)
      treeAutoScrollRaf.value = null
    }

    treeAutoScrollVelocity.value = 0
  }

  const runTreeAutoScroll = () => {
    const container = scrollRef.value

    if (!container || treeAutoScrollVelocity.value === 0) {
      stopTreeAutoScroll()
      return
    }

    container.scrollTop += treeAutoScrollVelocity.value
    treeAutoScrollRaf.value = window.requestAnimationFrame(runTreeAutoScroll)
  }

  const syncTreeAutoScroll = (clientY: number) => {
    const container = scrollRef.value

    if (!container) {
      stopTreeAutoScroll()
      return
    }

    treeAutoScrollVelocity.value = getAutoScrollVelocity(clientY, container.getBoundingClientRect())

    if (treeAutoScrollVelocity.value === 0) {
      stopTreeAutoScroll()
      return
    }

    if (treeAutoScrollRaf.value === null) {
      treeAutoScrollRaf.value = window.requestAnimationFrame(runTreeAutoScroll)
    }
  }

  const scheduleTreeDragHoverExpand = (
    node: KnowledgeDocumentTreeNode,
    position: TreeDropPosition,
    inputMode: TreeDragSession["inputMode"],
  ) => {
    if (
      inputMode === "touch" ||
      position !== "inside" ||
      (node.type !== "folder" && node.type !== "doc") ||
      // 无子级的文档没有可展开内容，不写展开集合
      (node.type === "doc" && node.children.length === 0) ||
      expandedFolderIds.value.includes(node.id)
    ) {
      clearTreeDragHoverExpand()
      return
    }

    if (treeDragHoverExpandNodeId.value === node.id && treeDragHoverExpandTimer.value !== null) {
      return
    }

    clearTreeDragHoverExpand()
    treeDragHoverExpandNodeId.value = node.id
    treeDragHoverExpandTimer.value = window.setTimeout(() => {
      expandedFolderIds.value = normalizeNodeIds([...expandedFolderIds.value, node.id])
      treeDragHoverExpandTimer.value = null
      treeDragHoverExpandNodeId.value = null
    }, 560)
  }

  const resetTreeDragState = () => {
    treeDragSession.value = null
    treeDropTarget.value = null
    treeDragBlockedReason.value = null
    clearTreeDragHoverExpand()
    stopTreeAutoScroll()
  }

  const handleGlobalTreeDragMove = (event: PointerEvent) => {
    const session = treeDragSession.value

    if (!session || options.disabled()) {
      return
    }

    // 只跟踪发起拖拽的那根指针（触摸/多点触控时其余指针不参与）
    if (event.pointerId !== session.pointerId) {
      return
    }

    // 位移阈值：名称按钮兼具拖拽把手，按下后轻微移动（半行以内）不算拖拽，
    // 避免手抖直接触发跨行排序提交
    if (!session.active) {
      const dx = event.clientX - session.startX
      const dy = event.clientY - session.startY

      if (Math.hypot(dx, dy) < TREE_DRAG_ACTIVATION_DISTANCE_PX) {
        return
      }

      session.active = true
    }

    syncTreeAutoScroll(event.clientY)

    const sourceNode = findTreeNode(treeNodes.value, session.sourceNodeId)

    if (!sourceNode) {
      resetTreeDragState()
      return
    }

    const nextDropTarget = resolveTreeDropTargetFromPointer(event.clientY, session.inputMode)

    if (!nextDropTarget) {
      treeDropTarget.value = null
      treeDragBlockedReason.value = null
      clearTreeDragHoverExpand()
      return
    }

    if (!canDropTreeNode(sourceNode, nextDropTarget)) {
      treeDropTarget.value = null
      treeDragBlockedReason.value = resolveTreeDropBlockedReason(sourceNode, nextDropTarget)
      clearTreeDragHoverExpand()
      return
    }

    treeDragBlockedReason.value = null
    const targetNode = getTreeDropTargetNode(nextDropTarget)

    if (targetNode) {
      scheduleTreeDragHoverExpand(targetNode, nextDropTarget.position, nextDropTarget.inputMode)
    } else {
      clearTreeDragHoverExpand()
    }

    treeDropTarget.value = nextDropTarget
  }

  const cancelTreeDrag = () => {
    if (!treeDragSession.value || options.reordering.value) {
      return
    }

    resetTreeDragState()
  }

  const handleGlobalTreeDragEnd = async (event: PointerEvent) => {
    const session = treeDragSession.value

    if (!session || options.reordering.value) {
      return
    }

    // 未过位移阈值（只是点击/轻移）或非发起指针：不算拖拽，直接结束
    if (!session.active || event.pointerId !== session.pointerId) {
      resetTreeDragState()
      return
    }

    if (!treeDropTarget.value || treeDragBlockedReason.value) {
      resetTreeDragState()
      return
    }

    await commitTreeDrop(treeDropTarget.value)
  }

  const getChildrenRefByParentId = (
    parentId: string | null,
  ): KnowledgeDocumentTreeNode[] | null => {
    if (!parentId) {
      return treeNodes.value
    }

    const parentNode = findTreeNode(treeNodes.value, parentId)

    // 分组与文档（挂子级，批次 B）都能作为拖拽落点的父级容器
    if (!parentNode || (parentNode.type !== "folder" && parentNode.type !== "doc")) {
      return null
    }

    return parentNode.children
  }

  const getIndexInParent = (parentId: string | null, nodeId: string) => {
    const siblings = getChildrenRefByParentId(parentId)

    if (!siblings) {
      return -1
    }

    return siblings.findIndex((item) => item.id === nodeId)
  }

  const buildReorderItems = (parentIds: Array<string | null>) => {
    const visited = new Set<string>()

    return parentIds.flatMap((parentId) => {
      const key = parentId ?? "__root__"

      if (visited.has(key)) {
        return []
      }

      visited.add(key)

      const siblings = getChildrenRefByParentId(parentId)

      if (!siblings) {
        return []
      }

      return siblings.map((item, order) => ({
        id: item.id,
        parentId,
        order,
      }))
    })
  }

  const commitTreeDrop = async (target: TreeDropTarget) => {
    if (options.disabled() || !draggingNodeId.value) {
      resetTreeDragState()
      return
    }

    const sourceNode = findTreeNode(treeNodes.value, draggingNodeId.value)

    if (!sourceNode) {
      resetTreeDragState()
      return
    }

    if (!canDropTreeNode(sourceNode, target)) {
      resetTreeDragState()
      return
    }

    const sourceParentId = sourceNode.parentId ?? null
    const sourceIndex = getIndexInParent(sourceParentId, sourceNode.id)
    const targetParentId = target.parentId
    let insertIndex = target.index

    if (sourceParentId === targetParentId && sourceIndex >= 0 && sourceIndex < insertIndex) {
      insertIndex -= 1
    }

    if (sourceParentId === targetParentId && sourceIndex === insertIndex) {
      resetTreeDragState()
      return
    }

    const previousTreeSnapshot = cloneTreeNodes(treeNodes.value)

    const removed = removeTreeNode(treeNodes.value, sourceNode.id)

    if (!removed) {
      resetTreeDragState()
      return
    }

    const targetList = getChildrenRefByParentId(targetParentId)

    if (!targetList) {
      await options.refreshTree()
      resetTreeDragState()
      return
    }

    const clampedIndex = Math.max(0, Math.min(insertIndex, targetList.length))
    removed.node.parentId = targetParentId
    targetList.splice(clampedIndex, 0, removed.node)

    const reorderItems = buildReorderItems([sourceParentId, targetParentId])

    if (reorderItems.length === 0) {
      resetTreeDragState()
      return
    }

    options.reordering.value = true

    try {
      const reorderResult = await reorderKnowledgeDocuments({
        kbId: options.kbId.value,
        items: reorderItems,
      })

      if (!reorderResult.ok) {
        throw new Error("排序请求未成功提交。")
      }

      if (targetParentId && !expandedFolderIds.value.includes(targetParentId)) {
        expandedFolderIds.value = [...expandedFolderIds.value, targetParentId]
      }

      await options.refreshTree()
    } catch (error) {
      treeNodes.value = previousTreeSnapshot
      options.ensureFocusedNode()
      await options.refreshTree()
      // 静默回滚会让「绿灯落点」看起来成功：后端拒绝（403 等）必须给出原因（评审 I1）
      showToastMessage(getApiErrorMessage(error, "排序提交失败，已恢复原状。"), "error")
    } finally {
      options.reordering.value = false
      resetTreeDragState()
    }
  }

  const handleGlobalTreeKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return
    }

    cancelTreeDrag()
  }

  const attach = () => {
    window.addEventListener("pointermove", handleGlobalTreeDragMove)
    window.addEventListener("pointerup", handleGlobalTreeDragEnd)
    window.addEventListener("pointercancel", cancelTreeDrag)
    window.addEventListener("blur", cancelTreeDrag)
    window.addEventListener("keydown", handleGlobalTreeKeydown)
  }

  const detach = () => {
    window.removeEventListener("pointermove", handleGlobalTreeDragMove)
    window.removeEventListener("pointerup", handleGlobalTreeDragEnd)
    window.removeEventListener("pointercancel", cancelTreeDrag)
    window.removeEventListener("blur", cancelTreeDrag)
    window.removeEventListener("keydown", handleGlobalTreeKeydown)
  }

  const beginDrag = (payload: { event: PointerEvent; node: KnowledgeDocumentTreeNode }) => {
    clearTreeDragHoverExpand()
    stopTreeAutoScroll()
    treeDragSession.value = {
      pointerId: payload.event.pointerId,
      sourceNodeId: payload.node.id,
      inputMode: resolveTreeDragInputMode(payload.event),
      startedAt: Date.now(),
      startX: payload.event.clientX,
      startY: payload.event.clientY,
      // 位移超过阈值（见 handleGlobalTreeDragMove）才置为 true
      active: false,
    }
    treeDropTarget.value = null
    treeDragBlockedReason.value = null
  }

  onMounted(() => {
    attach()
  })

  onBeforeUnmount(() => {
    detach()
    clearTreeDragHoverExpand()
    stopTreeAutoScroll()
  })

  return {
    treeDragSession,
    treeDropTarget,
    treeDragBlockedReason,
    draggingNodeId,
    registerTreeRow,
    unregisterTreeRow,
    beginDrag,
    resetTreeDragState,
    isDescendantNode,
    clearTreeDragHoverExpand,
    stopTreeAutoScroll,
  }
}

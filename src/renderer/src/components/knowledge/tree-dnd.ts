/** 汇总知识库树拖拽命中的位置计算与会话类型。 */

import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

/** 表示拖拽目标相对节点的落点位置。 */
export type TreeDropPosition = "before" | "after" | "inside" | "append"
/** 区分当前拖拽来自鼠标还是触摸输入。 */
export type TreeDragInputMode = "mouse" | "touch"

/** 描述一次拖拽命中结果对应的目标节点与插入位置。 */
export type TreeDropTarget = {
  nodeId: string | null
  parentId: string | null
  index: number
  position: TreeDropPosition
  inputMode: TreeDragInputMode
}

/** 描述拖拽移动过程中需要实时广播的命中状态。 */
export type TreeDragMovePayload = TreeDropTarget & {
  node: KnowledgeDocumentTreeNode | null
  clientY: number
}

/** 记录一次树拖拽手势的来源节点与输入上下文。 */
export type TreeDragSession = {
  pointerId: number
  sourceNodeId: string
  inputMode: TreeDragInputMode
  startedAt: number
  /** 手势起点，用于位移阈值判定 */
  startX: number
  startY: number
  /** 位移超过阈值后才算真正的拖拽，按下即轻微移动不触发排序提交 */
  active: boolean
}

/** 描述树节点注册到拖拽系统后的 DOM 与层级信息。 */
export type TreeRowRegistryItem = {
  node: KnowledgeDocumentTreeNode
  nodeId: string
  element: HTMLElement
  depth: number
  parentId: string | null
  type: KnowledgeDocumentTreeNode["type"]
  index: number
}

/** 根据指针在节点矩形中的纵向位置推断落点方向。 */
export const resolveDropPositionByRect = (
  clientY: number,
  rect: DOMRect,
  isFolder: boolean,
): TreeDropPosition => {
  if (rect.height <= 0) {
    return "append"
  }

  const offset = clientY - rect.top
  const ratio = offset / rect.height
  const edgeThreshold = isFolder ? 0.28 : 0.5

  if (isFolder && ratio > edgeThreshold && ratio < 1 - edgeThreshold) {
    return "inside"
  }

  return ratio <= 0.5 ? "before" : "after"
}

/** 根据指针距离滚动容器边缘的距离计算自动滚动速度。 */
export const getAutoScrollVelocity = (clientY: number, containerRect: DOMRect) => {
  const threshold = Math.min(72, containerRect.height * 0.18)

  if (clientY < containerRect.top + threshold) {
    return -Math.min(18, Math.max(4, Math.round((containerRect.top + threshold - clientY) / 6)))
  }

  if (clientY > containerRect.bottom - threshold) {
    return Math.min(18, Math.max(4, Math.round((clientY - (containerRect.bottom - threshold)) / 6)))
  }

  return 0
}

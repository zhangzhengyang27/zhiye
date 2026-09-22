/**
 * 知识库文档树的纯工具函数：查找、摘除、深拷贝与展开集合规整。
 *
 * 由 KnowledgeWorkspaceLayout 与 use-tree-drag 共用。
 */
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

export const normalizeNodeIds = (nodeIds: string[]) =>
  Array.from(new Set(nodeIds.filter((nodeId) => nodeId.trim().length > 0)))

export const collectFolderIds = (nodes: KnowledgeDocumentTreeNode[]) => {
  const folderIds: string[] = []

  const walk = (list: KnowledgeDocumentTreeNode[]) => {
    list.forEach((node) => {
      if (node.type === "folder") {
        folderIds.push(node.id)
      }

      if (node.children.length > 0) {
        walk(node.children)
      }
    })
  }

  walk(nodes)

  return folderIds
}

/**
 * 收集深度 < maxDepth 的目录 id（根层为 1 级），用于 KB 偏好「默认展开级别」（#16）：
 * level=1 展开根层目录、2 再展开其子目录，以此类推。非目录节点不参与，
 * level 非法（<=0）时返回空数组（不展开任何目录）。
 */
export const collectFolderIdsUpToDepth = (nodes: KnowledgeDocumentTreeNode[], maxDepth: number) => {
  const folderIds: string[] = []

  if (!Number.isFinite(maxDepth) || maxDepth <= 0) {
    return folderIds
  }

  const walk = (list: KnowledgeDocumentTreeNode[], depth: number) => {
    list.forEach((node) => {
      if (node.type === "folder" && depth < maxDepth) {
        folderIds.push(node.id)
      }

      if (node.children.length > 0) {
        walk(node.children, depth + 1)
      }
    })
  }

  walk(nodes, 1)

  return folderIds
}

export const findTreeNode = (
  nodes: KnowledgeDocumentTreeNode[],
  id: string,
): KnowledgeDocumentTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }

    if (node.children.length > 0) {
      const matched = findTreeNode(node.children, id)

      if (matched) {
        return matched
      }
    }
  }

  return null
}

export const removeTreeNode = (
  nodes: KnowledgeDocumentTreeNode[],
  nodeId: string,
  parentId: string | null = null,
): { node: KnowledgeDocumentTreeNode; parentId: string | null; index: number } | null => {
  for (let index = 0; index < nodes.length; index += 1) {
    const item = nodes[index]

    if (!item) {
      continue
    }

    if (item.id === nodeId) {
      const [removed] = nodes.splice(index, 1)

      if (!removed) {
        return null
      }

      return {
        node: removed,
        parentId,
        index,
      }
    }

    if (item.children.length > 0) {
      const removed = removeTreeNode(item.children, nodeId, item.id)

      if (removed) {
        return removed
      }
    }
  }

  return null
}

export const cloneTreeNodes = (nodes: KnowledgeDocumentTreeNode[]): KnowledgeDocumentTreeNode[] =>
  nodes.map((node) => ({
    ...node,
    children: cloneTreeNodes(node.children),
  }))

/** 拖拽落点的相对位置：上方 / 下方 / 作为子级放入。 */
export type TreeDropPosition = "before" | "after" | "inside"

/**
 * 描述一次拖拽落点：落到 nodeId 节点的 position 相对位置。
 * before/after 时新父级为 parentId；inside 时新父级即 nodeId 节点。
 */
export interface TreeDropPlacement {
  position: TreeDropPosition
  nodeId: string
  parentId: string | null
}

/** 判定 nodeId 是否落在 subtree 的子树内（不含 subtree 自身）。 */
const isInSubtree = (subtree: KnowledgeDocumentTreeNode | null, nodeId: string): boolean => {
  if (!subtree) {
    return false
  }

  return findTreeNode(subtree.children, nodeId) !== null
}

/**
 * 纯函数版拖拽合法性判定（与 use-tree-drag 的运行时判定同口径，供单测与复用）：
 * 1. 不能拖到自身；
 * 2. inside 仅目录（目标不是 folder 一律拒绝）；
 * 3. 目录不可进入自身或自身后代（新父级为自身 id，或新父级落在自身子树内；
 *    inside 的新父级即 nodeId，before/after 的新父级是 parentId）。
 * 非目录节点（文档/外链）只要前两条通过即可放置。
 */
export const canDropTreeNode = (
  nodes: KnowledgeDocumentTreeNode[],
  sourceNode: KnowledgeDocumentTreeNode,
  target: TreeDropPlacement,
): boolean => {
  // 规则 1：不能拖自身
  if (sourceNode.id === target.nodeId) {
    return false
  }

  const targetNode = findTreeNode(nodes, target.nodeId)

  // 规则 2：inside 仅目录
  if (target.position === "inside" && targetNode?.type !== "folder") {
    return false
  }

  if (sourceNode.type !== "folder") {
    return true
  }

  // 规则 3：目录不可入自身或自身后代（按落点解析出的「新父级」判定）
  const effectiveParentId = target.position === "inside" ? target.nodeId : target.parentId

  if (!effectiveParentId) {
    return true
  }

  if (effectiveParentId === sourceNode.id) {
    return false
  }

  return !isInSubtree(sourceNode, effectiveParentId)
}

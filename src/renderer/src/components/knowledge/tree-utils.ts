/**
 * 知识库文档树的纯工具函数：查找、摘除、深拷贝与展开集合规整。
 *
 * 由 KnowledgeWorkspaceLayout 与 use-tree-drag 共用。
 */
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

export const normalizeNodeIds = (nodeIds: string[]) =>
  Array.from(new Set(nodeIds.filter((nodeId) => nodeId.trim().length > 0)))

/** 可展开容器：分组，或挂了子级的文档（批次 B 文档嵌套文档）。 */
const isExpandableContainer = (node: KnowledgeDocumentTreeNode): boolean =>
  node.type === "folder" || node.children.length > 0

export const collectFolderIds = (nodes: KnowledgeDocumentTreeNode[]) => {
  const folderIds: string[] = []

  const walk = (list: KnowledgeDocumentTreeNode[]) => {
    list.forEach((node) => {
      if (isExpandableContainer(node)) {
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
 * 收集深度 < maxDepth 的可展开容器 id（分组或挂子级的文档；根层为 1 级），
 * 用于 KB 偏好「默认展开级别」（#16）：level=1 展开根层、2 再展开其子层，以此类推。
 * level 非法（<=0）时返回空数组（不展开任何层）。
 */
export const collectFolderIdsUpToDepth = (nodes: KnowledgeDocumentTreeNode[], maxDepth: number) => {
  const folderIds: string[] = []

  if (!Number.isFinite(maxDepth) || maxDepth <= 0) {
    return folderIds
  }

  const walk = (list: KnowledgeDocumentTreeNode[], depth: number) => {
    list.forEach((node) => {
      if (isExpandableContainer(node) && depth < maxDepth) {
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
 * 纯函数版拖拽合法性判定（与 use-tree-drag 的运行时判定同口径，供单测与复用）。
 * 规则与后端 documents.service 的 parentRuleViolation 三路收口同源（批次 B，
 * 对齐语雀「分组 > 文档 > 文档」），以「有效父级」统一 inside 与 before/after：
 * 1. 不能拖到自身；
 * 2. 有效父级（inside = 目标行自身；before/after = 目标行父级；根级 = null）
 *    必须是分组或文档——外链/模板行不能挂子级；
 * 3. 分组不能挂到文档下；
 * 4. 文档挂文档最多两级：有效父级是文档时，源不得自带 doc 子级
 *    （否则「移动带子级文档」会拼出三级文档链）；
 * 5. 不可进入自身或自身后代（防环；inside 的新父级即 nodeId，
 *    before/after 的新父级是 parentId）。
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
  void targetNode

  // 规则 2：解析有效父级并校验其类型
  const effectiveParentId = target.position === "inside" ? target.nodeId : target.parentId
  const effectiveParentType = effectiveParentId
    ? (findTreeNode(nodes, effectiveParentId)?.type ?? null)
    : null

  if (effectiveParentType && effectiveParentType !== "folder" && effectiveParentType !== "doc") {
    return false
  }

  // 规则 3/4：分组不进文档；文档挂文档最多两级（源不得自带 doc 子级）
  if (effectiveParentType === "doc") {
    if (sourceNode.type === "folder") {
      return false
    }

    if (sourceNode.children.some((child) => child.type === "doc")) {
      return false
    }
  }

  // 规则 5：不可入自身或自身后代（防环）
  if (!effectiveParentId) {
    return true
  }

  if (effectiveParentId === sourceNode.id) {
    return false
  }

  return !isInSubtree(sourceNode, effectiveParentId)
}

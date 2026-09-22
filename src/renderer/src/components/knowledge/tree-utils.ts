/**
 * 知识库文档树的纯工具函数：查找、摘除、深拷贝与展开集合规整。
 *
 * 由 KnowledgeWorkspaceLayout 与 use-tree-drag 共用。
 */
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

export const normalizeNodeIds = (nodeIds: string[]) =>
  Array.from(new Set(nodeIds.filter(nodeId => nodeId.trim().length > 0)))

export const collectFolderIds = (nodes: KnowledgeDocumentTreeNode[]) => {
  const folderIds: string[] = []

  const walk = (list: KnowledgeDocumentTreeNode[]) => {
    list.forEach(node => {
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

export const findTreeNode = (nodes: KnowledgeDocumentTreeNode[], id: string): KnowledgeDocumentTreeNode | null => {
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
  parentId: string | null = null
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
  nodes.map(node => ({
    ...node,
    children: cloneTreeNodes(node.children),
  }))

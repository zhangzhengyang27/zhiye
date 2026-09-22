import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
  getKnowledgeDocumentTree,
  type KnowledgeDocumentTreeNode,
} from "@/services/knowledge-documents"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"

export function useKnowledgeTree() {
  const route = useRoute()
  const router = useRouter()

  const treeNodes = ref<KnowledgeDocumentTreeNode[]>([])
  const loadingTree = ref(false)
  const reorderingTree = ref(false)
  const expandedFolderIds = ref<string[]>([])
  const focusedNodeId = ref<string | null>(null)
  const hasStoredExpandedFolderIds = ref(false)

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

  const collectFolderIds = (nodes: KnowledgeDocumentTreeNode[]): string[] => {
    const ids: string[] = []

    for (const node of nodes) {
      if (node.type === "folder") {
        ids.push(node.id)
      }

      if (node.children?.length) {
        ids.push(...collectFolderIds(node.children))
      }
    }

    return ids
  }

  const allFoldersExpanded = computed(() => {
    const allFolderIds = collectFolderIds(treeNodes.value)
    return (
      allFolderIds.length > 0 && allFolderIds.every((id) => expandedFolderIds.value.includes(id))
    )
  })

  const findTreeNode = (
    nodes: KnowledgeDocumentTreeNode[],
    id: string,
  ): KnowledgeDocumentTreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) {
        return node
      }

      if (node.children?.length) {
        const found = findTreeNode(node.children, id)

        if (found) {
          return found
        }
      }
    }

    return null
  }

  const isDescendantNode = (ancestorId: string, nodeId: string): boolean => {
    const ancestor = findTreeNode(treeNodes.value, ancestorId)

    if (!ancestor) {
      return false
    }

    const checkChildren = (children: KnowledgeDocumentTreeNode[]): boolean => {
      for (const child of children) {
        if (child.id === nodeId) {
          return true
        }

        if (child.children?.length && checkChildren(child.children)) {
          return true
        }
      }

      return false
    }

    return !!(ancestor.children?.length && checkChildren(ancestor.children))
  }

  const getChildrenRefByParentId = (
    parentId: string | null,
  ): KnowledgeDocumentTreeNode[] | null => {
    if (parentId === null) {
      return treeNodes.value
    }

    const parent = findTreeNode(treeNodes.value, parentId)

    if (!parent || !parent.children) {
      return null
    }

    return parent.children
  }

  const getIndexInParent = (parentId: string | null, nodeId: string): number => {
    const siblings = getChildrenRefByParentId(parentId)

    if (!siblings) {
      return -1
    }

    return siblings.findIndex((n) => n.id === nodeId)
  }

  const cloneTreeNodes = (nodes: KnowledgeDocumentTreeNode[]): KnowledgeDocumentTreeNode[] =>
    JSON.parse(JSON.stringify(nodes))

  const removeTreeNode = (
    nodes: KnowledgeDocumentTreeNode[],
    nodeId: string,
  ): { updated: KnowledgeDocumentTreeNode[]; removed: KnowledgeDocumentTreeNode | null } => {
    const cloned = cloneTreeNodes(nodes)
    let removed: KnowledgeDocumentTreeNode | null = null

    const walk = (list: KnowledgeDocumentTreeNode[]): KnowledgeDocumentTreeNode[] =>
      list.filter((node) => {
        if (node.id === nodeId) {
          removed = node
          return false
        }

        if (node.children?.length) {
          node.children = walk(node.children)
        }

        return true
      })

    return { updated: walk(cloned), removed }
  }

  const loadTree = async () => {
    loadingTree.value = true

    try {
      treeNodes.value = await getKnowledgeDocumentTree(kbId.value)

      const allFolderIds = collectFolderIds(treeNodes.value)

      if (expandedFolderIds.value.length === 0 && !hasStoredExpandedFolderIds.value) {
        expandedFolderIds.value = allFolderIds
      } else {
        const validFolderIds = new Set(allFolderIds)
        expandedFolderIds.value = expandedFolderIds.value.filter((folderId) =>
          validFolderIds.has(folderId),
        )
      }
    } finally {
      loadingTree.value = false
    }
  }

  const refreshTree = async () => {
    await loadTree()
  }

  const toggleFolder = (id: string) => {
    const index = expandedFolderIds.value.indexOf(id)

    if (index >= 0) {
      expandedFolderIds.value.splice(index, 1)
    } else {
      expandedFolderIds.value.push(id)
    }
  }

  const expandAllFolders = () => {
    expandedFolderIds.value = collectFolderIds(treeNodes.value)
  }

  const collapseAllFolders = () => {
    expandedFolderIds.value = []
  }

  const ensureNodeAncestorsExpanded = (nodeId: string) => {
    const pathToRoot: string[] = []
    let currentId: string | undefined = nodeId

    while (currentId) {
      const found = findTreeNode(treeNodes.value, currentId)
      if (found) {
        pathToRoot.unshift(found.id)
        currentId = found.parentId ?? undefined
      } else {
        currentId = undefined
      }
    }

    for (const ancestorId of pathToRoot.slice(0, -1)) {
      if (!expandedFolderIds.value.includes(ancestorId)) {
        expandedFolderIds.value.push(ancestorId)
      }
    }
  }

  const openDoc = (docId: string, editorType?: string | null) => {
    const target = getKnowledgeDocumentRouteTarget({ docId, kbId: kbId.value, editorType })
    void router.push(target)
  }

  const openWorkspaceHome = () => {
    void router.push({ name: "knowledge-workspace-home", params: { kbId: kbId.value } })
  }

  const buildReorderItems = (parentIds: Array<string | null>) => {
    const items: Array<{ documentId: number; order: number }> = []

    for (const parentId of parentIds) {
      const siblings = getChildrenRefByParentId(parentId)

      if (!siblings) {
        continue
      }

      siblings.forEach((node, index) => {
        items.push({ documentId: node.id as unknown as number, order: index + 1 })
      })
    }

    return items
  }

  const buildDuplicateTitle = (title: string) => {
    const match = title.match(/^(.*)\s+\(副本(?:\s+(\d+))?\)$/)

    if (match) {
      const baseTitle = match[1]
      const copyNumber = match[2] ? parseInt(match[2], 10) + 1 : 2
      return `${baseTitle} (副本 ${copyNumber})`
    }

    return `${title} (副本)`
  }

  return {
    kbId,
    activeDocId,
    treeNodes,
    loadingTree,
    reorderingTree,
    expandedFolderIds,
    focusedNodeId,
    hasStoredExpandedFolderIds,
    allFoldersExpanded,
    collectFolderIds,
    findTreeNode,
    isDescendantNode,
    getChildrenRefByParentId,
    getIndexInParent,
    cloneTreeNodes,
    removeTreeNode,
    loadTree,
    refreshTree,
    toggleFolder,
    expandAllFolders,
    collapseAllFolders,
    ensureNodeAncestorsExpanded,
    openDoc,
    openWorkspaceHome,
    buildReorderItems,
    buildDuplicateTitle,
  }
}

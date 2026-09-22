/**
 * 知识库工作区状态持久化：按知识库记住展开的容器（分组与挂子级的文档）与聚焦节点。
 *
 * 从 KnowledgeWorkspaceLayout 抽出。切库时自动恢复（没有存档则清空，
 * loadTree 依据 hasStoredExpandedFolderIds 决定是否自动展开全部目录），
 * 状态变化时自动写回 localStorage。
 */
import { nextTick, ref, watch, type Ref } from "vue"
import { normalizeNodeIds } from "@/components/knowledge/tree-utils"
import {
  buildExpandedFoldersStorageKey,
  buildFocusedNodeStorageKey,
  readStorageItem,
  writeStorageItem,
} from "./workspace-storage"

export const useWorkspacePersistence = (options: {
  kbId: Ref<string>
  expandedFolderIds: Ref<string[]>
  focusedNodeId: Ref<string | null>
}) => {
  const { kbId, expandedFolderIds, focusedNodeId } = options

  /** 当前库是否有过本地存档；没有存档时 loadTree 会自动展开全部目录。 */
  const hasStoredExpandedFolderIds = ref(false)

  /** 恢复存档期间的写入是回放而非用户操作，不应标记「已有存档」或回写存储 */
  let isRestoring = false

  const readStoredExpandedFolderIds = (targetKbId: string) => {
    if (!targetKbId) {
      return null
    }

    const raw = readStorageItem(buildExpandedFoldersStorageKey(targetKbId))

    if (!raw) {
      return null
    }

    try {
      const parsed = JSON.parse(raw)

      if (!Array.isArray(parsed)) {
        return null
      }

      return normalizeNodeIds(parsed.filter((item): item is string => typeof item === "string"))
    } catch {
      return null
    }
  }

  const readStoredFocusedNodeId = (targetKbId: string) => {
    if (!targetKbId) {
      return null
    }

    const raw = readStorageItem(buildFocusedNodeStorageKey(targetKbId))

    if (!raw) {
      return null
    }

    const normalized = raw.trim()
    return normalized ? normalized : null
  }

  const persistExpandedFolderIds = (targetKbId: string, folderIds: string[]) => {
    if (!targetKbId) {
      return
    }

    const normalizedFolderIds = normalizeNodeIds(folderIds)
    writeStorageItem(
      buildExpandedFoldersStorageKey(targetKbId),
      JSON.stringify(normalizedFolderIds),
    )
  }

  const persistFocusedNodeId = (targetKbId: string, nodeId: string | null) => {
    if (!targetKbId) {
      return
    }

    const normalizedNodeId = nodeId?.trim() ?? ""

    if (!normalizedNodeId) {
      writeStorageItem(buildFocusedNodeStorageKey(targetKbId), null)
      return
    }

    writeStorageItem(buildFocusedNodeStorageKey(targetKbId), normalizedNodeId)
  }

  const restoreWorkspaceState = (targetKbId: string) => {
    isRestoring = true
    const storedExpandedFolderIds = readStoredExpandedFolderIds(targetKbId)
    hasStoredExpandedFolderIds.value = storedExpandedFolderIds !== null
    expandedFolderIds.value = storedExpandedFolderIds ?? []
    focusedNodeId.value = readStoredFocusedNodeId(targetKbId)
    // watcher 是异步触发（pre-flush），在 flush 完成后再解除标记
    void nextTick(() => {
      isRestoring = false
    })
  }

  watch(
    kbId,
    (targetKbId) => {
      if (!targetKbId) {
        hasStoredExpandedFolderIds.value = false
        expandedFolderIds.value = []
        focusedNodeId.value = null
        return
      }

      restoreWorkspaceState(targetKbId)
    },
    { immediate: true },
  )

  watch(expandedFolderIds, (folderIds) => {
    if (!kbId.value || isRestoring) {
      return
    }

    hasStoredExpandedFolderIds.value = true
    persistExpandedFolderIds(kbId.value, folderIds)
  })

  // 方向键连续导航会高频触发，防抖后再写 localStorage
  let focusedPersistTimer: number | null = null

  watch(focusedNodeId, (nodeId) => {
    if (!kbId.value || isRestoring) {
      return
    }

    const targetKbId = kbId.value

    if (focusedPersistTimer !== null) {
      window.clearTimeout(focusedPersistTimer)
    }

    focusedPersistTimer = window.setTimeout(() => {
      focusedPersistTimer = null
      persistFocusedNodeId(targetKbId, nodeId)
    }, 300)
  })

  return {
    hasStoredExpandedFolderIds,
    restoreWorkspaceState,
  }
}

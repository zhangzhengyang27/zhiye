/**
 * 知识库工作区加载链路 composable。
 *
 * 从 KnowledgeWorkspaceLayout 抽出：知识库/权限/文档树的加载与刷新，
 * 以及 kbId 快速切换时丢弃过期结果的序号保护。布局消费返回的响应式
 * 状态与刷新入口；焦点修复（祖先展开、聚焦兜底）通过注入回调完成。
 */
import { ref, type Ref } from "vue"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"
import { getKnowledgeBase } from "@/services/knowledge-base"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import { getKnowledgeDocumentTree } from "@/services/knowledge-documents"
import {
  checkKnowledgeBasePermissions,
  type KnowledgeBasePermissions,
} from "@/services/knowledge-permissions"
import { getApiErrorMessage } from "@/services/http-client"
import { collectFolderIds, collectFolderIdsUpToDepth } from "@/components/knowledge/tree-utils"

export const useWorkspaceLoader = (options: {
  kbId: Ref<string>
  treeNodes: Ref<KnowledgeDocumentTreeNode[]>
  expandedFolderIds: Ref<string[]>
  /** 本地是否有展开状态存档；没有时加载完按默认展开级别（无则全展开）初始化 */
  hasStoredExpandedFolderIds: Ref<boolean>
  focusedNodeId: Ref<string | null>
  /** KB 偏好 settings.defaultExpandLevel（根为 1 级，展开深度 < level）；无效值回退全展开 */
  getDefaultExpandLevel: () => number | null | undefined
  /** 程序性展开赋值（不落存档、不标记「已有存档」），由持久化模块提供 */
  applyProgrammaticExpandedFolderIds: (folderIds: string[]) => void
  ensureNodeAncestorsExpanded: (nodeId: string) => void
  ensureFocusedNode: () => void
  showToastMessage: (message: string, type?: "success" | "error" | "info") => void
}) => {
  const { kbId, treeNodes, expandedFolderIds } = options

  const knowledgeBase = ref<KnowledgeBaseItem | null>(null)
  const permissions = ref<KnowledgeBasePermissions | null>(null)
  const loadingWorkspace = ref(false)
  const loadingTree = ref(false)
  const errorMessage = ref("")

  /** 工作区刷新序号：kbId 快速切换时丢弃过期加载结果，防止旧工作区数据覆盖新工作区 */
  let workspaceLoadSeq = 0

  /**
   * 树加载序号：同一库内 refreshTree 会被改名/拖拽提交/自动保存等多处并发
   * 触发，慢的旧响应晚归会用旧树覆盖新树（丢刚提交的改名/删除），序号过期即丢弃
   */
  let treeLoadSeq = 0

  const loadKnowledgeBase = async (targetKbId: string) => {
    // 触屏拖拽回滚等瞬态会把 kbId 短暂置空，直接请求会打 undefined 路径
    if (!targetKbId) {
      return
    }
    const result = await getKnowledgeBase(targetKbId)

    if (kbId.value === targetKbId) {
      knowledgeBase.value = result
    }
  }

  const loadPermissions = async (targetKbId: string) => {
    if (!targetKbId) {
      return
    }
    const result = await checkKnowledgeBasePermissions(targetKbId)

    if (kbId.value === targetKbId) {
      permissions.value = result
    }
  }

  const loadTree = async (targetKbId: string) => {
    if (!targetKbId) {
      return
    }
    const seq = ++treeLoadSeq
    loadingTree.value = true

    try {
      const result = await getKnowledgeDocumentTree(targetKbId)

      // kbId 已切换：丢弃过期结果，避免覆盖新工作区的树与展开/聚焦态；
      // 同库并发时序号过期（旧请求晚归）同样丢弃，loadingTree 只由最新一次复位
      if (kbId.value !== targetKbId || seq !== treeLoadSeq) {
        return
      }

      treeNodes.value = result
      const allFolderIds = collectFolderIds(result)

      if (expandedFolderIds.value.length === 0 && !options.hasStoredExpandedFolderIds.value) {
        // 首次加载且无存档：按 KB 偏好的默认展开级别初始化，无效/缺省时全展开兜底。
        // 赋值必须走「程序性」通道——直接赋值会被持久化 watcher 误标成用户存档，
        // 偏好从此失效（2026-09-23 修复：此前布局层 watch 与此处竞态，两种顺序都输）
        const level = options.getDefaultExpandLevel()
        const initialFolderIds =
          typeof level === "number" && Number.isFinite(level) && level > 0
            ? collectFolderIdsUpToDepth(result, level)
            : allFolderIds
        options.applyProgrammaticExpandedFolderIds(initialFolderIds)
      } else {
        const validFolderIds = new Set(allFolderIds)
        expandedFolderIds.value = expandedFolderIds.value.filter((folderId) =>
          validFolderIds.has(folderId),
        )
      }

      if (options.focusedNodeId.value) {
        options.ensureNodeAncestorsExpanded(options.focusedNodeId.value)
      }

      options.ensureFocusedNode()
    } finally {
      if (seq === treeLoadSeq) {
        loadingTree.value = false
      }
    }
  }

  const refreshTree = async () => {
    try {
      await loadTree(kbId.value)
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "刷新文档树失败。"), "error")
    }
  }

  const refreshPermissions = async () => {
    if (!kbId.value) {
      return
    }
    try {
      await loadPermissions(kbId.value)
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "刷新权限失败。"), "error")
    }
  }

  /**
   * 立即清空旧工作区数据。切库时若不清理，加载窗口内旧树仍可点击
   * （以新库 id 打开旧文档 → 跨库错误导航），旧权限也会被沿用做判定。
   */
  const resetWorkspaceState = () => {
    knowledgeBase.value = null
    permissions.value = null
    treeNodes.value = []
    errorMessage.value = ""
  }

  const refreshWorkspace = async () => {
    const targetKbId = kbId.value

    if (!targetKbId) {
      return
    }

    const seq = ++workspaceLoadSeq
    loadingWorkspace.value = true
    errorMessage.value = ""

    try {
      await Promise.all([
        loadKnowledgeBase(targetKbId),
        loadTree(targetKbId),
        loadPermissions(targetKbId),
      ])
    } catch (error) {
      if (seq === workspaceLoadSeq) {
        errorMessage.value = getApiErrorMessage(error, "加载知识库工作区失败。")
      }
    } finally {
      if (seq === workspaceLoadSeq) {
        loadingWorkspace.value = false
      }
    }
  }

  return {
    knowledgeBase,
    permissions,
    loadingWorkspace,
    loadingTree,
    errorMessage,
    resetWorkspaceState,
    refreshTree,
    refreshPermissions,
    refreshWorkspace,
  }
}

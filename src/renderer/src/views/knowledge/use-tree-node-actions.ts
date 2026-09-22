/**
 * 知识库文档树节点操作 composable。
 *
 * 从 KnowledgeWorkspaceLayout 抽出：新建/删除/复制/移动/导出/置顶等业务 handler、
 * 链接构造、对话框（新建输入/确认/模板）状态，以及右键菜单分组
 * （treeNodeMenuGroups）与键盘 M/F2/N/B/Delete 等菜单快捷键的分发。
 * 重命名走树行内编辑（对齐语雀：不开弹窗），本模块只持有 renamingNodeId 与收尾提交。
 * 布局只保留全局 keydown 分发、树导航快捷键与模板绑定。
 */
import { computed, ref, watch, type Ref } from "vue"
import type { Router } from "vue-router"
import { getApiErrorMessage } from "@/services/http-client"
import { resolveWebBaseUrl } from "@/services/desktop-bridge"
import { addKnowledgeFavorite, checkKnowledgeFavorite } from "@/services/knowledge-favorites"
import {
  createKnowledgeDocument,
  getKnowledgeDocument,
  trashKnowledgeDocument,
  updateKnowledgeDocument,
  type KnowledgeDocumentEditorType,
  type KnowledgeDocumentTreeNode,
} from "@/services/knowledge-documents"
import {
  KNOWLEDGE_BOARD_CONTENT_SCHEME,
  KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
  KNOWLEDGE_DOCUMENT_EDITOR_TYPES,
  KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
  type KnowledgeDocumentContent,
} from "@/types/knowledge-document"
import { createKnowledgeBoardDocument } from "@/utils/knowledge-board"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import type {
  TreeNodeMenuGroup,
  TreeNodeMenuItem,
  TreeNodeMenuState,
} from "@/components/knowledge/tree-node-menu"
import type { KnowledgeWorkspaceCreateNodeType } from "./workspace-context"

/**
 * 新建弹层「高级选项」的编辑器类型口径（与 KnowledgeDocCreateDialog 的
 * DocCreateEditorType 同一组字面量：SFC 内局部类型不可 import，这里镜像声明）。
 */
type DocCreateEditorType = "richText" | "board" | "datatable" | "sheet" | "mindmap"

/** 专类文档（非富文本/目录）的新建文案与编辑器类型映射（flowchart 已撤并不做）。 */
const SPECIALIZED_CREATE_META = {
  board: {
    label: "画板",
    dialogTitle: "新建画板",
    dialogDefault: "无标题画板",
    instantTitle: "无标题画板",
  },
  datatable: {
    label: "数据表",
    dialogTitle: "新建数据表",
    dialogDefault: "新建数据表",
    instantTitle: "无标题数据表",
  },
  sheet: {
    label: "表格",
    dialogTitle: "新建表格",
    dialogDefault: "新建表格",
    instantTitle: "无标题表格",
  },
  mindmap: {
    label: "思维导图",
    dialogTitle: "新建思维导图",
    dialogDefault: "新建思维导图",
    instantTitle: "无标题思维导图",
  },
} as const

type SpecializedCreateType = keyof typeof SPECIALIZED_CREATE_META

/** 根级「+」菜单可直达创建的类型全集（template 走模板库，folder 走命名对话框）。 */
export type RootCreateMenuAction =
  "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"

/** 思维导图根节点 uid：与 KnowledgeMindmapEditorView.makeUid 同口径。 */
const makeMindmapUid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14)

/** 按编辑器类型构建预置内容（D1 对齐语雀：专类文档创建即可进编辑器）。 */
const buildCreateContent = (
  editorType: DocCreateEditorType,
  title: string,
): KnowledgeDocumentContent | undefined => {
  switch (editorType) {
    case "board":
      return {
        scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
        value: createKnowledgeBoardDocument(),
      }
    case "datatable":
    case "sheet":
      // 表格与数据表共用同一 scheme（区分靠 editorType），预置空字段空行
      return {
        scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
        value: { fields: [], rows: [] },
      }
    case "mindmap":
      return {
        scheme: KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
        value: { data: { text: title || "中心主题", uid: makeMindmapUid() }, children: [] },
      }
    default:
      return { scheme: "text/markdown", value: "" }
  }
}

export const useTreeNodeActions = (options: {
  kbId: Ref<string>
  /** 当前打开的右键菜单状态（分组构造与动作节点解析都依赖它） */
  menu: Ref<TreeNodeMenuState | null>
  activeDocId: Ref<string | null>
  treeNodes: Ref<KnowledgeDocumentTreeNode[]>
  router: Router
  canEdit: () => boolean
  getFocusedTreeNode: () => KnowledgeDocumentTreeNode | null
  focusTreeNode: (node: KnowledgeDocumentTreeNode) => void
  closeNodeMenu: () => void
  refreshTree: () => Promise<void>
  openDoc: (docId: string, editorType?: string | null) => void
  openMoveDialog: (node: KnowledgeDocumentTreeNode) => void
  /** 行内重命名结束后把键盘焦点交回该行，方向键导航才能继续 */
  refocusNodeRow: (nodeId: string) => void
  showToastMessage: (message: string, type?: "success" | "error" | "info") => void
}) => {
  const { kbId, router } = options

  const showTemplateDialog = ref(false)
  const templateDialogParentId = ref<string | null>(null)
  const inputDialog = ref<{
    open: boolean
    title: string
    defaultValue: string
    onConfirm: (value: string, parentId: string, editorType: DocCreateEditorType) => void
    folders?: Array<{ id: string; label: string }>
    defaultFolderId?: string
    /** 菜单直达专类时的预选编辑器类型（D2：CreateDialog 高级选项预选并展开） */
    presetEditorType?: DocCreateEditorType
  }>({ open: false, title: "", defaultValue: "", onConfirm: () => {} })
  const confirmDialog = ref<{ open: boolean; message: string; onConfirm: () => void }>({
    open: false,
    message: "",
    onConfirm: () => {},
  })
  /** 正在行内改名的节点 id（对齐语雀：重命名不开弹窗，直接在树行里改） */
  const renamingNodeId = ref<string | null>(null)

  const ensureEditPermission = (message = "当前角色没有编辑权限。") => {
    if (options.canEdit()) {
      return true
    }

    options.showToastMessage(message, "error")
    return false
  }

  const copyText = async (textToCopy: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy)
      return true
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = textToCopy
      textarea.style.position = "fixed"
      textarea.style.left = "-9999px"
      document.body.appendChild(textarea)

      try {
        textarea.select()
        document.execCommand("copy")
        return true
      } catch {
        return false
      } finally {
        // select/execCommand 抛异常时也要移除，避免 textarea 残留在 body
        document.body.removeChild(textarea)
      }
    }
  }

  const buildDocLink = (docId: string, editorType?: string | null) => {
    if (typeof window === "undefined") {
      return ""
    }

    const href = router.resolve(
      getKnowledgeDocumentRouteTarget({
        kbId: kbId.value,
        docId,
        editorType,
      }),
    ).href

    return `${resolveWebBaseUrl()}${href}`
  }

  const buildFolderLink = () => {
    if (typeof window === "undefined") {
      return ""
    }

    const href = router.resolve({
      name: "knowledge-workspace-home",
      params: { kbId: kbId.value },
    }).href

    return `${resolveWebBaseUrl()}${href}`
  }

  const buildNodeLink = (node: KnowledgeDocumentTreeNode) => {
    if (node.type === "doc") {
      return buildDocLink(node.id, node.editorType)
    }

    return buildFolderLink()
  }

  const escapeMarkdownText = (value: string) => {
    return value.replace(/([()[\]])/g, "\\$1")
  }

  const buildDocTitledLink = (node: KnowledgeDocumentTreeNode) => {
    const docLink = buildDocLink(node.id, node.editorType)

    if (!docLink) {
      return ""
    }

    const normalizedTitle = node.title.trim() || "未命名文档"
    return `[${escapeMarkdownText(normalizedTitle)}](${docLink})`
  }

  const resolveActionNode = () => {
    if (options.menu.value) {
      return options.menu.value.node
    }

    return options.getFocusedTreeNode()
  }

  const createNode = (type: KnowledgeWorkspaceCreateNodeType, parentId: string | null = null) => {
    if (!ensureEditPermission()) {
      return
    }

    // 对齐语雀新建弹窗：根目录 + 各级目录（带路径缩进 label）
    const folders: Array<{ id: string; label: string }> = [{ id: "", label: "根目录" }]

    const walkFolders = (nodes: KnowledgeDocumentTreeNode[], prefix: string) => {
      nodes.forEach((item) => {
        if (item.type !== "folder") {
          return
        }

        const path = prefix ? `${prefix} / ${item.title}` : item.title
        folders.push({ id: item.id, label: path })
        walkFolders(item.children, path)
      })
    }

    walkFolders(options.treeNodes.value, "")

    const specializedMeta = isSpecializedCreateType(type) ? SPECIALIZED_CREATE_META[type] : null
    const isFolder = type === "folder"

    inputDialog.value = {
      open: true,
      title: isFolder ? "新建文件夹" : specializedMeta ? specializedMeta.dialogTitle : "新建文档",
      defaultValue: isFolder
        ? "新建文件夹"
        : specializedMeta
          ? specializedMeta.dialogDefault
          : "新建文档",
      folders,
      defaultFolderId: parentId ?? "",
      presetEditorType: isSpecializedCreateType(type) ? type : undefined,
      onConfirm: async (normalizedTitle, targetParentId, editorType) => {
        // 弹层按 presetEditorType 预选，用户仍可在高级选项改选；以提交值落库
        const resolvedEditorType: DocCreateEditorType = editorType
        try {
          const created = await createKnowledgeDocument({
            kbId: kbId.value,
            title: normalizedTitle,
            type: isFolder ? "folder" : "doc",
            editorType:
              resolvedEditorType === "richText"
                ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText
                : KNOWLEDGE_DOCUMENT_EDITOR_TYPES[resolvedEditorType],
            status: "draft",
            parentId: targetParentId || null,
            content: isFolder ? undefined : buildCreateContent(resolvedEditorType, normalizedTitle),
          })
          options.showToastMessage(
            isFolder
              ? "文件夹已创建。"
              : `${specializedMeta?.label ?? "文档"}「${normalizedTitle}」已创建。`,
            "success",
          )
          await options.refreshTree()
          if (!isFolder) {
            options.openDoc(created.id, created.editorType)
          }
        } catch (error) {
          options.showToastMessage(getApiErrorMessage(error, "创建失败，请稍后重试。"), "error")
        }
      },
    }
  }

  const isSpecializedCreateType = (
    type: KnowledgeWorkspaceCreateNodeType,
  ): type is SpecializedCreateType =>
    type === "board" || type === "datatable" || type === "sheet" || type === "mindmap"

  /**
   * 根级菜单即时创建（D1 对齐语雀）：点类型即以默认标题创建并直接进入编辑器，
   * 不弹命名窗（folder 仍走对话框）。创建后 toast + 刷新树 + openDoc。
   */
  const createNodeInstantly = async (
    type: KnowledgeWorkspaceCreateNodeType,
    parentId: string | null = null,
  ) => {
    // 目录保持「命名对话框」路径（语雀根菜单目录同样弹窗）
    if (type === "folder") {
      createNode("folder", parentId)
      return
    }

    if (!ensureEditPermission()) {
      return
    }

    const isDoc = type === "doc"
    const specializedMeta = isSpecializedCreateType(type) ? SPECIALIZED_CREATE_META[type] : null
    const title = isDoc ? "新建文档" : specializedMeta ? specializedMeta.instantTitle : "新建文档"
    const editorType: KnowledgeDocumentEditorType = isDoc
      ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText
      : KNOWLEDGE_DOCUMENT_EDITOR_TYPES[type as SpecializedCreateType]

    try {
      const created = await createKnowledgeDocument({
        kbId: kbId.value,
        title,
        type: "doc",
        editorType,
        status: "draft",
        parentId: parentId || null,
        content: buildCreateContent(editorType as DocCreateEditorType, title),
      })
      options.showToastMessage(
        `${specializedMeta?.label ?? "文档"}「${title}」已创建，正在打开编辑器`,
        "success",
      )
      await options.refreshTree()
      options.openDoc(created.id, created.editorType)
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "创建失败，请稍后重试。"), "error")
    }
  }

  const openTemplateLibrary = (parentId: string | null = null) => {
    if (!ensureEditPermission()) {
      return
    }

    templateDialogParentId.value = parentId
    showTemplateDialog.value = true
  }

  const hideTemplateDialog = () => {
    if (showTemplateDialog.value) {
      showTemplateDialog.value = false
    }
  }

  watch(showTemplateDialog, (open) => {
    if (!open) {
      templateDialogParentId.value = null
    }
  })

  const renameNode = (node: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      return
    }

    renamingNodeId.value = node.id
  }

  /** 行内改名收尾：committed=false（Esc / 空标题 / 未改动）只退出不发请求 */
  const finishRename = async (payload: {
    node: KnowledgeDocumentTreeNode
    title: string
    committed: boolean
  }) => {
    const { node, committed } = payload

    if (renamingNodeId.value === node.id) {
      renamingNodeId.value = null
    }

    const normalizedTitle = payload.title.trim()

    if (!committed || !normalizedTitle || normalizedTitle === node.title) {
      options.refocusNodeRow(node.id)
      return
    }

    try {
      await updateKnowledgeDocument(node.id, { title: normalizedTitle })
      options.showToastMessage("已更新名称。", "success")
      await options.refreshTree()
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "重命名失败。"), "error")
    } finally {
      options.refocusNodeRow(node.id)
    }
  }

  /** 收集节点自身（若为文档）及其子树内全部文档 id，用于删除前判定激活文档是否受影响 */
  const collectSubtreeDocIds = (root: KnowledgeDocumentTreeNode) => {
    const ids: string[] = []
    const walk = (node: KnowledgeDocumentTreeNode) => {
      if (node.type !== "folder") {
        ids.push(node.id)
      }
      node.children.forEach(walk)
    }
    walk(root)
    return ids
  }

  const deleteNode = (node: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      return
    }

    confirmDialog.value = {
      open: true,
      message: `确认将「${node.title}」移入回收站吗？`,
      onConfirm: async () => {
        try {
          // 删除前收集子树文档 id：刷新后旧子树已不在树中，届时无从判断
          const removedDocIds = collectSubtreeDocIds(node)
          await trashKnowledgeDocument(node.id)
          options.showToastMessage("已移入回收站。", "success")
          await options.refreshTree()
          const activeDocId = options.activeDocId.value
          if (activeDocId && removedDocIds.includes(activeDocId)) {
            router.push({ name: "knowledge-workspace-home", params: { kbId: kbId.value } })
          }
        } catch (error) {
          options.showToastMessage(getApiErrorMessage(error, "删除失败。"), "error")
        }
      },
    }
  }

  const handleNodeMenuCreateChild = async (
    type: KnowledgeWorkspaceCreateNodeType,
    targetNode?: KnowledgeDocumentTreeNode,
  ) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu()
      return
    }

    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode || actionNode.type !== "folder") {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)
    await createNode(type, actionNode.id)
  }

  const handleNodeMenuRename = async (targetNode?: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu()
      return
    }

    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode) {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)
    await renameNode(actionNode)
  }

  const handleNodeMenuMove = (targetNode?: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu()
      return
    }

    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode) {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)
    options.openMoveDialog(actionNode)
  }

  const handleNodeMenuDelete = async (targetNode?: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu()
      return
    }

    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode) {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)
    await deleteNode(actionNode)
  }

  const copyDocLinkByMode = async (
    mode: "titled" | "raw",
    targetNode?: KnowledgeDocumentTreeNode,
  ) => {
    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode || actionNode.type !== "doc") {
      return
    }

    const textToCopy =
      mode === "titled"
        ? buildDocTitledLink(actionNode)
        : buildDocLink(actionNode.id, actionNode.editorType)

    if (!textToCopy) {
      options.closeNodeMenu()
      options.showToastMessage("复制链接失败，请稍后重试。", "error")
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    const copied = await copyText(textToCopy)

    if (!copied) {
      options.showToastMessage("复制链接失败，请手动复制地址栏。", "error")
      return
    }

    options.showToastMessage(
      mode === "titled" ? "标题链接已复制（Markdown 格式）。" : "纯链接已复制。",
      "success",
    )
  }

  const handleNodeMenuCopyLink = async (targetNode?: KnowledgeDocumentTreeNode) => {
    await copyDocLinkByMode("titled", targetNode)
  }

  const handleNodeMenuCopyRawLink = async (targetNode?: KnowledgeDocumentTreeNode) => {
    await copyDocLinkByMode("raw", targetNode)
  }

  const buildDuplicateTitle = (title: string) => {
    const normalizedTitle = title.trim() || "未命名文档"
    // 识别「xx 副本」「xx 副本 3」等既有编号，复制时递增而不是叠加
    const numberedMatch = normalizedTitle.match(/^(.*?)\s*副本\s*(\d+)$/)
    const plainCopyMatch = normalizedTitle.match(/^(.*?)\s*副本$/)
    if (numberedMatch) {
      return `${numberedMatch[1]} 副本 ${Number(numberedMatch[2]) + 1}`
    }
    if (plainCopyMatch) {
      return `${plainCopyMatch[1]} 副本 2`
    }
    return `${normalizedTitle} 副本`
  }

  const handleNodeMenuCopyNodeLink = async (targetNode?: KnowledgeDocumentTreeNode) => {
    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode) {
      return
    }

    const link = buildNodeLink(actionNode)

    if (!link) {
      options.closeNodeMenu()
      options.showToastMessage("复制链接失败，请稍后重试。", "error")
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    const copied = await copyText(link)

    if (!copied) {
      options.showToastMessage("复制链接失败，请手动复制地址栏。", "error")
      return
    }

    options.showToastMessage("链接已复制。", "success")
  }

  const handleNodeMenuOpenInNewWindow = (targetNode?: KnowledgeDocumentTreeNode) => {
    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode) {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    const href =
      actionNode.type === "doc"
        ? router.resolve(
            getKnowledgeDocumentRouteTarget({
              kbId: kbId.value,
              docId: actionNode.id,
              editorType: actionNode.editorType,
            }),
          ).href
        : router.resolve({
            name: "knowledge-workspace-home",
            params: { kbId: kbId.value },
          }).href

    // 桌面端：应用内新窗口加载 SPA 路由（对齐语雀「在新窗口打开」行为）
    if (window.xiaoyeDesktop) {
      void window.xiaoyeDesktop.openDocumentInNewWindow(href)
      return
    }

    // Web 端：保留原有新标签页行为
    window.open(`${resolveWebBaseUrl()}${href}`, "_blank", "noopener,noreferrer")
  }

  const handleNodeMenuMoveOutOfDirectory = async (targetNode?: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu()
      return
    }

    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode || actionNode.parentId === null) {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    try {
      await updateKnowledgeDocument(actionNode.id, { parentId: null })
      options.showToastMessage("已移出目录。", "success")
      await options.refreshTree()
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "移出目录失败。"), "error")
    }
  }

  const handleNodeMenuDuplicate = async (targetNode?: KnowledgeDocumentTreeNode) => {
    if (!ensureEditPermission()) {
      options.closeNodeMenu()
      return
    }

    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode) {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    try {
      if (actionNode.type === "folder") {
        await createKnowledgeDocument({
          kbId: kbId.value,
          title: buildDuplicateTitle(actionNode.title),
          type: "folder",
          parentId: actionNode.parentId,
        })
      } else {
        const sourceDocument = await getKnowledgeDocument(actionNode.id)

        await createKnowledgeDocument({
          kbId: kbId.value,
          title: buildDuplicateTitle(sourceDocument.title),
          type: sourceDocument.type,
          parentId: sourceDocument.parentId ?? null,
          status: sourceDocument.status,
          editorType:
            sourceDocument.editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
              ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
              : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,
          content: sourceDocument.content,
        })
      }

      options.showToastMessage("已复制。", "success")
      await options.refreshTree()
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "复制失败。"), "error")
    }
  }

  const handleNodeMenuExport = async (
    format: "markdown" | "pdf" | "word",
    targetNode?: KnowledgeDocumentTreeNode,
  ) => {
    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode || actionNode.type !== "doc") {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    try {
      const sourceDocument = await getKnowledgeDocument(actionNode.id)

      if (!sourceDocument.content || typeof sourceDocument.content.value !== "string") {
        options.showToastMessage("当前文档暂不支持导出。", "error")
        return
      }

      const exportTitle = sourceDocument.title.trim() || "未命名文档"
      const exportValue = sourceDocument.content.value
      const exportContentType = sourceDocument.content.scheme === "text/html" ? "html" : "markdown"
      const exportTools = await import("@/utils/document-export")

      if (format === "markdown") {
        // HTML scheme 文档（TipTap 存量）需转换为 Markdown，避免把 HTML 源码导出成 .md
        await exportTools.exportAsMarkdown(exportTitle, exportValue, exportContentType)
        options.showToastMessage("Markdown 已导出。", "success")
        return
      }

      if (format === "pdf") {
        await exportTools.exportAsPDF(exportTitle, exportValue, exportContentType)
        options.showToastMessage("PDF 已导出。", "success")
        return
      }

      await exportTools.exportAsWord(exportTitle, exportValue, exportContentType)
      options.showToastMessage("Word 已导出。", "success")
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "导出失败。"), "error")
    }
  }

  const handleNodeMenuPinDocument = async (targetNode?: KnowledgeDocumentTreeNode) => {
    const actionNode = targetNode ?? resolveActionNode()

    if (!actionNode || actionNode.type !== "doc") {
      return
    }

    options.closeNodeMenu()
    options.focusTreeNode(actionNode)

    try {
      const favoriteState = await checkKnowledgeFavorite(actionNode.id)

      if (!favoriteState.favorited) {
        await addKnowledgeFavorite(actionNode.id)
      }

      options.showToastMessage("文档已置顶。", "success")
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "置顶失败。"), "error")
    }
  }

  /** 目录行 hover「@」按钮：对齐语雀的快速复制文档链接。 */
  const handleTreeNodeCopyLink = (node: KnowledgeDocumentTreeNode) => {
    if (node.type !== "doc") {
      return
    }

    void copyDocLinkByMode("titled", node)
  }

  /** 根级「+」菜单动作（D1 全类型）：template→模板库，folder→命名对话框，其余→即时创建进编辑器 */
  const handleRootCreateMenuAction = (action: RootCreateMenuAction) => {
    if (action === "template") {
      openTemplateLibrary()
      return
    }

    void createNodeInstantly(action)
  }

  const treeNodeMenuGroups = computed<TreeNodeMenuGroup[]>(() => {
    const menu = options.menu.value

    if (!menu) {
      return []
    }

    const groups: TreeNodeMenuGroup[] = []
    const createItems: TreeNodeMenuItem[] = [
      {
        id: "create-doc",
        label: "新建子文档",
        shortcut: "N",
        ariaKeyshortcuts: "N",
        icon: "ph:file-plus",
        disabled: menu.node.type !== "folder" || !options.canEdit(),
        onClick: () => void handleNodeMenuCreateChild("doc"),
      },
      {
        id: "create-folder",
        label: "新建子文件夹",
        shortcut: "Shift+N",
        ariaKeyshortcuts: "Shift+N",
        icon: "ph:folder-simple-plus",
        disabled: menu.node.type !== "folder" || !options.canEdit(),
        onClick: () => void handleNodeMenuCreateChild("folder"),
      },
      {
        id: "create-board",
        label: "新建子画板",
        shortcut: "B",
        ariaKeyshortcuts: "B",
        icon: "ph:clipboard-text",
        disabled: menu.node.type !== "folder" || !options.canEdit(),
        onClick: () => void handleNodeMenuCreateChild("board"),
      },
    ]

    if (menu.mode === "create") {
      groups.push({
        id: "create",
        items: createItems,
      })
      return groups
    }

    groups.push({
      id: "basic",
      items: [
        {
          id: "rename",
          label: "重命名",
          shortcut: "F2",
          ariaKeyshortcuts: "F2",
          icon: "ph:note-pencil",
          disabled: !options.canEdit(),
          onClick: () => void handleNodeMenuRename(),
        },
        {
          id: "copy-link",
          label: "复制链接",
          shortcut: menu.node.type === "doc" ? "Ctrl/Cmd+C" : undefined,
          ariaKeyshortcuts: menu.node.type === "doc" ? "Control+C Meta+C" : undefined,
          icon: "ph:link-simple",
          onClick: () => void handleNodeMenuCopyNodeLink(),
        },
        {
          id: "open-new-window",
          label: "在新窗口打开",
          shortcut: menu.node.type === "doc" ? "Ctrl/Cmd+Enter" : undefined,
          ariaKeyshortcuts: menu.node.type === "doc" ? "Control+Enter Meta+Enter" : undefined,
          icon: "ph:arrow-square-out",
          onClick: () => handleNodeMenuOpenInNewWindow(),
        },
      ],
    })

    groups.push({
      id: "detach",
      items: [
        {
          id: "move-out",
          label: "移出目录",
          icon: "ph:arrow-bend-up-left",
          disabled: !options.canEdit() || menu.node.parentId === null,
          onClick: () => void handleNodeMenuMoveOutOfDirectory(),
        },
      ],
    })

    groups.push({
      id: "organize",
      items: [
        {
          id: "duplicate",
          label: "复制…",
          icon: "ph:copy",
          disabled: !options.canEdit(),
          onClick: () => void handleNodeMenuDuplicate(),
        },
        {
          id: "move",
          label: "移动…",
          shortcut: "M",
          ariaKeyshortcuts: "M",
          icon: "ph:arrows-out-cardinal",
          disabled: !options.canEdit(),
          onClick: () => handleNodeMenuMove(),
        },
        {
          id: "export",
          label: "导出…",
          icon: "ph:export",
          disabled: menu.node.type !== "doc",
          children: [
            {
              id: "export-markdown",
              label: "导出为 Markdown",
              icon: "ph:file-text",
              onClick: () => void handleNodeMenuExport("markdown"),
            },
            {
              id: "export-pdf",
              label: "导出为 PDF",
              icon: "ph:file-text",
              onClick: () => void handleNodeMenuExport("pdf"),
            },
            {
              id: "export-word",
              label: "导出为 Word",
              icon: "ph:file-text",
              onClick: () => void handleNodeMenuExport("word"),
            },
          ],
          onClick: () => {},
        },
        {
          id: "pin",
          label: "置顶文档",
          icon: "ph:push-pin-simple",
          disabled: menu.node.type !== "doc",
          onClick: () => void handleNodeMenuPinDocument(),
        },
      ],
    })

    groups.push({
      id: "danger",
      items: [
        {
          id: "delete",
          label: "删除",
          shortcut: "Delete",
          ariaKeyshortcuts: "Delete Backspace",
          icon: "ph:trash-simple",
          tone: "danger",
          disabled: !options.canEdit(),
          onClick: () => void handleNodeMenuDelete(),
        },
      ],
    })

    return groups
  })

  const handleMenuShortcut = (event: KeyboardEvent, targetNode: KnowledgeDocumentTreeNode) => {
    const normalizedKey = event.key.toLowerCase()
    const withModifier = event.metaKey || event.ctrlKey

    if (withModifier && normalizedKey === "c") {
      if (targetNode.type !== "doc") {
        return
      }

      const hasTextSelection =
        typeof window !== "undefined" && Boolean(window.getSelection()?.toString())

      if (hasTextSelection) {
        return
      }

      event.preventDefault()

      if (event.shiftKey) {
        void handleNodeMenuCopyLink(targetNode)
        return
      }

      void handleNodeMenuCopyRawLink(targetNode)
      return
    }

    if (withModifier && event.key === "Enter") {
      if (targetNode.type !== "doc") {
        return
      }

      event.preventDefault()
      handleNodeMenuOpenInNewWindow(targetNode)
      return
    }

    if (event.key === "F2") {
      if (!options.canEdit()) {
        return
      }

      event.preventDefault()
      void handleNodeMenuRename(targetNode)
      return
    }

    if (!withModifier && !event.altKey && normalizedKey === "m") {
      if (!options.canEdit()) {
        return
      }

      event.preventDefault()
      handleNodeMenuMove(targetNode)
      return
    }

    if (!withModifier && !event.altKey && normalizedKey === "n" && targetNode.type === "folder") {
      if (!options.canEdit()) {
        return
      }

      event.preventDefault()

      if (event.shiftKey) {
        void handleNodeMenuCreateChild("folder", targetNode)
        return
      }

      void handleNodeMenuCreateChild("doc", targetNode)
      return
    }

    if (!withModifier && !event.altKey && normalizedKey === "b" && targetNode.type === "folder") {
      if (!options.canEdit()) {
        return
      }

      event.preventDefault()
      void handleNodeMenuCreateChild("board", targetNode)
      return
    }

    if ((event.key === "Delete" || event.key === "Backspace") && !withModifier && !event.altKey) {
      if (!options.canEdit()) {
        return
      }

      event.preventDefault()
      void handleNodeMenuDelete(targetNode)
    }
  }

  return {
    inputDialog,
    confirmDialog,
    showTemplateDialog,
    templateDialogParentId,
    hideTemplateDialog,
    createNode,
    createNodeInstantly,
    openTemplateLibrary,
    renamingNodeId,
    finishRename,
    deleteNode,
    resolveActionNode,
    handleTreeNodeCopyLink,
    handleRootCreateMenuAction,
    treeNodeMenuGroups,
    handleMenuShortcut,
  }
}

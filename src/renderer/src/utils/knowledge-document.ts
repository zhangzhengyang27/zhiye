/** 提供知识库文档编辑器类型、内容类型与路由目标的辅助判断能力。 */

import {
  KNOWLEDGE_BOARD_CONTENT_SCHEME,
  KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
  KNOWLEDGE_DOCUMENT_EDITOR_TYPES,
  KNOWLEDGE_LEGACY_BOARD_CONTENT_SCHEME,
  KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
  type KnowledgeDocumentContent,
} from "@/types/knowledge-document"

/** 判断画板编辑器类型是否满足条件。 */
export const isBoardEditorType = (editorType?: string | null) => {
  return editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
}

/** 判断画板内容是否满足条件。 */
export const isBoardContent = (content?: KnowledgeDocumentContent | null) => {
  return (
    content?.scheme === KNOWLEDGE_BOARD_CONTENT_SCHEME ||
    content?.scheme === KNOWLEDGE_LEGACY_BOARD_CONTENT_SCHEME
  )
}

/** 判断数据表内容是否满足条件（表格文档与数据表共用同一 scheme，两者区分仍依赖 editorType）。 */
export const isDataTableContent = (content?: KnowledgeDocumentContent | null) => {
  return content?.scheme === KNOWLEDGE_DATATABLE_CONTENT_SCHEME
}

/** 判断思维导图内容是否满足条件。 */
export const isMindmapContent = (content?: KnowledgeDocumentContent | null) => {
  return content?.scheme === KNOWLEDGE_MINDMAP_CONTENT_SCHEME
}

/** 根据编辑器类型与内容 scheme 解析当前文档应使用的编辑器（editorType 缺失或漂移时按 scheme 兜底）。 */
export const resolveKnowledgeDocumentEditorType = (document?: {
  editorType?: string | null
  content?: KnowledgeDocumentContent | null
}) => {
  if (isBoardEditorType(document?.editorType) || isBoardContent(document?.content)) {
    return KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
  }

  if (isMindmapEditorType(document?.editorType) || isMindmapContent(document?.content)) {
    return KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap
  }

  // sheet 与 datatable 共用 content scheme：先认 editorType，再按 scheme 回落到 datatable
  if (isSheetEditorType(document?.editorType)) {
    return KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet
  }

  if (isDataTableEditorType(document?.editorType) || isDataTableContent(document?.content)) {
    return KNOWLEDGE_DOCUMENT_EDITOR_TYPES.datatable
  }

  return KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText
}

/** 判断当前文档是否应按画板文档处理。 */
export const isBoardDocument = (document?: {
  editorType?: string | null
  content?: KnowledgeDocumentContent | null
}) => {
  return resolveKnowledgeDocumentEditorType(document) === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
}

/** 根据编辑器类型（结合 content scheme）生成跳转到对应编辑器页面的路由目标。 */
export const getKnowledgeDocumentRouteTarget = (params: {
  kbId: string
  docId: string
  editorType?: string | null
  content?: KnowledgeDocumentContent | null
}) => {
  const editorType = resolveKnowledgeDocumentEditorType({
    editorType: params.editorType,
    content: params.content,
  })

  const routeName =
    editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
      ? "knowledge-board-editor"
      : editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.datatable
        ? "knowledge-datatable-editor"
        : editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet
          ? "knowledge-sheet-editor"
          : editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap
            ? "knowledge-mindmap-editor"
            : "knowledge-doc-editor"

  return {
    name: routeName,
    params: {
      kbId: params.kbId,
      docId: params.docId,
    },
  } as const
}

/** 判断数据表编辑器类型是否满足条件（B7 #24a）。 */
export const isDataTableEditorType = (editorType?: string | null) => {
  return editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.datatable
}

/** 判断表格文档编辑器类型是否满足条件（B7 #24b）。 */
export const isSheetEditorType = (editorType?: string | null) => {
  return editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet
}

/** 判断思维导图编辑器类型是否满足条件（B7 #24c）。 */
export const isMindmapEditorType = (editorType?: string | null) => {
  return editorType === KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap
}

export const getKnowledgeDocumentEditorLabel = (editorType?: string | null) => {
  if (isBoardEditorType(editorType)) return "画板"
  if (isDataTableEditorType(editorType)) return "数据表"
  if (isSheetEditorType(editorType)) return "表格"
  if (isMindmapEditorType(editorType)) return "思维导图"
  return "富文本文档"
}

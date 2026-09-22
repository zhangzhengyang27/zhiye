/** 汇总知识库文档内容与编辑器类型约束。 */

import type { KnowledgeBoardDocument } from "./knowledge-board"

/** 列出当前支持的文档编辑器类型标识。 */
export const KNOWLEDGE_DOCUMENT_EDITOR_TYPES = {
  richText: "nuxt-editor",
  board: "board",
  /** 数据表（B7 #24a，多维表格 v1） */
  datatable: "datatable",
  /** 表格文档（B7 #24b，自由网格 v1） */
  sheet: "sheet",
  /** 思维导图（B7 #24c） */
  mindmap: "mindmap",
} as const

/** 约束文档编辑器类型的可选值。 */
export type KnowledgeDocumentEditorType =
  (typeof KNOWLEDGE_DOCUMENT_EDITOR_TYPES)[keyof typeof KNOWLEDGE_DOCUMENT_EDITOR_TYPES]

/** 标记 Excalidraw 画板内容的协议标识。 */
export const KNOWLEDGE_BOARD_CONTENT_SCHEME = "application/vnd.excalidraw+json"

export const KNOWLEDGE_DATATABLE_CONTENT_SCHEME = "application/vnd.kb-datatable+json"

export const KNOWLEDGE_MINDMAP_CONTENT_SCHEME = "application/vnd.kb-mindmap+json"

/** 思维导图节点（B7 #24c）：simple-mind-map 的 nodeTree 数据形态 */
export interface KnowledgeMindmapNodeData {
  /** 节点文案 */
  text: string
  /** 节点唯一 id（simple-mind-map 内部用于增量更新） */
  uid?: string
  /** 是否展开子级（缺省展开） */
  expand?: boolean
}

export interface KnowledgeMindmapNode {
  data: KnowledgeMindmapNodeData
  children?: KnowledgeMindmapNode[]
}

/** 数据表字段（B7 #24a v1：文本/单选/日期） */
export interface KnowledgeDataTableField {
  id: string
  name: string
  type: "text" | "select" | "date"
  /** select 类型的可选项 */
  options?: string[]
}

/** 数据表行：fieldId → 单元格值 */
export interface KnowledgeDataTableRow {
  id: string
  cells: Record<string, string>
}

/** 数据表文档内容（多维表格 v1） */
export interface KnowledgeDataTableDocument {
  fields: KnowledgeDataTableField[]
  rows: KnowledgeDataTableRow[]
}
/** 标记旧版知识画板内容的协议标识。 */
export const KNOWLEDGE_LEGACY_BOARD_CONTENT_SCHEME = "application/vnd.xiaoye.board+json"

/** 约束画板文档内容协议的可选值。 */
export type KnowledgeBoardContentScheme =
  | typeof KNOWLEDGE_BOARD_CONTENT_SCHEME
  | typeof KNOWLEDGE_LEGACY_BOARD_CONTENT_SCHEME

/** 约束富文本文档内容协议的可选值。 */
export type KnowledgeRichTextContentScheme = "text/markdown" | "text/html"

/** 外链节点内容协议（B3c「添加链接」）：value 为目标地址。 */
export type KnowledgeLinkContent = {
  scheme: "text/uri"
  value: string
}

/** 描述文档内容在富文本、画板与外链三种形态下的序列化。 */
export type KnowledgeDocumentContent =
  | {
      scheme: KnowledgeRichTextContentScheme
      value: string
    }
  | {
      scheme: KnowledgeBoardContentScheme
      value: KnowledgeBoardDocument | Record<string, unknown>
    }
  | {
      scheme: typeof KNOWLEDGE_DATATABLE_CONTENT_SCHEME
      value: KnowledgeDataTableDocument
    }
  | {
      scheme: typeof KNOWLEDGE_MINDMAP_CONTENT_SCHEME
      value: KnowledgeMindmapNode
    }
  | KnowledgeLinkContent

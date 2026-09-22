/** 汇总知识画板在新旧格式之间流转时使用的类型。 */
export type KnowledgeLegacyBoardNodeType = "text" | "sticky" | "shape"

/** 描述旧版画板视口的平移与缩放状态。 */
export interface KnowledgeLegacyBoardViewport {
  x: number
  y: number
  zoom: number
}

interface KnowledgeLegacyBoardNodeBase {
  id: string
  type: KnowledgeLegacyBoardNodeType
  x: number
  y: number
  width: number
  height: number
  text: string
}

/** 描述旧版画板中的文本节点。 */
export interface KnowledgeLegacyBoardTextNode extends KnowledgeLegacyBoardNodeBase {
  type: "text"
  fontSize: number
}

/** 描述旧版画板中的便签节点。 */
export interface KnowledgeLegacyBoardStickyNode extends KnowledgeLegacyBoardNodeBase {
  type: "sticky"
  tone: "amber" | "green" | "blue"
}

/** 描述旧版画板中的基础形状节点。 */
export interface KnowledgeLegacyBoardShapeNode extends KnowledgeLegacyBoardNodeBase {
  type: "shape"
  fill: string
}

/** 表示旧版画板可能出现的节点类型。 */
export type KnowledgeLegacyBoardNode =
  | KnowledgeLegacyBoardTextNode
  | KnowledgeLegacyBoardStickyNode
  | KnowledgeLegacyBoardShapeNode

/** 描述旧版画板中的连线。 */
export interface KnowledgeLegacyBoardConnector {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string
}

/** 描述旧版知识画板文档的完整序列化结构。 */
export interface KnowledgeLegacyBoardDocument {
  version: 1
  viewport: KnowledgeLegacyBoardViewport
  nodes: KnowledgeLegacyBoardNode[]
  connectors: KnowledgeLegacyBoardConnector[]
  meta?: {
    background?: "grid"
    createdFrom?: "mvp"
  }
}

/** 描述当前 Excalidraw 画板文档的序列化结构。 */
export interface KnowledgeBoardDocument {
  type: "excalidraw"
  version: number
  source: string
  elements: Array<Record<string, unknown>>
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

/** 提供知识画板迁移相关工具函数与辅助配置。 */

import { convertToExcalidrawElements } from "@excalidraw/excalidraw"
import type {
  KnowledgeBoardDocument,
  KnowledgeLegacyBoardConnector,
  KnowledgeLegacyBoardDocument,
  KnowledgeLegacyBoardNode,
} from "@/types/knowledge-board"
import {
  DEFAULT_KNOWLEDGE_BOARD_BACKGROUND,
  EXCALIDRAW_SCENE_SOURCE,
  EXCALIDRAW_SCENE_TYPE,
  EXCALIDRAW_SCENE_VERSION,
  createKnowledgeBoardDocument,
  normalizeExcalidrawBoardDocument,
} from "./knowledge-board"
import { cloneSerializable, isRecord, toFiniteNumber } from "./knowledge-board-shared"

type ExcalidrawElementSkeletonInput = Parameters<typeof convertToExcalidrawElements>[0]

const toNonEmptyString = (value: unknown, fallback: string) => {
  if (typeof value !== "string") {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

const getLegacyNodeCenter = (node: KnowledgeLegacyBoardNode) => {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  }
}

const normalizeLegacyBoardNode = (value: unknown): KnowledgeLegacyBoardNode | null => {
  if (!isRecord(value)) {
    return null
  }

  const type = value.type

  if (type !== "text" && type !== "sticky" && type !== "shape") {
    return null
  }

  const id = toNonEmptyString(value.id, `legacy_${Math.random().toString(36).slice(2, 10)}`)
  const base = {
    id,
    type,
    x: toFiniteNumber(value.x, 0),
    y: toFiniteNumber(value.y, 0),
    width: Math.max(120, toFiniteNumber(value.width, type === "text" ? 320 : 220)),
    height: Math.max(64, toFiniteNumber(value.height, type === "text" ? 96 : 160)),
    text: typeof value.text === "string" ? value.text : "",
  }

  if (type === "sticky") {
    return {
      ...base,
      type,
      tone: value.tone === "green" || value.tone === "blue" ? value.tone : "amber",
    }
  }

  if (type === "shape") {
    return {
      ...base,
      type,
      fill: typeof value.fill === "string" ? value.fill : "#EEF6FF",
    }
  }

  return {
    ...base,
    type,
    fontSize: Math.min(Math.max(toFiniteNumber(value.fontSize, 18), 14), 28),
  }
}

const normalizeLegacyConnector = (value: unknown, nodeIds: Set<string>): KnowledgeLegacyBoardConnector | null => {
  if (!isRecord(value)) {
    return null
  }

  const fromNodeId = typeof value.fromNodeId === "string" ? value.fromNodeId : ""
  const toNodeId = typeof value.toNodeId === "string" ? value.toNodeId : ""

  if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId) || fromNodeId === toNodeId) {
    return null
  }

  return {
    id: toNonEmptyString(value.id, `conn_${Math.random().toString(36).slice(2, 10)}`),
    fromNodeId,
    toNodeId,
    label: typeof value.label === "string" ? value.label : undefined,
  }
}

const normalizeLegacyBoardDocument = (value: unknown): KnowledgeLegacyBoardDocument | null => {
  if (!isRecord(value)) {
    return null
  }

  const nodes = Array.isArray(value.nodes) ? value.nodes.map(normalizeLegacyBoardNode).filter(Boolean) : []
  const normalizedNodes = nodes as KnowledgeLegacyBoardNode[]

  if (normalizedNodes.length === 0) {
    return null
  }

  const nodeIds = new Set(normalizedNodes.map(node => node.id))
  const connectors = Array.isArray(value.connectors)
    ? value.connectors.map(item => normalizeLegacyConnector(item, nodeIds)).filter(Boolean)
    : []

  return {
    version: 1,
    viewport: {
      x: toFiniteNumber((value.viewport as Record<string, unknown> | undefined)?.x, 280),
      y: toFiniteNumber((value.viewport as Record<string, unknown> | undefined)?.y, 180),
      zoom: Math.min(
        Math.max(toFiniteNumber((value.viewport as Record<string, unknown> | undefined)?.zoom, 1), 0.3),
        2.4
      ),
    },
    nodes: normalizedNodes,
    connectors: connectors as KnowledgeLegacyBoardConnector[],
    meta: {
      background: "grid",
      createdFrom: "mvp",
    },
  }
}

const convertLegacyNodeToSkeletons = (node: KnowledgeLegacyBoardNode) => {
  if (node.type === "text") {
    return [
      {
        type: "text",
        x: node.x,
        y: node.y,
        text: node.text || "文本",
        fontSize: node.fontSize,
        strokeColor: "#1f1f1f",
      },
    ]
  }

  const backgroundColor =
    node.type === "sticky"
      ? node.tone === "green"
        ? "#F6FFED"
        : node.tone === "blue"
          ? "#E6F4FF"
          : "#FFF7E8"
      : node.fill || "#EEF6FF"

  const strokeColor =
    node.type === "sticky"
      ? node.tone === "green"
        ? "#52C41A"
        : node.tone === "blue"
          ? "#1677FF"
          : "#D48806"
      : "#1677FF"

  const textY = node.y + Math.min(24, Math.max(16, node.height * 0.12))

  return [
    {
      type: "rectangle",
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      backgroundColor,
      strokeColor,
      roughness: 1,
    },
    {
      type: "text",
      x: node.x + 18,
      y: textY,
      text: node.text || (node.type === "sticky" ? "便签" : "矩形卡片"),
      fontSize: node.type === "sticky" ? 20 : 18,
      strokeColor: "#1f1f1f",
    },
  ]
}

const convertLegacyConnectorToSkeleton = (
  connector: KnowledgeLegacyBoardConnector,
  nodesById: Map<string, KnowledgeLegacyBoardNode>
) => {
  const fromNode = nodesById.get(connector.fromNodeId)
  const toNode = nodesById.get(connector.toNodeId)

  if (!fromNode || !toNode) {
    return null
  }

  const from = getLegacyNodeCenter(fromNode)
  const to = getLegacyNodeCenter(toNode)

  return {
    type: "arrow",
    x: from.x,
    y: from.y,
    points: [
      [0, 0],
      [to.x - from.x, to.y - from.y],
    ],
    strokeColor: "#53B672",
    label: connector.label
      ? {
          text: connector.label,
        }
      : undefined,
  }
}

const isWrappedExcalidrawBoardDocument = (value: unknown): value is Record<string, unknown> => {
  return (
    isRecord(value) &&
    value.type === undefined &&
    value.source === "excalidraw" &&
    value.version === 2 &&
    Array.isArray(value.elements)
  )
}

const convertWrappedExcalidrawBoardDocument = (value: Record<string, unknown>): KnowledgeBoardDocument => {
  return normalizeExcalidrawBoardDocument({
    type: EXCALIDRAW_SCENE_TYPE,
    version: EXCALIDRAW_SCENE_VERSION,
    source: EXCALIDRAW_SCENE_SOURCE,
    elements: value.elements,
    appState: value.appState,
    files: value.files,
  })
}

/** 转换旧版画板ToExcalidraw文档。 */
export const convertLegacyBoardToExcalidrawDocument = (
  legacyDocument: KnowledgeLegacyBoardDocument
): KnowledgeBoardDocument => {
  const nodesById = new Map(legacyDocument.nodes.map(node => [node.id, node]))
  const skeletons = [
    ...legacyDocument.nodes.flatMap(convertLegacyNodeToSkeletons),
    ...legacyDocument.connectors
      .map(connector => convertLegacyConnectorToSkeleton(connector, nodesById))
      .filter(Boolean),
  ] as ExcalidrawElementSkeletonInput

  return {
    ...createKnowledgeBoardDocument(),
    type: EXCALIDRAW_SCENE_TYPE,
    version: EXCALIDRAW_SCENE_VERSION,
    source: EXCALIDRAW_SCENE_SOURCE,
    elements: cloneSerializable(
      convertToExcalidrawElements(skeletons) as Array<Record<string, unknown>>,
      [] as Array<Record<string, unknown>>
    ),
    appState: {
      viewBackgroundColor: DEFAULT_KNOWLEDGE_BOARD_BACKGROUND,
      zoom: {
        value: legacyDocument.viewport.zoom,
      },
    },
  }
}

/** 解析知识画板文档。 */
export const resolveKnowledgeBoardDocument = (value: unknown) => {
  if (isRecord(value) && value.type === EXCALIDRAW_SCENE_TYPE && Array.isArray(value.elements)) {
    return {
      document: normalizeExcalidrawBoardDocument(value),
      migratedFromLegacy: false,
    }
  }

  if (isWrappedExcalidrawBoardDocument(value)) {
    const meta = isRecord(value.meta) ? value.meta : null

    return {
      document: convertWrappedExcalidrawBoardDocument(value),
      migratedFromLegacy: meta?.createdFrom === "migrated-mvp",
    }
  }

  const legacyDocument = normalizeLegacyBoardDocument(value)

  if (legacyDocument) {
    return {
      document: convertLegacyBoardToExcalidrawDocument(legacyDocument),
      migratedFromLegacy: true,
    }
  }

  return {
    document: createKnowledgeBoardDocument(),
    migratedFromLegacy: false,
  }
}

/** 规范化知识画板文档。 */
export const normalizeKnowledgeBoardDocument = (value: unknown): KnowledgeBoardDocument => {
  return resolveKnowledgeBoardDocument(value).document
}

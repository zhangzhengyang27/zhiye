/** 提供知识画板 AI 结果到 Excalidraw 场景的转换与拼装能力。 */

import { convertToExcalidrawElements } from "@excalidraw/excalidraw"
import type { KnowledgeBoardDocument } from "@/types/knowledge-board"
import type {
  KnowledgeBoardAiDsl,
  KnowledgeBoardAiDslNode,
  KnowledgeBoardAiGenerateResult,
} from "@/types/knowledge-board-ai"
import { createKnowledgeBoardDocument, normalizeExcalidrawBoardDocument } from "./knowledge-board"

type ExcalidrawElementSkeletonInput = Parameters<typeof convertToExcalidrawElements>[0]

type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 白板分栏布局时的列间距。 */
const WHITEBOARD_COLUMN_GAP = 120
/** 白板分栏布局时的行间距。 */
const WHITEBOARD_ROW_GAP = 32
/** 白板场景顶部的基础留白。 */
const WHITEBOARD_PADDING_TOP = 72
/** 分组标题相对主内容的纵向偏移。 */
const WHITEBOARD_GROUP_TITLE_OFFSET = 44
/** 将生成结果追加到现有画布右侧时使用的水平间距。 */
const APPEND_SCENE_GAP = 280

const createEmptyRecord = () => Object.create(null) as Record<string, unknown>

const cloneSerializable = <T>(value: T, fallback: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return fallback
  }
}

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

const estimateTextWidth = (text: string, fontSize: number) => {
  return Math.max(120, Math.min(420, text.length * Math.max(10, fontSize * 0.68)))
}

const estimateTextHeight = (text: string, fontSize: number, width: number) => {
  const charsPerLine = Math.max(6, Math.floor(width / Math.max(fontSize * 0.7, 10)))
  const lineCount = Math.max(1, Math.ceil(text.length / charsPerLine))
  return Math.max(fontSize * 1.8, lineCount * (fontSize + 8))
}

const computeTextNodeSize = (node: KnowledgeBoardAiDslNode) => {
  if (node.type === "title") {
    const width = estimateTextWidth(node.text, 30)
    return {
      width,
      height: estimateTextHeight(node.text, 30, width),
      fontSize: 30,
    }
  }

  if (node.type === "text") {
    const width = estimateTextWidth(node.text, 20)
    return {
      width,
      height: estimateTextHeight(node.text, 20, width),
      fontSize: 20,
    }
  }

  const width = 260
  const innerWidth = width - 36
  const textHeight = estimateTextHeight(node.text, 18, innerWidth)

  return {
    width,
    height: Math.max(122, textHeight + 42),
    fontSize: 18,
  }
}

const createSceneFromElements = (elements: Array<Record<string, unknown>>, files?: Record<string, unknown>) => {
  const board = createKnowledgeBoardDocument()
  return normalizeExcalidrawBoardDocument({
    ...board,
    elements,
    files: files ?? board.files,
  })
}

const loadMermaidParser = async () => {
  const module = await import("@excalidraw/mermaid-to-excalidraw")
  return module.parseMermaidToExcalidraw
}

const normalizeElementBounds = (element: Record<string, unknown>): Bounds | null => {
  if (element.deleted === true) {
    return null
  }

  const x = toFiniteNumber(element.x)
  const y = toFiniteNumber(element.y)
  const width = toFiniteNumber(element.width)
  const height = toFiniteNumber(element.height)
  const points = Array.isArray(element.points) ? element.points : []

  if (points.length > 0) {
    let minX = x
    let maxX = x
    let minY = y
    let maxY = y

    points.forEach(point => {
      if (!Array.isArray(point) || point.length < 2) {
        return
      }

      const pointX = x + toFiniteNumber(point[0])
      const pointY = y + toFiniteNumber(point[1])
      minX = Math.min(minX, pointX)
      maxX = Math.max(maxX, pointX)
      minY = Math.min(minY, pointY)
      maxY = Math.max(maxY, pointY)
    })

    return {
      minX,
      minY,
      maxX,
      maxY,
    }
  }

  return {
    minX: Math.min(x, x + width),
    minY: Math.min(y, y + height),
    maxX: Math.max(x, x + width),
    maxY: Math.max(y, y + height),
  }
}

const getSceneBounds = (elements: Array<Record<string, unknown>>): Bounds | null => {
  const bounds = elements.map(normalizeElementBounds).filter((value): value is Bounds => Boolean(value))

  if (bounds.length === 0) {
    return null
  }

  const firstBounds = bounds[0] as Bounds
  const restBounds = bounds.slice(1)

  return restBounds.reduce<Bounds>(
    (accumulator, current) => ({
      minX: Math.min(accumulator.minX, current.minX),
      minY: Math.min(accumulator.minY, current.minY),
      maxX: Math.max(accumulator.maxX, current.maxX),
      maxY: Math.max(accumulator.maxY, current.maxY),
    }),
    firstBounds
  )
}

const shiftSceneElements = (elements: Array<Record<string, unknown>>, deltaX: number, deltaY: number) => {
  return cloneSerializable(elements, []).map(element => {
    const nextElement = {
      ...element,
      x: toFiniteNumber(element.x) + deltaX,
      y: toFiniteNumber(element.y) + deltaY,
    }

    return nextElement
  })
}

const getUniqueGroups = (nodes: KnowledgeBoardAiDsl["nodes"]) => {
  const groups: string[] = []
  const seen = new Set<string>()

  nodes.forEach(node => {
    const group = typeof node.group === "string" ? node.group.trim() : ""

    if (!group || seen.has(group)) {
      return
    }

    seen.add(group)
    groups.push(group)
  })

  return groups
}

const createWhiteboardSkeletons = (dsl: KnowledgeBoardAiDsl) => {
  const skeletons: ExcalidrawElementSkeletonInput = []
  const nodeCenterById = new Map<string, { x: number; y: number }>()
  const titleNodes = dsl.nodes.filter(node => node.type === "title" && !node.group)
  const contentNodes = dsl.nodes.filter(node => !(node.type === "title" && !node.group))
  const groups = getUniqueGroups(contentNodes)
  const defaultGroup = groups.length === 0 ? "内容" : ""
  let titleCursorX = 120
  let titleMaxBottom = 120

  titleNodes.forEach(node => {
    const size = computeTextNodeSize(node)

    skeletons.push({
      type: "text",
      x: titleCursorX,
      y: 88,
      text: node.text,
      fontSize: size.fontSize,
      strokeColor: "#1f1f1f",
      fontFamily: 3,
    })

    nodeCenterById.set(node.id, {
      x: titleCursorX + size.width / 2,
      y: 88 + size.height / 2,
    })

    titleMaxBottom = Math.max(titleMaxBottom, 88 + size.height)
    titleCursorX += size.width + 48
  })

  const groupNames = groups.length > 0 ? groups : [defaultGroup]
  const columnNodeMap = new Map<string, KnowledgeBoardAiDslNode[]>()

  groupNames.forEach(groupName => {
    columnNodeMap.set(groupName, [])
  })

  contentNodes.forEach(node => {
    const groupName = node.group?.trim() || groupNames[0] || defaultGroup
    const columnNodes = columnNodeMap.get(groupName) ?? []
    columnNodes.push(node)
    columnNodeMap.set(groupName, columnNodes)
  })

  const columnWidths = groupNames.map(groupName => {
    const columnNodes = columnNodeMap.get(groupName) ?? []
    return columnNodes.reduce((maxWidth, node) => {
      return Math.max(maxWidth, computeTextNodeSize(node).width)
    }, 260)
  })

  let columnX = 120
  groupNames.forEach((groupName, columnIndex) => {
    const columnNodes = columnNodeMap.get(groupName) ?? []
    const startY = Math.max(titleMaxBottom + WHITEBOARD_PADDING_TOP, 180)
    let cursorY = startY
    const columnWidth = Math.max(260, columnWidths[columnIndex] ?? 260)
    const hasExplicitGroups = groups.length > 0 && groupName.trim().length > 0

    if (hasExplicitGroups) {
      skeletons.push({
        type: "text",
        x: columnX,
        y: startY - WHITEBOARD_GROUP_TITLE_OFFSET,
        text: groupName,
        fontSize: 22,
        strokeColor: "#3d5a45",
        fontFamily: 3,
      })
    }

    columnNodes.forEach(node => {
      const size = computeTextNodeSize(node)
      const nodeX = columnX
      const nodeY = cursorY

      if (node.type === "card") {
        skeletons.push({
          type: "rectangle",
          x: nodeX,
          y: nodeY,
          width: size.width,
          height: size.height,
          backgroundColor: "#fffdf6",
          strokeColor: "#53B672",
          strokeWidth: 2,
          roundness: {
            type: 3,
          },
          roughness: 0,
        })
        skeletons.push({
          type: "text",
          x: nodeX + 18,
          y: nodeY + 18,
          text: node.text,
          fontSize: size.fontSize,
          strokeColor: "#1f1f1f",
          fontFamily: 3,
        })
      } else {
        skeletons.push({
          type: "text",
          x: nodeX,
          y: nodeY,
          text: node.text,
          fontSize: size.fontSize,
          strokeColor: node.type === "title" ? "#0f172a" : "#334155",
          fontFamily: 3,
        })
      }

      nodeCenterById.set(node.id, {
        x: nodeX + size.width / 2,
        y: nodeY + size.height / 2,
      })

      cursorY += size.height + WHITEBOARD_ROW_GAP
    })

    columnX += columnWidth + WHITEBOARD_COLUMN_GAP
  })

  dsl.connectors.forEach(connector => {
    const from = nodeCenterById.get(connector.fromNodeId)
    const to = nodeCenterById.get(connector.toNodeId)

    if (!from || !to) {
      return
    }

    skeletons.push({
      type: "arrow",
      x: from.x,
      y: from.y,
      points: [
        [0, 0],
        [to.x - from.x, to.y - from.y],
      ],
      strokeColor: "#4d8d65",
      strokeWidth: 2,
      label: connector.label
        ? {
            text: connector.label,
          }
        : undefined,
    })
  })

  return skeletons
}

/** 将 AI 生成结果转换为可直接加载的 Excalidraw 场景。 */
export const buildKnowledgeBoardSceneFromAiResult = async (result: KnowledgeBoardAiGenerateResult) => {
  if (result.kind === "flowchart") {
    const parseMermaidToExcalidraw = await loadMermaidParser()
    const mermaidResult = await parseMermaidToExcalidraw(result.mermaid, {
      flowchart: {
        curve: "linear",
      },
      themeVariables: {
        fontSize: "22px",
      },
      maxEdges: 200,
      maxTextSize: 10000,
    })
    const elements = convertToExcalidrawElements(mermaidResult.elements as ExcalidrawElementSkeletonInput) as Array<
      Record<string, unknown>
    >

    return createSceneFromElements(elements, cloneSerializable(mermaidResult.files, createEmptyRecord()))
  }

  const skeletons = createWhiteboardSkeletons(result.boardDsl)
  const elements = convertToExcalidrawElements(skeletons) as Array<Record<string, unknown>>
  return createSceneFromElements(elements, createEmptyRecord())
}

/** 用 AI 生成场景整体替换当前画板内容。 */
export const replaceKnowledgeBoardWithGeneratedScene = (scene: KnowledgeBoardDocument) => {
  return normalizeExcalidrawBoardDocument(scene)
}

/** 将 AI 生成场景平移到当前画板右侧并合并进去。 */
export const appendKnowledgeBoardSceneToRight = (
  currentScene: KnowledgeBoardDocument,
  generatedScene: KnowledgeBoardDocument
) => {
  const baseScene = normalizeExcalidrawBoardDocument(currentScene)
  const nextScene = normalizeExcalidrawBoardDocument(generatedScene)
  const baseBounds = getSceneBounds(baseScene.elements)
  const generatedBounds = getSceneBounds(nextScene.elements)

  if (!generatedBounds) {
    return baseScene
  }

  if (!baseBounds) {
    return normalizeExcalidrawBoardDocument({
      ...nextScene,
      appState: {
        ...baseScene.appState,
        ...nextScene.appState,
      },
    })
  }

  const deltaX = baseBounds.maxX - generatedBounds.minX + APPEND_SCENE_GAP
  const deltaY = baseBounds.minY - generatedBounds.minY
  const shiftedElements = shiftSceneElements(nextScene.elements, deltaX, deltaY)

  return normalizeExcalidrawBoardDocument({
    ...baseScene,
    elements: [...cloneSerializable(baseScene.elements, []), ...shiftedElements],
    files: {
      ...cloneSerializable(baseScene.files, createEmptyRecord()),
      ...cloneSerializable(nextScene.files, createEmptyRecord()),
    },
    appState: {
      ...baseScene.appState,
      ...nextScene.appState,
      viewBackgroundColor: baseScene.appState.viewBackgroundColor ?? nextScene.appState.viewBackgroundColor,
    },
  })
}

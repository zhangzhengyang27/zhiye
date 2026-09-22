/** 提供知识画板相关工具函数与辅助配置。 */

import type { KnowledgeBoardDocument } from "@/types/knowledge-board"
import { cloneSerializable, isRecord } from "./knowledge-board-shared"

/** 新建知识画板时使用的默认背景色。 */
export const DEFAULT_KNOWLEDGE_BOARD_BACKGROUND = "#fcfbf8"
/** 当前画板文档的固定类型标识。 */
export const EXCALIDRAW_SCENE_TYPE = "excalidraw"
/** 当前画板文档结构版本号。 */
export const EXCALIDRAW_SCENE_VERSION = 2
/** 当前应用写入 Excalidraw 文档时使用的来源标识。 */
export const EXCALIDRAW_SCENE_SOURCE = "xiaoye"

const createEmptyObject = () => Object.create(null) as Record<string, unknown>

const normalizeBoardAppState = (value: unknown) => {
  const appState = isRecord(value)
    ? cloneSerializable(value, createEmptyObject())
    : createEmptyObject()

  if (typeof appState.viewBackgroundColor !== "string" || !appState.viewBackgroundColor.trim()) {
    appState.viewBackgroundColor = DEFAULT_KNOWLEDGE_BOARD_BACKGROUND
  }

  if ("collaborators" in appState) {
    delete appState.collaborators
  }

  return appState
}

/** 创建知识画板文档。 */
export const createKnowledgeBoardDocument = (): KnowledgeBoardDocument => {
  return {
    type: EXCALIDRAW_SCENE_TYPE,
    version: EXCALIDRAW_SCENE_VERSION,
    source: EXCALIDRAW_SCENE_SOURCE,
    elements: [],
    appState: {
      viewBackgroundColor: DEFAULT_KNOWLEDGE_BOARD_BACKGROUND,
      zoom: {
        value: 1,
      },
    },
    files: createEmptyObject(),
  }
}

/** 判断输入值是否满足当前画板文档结构。 */
export const isKnowledgeBoardDocument = (value: unknown): value is KnowledgeBoardDocument => {
  return (
    isRecord(value) &&
    value.type === EXCALIDRAW_SCENE_TYPE &&
    typeof value.version === "number" &&
    typeof value.source === "string" &&
    Array.isArray(value.elements)
  )
}

/** 将任意输入规整为可安全读取的 Excalidraw 画板文档。 */
export const normalizeExcalidrawBoardDocument = (value: unknown): KnowledgeBoardDocument => {
  if (!isKnowledgeBoardDocument(value)) {
    return createKnowledgeBoardDocument()
  }

  return {
    type: EXCALIDRAW_SCENE_TYPE,
    version: Number.isFinite(value.version) ? value.version : EXCALIDRAW_SCENE_VERSION,
    source:
      typeof value.source === "string" && value.source.trim()
        ? value.source
        : EXCALIDRAW_SCENE_SOURCE,
    elements: Array.isArray(value.elements)
      ? cloneSerializable(
          value.elements.filter((item) => isRecord(item)),
          [] as Array<Record<string, unknown>>,
        )
      : [],
    appState: normalizeBoardAppState(value.appState),
    files: isRecord(value.files)
      ? cloneSerializable(value.files, createEmptyObject())
      : createEmptyObject(),
  }
}

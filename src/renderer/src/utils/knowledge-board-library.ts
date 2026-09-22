/** 提供知识画板素材库相关工具函数与辅助配置。 */

import type {
  KnowledgeBoardLibraryAsset,
  KnowledgeBoardLibraryBinaryFile,
  KnowledgeBoardLibraryItem,
} from "@/types/knowledge-board-library"
import { cloneSerializable, isRecord } from "./knowledge-board-shared"

/** 规范化知识画板素材库二进制文件。 */
export const normalizeKnowledgeBoardLibraryBinaryFiles = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as KnowledgeBoardLibraryBinaryFile[]
  }

  return value.flatMap(item => {
    if (!isRecord(item)) {
      return []
    }

    const id = typeof item.id === "string" ? item.id.trim() : ""
    const mimeType = typeof item.mimeType === "string" ? item.mimeType.trim() : ""
    const dataURL = typeof item.dataURL === "string" ? item.dataURL.trim() : ""
    const created = typeof item.created === "number" && Number.isFinite(item.created) ? item.created : Date.now()

    if (!id || !mimeType || !dataURL) {
      return []
    }

    return [
      cloneSerializable(
        {
          id,
          mimeType,
          dataURL,
          created,
          ...(typeof item.lastRetrieved === "number" && Number.isFinite(item.lastRetrieved)
            ? { lastRetrieved: item.lastRetrieved }
            : {}),
          ...(typeof item.version === "number" && Number.isFinite(item.version) ? { version: item.version } : {}),
        } satisfies KnowledgeBoardLibraryBinaryFile,
        {
          id,
          mimeType,
          dataURL,
          created,
        }
      ),
    ]
  })
}

/** 提取知识画板素材库图片文件Ids。 */
export const extractKnowledgeBoardLibraryImageFileIds = (items: KnowledgeBoardLibraryItem[]) => {
  const fileIds = new Set<string>()

  for (const item of items) {
    if (!isRecord(item) || !Array.isArray(item.elements)) {
      continue
    }

    for (const element of item.elements) {
      if (!isRecord(element) || element.type !== "image") {
        continue
      }

      const fileId = typeof element.fileId === "string" ? element.fileId.trim() : ""

      if (fileId) {
        fileIds.add(fileId)
      }
    }
  }

  return [...fileIds]
}

/** 提取知识画板素材库二进制文件。 */
export const extractKnowledgeBoardLibraryBinaryFiles = (
  items: KnowledgeBoardLibraryItem[],
  files: Record<string, unknown>
) => {
  const referencedIds = new Set(extractKnowledgeBoardLibraryImageFileIds(items))

  if (referencedIds.size === 0) {
    return [] as KnowledgeBoardLibraryBinaryFile[]
  }

  return normalizeKnowledgeBoardLibraryBinaryFiles(
    Object.values(files).filter(item => {
      return isRecord(item) && typeof item.id === "string" && referencedIds.has(item.id)
    })
  )
}

/** 合并知识画板素材库二进制文件。 */
export const mergeKnowledgeBoardLibraryBinaryFiles = (
  currentFiles: KnowledgeBoardLibraryBinaryFile[],
  nextFiles: KnowledgeBoardLibraryBinaryFile[]
) => {
  const merged = new Map<string, KnowledgeBoardLibraryBinaryFile>()

  for (const file of [...currentFiles, ...nextFiles]) {
    merged.set(file.id, cloneSerializable(file, file))
  }

  return [...merged.values()]
}

/** 根据远端素材资源构造 Excalidraw 可读的二进制文件缓存条目。 */
export const createKnowledgeBoardLibraryBinaryFilesFromAssets = (assets: KnowledgeBoardLibraryAsset[]) => {
  return assets.map(asset => ({
    id: asset.fileId,
    mimeType: asset.mimeType,
    dataURL: asset.url,
    created: new Date(asset.createdAt).getTime() || Date.now(),
    lastRetrieved: Date.now(),
  })) satisfies KnowledgeBoardLibraryBinaryFile[]
}

/** 清理知识画板素材库二进制文件。 */
export const pruneKnowledgeBoardLibraryBinaryFiles = (
  files: KnowledgeBoardLibraryBinaryFile[],
  items: KnowledgeBoardLibraryItem[]
) => {
  const referencedIds = new Set(extractKnowledgeBoardLibraryImageFileIds(items))

  return files.filter(file => referencedIds.has(file.id))
}

/** 将素材库中的二进制文件缓存还原为浏览器 File 对象。 */
export const knowledgeBoardLibraryBinaryFileToFile = async (
  file: KnowledgeBoardLibraryBinaryFile,
  fallbackName?: string
) => {
  const response = await fetch(file.dataURL)

  if (!response.ok) {
    throw new Error(`素材文件加载失败（${response.status}）`)
  }

  const blob = await response.blob()
  const extension = file.mimeType.includes("/")
    ? file.mimeType
        .split("/")
        .pop()
        ?.replace(/[^a-z0-9]+/gi, "")
    : ""
  const filename = fallbackName?.trim() || `library-${file.id}${extension ? `.${extension}` : ""}`

  return new File([blob], filename, {
    type: blob.type || file.mimeType,
    lastModified: file.created || Date.now(),
  })
}

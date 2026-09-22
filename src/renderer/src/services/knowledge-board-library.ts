/** 封装知识画板素材库相关接口请求与数据结构。 */

import type {
  KnowledgeBoardLibraryItem,
  KnowledgeBoardLibraryState,
  UploadKnowledgeBoardLibraryAssetPayload,
  KnowledgeBoardLibraryAsset,
} from "@/types/knowledge-board-library"
import { requestKbDriveApi } from "./kb-drive-http"

/**
 * 获取画板素材库配置。
 */
export const getKnowledgeBoardLibrary = () => {
  return requestKbDriveApi<KnowledgeBoardLibraryState>("/knowledge/board-library", {
    method: "GET",
  })
}

/**
 * 更新画板素材库配置。
 */
export const updateKnowledgeBoardLibrary = (items: KnowledgeBoardLibraryItem[]) => {
  return requestKbDriveApi<KnowledgeBoardLibraryState>("/knowledge/board-library", {
    method: "PUT",
    body: JSON.stringify({
      items,
    }),
  })
}

/**
 * 上传画板素材库资源。
 */
export const uploadKnowledgeBoardLibraryAsset = async (
  payload: UploadKnowledgeBoardLibraryAssetPayload,
) => {
  const form = new FormData()

  form.append("fileId", payload.fileId)
  form.append("file", payload.file)

  if (payload.kbId) {
    form.append("kbId", payload.kbId)
  }

  if (payload.docId) {
    form.append("docId", payload.docId)
  }

  return requestKbDriveApi<KnowledgeBoardLibraryAsset>("/knowledge/board-library/assets/upload", {
    method: "POST",
    body: form,
  })
}

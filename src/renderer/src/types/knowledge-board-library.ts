/** 汇总知识画板素材库在前端流转时使用的类型。 */
export interface KnowledgeBoardLibraryItem {
  [key: string]: unknown
}

/** 描述已上传到素材库的远端资源记录。 */
export interface KnowledgeBoardLibraryAsset {
  id: string
  fileId: string
  url: string
  key?: string | null
  mimeType: string
  size: number
  filename: string
  createdAt: string
  updatedAt: string
}

/** 描述 Excalidraw 本地缓存使用的二进制文件条目。 */
export interface KnowledgeBoardLibraryBinaryFile {
  id: string
  mimeType: string
  dataURL: string
  created: number
  lastRetrieved?: number
  version?: number
}

/** 描述画板向素材库同步变更时携带的条目与文件集合。 */
export interface KnowledgeBoardLibraryChangePayload {
  items: KnowledgeBoardLibraryItem[]
  files: KnowledgeBoardLibraryBinaryFile[]
}

/** 描述素材库面板在前端维护的聚合状态。 */
export interface KnowledgeBoardLibraryState {
  items: KnowledgeBoardLibraryItem[]
  assets: KnowledgeBoardLibraryAsset[]
  updatedAt: string | null
}

/** 描述上传素材库资源时需要的文件与上下文信息。 */
export interface UploadKnowledgeBoardLibraryAssetPayload {
  fileId: string
  file: File
  kbId?: string
  docId?: string
}

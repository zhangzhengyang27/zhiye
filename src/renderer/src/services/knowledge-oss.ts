/** 封装知识oss相关接口请求与数据结构。 */

import { requestKbDriveApi } from "./kb-drive-http"

/**
 * 描述资源上传结果。
 */
export interface KnowledgeUploadResult {
  url: string
  size: number
  filename: string
  key?: string
  /** true 表示对象存储不可用、已降级为文档内联 dataURL（体积受限、不共享） */
  degraded?: boolean
}

interface KnowledgeUploadPayload {
  file: File
  key?: string
  kbId?: string
  docId?: string
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve((event.target?.result as string) || "")
    // 读取失败必须拒绝，否则上传降级链路会永久挂起
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"))
    reader.onabort = () => reject(new Error("文件读取被中断"))
    reader.readAsDataURL(file)
  })

/** 内联进文档正文（dataURL）的大小上限：超过后不再降级，避免把自动保存的请求体撑爆 */
const DATA_URL_FALLBACK_MAX_BYTES = 2 * 1024 * 1024

const uploadAsset = async (
  payload: KnowledgeUploadPayload,
  token?: string | null,
): Promise<KnowledgeUploadResult> => {
  const form = new FormData()

  form.append("file", payload.file)

  if (payload.key) {
    form.append("key", payload.key)
  }

  if (payload.kbId) {
    form.append("kbId", payload.kbId)
  }

  if (payload.docId) {
    form.append("docId", payload.docId)
  }

  try {
    return await requestKbDriveApi<KnowledgeUploadResult>(
      "/knowledge/oss/upload",
      {
        method: "POST",
        body: form,
      },
      token,
    )
  } catch (error) {
    console.warn("[knowledge-oss] 上传失败，尝试本地内联降级：", error)

    // 大文件内联会让此后每次保存都携带几十 MB 的 dataURL，直接失败并提示
    if (payload.file.size > DATA_URL_FALLBACK_MAX_BYTES) {
      throw error instanceof Error ? error : new Error("文件上传失败，且文件过大无法本地内联。")
    }

    const fallbackUrl = await fileToDataUrl(payload.file)

    return {
      url: fallbackUrl,
      size: payload.file.size,
      filename: payload.file.name,
      degraded: true,
    }
  }
}

/**
 * 上传知识库资源文件。
 */
export function uploadKnowledgeAsset(file: File): Promise<string>
/**
 * 上传知识库资源文件。
 */
export function uploadKnowledgeAsset(
  payload: KnowledgeUploadPayload,
  token?: string | null,
): Promise<KnowledgeUploadResult>
/**
 * 上传知识库资源文件。
 */
export async function uploadKnowledgeAsset(
  input: File | KnowledgeUploadPayload,
  token?: string | null,
): Promise<string | KnowledgeUploadResult> {
  if (input instanceof File) {
    const result = await uploadAsset({ file: input }, token)
    return result.url
  }

  return uploadAsset(input, token)
}

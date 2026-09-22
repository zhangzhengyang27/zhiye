/** 封装文档分享相关接口请求与数据结构。 */

import { requestKbDriveApi } from "./kb-drive-http"

import type { KnowledgeDocumentContent } from "@/types/knowledge-document"

/**
 * 描述文档分享链接。
 */
export interface DocumentShare {
  id: string
  documentId: string
  shareKey: string
  /** 是否设置了访问密码（密码本体不回传客户端，只下发布尔标记） */
  hasPassword: boolean
  permission: "view" | "edit"
  expiresAt: string | null
  createdBy: string
  viewCount: number
  /** B2e 允许站内公开搜索（仅公开语义，消费端=站内搜索聚合，后续立项） */
  searchable: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 描述创建分享链接时提交的请求体。
 */
export interface CreateSharePayload {
  password?: string
  permission: "view" | "edit"
  expiresAt?: string
}

/**
 * 描述分享页可访问的文档内容。
 */
export interface SharedDocument {
  document: {
    id: string
    title: string
    content: KnowledgeDocumentContent | null
    editorType?: string
    type?: string
    kb: {
      name: string
    }
  }
  permission: "view" | "edit"
}

/**
 * 描述更新分享内容时提交的请求体。
 */
export interface UpdateSharedDocumentPayload {
  password?: string
  title?: string
  content?: KnowledgeDocumentContent
  message?: string
  versionName?: string
}

/**
 * 创建文档分享链接。
 */
export async function createDocumentShare(documentId: string, payload: CreateSharePayload): Promise<DocumentShare> {
  return await requestKbDriveApi<DocumentShare>(`/knowledge/documents/${documentId}/shares`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * 获取文档分享链接列表。
 */
export async function getDocumentShares(documentId: string): Promise<DocumentShare[]> {
  return await requestKbDriveApi<DocumentShare[]>(`/knowledge/documents/${documentId}/shares`)
}

/**
 * 删除文档分享链接。
 */
export async function deleteDocumentShare(shareId: string): Promise<void> {
  await requestKbDriveApi<void>(`/knowledge/documents/shares/${shareId}`, {
    method: "DELETE",
  })
}

/**
 * 校验分享链接并读取公开内容。
 */
export async function verifyShare(shareKey: string, password?: string): Promise<SharedDocument> {
  return await requestKbDriveApi<SharedDocument>(`/public/shares/${shareKey}/verify`, {
    method: "POST",
    body: JSON.stringify({ password }),
  })
}

/**
 * 更新分享文档的可访问内容。
 */
export async function updateSharedDocument(
  shareKey: string,
  payload: UpdateSharedDocumentPayload
): Promise<SharedDocument> {
  return await requestKbDriveApi<SharedDocument>(`/public/shares/${shareKey}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

/**
 * 更新分享设置（B2e 站内公开搜索开关）。
 */
export const updateShareSettings = (shareId: string, payload: { searchable?: boolean }, token?: string | null) =>
  requestKbDriveApi<{ id: string; searchable: boolean }>(
    `/knowledge/documents/shares/${shareId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  )

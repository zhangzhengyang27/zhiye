/**
 * 封装知识库收藏列表、状态查询与增删操作接口。
 */
import { buildKbDriveQuery, requestKbDriveApi } from "./kb-drive-http"
import type { KnowledgeDocumentEditorType } from "@/types/knowledge-document"

/**
 * 描述收藏内容项。
 */
export interface KnowledgeFavoriteItem {
  id: string
  title: string
  updatedAt: string
  kbId: string
  editorType?: KnowledgeDocumentEditorType | string
  kbName?: string
  /** 文档创建者显示名（列表接口返回，用于收藏行元信息） */
  creator?: string | null
  favoritedAt: string
  /** 所属收藏夹 id（B3a 分组；null = 未分组，显示在「全部收藏」） */
  folderId?: string | null
}

/**
 * 描述收藏夹分组。
 */
export interface KnowledgeFavoriteFolder {
  id: string
  name: string
  createdAt: string
  /** 夹内收藏数 */
  count: number
}

/**
 * 描述收藏列表结果。
 */
export interface KnowledgeFavoriteListResult {
  items: KnowledgeFavoriteItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * 获取知识库收藏列表。
 */
export const listKnowledgeFavorites = (
  params?: {
    kbId?: string
    page?: number
    pageSize?: number
  },
  token?: string | null,
) => {
  const queryText = buildKbDriveQuery({
    kbId: params?.kbId,
    page: params?.page,
    pageSize: params?.pageSize,
  })

  return requestKbDriveApi<KnowledgeFavoriteListResult>(
    `/knowledge/favorites${queryText ? `?${queryText}` : ""}`,
    undefined,
    token,
  )
}

/**
 * 取消收藏指定知识内容。
 */
export const removeKnowledgeFavorite = (documentId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    `/knowledge/favorites/${documentId}`,
    {
      method: "DELETE",
    },
    token,
  )

/**
 * 收藏指定知识内容。
 */
export const addKnowledgeFavorite = (documentId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    "/knowledge/favorites",
    {
      method: "POST",
      body: JSON.stringify({ documentId }),
    },
    token,
  )

/**
 * 检查内容是否已被收藏。
 */
export const checkKnowledgeFavorite = (documentId: string, token?: string | null) =>
  requestKbDriveApi<{ favorited: boolean }>(
    `/knowledge/favorites/exists/${documentId}`,
    undefined,
    token,
  )

/**
 * 检查知识库是否已被收藏。
 */
export const checkKnowledgeBaseFavorite = (kbId: string, token?: string | null) =>
  requestKbDriveApi<{ favorited: boolean }>(
    `/knowledge/favorites/kb/exists/${kbId}`,
    undefined,
    token,
  )

/**
 * 收藏知识库。
 */
export const addKnowledgeBaseFavorite = (kbId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    "/knowledge/favorites/kb",
    { method: "POST", body: JSON.stringify({ knowledgeBaseId: kbId }) },
    token,
  )

/**
 * 取消收藏知识库。
 */
export const removeKnowledgeBaseFavorite = (kbId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(`/knowledge/favorites/kb/${kbId}`, { method: "DELETE" }, token)

// ==================== 收藏夹分组（B3a 对齐语雀收藏页左列） ====================

/**
 * 获取收藏夹分组列表（含各夹收藏数）。
 */
export const listFavoriteFolders = (token?: string | null) =>
  requestKbDriveApi<KnowledgeFavoriteFolder[]>("/knowledge/favorites/folders", undefined, token)

/**
 * 新建收藏夹。
 */
export const createFavoriteFolder = (name: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeFavoriteFolder>(
    "/knowledge/favorites/folders",
    { method: "POST", body: JSON.stringify({ name }) },
    token,
  )

/**
 * 重命名收藏夹。
 */
export const renameFavoriteFolder = (folderId: string, name: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeFavoriteFolder>(
    `/knowledge/favorites/folders/${folderId}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
    token,
  )

/**
 * 删除收藏夹（夹内收藏回落「全部收藏」）。
 */
export const removeFavoriteFolder = (folderId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    `/knowledge/favorites/folders/${folderId}`,
    { method: "DELETE" },
    token,
  )

/**
 * 收藏移入收藏夹；folderId 传 null 表示移出（回全部收藏）。
 */
export const moveFavoriteToFolder = (
  documentId: string,
  folderId: string | null,
  token?: string | null,
) =>
  requestKbDriveApi<{ ok: boolean }>(
    "/knowledge/favorites/folders/move",
    { method: "POST", body: JSON.stringify({ documentId, folderId }) },
    token,
  )

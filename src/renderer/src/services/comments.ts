/** 封装评论相关接口请求与数据结构。 */

import { requestKbDriveApi } from "./kb-drive-http"

/**
 * 描述评论中的用户信息。
 */
export interface CommentUser {
  id: string
  displayName: string
  name: string
  email: string | null
  avatar: string | null
}

/**
 * 描述评论数据结构。
 */
export interface Comment {
  id: string
  content: string
  documentId: string
  userId: string
  parentId: string | null
  mentions: string[]
  resolved: boolean
  position: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  user: CommentUser
  replies?: Comment[]
}

/**
 * 描述创建评论时提交的请求体。
 */
export interface CreateCommentPayload {
  content: string
  parentId?: string
  mentions?: string[]
  position?: Record<string, unknown>
}

/**
 * 描述评论列表分页查询参数（顶层评论分页，后端 clamp 到 [1, 200]）。
 */
export interface ListCommentsQuery {
  page?: number
  pageSize?: number
}

/**
 * 描述评论列表分页结果：items 为顶层评论（回复内嵌于 replies），total 为顶层评论总数。
 */
export interface CommentListResult {
  items: Comment[]
  total: number
  page: number
  pageSize: number
}

/**
 * 获取文档评论列表（顶层评论分页，createdAt 正序）。
 */
export async function getDocumentComments(
  documentId: string,
  query?: ListCommentsQuery,
): Promise<CommentListResult> {
  const search = new URLSearchParams()
  if (query?.page != null) search.set("page", String(query.page))
  if (query?.pageSize != null) search.set("pageSize", String(query.pageSize))
  const qs = search.toString()
  return await requestKbDriveApi<CommentListResult>(
    `/knowledge/documents/${documentId}/comments${qs ? `?${qs}` : ""}`,
  )
}

/**
 * 创建新的评论。
 */
export async function createComment(
  documentId: string,
  payload: CreateCommentPayload,
): Promise<Comment> {
  return await requestKbDriveApi<Comment>(`/knowledge/documents/${documentId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * 删除指定评论。
 */
export async function deleteComment(commentId: string): Promise<void> {
  await requestKbDriveApi<void>(`/knowledge/comments/${commentId}`, {
    method: "DELETE",
  })
}

/**
 * 将评论标记为已解决。
 */
export async function resolveComment(commentId: string): Promise<Comment> {
  return await requestKbDriveApi<Comment>(`/knowledge/comments/${commentId}/resolve`, {
    method: "PATCH",
  })
}

/**
 * 取消评论的已解决状态。
 */
export async function unresolveComment(commentId: string): Promise<Comment> {
  return await requestKbDriveApi<Comment>(`/knowledge/comments/${commentId}/unresolve`, {
    method: "PATCH",
  })
}

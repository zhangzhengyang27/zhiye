/**
 * 小记（闪念笔记）服务：对齐语雀「小记」产品线的最小可用集。
 * 内容为纯文本；标签精确过滤与关键词搜索由后端完成。
 */

import { requestKbDriveApi } from "./kb-drive-http"

/** 描述一条小记。 */
export interface Note {
  id: string
  userId: string
  content: string
  tags: string[]
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/** 创建小记的请求体。 */
export interface CreateNotePayload {
  content: string
  tags?: string[]
  pinned?: boolean
}

/** 更新小记的请求体（均为可选）。 */
export interface UpdateNotePayload {
  content?: string
  tags?: string[]
  pinned?: boolean
}

/** 小记列表分页查询参数（后端 clamp 到 [1, 200]，默认每页 50）。 */
export interface ListNotesQuery {
  tag?: string
  q?: string
  page?: number
  pageSize?: number
}

/** 小记列表分页结果：total 为当前筛选条件下的小记总数。 */
export interface NoteListResult {
  items: Note[]
  total: number
  page: number
  pageSize: number
}

/**
 * 获取当前用户的小记列表（分页；置顶优先 + 更新时间倒序）。
 */
export async function listNotes(query?: ListNotesQuery): Promise<NoteListResult> {
  const search = new URLSearchParams()
  if (query?.tag) search.set("tag", query.tag)
  if (query?.q) search.set("q", query.q)
  if (query?.page != null) search.set("page", String(query.page))
  if (query?.pageSize != null) search.set("pageSize", String(query.pageSize))
  const qs = search.toString()
  return await requestKbDriveApi<NoteListResult>(`/knowledge/notes${qs ? `?${qs}` : ""}`)
}

/**
 * 创建小记。
 */
export async function createNote(payload: CreateNotePayload): Promise<Note> {
  return await requestKbDriveApi<Note>("/knowledge/notes", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/**
 * 更新小记（内容/标签/置顶）。
 */
export async function updateNote(noteId: string, payload: UpdateNotePayload): Promise<Note> {
  return await requestKbDriveApi<Note>(`/knowledge/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

/**
 * 删除小记。
 */
export async function deleteNote(noteId: string): Promise<void> {
  await requestKbDriveApi<void>(`/knowledge/notes/${noteId}`, { method: "DELETE" })
}

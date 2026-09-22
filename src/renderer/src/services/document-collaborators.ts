/**
 * 文档级协作者服务（B2f 对齐语雀文档协作者弹层）。
 *
 * 语义：升权不降权——KB 成员权限照旧，被邀请者按角色获得该文档的
 * 可编辑/只读能力（即使不是 KB 成员）。
 */

import { requestKbDriveApi } from "./kb-drive-http"
import { getApiErrorStatus } from "./http-client"

/** 描述文档协作者条目。 */
export interface DocumentCollaboratorItem {
  id: string
  role: "editor" | "reader"
  createdAt: string
  user: {
    id: string
    displayName: string
    email: string
    avatar: string | null
  }
  inviter?: {
    displayName: string
  } | null
}

/** 邀请文档协作者（按邮箱）。 */
export const addDocumentCollaborator = (
  documentId: string,
  payload: { email: string; role: "editor" | "reader" },
  token?: string | null
) =>
  requestKbDriveApi<DocumentCollaboratorItem>(
    `/knowledge/documents/${documentId}/collaborators`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  )

/**
 * 获取文档协作者列表（无协作者时返回空数组；403 等错误抛给调用方处理）。
 */
export async function listDocumentCollaborators(
  documentId: string,
  token?: string | null
): Promise<DocumentCollaboratorItem[]> {
  try {
    return await requestKbDriveApi<DocumentCollaboratorItem[]>(
      `/knowledge/documents/${documentId}/collaborators`,
      undefined,
      token
    )
  } catch (error) {
    // 无文档读权限（401 或 403）时表现为「无协作者」而非弹层报错；其余错误照常抛出
    const status = getApiErrorStatus(error)

    if (status === 401 || status === 403) {
      return []
    }

    throw error
  }
}

/** 修改协作者角色。 */
export const updateDocumentCollaborator = (
  documentId: string,
  collaboratorId: string,
  payload: { role: "editor" | "reader" },
  token?: string | null
) =>
  requestKbDriveApi<DocumentCollaboratorItem>(
    `/knowledge/documents/${documentId}/collaborators/${collaboratorId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  )

/** 移除协作者。 */
export const removeDocumentCollaborator = (documentId: string, collaboratorId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    `/knowledge/documents/${documentId}/collaborators/${collaboratorId}`,
    { method: "DELETE" },
    token
  )

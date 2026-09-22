/**
 * 封装知识库成员权限、角色判断与邀请相关接口。
 */
import { requestKbDriveApi } from "./kb-drive-http"

/**
 * 描述知识库成员信息。
 */
export interface KnowledgeBaseMember {
  id: string
  userId: string
  role: "owner" | "admin" | "editor" | "reader"
  joinedAt: string
  user: {
    id: string
    email: string
    displayName: string
    avatar?: string
  }
  invitedBy?: {
    id: string
    displayName: string
  }
}

/**
 * 描述当前用户在知识库中的权限快照。
 */
export interface KnowledgeBasePermissions {
  canRead: boolean
  canEdit: boolean
  canManage: boolean
  role: string | null
}

/**
 * 获取知识库成员列表。
 */
export const getKnowledgeBaseMembers = (
  kbId: string,
  token?: string | null,
): Promise<KnowledgeBaseMember[]> => {
  return requestKbDriveApi(`/knowledge/knowledge-bases/${kbId}/members`, undefined, token)
}

/**
 * 向知识库添加成员。
 */
export const addKnowledgeBaseMember = (
  kbId: string,
  data: {
    email: string
    role: "admin" | "editor" | "reader"
  },
  token?: string | null,
): Promise<KnowledgeBaseMember> => {
  return requestKbDriveApi(
    `/knowledge/knowledge-bases/${kbId}/members`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    token,
  )
}

/**
 * 更新知识库成员角色。
 */
export const updateKnowledgeBaseMemberRole = (
  kbId: string,
  userId: string,
  data: {
    role: "admin" | "editor" | "reader"
  },
  token?: string | null,
): Promise<KnowledgeBaseMember> => {
  return requestKbDriveApi(
    `/knowledge/knowledge-bases/${kbId}/members/${userId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    token,
  )
}

/**
 * 移除知识库成员。
 */
export const removeKnowledgeBaseMember = (
  kbId: string,
  userId: string,
  token?: string | null,
): Promise<{ success: boolean }> => {
  return requestKbDriveApi(
    `/knowledge/knowledge-bases/${kbId}/members/${userId}`,
    {
      method: "DELETE",
    },
    token,
  )
}

/**
 * 更新知识库可见性。
 */
export const updateKnowledgeBaseVisibility = (
  kbId: string,
  data: {
    visibility: "public" | "private"
  },
  token?: string | null,
): Promise<{ visibility: string }> => {
  return requestKbDriveApi(
    `/knowledge/knowledge-bases/${kbId}/settings`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    token,
  )
}

/**
 * 获取当前用户的知识库权限。
 */
export const checkKnowledgeBasePermissions = (
  kbId: string,
  token?: string | null,
): Promise<KnowledgeBasePermissions> => {
  return requestKbDriveApi(`/knowledge/knowledge-bases/${kbId}/permissions/check`, undefined, token)
}

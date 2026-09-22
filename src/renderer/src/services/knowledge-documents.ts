/**
 * 封装知识库文档、目录树、版本与回收站相关接口。
 */
import { requestKbDriveApi } from "./kb-drive-http"
import type {
  KnowledgeDocumentContent,
  KnowledgeDocumentEditorType,
} from "@/types/knowledge-document"

/** 约束知识库树节点与文档条目的资源类型。 */
export type KnowledgeDocumentType = "doc" | "folder" | "template" | "link"
/** 约束文档搜索接口可命中的内容范围。 */
export type KnowledgeSearchScope = "all" | "title" | "content"
export type {
  KnowledgeDocumentContent,
  KnowledgeDocumentEditorType,
} from "@/types/knowledge-document"

/**
 * 描述知识库文档基础信息。
 */
export interface KnowledgeDocumentItem {
  id: string
  title: string
  content: KnowledgeDocumentContent | null
  /** 文档级编辑器样式（正文字号/段间距），服务端持久化 */
  editorStyle?: KnowledgeDocumentEditorStyle | null
  kbId: string
  parentId?: string | null
  order: number
  status: string
  type: KnowledgeDocumentType
  editorType?: KnowledgeDocumentEditorType | string
  updatedAt: string
  createdAt: string
  /** 详情接口返回：创建者（用于文档信息面板展示） */
  creator?: {
    displayName: string
    avatar?: string | null
  } | null
  deletedAt?: string | null
  /** 详情接口返回：累计阅读数（阅读态元信息行展示） */
  viewCount?: number
  /** 详情接口返回：当前用户对该文档的有效编辑权限（含文档级协作者升权，B2f） */
  myDocPermissions?: {
    canEdit: boolean
    canManageCollaborators?: boolean
  }
}

/**
 * 描述知识库文档树节点。
 */
export interface KnowledgeDocumentTreeNode {
  id: string
  title: string
  parentId: string | null
  order: number
  status: string
  type: KnowledgeDocumentType
  editorType?: KnowledgeDocumentEditorType | string
  updatedAt: string
  /** 外链节点地址（仅 type=link 返回，B3c「添加链接」） */
  url?: string
  /** 树行摘要（B4 #21，对齐语雀 flat 视图的摘要行；服务端从正文提取，可能为空） */
  summary?: string
  children: KnowledgeDocumentTreeNode[]
}

/**
 * 描述知识库文档搜索结果。
 */
export interface KnowledgeDocumentSearchResult {
  items: Array<{
    id: string
    title: string
    updatedAt: string
    createdAt?: string
    status?: string
    editorType?: KnowledgeDocumentEditorType | string
    snippet?: string
  }>
  total: number
  page: number
  pageSize: number
  /** 站内公开分享聚合（B3 #22）：仅检索词非空时由服务端附带 */
  publicShares?: KnowledgePublicShareItem[]
}

/**
 * 描述站内公开分享搜索聚合项（搜索结果尾部分组，点击打开 /share/:shareKey）。
 */
export interface KnowledgePublicShareItem {
  id: string
  shareKey: string
  /** 分享文档标题 */
  title: string
  /** 来源知识库名（展示用徽标） */
  kbName?: string
  snippet?: string
}

/**
 * 描述最近访问文档项。
 */
export interface KnowledgeDocumentCreator {
  id: string
  displayName: string
  avatar: string | null
}

export interface KnowledgeRecentDocumentItem {
  id: string
  title: string
  kbId: string
  editorType?: KnowledgeDocumentEditorType | string
  updatedAt: string
  creator?: KnowledgeDocumentCreator | null
  lastViewedAt: string
  kb?: {
    id: string
    name: string
  }
}

/**
 * 「开始」聚合视角来源：编辑过 / 我评论的 / 分享中的 / 邀我协作 / 提到我 / 我点赞的。
 * （浏览过直接复用 recent-all）
 */
export type KnowledgeDashboardSource =
  "edited" | "commented" | "shared" | "collaborative" | "mentioned" | "liked"

/**
 * 「开始」聚合视角的文档项：公共字段 + 按来源不同的时间戳标记。
 */
export interface KnowledgeDashboardDocumentItem {
  id: string
  title: string
  kbId: string
  editorType?: KnowledgeDocumentEditorType | string
  updatedAt: string
  creator?: KnowledgeDocumentCreator | null
  kb?: {
    id: string
    name: string
  }
  /** 浏览过视角（recent-all）返回 */
  lastViewedAt?: string
  lastEditedAt?: string
  lastCommentedAt?: string
  lastSharedAt?: string
  lastMentionedAt?: string
  lastLikedAt?: string
}

/**
 * 获取「开始」页聚合文档清单。
 */
export const listDashboardKnowledgeDocuments = (
  params: {
    source: KnowledgeDashboardSource
    limit?: number
  },
  token?: string | null,
) => {
  const queryText = buildQuery({
    source: params.source,
    limit: params.limit ?? 20,
  })

  return requestKbDriveApi<KnowledgeDashboardDocumentItem[]>(
    `/knowledge/documents/dashboard?${queryText}`,
    undefined,
    token,
  )
}

/**
 * 描述文档版本项。
 */
export interface KnowledgeDocumentVersionItem {
  id: string
  createdAt: string
  message: string | null
  versionName?: string | null
  /** 保存该版本时的文档状态（draft / published…），用于「仅显示已发布」过滤 */
  status?: string
  author: {
    id: string
    email: string
    name: string | null
  }
}

/**
 * 描述文档回收站分页结果。
 */
export interface KnowledgeDocumentTrashResult {
  items: Array<{
    id: string
    title: string
    editorType?: KnowledgeDocumentEditorType | string
    kbId: string
    updatedAt: string
    deletedAt: string
    kb: {
      id: string
      name: string
    }
  }>
  total: number
  page: number
  pageSize: number
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return
    }

    query.set(key, String(value))
  })

  return query.toString()
}

/**
 * 获取知识库文档列表。
 */
export const listKnowledgeDocuments = (kbId: string, token?: string | null) => {
  const queryText = buildQuery({ kbId })
  return requestKbDriveApi<KnowledgeDocumentItem[]>(
    `/knowledge/documents?${queryText}`,
    undefined,
    token,
  )
}

/**
 * 获取知识库文档树。
 */
export const getKnowledgeDocumentTree = (kbId: string, token?: string | null) => {
  const queryText = buildQuery({ kbId })
  return requestKbDriveApi<KnowledgeDocumentTreeNode[]>(
    `/knowledge/documents/tree?${queryText}`,
    undefined,
    token,
  )
}

/**
 * 更新知识库文档排序。
 */
export const reorderKnowledgeDocuments = (
  payload: {
    kbId: string
    items: Array<{
      id: string
      parentId?: string | null
      order: number
    }>
  },
  token?: string | null,
) =>
  requestKbDriveApi<{ ok: boolean }>(
    "/knowledge/documents/reorder",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  )

/**
 * 搜索知识库文档。
 */
export const searchKnowledgeDocuments = (
  params: {
    kbId: string
    q: string
    scope?: KnowledgeSearchScope
    page?: number
    pageSize?: number
  },
  token?: string | null,
) => {
  const queryText = buildQuery({
    kbId: params.kbId,
    q: params.q,
    scope: params.scope ?? "all",
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  })

  return requestKbDriveApi<KnowledgeDocumentSearchResult>(
    `/knowledge/documents/search?${queryText}`,
    undefined,
    token,
  )
}

/**
 * 获取当前知识库内的最近文档。
 */
export const listRecentKnowledgeDocuments = (
  params: {
    kbId: string
    limit?: number
  },
  token?: string | null,
) => {
  const queryText = buildQuery({
    kbId: params.kbId,
    limit: params.limit ?? 20,
  })

  return requestKbDriveApi<KnowledgeRecentDocumentItem[]>(
    `/knowledge/documents/recent?${queryText}`,
    undefined,
    token,
  )
}

/**
 * 获取全部知识库范围内的最近文档。
 */
export const listRecentKnowledgeDocumentsAll = (
  params?: {
    limit?: number
  },
  token?: string | null,
) => {
  const queryText = buildQuery({
    limit: params?.limit ?? 20,
  })

  return requestKbDriveApi<KnowledgeRecentDocumentItem[]>(
    `/knowledge/documents/recent-all?${queryText}`,
    undefined,
    token,
  )
}

/**
 * 获取文档回收站列表。
 */
export const listKnowledgeDocumentTrash = (
  params?: {
    kbId?: string
    page?: number
    pageSize?: number
  },
  token?: string | null,
) => {
  const queryText = buildQuery({
    kbId: params?.kbId,
    page: params?.page,
    pageSize: params?.pageSize,
  })

  return requestKbDriveApi<KnowledgeDocumentTrashResult>(
    `/knowledge/documents/trash${queryText ? `?${queryText}` : ""}`,
    undefined,
    token,
  )
}

/**
 * 恢复单个文档。
 */
export const restoreKnowledgeDocument = (id: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeDocumentItem>(
    `/knowledge/documents/${id}/restore`,
    {
      method: "POST",
    },
    token,
  )

/**
 * 批量恢复文档。
 */
export const restoreKnowledgeDocuments = (ids: string[], token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    "/knowledge/documents/bulk/restore",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
    token,
  )

/**
 * 彻底删除单个文档。
 */
export const hardDeleteKnowledgeDocument = (id: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    `/knowledge/documents/${id}?hard=true`,
    {
      method: "DELETE",
    },
    token,
  )

/**
 * 批量彻底删除文档。
 */
export const hardDeleteKnowledgeDocuments = (ids: string[], token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    "/knowledge/documents/bulk/hard-delete",
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    },
    token,
  )

/**
 * 清空文档回收站。
 */
export const clearKnowledgeDocumentTrash = (kbId?: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean }>(
    `/knowledge/documents/trash/clear${kbId ? `?kbId=${encodeURIComponent(kbId)}` : ""}`,
    { method: "POST" },
    token,
  )

/**
 * 获取单个文档详情。
 */
export const getKnowledgeDocument = (id: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeDocumentItem>(`/knowledge/documents/${id}`, undefined, token)

/**
 * 创建知识库文档。
 */
export const createKnowledgeDocument = (
  payload: {
    kbId: string
    title: string
    content?: KnowledgeDocumentContent | null
    status?: string
    type?: KnowledgeDocumentType
    editorType?: KnowledgeDocumentEditorType
    parentId?: string | null
    order?: number
  },
  token?: string | null,
) =>
  requestKbDriveApi<KnowledgeDocumentItem>(
    "/knowledge/documents",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  )

/**
 * 文档级编辑器样式（与后端 DocumentEditorStyleDto 对齐）。
 */
export interface KnowledgeDocumentEditorStyle {
  fontSize?: number
  paragraphSpacing?: "default" | "relax"
}

/**
 * 更新知识库文档。
 */
export const updateKnowledgeDocument = (
  id: string,
  payload: Partial<{
    title: string
    content: KnowledgeDocumentContent | null
    editorStyle: KnowledgeDocumentEditorStyle | null
    status: string
    type: KnowledgeDocumentType
    editorType: KnowledgeDocumentEditorType
    parentId: string | null
    order: number
    message: string
    versionName: string
  }>,
  token?: string | null,
) =>
  requestKbDriveApi<KnowledgeDocumentItem>(
    `/knowledge/documents/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  )

/**
 * 将文档移入回收站。
 */
export const trashKnowledgeDocument = (id: string, token?: string | null) =>
  requestKbDriveApi(
    `/knowledge/documents/${id}/trash`,
    {
      method: "POST",
    },
    token,
  )

/**
 * 获取文档版本列表。
 */
export const listKnowledgeDocumentVersions = (id: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeDocumentVersionItem[]>(
    `/knowledge/documents/${id}/versions`,
    undefined,
    token,
  )

/**
 * 获取指定文档版本详情。
 */
export const getKnowledgeDocumentVersion = (id: string, versionId: string, token?: string | null) =>
  requestKbDriveApi<{
    id: string
    title: string
    content: KnowledgeDocumentContent | null
    status: string
    createdAt: string
  }>(`/knowledge/documents/${id}/versions/${versionId}`, undefined, token)

/**
 * 删除指定文档版本。
 */
export const deleteKnowledgeDocumentVersion = (
  id: string,
  versionId: string,
  token?: string | null,
) =>
  requestKbDriveApi(
    `/knowledge/documents/${id}/versions/${versionId}`,
    {
      method: "DELETE",
    },
    token,
  )

/**
 * 获取文档模板列表。
 */
export const listKnowledgeDocumentTemplates = (kbId: string, token?: string | null) =>
  requestKbDriveApi<
    Array<{
      id: string
      title: string
      content: KnowledgeDocumentContent | null
      updatedAt: string
      createdAt: string
    }>
  >(`/knowledge/documents/templates?kbId=${encodeURIComponent(kbId)}`, undefined, token)

/**
 * 根据模板创建文档。
 */
export const createKnowledgeDocumentFromTemplate = (
  templateId: string,
  payload: {
    title: string
    parentId?: string
    /** 「我的」模板跨库创建（B4 #14）：新文档落目标知识库 */ targetKbId?: string
  },
  token?: string | null,
) =>
  requestKbDriveApi<KnowledgeDocumentItem>(
    `/knowledge/documents/${templateId}/create-from-template`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  )

/**
 * 「我的」跨库模板（B4 #14）：本人创建的全部模板（限定可读知识库集），
 * kb.name 用于模板中心按来源知识库分组。
 */
export interface KnowledgeMyTemplateItem {
  id: string
  title: string
  content: KnowledgeDocumentContent | null
  kbId: string
  updatedAt: string
  createdAt: string
  kb?: {
    name: string
  }
}

export const listMyKnowledgeTemplates = (token?: string | null) =>
  requestKbDriveApi<KnowledgeMyTemplateItem[]>(
    "/knowledge/documents/templates/mine",
    undefined,
    token,
  )

/**
 * 将文档回滚到指定版本。
 */
export const rollbackKnowledgeDocumentVersion = (
  id: string,
  versionId: string,
  token?: string | null,
) =>
  requestKbDriveApi<KnowledgeDocumentItem>(
    `/knowledge/documents/${id}/rollback/${versionId}`,
    {
      method: "POST",
    },
    token,
  )

/**
 * 记录文档访问行为。
 */
export const recordKnowledgeDocumentView = (id: string, token?: string | null) =>
  requestKbDriveApi(
    `/knowledge/documents/${id}/view`,
    {
      method: "POST",
    },
    token,
  )

/**
 * 知识网络卡片（对齐后端 KnowledgeLinkDocCard，updatedAt 为 JSON 序列化的 ISO 串）。
 */
export interface KnowledgeLinkDocCard {
  id: string
  title: string
  updatedAt: string
  creatorName: string | null
}

/** 双向链接结果（backlinks=被引用 / forwardLinks=引用了，弱引用 v1）。 */
export interface KnowledgeLinksResult {
  backlinks: KnowledgeLinkDocCard[]
  forwardLinks: KnowledgeLinkDocCard[]
}

/**
 * 获取文档知识网络（B2b：基于文档间链接引用的双向列表，端点对齐后端
 * DocumentsKnowledgeLinksService.listLinks：GET /knowledge/documents/:id/knowledge-links）。
 */
export const getKnowledgeDocumentLinks = (documentId: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeLinksResult>(
    `/knowledge/documents/${documentId}/knowledge-links`,
    undefined,
    token,
  )

/**
 * 文档点赞状态（对齐 DocumentsLikeService.getLikeInfo：是否已赞 + 总数 + 最近点赞者）。
 */
export interface DocumentLikeInfo {
  liked: boolean
  count: number
  likers: Array<{
    id: string
    displayName: string
    avatar: string | null
  }>
}

/** 点赞文档（幂等：已赞再赞返回现状）。 */
export const likeDocument = (id: string, token?: string | null) =>
  requestKbDriveApi<{ liked: boolean; count: number }>(
    `/knowledge/documents/${id}/like`,
    { method: "POST" },
    token,
  )

/** 取消点赞（未赞时同样幂等返回现状）。 */
export const unlikeDocument = (id: string, token?: string | null) =>
  requestKbDriveApi<{ liked: boolean; count: number }>(
    `/knowledge/documents/${id}/like`,
    { method: "DELETE" },
    token,
  )

/** 获取点赞状态与点赞者列表（阅读态进入时拉取）。 */
export const getDocumentLike = (id: string, token?: string | null) =>
  requestKbDriveApi<DocumentLikeInfo>(`/knowledge/documents/${id}/like`, undefined, token)

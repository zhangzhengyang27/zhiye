/**
 * 封装知识库列表、创建、更新与回收站相关接口。
 */
import { buildKbDriveQuery, requestKbDriveApi } from "./kb-drive-http"

/**
 * KB 级偏好设置（settings JSON 通道）。
 * 「更多设置」四项与 defaultExpandLevel 一样缺省走服务端默认值：
 * docWidthMode=standard（固定页宽）、commentsEnabled=true、autoPublish=false、
 * docCreatePosition=top（顶部新增）。
 */
export interface KnowledgeBaseSettings {
  /** 目录默认展开级别（B4 #16）：1-5，缺省折叠 */
  defaultExpandLevel?: number | null
  /** 文档页宽：standard=固定页宽，wide=超宽自适应（适合超宽表格） */
  docWidthMode?: "standard" | "wide"
  /** 评论功能开关：缺省开启，显式 false 后所有用户都无法评论 */
  commentsEnabled?: boolean
  /** 自动发布开关：缺省关闭，开启后保存草稿时自动发布 */
  autoPublish?: boolean
  /** 文档新建位置：top=同层顶部新增，bottom=同层底部新增 */
  docCreatePosition?: "top" | "bottom"
}

/**
 * 描述知识库基础信息。
 */
export interface KnowledgeBaseItem {
  id: string
  name: string
  description?: string | null
  cover?: string | null
  /** 路径标识（B4 #15）：URL 独特小标记，唯一；空表示未设置 */
  slug?: string | null
  /** KB 级偏好（B4 #16 + 更多设置分区），缺省项走服务端默认值 */
  settings?: KnowledgeBaseSettings | null
  visibility?: "public" | "private"
  ownerId: string
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
  /** 详情接口返回：创建者（用于主页头像展示） */
  creator?: {
    displayName: string
    avatar?: string | null
  } | null
  /** 详情接口返回：对齐语雀「N 文档 · N 字」统计 */
  stats?: {
    docCount: number
    wordCount: number
  }
}

/**
 * 更新知识库偏好设置（B4 #16 + 更多设置分区）；defaultExpandLevel 传 null 表示恢复默认（全部折叠）。
 */
export const updateKnowledgeBasePreferences = (id: string, payload: KnowledgeBaseSettings, token?: string | null) =>
  requestKbDriveApi<KnowledgeBaseItem>(
    withKnowledgePrefix(`/knowledge-bases/${id}/preferences`),
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    token
  )

/**
 * 描述知识库回收站分页结果。
 */
export interface KnowledgeBaseTrashResult {
  items: KnowledgeBaseItem[]
  total: number
  page: number
  pageSize: number
}

/** 知识库相关接口在服务端使用的统一路径前缀。 */
const KNOWLEDGE_API_PREFIX = "/knowledge"

const withKnowledgePrefix = (path: string) => `${KNOWLEDGE_API_PREFIX}${path}`

/**
 * 获取当前用户可见的知识库列表。
 */
export const listKnowledgeBases = (token?: string | null) =>
  requestKbDriveApi<KnowledgeBaseItem[]>(withKnowledgePrefix("/knowledge-bases"), undefined, token)

/**
 * 批量更新知识库排序。
 */
export const updateKnowledgeBaseSortOrder = (items: { id: string; sortOrder: number }[], token?: string | null) =>
  requestKbDriveApi<{ success: boolean }>(
    withKnowledgePrefix("/knowledge-bases/sort-order"),
    {
      method: "PATCH",
      body: JSON.stringify({ items }),
    },
    token
  )

/**
 * 获取知识库回收站列表。
 */
export const listKnowledgeBaseTrash = (
  params?: {
    page?: number
    pageSize?: number
  },
  token?: string | null
) => {
  const queryText = buildKbDriveQuery({
    page: params?.page,
    pageSize: params?.pageSize,
  })

  return requestKbDriveApi<KnowledgeBaseTrashResult>(
    withKnowledgePrefix(`/knowledge-bases/trash${queryText ? `?${queryText}` : ""}`),
    undefined,
    token
  )
}

/**
 * 创建新的知识库。
 */
export const createKnowledgeBase = (
  payload: {
    name: string
    description?: string
  },
  token?: string | null
) =>
  requestKbDriveApi<KnowledgeBaseItem>(
    withKnowledgePrefix("/knowledge-bases"),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  )

/**
 * 更新知识库信息。
 */
export const updateKnowledgeBase = (
  id: string,
  payload: Partial<Pick<KnowledgeBaseItem, "name" | "description" | "cover" | "slug">>,
  token?: string | null
) =>
  requestKbDriveApi<KnowledgeBaseItem>(
    withKnowledgePrefix(`/knowledge-bases/${id}`),
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token
  )

/**
 * 删除知识库。
 */
export const deleteKnowledgeBase = (id: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeBaseItem>(
    withKnowledgePrefix(`/knowledge-bases/${id}`),
    {
      method: "DELETE",
    },
    token
  )

/**
 * 恢复已删除的知识库。
 */
export const restoreKnowledgeBase = (id: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeBaseItem>(
    withKnowledgePrefix(`/knowledge-bases/${id}/restore`),
    {
      method: "POST",
    },
    token
  )

/**
 * 获取单个知识库详情。
 */
export const getKnowledgeBase = (id: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeBaseItem>(withKnowledgePrefix(`/knowledge-bases/${id}`), undefined, token)

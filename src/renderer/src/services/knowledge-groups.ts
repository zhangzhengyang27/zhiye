/**
 * 知识库分组（批次 C，对齐语雀 Stack/Bookstacks）接口封装。
 *
 * 分组是侧栏知识库列表的一层容器：不嵌套、不装文档；KB.groupId 为空 = 未分组；
 * 删除分组后组内知识库自动迁回未分组（服务端 FK SetNull）。
 */
import { requestKbDriveApi } from "./kb-drive-http"

export interface KnowledgeGroupItem {
  id: string
  name: string
  ownerId: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

const withKnowledgePrefix = (path: string) => `/knowledge${path}`

export const listKnowledgeGroups = (token?: string | null) =>
  requestKbDriveApi<KnowledgeGroupItem[]>(
    withKnowledgePrefix("/knowledge-groups"),
    undefined,
    token,
  )

/** 创建分组；name 缺省 = 「未命名分组」（即时创建 + 行内改名，对齐语雀） */
export const createKnowledgeGroup = (payload: { name?: string } = {}, token?: string | null) =>
  requestKbDriveApi<KnowledgeGroupItem>(
    withKnowledgePrefix("/knowledge-groups"),
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  )

export const renameKnowledgeGroup = (id: string, name: string, token?: string | null) =>
  requestKbDriveApi<KnowledgeGroupItem>(
    withKnowledgePrefix(`/knowledge-groups/${id}`),
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
    token,
  )

/** 上移/下移分组：前端换算整组新次序后批量提交（与知识库 sort-order 同款契约） */
export const updateKnowledgeGroupSortOrder = (
  items: { id: string; sortOrder: number }[],
  token?: string | null,
) =>
  requestKbDriveApi<{ success: boolean }>(
    withKnowledgePrefix("/knowledge-groups/sort-order"),
    {
      method: "PATCH",
      body: JSON.stringify({ items }),
    },
    token,
  )

export const removeKnowledgeGroup = (id: string, token?: string | null) =>
  requestKbDriveApi<{ success: boolean }>(
    withKnowledgePrefix(`/knowledge-groups/${id}`),
    { method: "DELETE" },
    token,
  )

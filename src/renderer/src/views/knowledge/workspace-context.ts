/** 汇总知识库工作区向子组件注入的上下文类型与注入键。 */
import type { InjectionKey, Ref } from "vue"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"
import type {
  KnowledgeDocumentTreeNode,
  KnowledgeDocumentType,
} from "@/services/knowledge-documents"
import type { KnowledgeBasePermissions } from "@/services/knowledge-permissions"

/**
 * 表示工作区内允许直接创建的节点类型。
 */
export type KnowledgeWorkspaceCreateNodeType =
  KnowledgeDocumentType | "board" | "datatable" | "sheet" | "mindmap"

/**
 * 描述工作区布局向子树提供的上下文能力。
 */
export interface KnowledgeWorkspaceContext {
  kbId: Ref<string>
  knowledgeBase: Ref<KnowledgeBaseItem | null>
  treeNodes: Ref<KnowledgeDocumentTreeNode[]>
  permissions: Ref<KnowledgeBasePermissions | null>
  refreshWorkspace: () => Promise<void>
  refreshTree: () => Promise<void>
  refreshPermissions: () => Promise<void>
  createNode: (
    type: KnowledgeWorkspaceCreateNodeType,
    parentId?: string | null,
  ) => void | Promise<void>
  openTemplateLibrary: (parentId?: string | null) => void
  openDoc: (docId: string) => void
}

/** 供工作区子组件读取上下文能力的注入键。 */
export const knowledgeWorkspaceContextKey: InjectionKey<KnowledgeWorkspaceContext> = Symbol(
  "knowledge-workspace-context",
)

/** 列出知识画板 AI 支持的生成模式。 */
export const KNOWLEDGE_BOARD_AI_MODES = {
  auto: "auto",
  flowchart: "flowchart",
  whiteboard: "whiteboard",
} as const

/** 列出知识画板 AI 支持的模型提供方。 */
export const KNOWLEDGE_BOARD_AI_PROVIDERS = {
  deepseek: "deepseek",
  openAiCompatible: "openai-compatible",
} as const

/** 约束画板 AI 生成模式的可选值。 */
export type KnowledgeBoardAiMode = (typeof KNOWLEDGE_BOARD_AI_MODES)[keyof typeof KNOWLEDGE_BOARD_AI_MODES]

/** 表示显式指定结果形态时可选的生成模式。 */
export type KnowledgeBoardAiKind = Exclude<KnowledgeBoardAiMode, "auto">
/** 约束模型提供方标识。 */
export type KnowledgeBoardAiProvider = (typeof KNOWLEDGE_BOARD_AI_PROVIDERS)[keyof typeof KNOWLEDGE_BOARD_AI_PROVIDERS]

/** 描述一次模型请求所需的提供方配置。 */
export interface KnowledgeBoardAiProviderConfig {
  provider: KnowledgeBoardAiProvider
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

/**
 * 描述随生成请求提交的提供方配置（请求侧口径）。
 * 与后端 GenerateBoardAiProviderConfigDto 对齐：除 provider 外全可选，
 * 完整的 KnowledgeBoardAiProviderConfig 可直接赋给它。
 */
export interface KnowledgeBoardAiProviderConfigPayload {
  provider: KnowledgeBoardAiProvider
  apiKey?: string
  baseUrl?: string
  model?: string
  timeoutMs?: number
}

/** 描述本地持久化 API Key 时保存的密文结构。 */
export interface KnowledgeBoardAiEncryptedSecret {
  version: 1 | 2
  algorithm: "AES-GCM" | "XOR-LOCAL"
  iv: string
  ciphertext: string
}

/** 描述用户在配置面板中可编辑的一份提供方资料。 */
export interface KnowledgeBoardAiProviderProfile extends KnowledgeBoardAiProviderConfig {
  id: string
  name: string
}

/** 描述带更新时间的提供方资料草稿。 */
export interface KnowledgeBoardAiProviderProfileDraft extends KnowledgeBoardAiProviderProfile {
  updatedAt: string
}

/** 描述写入本地存储后的提供方资料，不再直接保存明文 API Key。 */
export interface KnowledgeBoardAiStoredProfile extends Omit<KnowledgeBoardAiProviderProfile, "apiKey"> {
  encryptedApiKey: KnowledgeBoardAiEncryptedSecret | null
  updatedAt: string
}

/** 描述运行时使用的 AI 配置集合与当前激活项。 */
export interface KnowledgeBoardAiConfigCollection {
  activeProfileId: string
  profiles: KnowledgeBoardAiProviderProfile[]
}

/** 描述落盘后的 AI 配置快照。 */
export interface KnowledgeBoardAiStoredConfig {
  activeProfileId: string
  profiles: KnowledgeBoardAiStoredProfile[]
  updatedAt: string
}

/** 描述白板生成结果中的节点结构。 */
export interface KnowledgeBoardAiDslNode {
  id: string
  type: "title" | "card" | "text"
  text: string
  group?: string
}

/** 描述白板生成结果中的连线结构。 */
export interface KnowledgeBoardAiDslConnector {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string
}

/** 描述白板模式返回的 DSL 草稿。 */
export interface KnowledgeBoardAiDsl {
  nodes: KnowledgeBoardAiDslNode[]
  connectors: KnowledgeBoardAiDslConnector[]
}

/** 描述请求 AI 生成画板草稿时提交的提示词与提供方配置。 */
export interface KnowledgeBoardAiGenerateRequest {
  prompt: string
  mode: KnowledgeBoardAiMode
  providerConfig?: KnowledgeBoardAiProviderConfigPayload
}

/** 描述流程图模式返回的 Mermaid 草稿与提示信息。 */
export interface KnowledgeBoardAiFlowchartResult {
  kind: "flowchart"
  summary: string
  warnings: string[]
  mermaid: string
}

/** 描述白板模式返回的 DSL 草稿与提示信息。 */
export interface KnowledgeBoardAiWhiteboardResult {
  kind: "whiteboard"
  summary: string
  warnings: string[]
  boardDsl: KnowledgeBoardAiDsl
}

/** 表示画板 AI 生成接口可能返回的结果形态。 */
export type KnowledgeBoardAiGenerateResult = KnowledgeBoardAiFlowchartResult | KnowledgeBoardAiWhiteboardResult

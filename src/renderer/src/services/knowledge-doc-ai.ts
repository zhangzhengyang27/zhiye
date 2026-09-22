/** 封装知识库文档 AI 写作面板的接口请求（复用画板 AI 的 DeepSeek 通道）。 */

import { AI_REQUEST_TIMEOUT_MS, requestKbDriveApi } from "./kb-drive-http"
import type { KnowledgeBoardAiProviderConfigPayload } from "@/types/knowledge-board-ai"

/** 文档 AI 内置动作。 */
export type DocAiAction = "summarize" | "outline" | "continue" | "polish" | "translate" | "custom"

export interface DocAiWriteRequest {
  action: DocAiAction
  instruction?: string
  selection?: string
  providerConfig?: KnowledgeBoardAiProviderConfigPayload
}

export interface DocAiWriteResult {
  text: string
}

/** 向指定文档发起 AI 写作请求（服务端读取正文 + 返回自由文本）。 */
export const generateDocumentAiWrite = (documentId: string, payload: DocAiWriteRequest, token?: string | null) =>
  requestKbDriveApi<DocAiWriteResult>(
    `/knowledge/documents/${documentId}/ai/write`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      // 续写、润色等动作的生成耗时随正文长度浮动，客户端兜底超时防无限等待
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    },
    token
  )

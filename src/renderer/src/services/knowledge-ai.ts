/** 封装 AI 写作页的独立生成接口（无文档上下文，复用服务端 DeepSeek 通道）。 */

import { AI_REQUEST_TIMEOUT_MS, requestKbDriveApi } from "./kb-drive-http"
import type { KnowledgeBoardAiProviderConfigPayload } from "@/types/knowledge-board-ai"

export interface AiStandaloneWriteRequest {
  instruction: string
  /** 深度思考开关：服务端据此调整提示词 */
  deepThink?: boolean
  providerConfig?: KnowledgeBoardAiProviderConfigPayload
}

export interface AiStandaloneWriteResult {
  text: string
}

/** 直接按指令生成文本（不依赖具体文档）。 */
export const generateAiStandaloneWrite = (payload: AiStandaloneWriteRequest, token?: string | null) =>
  requestKbDriveApi<AiStandaloneWriteResult>(
    "/knowledge/ai/write",
    {
      method: "POST",
      body: JSON.stringify(payload),
      // 深度思考模式的生成耗时显著更长，客户端兜底超时防无限等待
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    },
    token
  )

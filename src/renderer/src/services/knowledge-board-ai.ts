/** 封装知识画板 AI 生成接口请求。 */

import { AI_REQUEST_TIMEOUT_MS, requestKbDriveApi } from "./kb-drive-http"
import type { KnowledgeBoardAiGenerateRequest, KnowledgeBoardAiGenerateResult } from "@/types/knowledge-board-ai"

/** 向指定文档发起画板 AI 草稿生成请求。 */
export const generateKnowledgeBoardAi = (
  documentId: string,
  payload: KnowledgeBoardAiGenerateRequest,
  token?: string | null
) =>
  requestKbDriveApi<KnowledgeBoardAiGenerateResult>(
    `/knowledge/documents/${documentId}/board-ai/generate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      // 生成耗时随提示词长度浮动，客户端兜底超时防无限等待
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    },
    token
  )

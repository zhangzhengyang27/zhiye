/** 提供Mermaid渲染相关工具函数与辅助配置。 */

import type { CodeBlockTheme } from "./enhanced-code-block"
import { escapeHtml } from "./enhanced-code-block"
import { logger } from "@/utils/logger"

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void
  render: (
    id: string,
    text: string
  ) => Promise<{
    svg: string
    bindFunctions?: (element: Element) => void
  }>
}

let mermaidLoader: Promise<MermaidModule> | null = null

/** 加载MermaidModule。 */
export const loadMermaidModule = async () => {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then(module => {
      const mermaid = module.default ?? module

      return {
        initialize: mermaid.initialize.bind(mermaid),
        render: mermaid.render.bind(mermaid),
      }
    })
  }

  return mermaidLoader
}

/** 解析Mermaid主题。 */
export const resolveMermaidTheme = (theme?: CodeBlockTheme | string) => {
  switch (theme) {
    case "github-light":
      return "default"
    case "slate":
      return "forest"
    default:
      return "dark"
  }
}

const createStaticStage = (block: HTMLElement) => {
  const documentRef = block.ownerDocument
  const stage = documentRef.createElement("div")
  stage.className = "kb-code-block__mermaid-static"
  block.insertBefore(stage, block.querySelector(".kb-code-block__body"))
  return stage
}

/** 渲染Mermaid块InContainer。 */
export const renderMermaidBlocksInContainer = async (container: ParentNode) => {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.kb-code-block[data-language="mermaid"]'))

  if (blocks.length === 0) {
    return
  }

  let mermaid: MermaidModule

  try {
    mermaid = await loadMermaidModule()
  } catch (error) {
    logger.error("mermaid-render", "Mermaid 模块加载失败，已回退为源码展示。", error)
    return
  }

  let renderIndex = 0

  for (const block of blocks) {
    const codeElement = block.querySelector("pre code")
    const source = codeElement?.textContent?.trim()
    const stage = block.querySelector<HTMLElement>(".kb-code-block__mermaid-static") || createStaticStage(block)

    if (!source) {
      stage.innerHTML = ""
      block.dataset.mermaidRendered = "empty"
      continue
    }

    try {
      mermaid.initialize({
        startOnLoad: false,
        // strict：图表文本里的标签与链接由 mermaid 自行消毒，防止恶意源码借渲染注入
        securityLevel: "strict",
        theme: resolveMermaidTheme(block.dataset.theme),
        fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace",
      })

      const rendered = await mermaid.render(`kb-mermaid-static-${Date.now()}-${renderIndex}`, source)
      renderIndex += 1

      stage.innerHTML = rendered.svg
      rendered.bindFunctions?.(stage)
      block.dataset.mermaidRendered = "true"
    } catch (error) {
      logger.error("mermaid-render", "静态 Mermaid 渲染失败:", error)
      // 错误信息可能拼接图表源码原文，进 innerHTML 前必须转义
      stage.innerHTML = `<div class="kb-code-block__mermaid-static-error">${escapeHtml(
        error instanceof Error ? error.message : "Mermaid 图表渲染失败，请检查语法。"
      )}</div>`
      block.dataset.mermaidRendered = "error"
    }
  }
}

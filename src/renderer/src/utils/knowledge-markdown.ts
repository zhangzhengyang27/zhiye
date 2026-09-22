/** 提供知识Markdown相关工具函数与辅助配置。 */

import DOMPurify from "dompurify"
import MarkdownIt from "markdown-it"
import {
  enhancedCodeBlockStyles,
  escapeHtml,
  getCodeBlockAttrsFromDataset,
  normalizeCodeBlockAttrs,
  parseCodeFenceInfo,
  renderEnhancedCodeBlockHtml,
} from "./enhanced-code-block"
import { renderMermaidBlocksInContainer } from "./mermaid-render"

type MarkdownRenderer = ReturnType<typeof createKnowledgeMarkdown>
type MarkdownInstance = InstanceType<typeof MarkdownIt>
type ImageRenderer = NonNullable<MarkdownInstance["renderer"]["rules"]["image"]>
type FenceRenderer = NonNullable<MarkdownInstance["renderer"]["rules"]["fence"]>

const applyLazyImageRule = (markdown: MarkdownInstance) => {
  const defaultImageRender = markdown.renderer.rules.image

  markdown.renderer.rules.image = ((...args: Parameters<ImageRenderer>) => {
    const [rawTokens, rawIdx, options, env, rawSelf] = args
    const tokens = rawTokens as { attrSet: (name: string, value: string) => void }[]
    const idx = rawIdx as number
    const self = rawSelf as {
      renderToken: (tokens: unknown[], idx: number, options: unknown) => string
    }
    const token = tokens[idx]

    if (!token) {
      return ""
    }
    token.attrSet("loading", "lazy")

    return defaultImageRender
      ? defaultImageRender(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }) as typeof markdown.renderer.rules.image
}

const renderLegacyFence = (tokens: Array<{ info?: string; content: string }>, idx: number) => {
  const token = tokens[idx]
  if (!token) {
    return ""
  }
  const info = token.info ? escapeHtml(token.info.trim()) : ""
  const languageClass = info ? ` class="language-${info}"` : ""
  return `<pre><code${languageClass}>${escapeHtml(token.content)}</code></pre>`
}

const getLanguageFromCodeElement = (element: HTMLElement) => {
  const className = Array.from(element.classList).find((classItem) =>
    classItem.startsWith("language-"),
  )
  return className ? className.replace("language-", "") : undefined
}

const normalizeKnowledgeHtmlBody = (content: string) => {
  if (typeof DOMParser === "undefined") {
    return content
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(content, "text/html")
  const legacyBlocks = Array.from(documentNode.body.querySelectorAll<HTMLElement>("pre"))

  for (const block of legacyBlocks) {
    if (block.closest(".kb-code-block")) {
      continue
    }

    const codeElement = block.querySelector("code")
    if (!codeElement) {
      continue
    }

    const attrs = normalizeCodeBlockAttrs({
      ...getCodeBlockAttrsFromDataset(block.dataset),
      language: block.dataset.language || getLanguageFromCodeElement(codeElement) || "text",
    })

    const fragment = parser.parseFromString(
      renderEnhancedCodeBlockHtml(codeElement.textContent || "", attrs),
      "text/html",
    ).body.firstElementChild

    if (!fragment) {
      continue
    }

    block.replaceWith(fragment)
  }

  return documentNode.body.innerHTML
}

const applyEnhancedCodeBlockFence = (markdown: MarkdownInstance) => {
  const defaultFence = markdown.renderer.rules.fence

  markdown.renderer.rules.fence = (...args: Parameters<FenceRenderer>) => {
    const [rawTokens, rawIdx, options, env, self] = args
    const tokens = rawTokens as Array<{ info?: string; content: string }>
    const idx = rawIdx as number
    const token = tokens[idx]

    if (!token) {
      return ""
    }

    const parsed = parseCodeFenceInfo(token.info || "")

    if (!parsed.language) {
      return defaultFence
        ? defaultFence(tokens, idx, options, env, self)
        : renderLegacyFence(tokens, idx)
    }

    return renderEnhancedCodeBlockHtml(
      token.content,
      normalizeCodeBlockAttrs({
        language: parsed.language,
        ...parsed.attrs,
      }),
    )
  }
}

/**
 * HTML 出口统一消毒（打印 document.write 与导出/分享共用此处）：
 * markdown-it 以 html:true 直通内嵌标签，存量 HTML scheme 文档本身就是标签流——
 * 进入独立打印窗（同源特权上下文）或导出文件前统一清洗，阻断 script、
 * on* 事件属性与 javascript: 链接等注入面；增强代码块的自产标记（div/pre/code、
 * data-* 属性）均在默认白名单内，不受影响。
 */
const sanitizeKnowledgeHtml = (html: string) => {
  return DOMPurify.isSupported ? DOMPurify.sanitize(html) : html
}

/** 创建知识Markdown。 */
export const createKnowledgeMarkdown = () => {
  const markdown = new MarkdownIt({ html: true, breaks: true })

  applyLazyImageRule(markdown)
  applyEnhancedCodeBlockFence(markdown)

  return markdown
}

let sharedMarkdownInstance: MarkdownInstance | null = null

export const getSharedMarkdown = (): MarkdownInstance => {
  if (!sharedMarkdownInstance) {
    sharedMarkdownInstance = createKnowledgeMarkdown()
  }
  return sharedMarkdownInstance
}

/** 获取知识库文档样式。 */
export const getKnowledgeDocumentStyles = () => `body {
  margin: 0 auto;
  max-width: 880px;
  padding: 48px;
  color: #0f172a;
  font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #ffffff;
}
h1, h2, h3, h4, h5, h6 {
  color: #0f172a;
  line-height: 1.3;
}
p, ul, ol, blockquote {
  margin: 1em 0;
}
pre {
  overflow: auto;
}
code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
blockquote {
  margin: 16px 0;
  padding-left: 16px;
  border-left: 4px solid #cbd5e1;
  color: #475569;
}
img {
  max-width: 100%;
  height: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  border: 1px solid #cbd5e1;
  padding: 8px 12px;
  text-align: left;
}
th {
  background: #f8fafc;
}
${enhancedCodeBlockStyles}
@media print {
  body {
    padding: 0;
  }
}`

/** 渲染知识库文档正文。 */
export const renderKnowledgeDocumentBody = (
  content: string,
  contentType: "markdown" | "html",
  markdown: MarkdownRenderer = getSharedMarkdown(),
) => {
  const body =
    contentType === "markdown" ? markdown.render(content) : normalizeKnowledgeHtmlBody(content)
  return sanitizeKnowledgeHtml(body)
}

/** 渲染知识库文档HTML。 */
export const renderKnowledgeDocumentHtml = (
  title: string,
  content: string,
  contentType: "markdown" | "html",
  markdown: MarkdownRenderer = getSharedMarkdown(),
) => {
  const body = renderKnowledgeDocumentBody(content, contentType, markdown)

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${getKnowledgeDocumentStyles()}
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </body>
</html>`
}

/** 渲染知识库文档HTMLWithMermaid。 */
export const renderKnowledgeDocumentHtmlWithMermaid = async (
  title: string,
  content: string,
  contentType: "markdown" | "html",
  markdown: MarkdownRenderer = getSharedMarkdown(),
) => {
  const html = renderKnowledgeDocumentHtml(title, content, contentType, markdown)

  if (typeof DOMParser === "undefined") {
    return html
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(html, "text/html")

  await renderMermaidBlocksInContainer(documentNode.body)

  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`
}

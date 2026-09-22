/** 提供文档内容元数据相关工具函数与辅助配置。 */
export type DocumentContentScheme = "text/markdown" | "text/html"

/** 描述文档大纲中的单个标题条目。 */
export type DocumentOutlineItem = {
  id: string
  text: string
  depth: number
}

const parseHtmlDocument = (source: string) => {
  if (typeof DOMParser === "undefined") {
    return null
  }

  return new DOMParser().parseFromString(source, "text/html")
}

/** 提取文档大纲。 */
export const extractDocumentOutline = (
  content: string,
  scheme: DocumentContentScheme,
  prefix = "outline"
): DocumentOutlineItem[] => {
  const source = content.trim()

  if (!source) {
    return []
  }

  if (scheme === "text/html") {
    const documentNode = parseHtmlDocument(source)
    const headings = Array.from(documentNode?.querySelectorAll("h1, h2, h3, h4") ?? [])

    return headings
      .map((node, index) => ({
        id: `${prefix}-${index + 1}`,
        text: node.textContent?.trim() || "",
        depth: Math.max(0, Number(node.tagName.slice(1)) - 1),
      }))
      .filter(item => Boolean(item.text))
  }

  const lines = source.split(/\r?\n/)
  const items: DocumentOutlineItem[] = []
  let inCodeBlock = false

  lines.forEach(line => {
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock
      return
    }

    if (inCodeBlock) {
      return
    }

    const matched = line.match(/^(#{1,4})\s+(.+)$/)

    if (!matched) {
      return
    }

    const [, headingMarks, headingText] = matched

    if (!headingMarks || !headingText) {
      return
    }

    items.push({
      id: `${prefix}-${items.length + 1}`,
      text: headingText.trim(),
      depth: headingMarks.length - 1,
    })
  })

  return items
}

/** 提取文档内容对应的纯文本版本。 */
export const extractDocumentPlainText = (content: string, scheme: DocumentContentScheme) => {
  const source = content.trim()

  if (!source) {
    return ""
  }

  if (scheme === "text/html") {
    const documentNode = parseHtmlDocument(source)
    return documentNode?.body.textContent?.replace(/\s+/g, " ").trim() || ""
  }

  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#>*_\-~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}


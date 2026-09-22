/**
 * HTML → Markdown 轻量转换（用于 docx 导入）。
 *
 * mammoth 将 .docx 转为 HTML 后，经本工具降为 Markdown 文本，
 * 与知识库文档 content.scheme = "text/markdown" 的存储形态对齐。
 * 覆盖标题/段落/列表/引用/代码块/表格/行内样式等常见结构；
 * 未覆盖的元素按可见文本降级，保证内容不丢失。
 *
 * 注意：与 utils/document-export.ts 的 htmlToMarkdown（导出/版本对比链路的
 * turndown 实现）是两套刻意不合并的实现，口径漂移属预期；修改任一侧时
 * 先确认另一侧是否需要同步。
 */

const isBlockTag = (tag: string): boolean =>
  ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "TABLE", "HR", "BR"].includes(
    tag
  )

const inlineTag = (tag: string): boolean =>
  ["STRONG", "B", "EM", "I", "CODE", "A", "SPAN", "DEL", "S", "U", "SUP", "SUB", "SMALL", "IMG"].includes(tag)

const collectTable = (table: HTMLElement): string[] => {
  const rows = Array.from(table.querySelectorAll("tr"))
  const grid = rows.map(row =>
    Array.from(row.querySelectorAll("th, td")).map(cell => cell.textContent?.trim().replace(/\s+/g, " ") ?? "")
  )

  if (grid.length === 0) {
    return []
  }

  const columnCount = Math.max(...grid.map(row => row.length))
  const normalizeRow = (row: string[]): string[] => {
    const cells = [...row]
    while (cells.length < columnCount) {
      cells.push("")
    }
    return cells.slice(0, columnCount)
  }

  const lines: string[] = []
  const header = normalizeRow(grid[0] ?? [])
  lines.push(`| ${header.join(" | ")} |`)
  lines.push(`| ${header.map(() => "---").join(" | ")} |`)
  for (const row of grid.slice(1)) {
    lines.push(`| ${normalizeRow(row).join(" | ")} |`)
  }
  return lines
}

const renderNode = (node: Node, depth: number): string[] => {
  const lines: string[] = []

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ""
    if (text.trim()) {
      lines.push(text)
    }
    return lines
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return lines
  }

  const element = node as HTMLElement
  const tag = element.tagName

  if (tag === "BR") {
    lines.push("")
    return lines
  }

  if (tag === "HR") {
    lines.push("---")
    return lines
  }

  if (tag === "PRE") {
    const code = element.querySelector("code")
    const raw = (code ?? element).textContent ?? ""
    const lang = code?.className?.match(/language-([\w-]+)/)?.[1] ?? ""
    const normalized = raw.replace(/\n$/, "")
    lines.push("```" + lang)
    lines.push(normalized)
    lines.push("```")
    return lines
  }

  if (tag === "TABLE") {
    return collectTable(element)
  }

  if (tag === "UL" || tag === "OL") {
    const ordered = tag === "OL"
    let index = 0
    for (const li of Array.from(element.children).filter(child => child.tagName === "LI")) {
      const childLines = renderNode(li, depth + 1)
      const firstContent =
        childLines
          .filter(line => line.trim())
          .join("\n")
          .split("\n")[0] ?? ""
      const rest = childLines.slice(1)
      const marker = ordered ? `${++index}.` : "-"
      lines.push(`${"  ".repeat(depth)}${marker} ${firstContent}`)
      for (const restLine of rest) {
        lines.push(`${"  ".repeat(depth + 1)}${restLine}`)
      }
    }
    return lines
  }

  if (tag === "LI") {
    return renderNodeChildren(element, depth)
  }

  if (tag === "BLOCKQUOTE") {
    const inner = renderNodeChildren(element, depth)
    for (const line of inner) {
      lines.push(`> ${line}`)
    }
    return lines
  }

  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    const text = element.textContent?.trim() ?? ""
    if (text) {
      lines.push(`${"#".repeat(level)} ${text}`)
    }
    return lines
  }

  if (tag === "P") {
    const inner = renderNodeChildren(element, depth)
    const paragraph = inner.join("").trim()
    if (paragraph) {
      lines.push(paragraph)
      lines.push("")
    }
    return lines
  }

  if (tag === "DIV") {
    return renderNodeChildren(element, depth)
  }

  if (inlineTag(tag)) {
    const inner = renderNodeChildren(element, depth).join("").trim()
    if (!inner) {
      return lines
    }

    if (tag === "STRONG" || tag === "B") {
      lines.push(`**${inner}**`)
    } else if (tag === "EM" || tag === "I") {
      lines.push(`*${inner}*`)
    } else if (tag === "CODE") {
      lines.push(`\`${inner}\``)
    } else if (tag === "DEL" || tag === "S") {
      lines.push(`~~${inner}~~`)
    } else if (tag === "A") {
      const href = (element as HTMLAnchorElement).getAttribute("href") ?? ""
      lines.push(href ? `[${inner}](${href})` : inner)
    } else if (tag === "IMG") {
      const src = element.getAttribute("src") ?? ""
      const alt = element.getAttribute("alt") ?? ""
      lines.push(src ? `![${alt}](${src})` : alt)
    } else {
      lines.push(inner)
    }
    return lines
  }

  return renderNodeChildren(element, depth)
}

const renderNodeChildren = (node: HTMLElement, depth: number): string[] => {
  const lines: string[] = []
  for (const child of Array.from(node.childNodes)) {
    for (const line of renderNode(child, depth)) {
      lines.push(line)
    }
  }
  return lines
}

/** 将 HTML 文档片段转为 Markdown 文本。 */
export const htmlToMarkdown = (html: string): string => {
  const container = document.createElement("div")
  container.innerHTML = html

  const blocks: string[] = []
  let paragraphBuffer = ""

  const flushParagraph = () => {
    const trimmed = paragraphBuffer.replace(/\s+/g, " ").trim()
    if (trimmed) {
      blocks.push(trimmed)
    }
    paragraphBuffer = ""
  }

  for (const node of Array.from(container.childNodes)) {
    const lines = renderNode(node, 0)
    const isBlock = node.nodeType === Node.ELEMENT_NODE && isBlockTag((node as HTMLElement).tagName)

    if (isBlock) {
      flushParagraph()
      for (const line of lines) {
        blocks.push(line)
      }
      if (lines.length > 0) {
        blocks.push("")
      }
    } else {
      paragraphBuffer += lines.join("")
    }
  }
  flushParagraph()

  const output = blocks
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return output || ""
}

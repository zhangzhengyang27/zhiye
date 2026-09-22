/**
 * 小记 markdown-lite（#17）：约定三种行语法，其余按纯文本渲染。
 * - 待办：`- [ ] 文本` / `- [x] 文本`
 * - 图片：`![描述](url)` 独占一行
 * - 附件：`[附件名](url)` 独占一行（非图片链接）
 * 解析结果供卡片渲染与待办勾选回写使用；解析失败一律按文本行兜底。
 */

export type NoteSegment =
  | { kind: "text"; text: string; lineIndex: number }
  | { kind: "todo"; checked: boolean; text: string; lineIndex: number }
  | { kind: "image"; url: string; lineIndex: number }
  | { kind: "attachment"; label: string; url: string; lineIndex: number }

const TODO_PATTERN = /^-\s\[( |x|X)\]\s?(.*)$/
const IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)\)$/
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)\s]+)\)$/

/** 按行解析小记内容为渲染段（保留行序；空行归并为空文本段）。 */
export const parseNoteSegments = (content: string): NoteSegment[] => {
  return content.split("\n").map((line, lineIndex) => {
    const todo = line.match(TODO_PATTERN)
    if (todo) {
      return {
        kind: "todo" as const,
        checked: (todo[1] ?? " ").toLowerCase() === "x",
        text: todo[2] ?? "",
        lineIndex,
      }
    }

    const image = line.match(IMAGE_PATTERN)
    if (image) {
      return { kind: "image" as const, url: image[2] ?? "", lineIndex }
    }

    const link = line.match(LINK_PATTERN)
    if (link && !line.startsWith("!")) {
      return {
        kind: "attachment" as const,
        label: link[1] ?? "附件",
        url: link[2] ?? "",
        lineIndex,
      }
    }

    return { kind: "text" as const, text: line, lineIndex }
  })
}

/** 翻转指定行的待办勾选状态，返回新内容；该行不是待办时原样返回。 */
export const toggleTodoLine = (content: string, lineIndex: number): string => {
  const lines = content.split("\n")
  const line = lines[lineIndex]
  if (line === undefined) {
    return content
  }

  if (/^-\s\[\s\]/.test(line)) {
    lines[lineIndex] = line.replace(/^-\s\[\s\]/, "- [x]")
  } else if (/^-\s\[[xX]\]/.test(line)) {
    lines[lineIndex] = line.replace(/^-\s\[[xX]\]/, "- [ ]")
  }
  return lines.join("\n")
}

import { describe, expect, it } from "vitest"
import { parseNoteSegments, toggleTodoLine } from "./notes-markdown"

describe("parseNoteSegments（#17 小记 markdown-lite）", () => {
  it("解析待办行（未勾/已勾）", () => {
    const segments = parseNoteSegments("- [ ] 买牛奶\n- [x] 交报告")
    expect(segments[0]).toMatchObject({
      kind: "todo",
      checked: false,
      text: "买牛奶",
      lineIndex: 0,
    })
    expect(segments[1]).toMatchObject({ kind: "todo", checked: true, text: "交报告", lineIndex: 1 })
  })

  it("解析图片与附件行", () => {
    const segments = parseNoteSegments(
      "![截图](https://x.com/a.png)\n[会议纪要.docx](https://x.com/b.docx)",
    )
    expect(segments[0]).toMatchObject({ kind: "image", url: "https://x.com/a.png" })
    expect(segments[1]).toMatchObject({
      kind: "attachment",
      label: "会议纪要.docx",
      url: "https://x.com/b.docx",
    })
  })

  it("普通文本与空行归为文本段并保留行号", () => {
    const segments = parseNoteSegments("第一行\n\n第三行")
    expect(segments[0]).toMatchObject({ kind: "text", text: "第一行", lineIndex: 0 })
    expect(segments[1]).toMatchObject({ kind: "text", text: "", lineIndex: 1 })
    expect(segments[2]).toMatchObject({ kind: "text", text: "第三行", lineIndex: 2 })
  })

  it("非法语法行兜底为文本", () => {
    const segments = parseNoteSegments("![没有闭合的图片(https://x)\n[空url]()")
    expect(segments.every((s) => s.kind === "text")).toBe(true)
  })
})

describe("toggleTodoLine（#17 待办勾选回写）", () => {
  it("未勾 → 已勾，其余行不动", () => {
    expect(toggleTodoLine("- [ ] A\n文本", 0)).toBe("- [x] A\n文本")
  })

  it("已勾 → 未勾", () => {
    expect(toggleTodoLine("- [x] A", 0)).toBe("- [ ] A")
  })

  it("非待办行原样返回", () => {
    expect(toggleTodoLine("普通文本", 0)).toBe("普通文本")
  })

  it("越界行号原样返回", () => {
    expect(toggleTodoLine("- [ ] A", 5)).toBe("- [ ] A")
  })
})

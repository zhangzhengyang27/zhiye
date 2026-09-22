import { describe, expect, it } from "vitest"
import { collectFolderIds, findTreeNode, normalizeNodeIds, removeTreeNode } from "./tree-utils"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

const makeNode = (
  id: string,
  type: "doc" | "folder",
  children: KnowledgeDocumentTreeNode[] = []
): KnowledgeDocumentTreeNode => ({ id, type, children }) as KnowledgeDocumentTreeNode

const tree = [
  makeNode("a", "folder", [makeNode("a-1", "doc"), makeNode("a-2", "folder", [makeNode("a-2-1", "doc")])]),
  makeNode("b", "doc"),
]

describe("normalizeNodeIds", () => {
  it("去重并过滤空值", () => {
    expect(normalizeNodeIds(["a", "", "a", "b"])).toEqual(["a", "b"])
  })
})

describe("collectFolderIds（可展开容器 = 分组节点）", () => {
  it("递归收集全部分组节点 id", () => {
    expect(collectFolderIds(tree).sort()).toEqual(["a", "a-2"])
  })

  it("挂了子级的文档不算分组（当前口径：可展开容器只有 folder）", () => {
    expect(collectFolderIds([makeNode("d", "doc", [makeNode("d-1", "doc")])])).toEqual([])
  })
})

describe("findTreeNode", () => {
  it("按 id 深度查找节点", () => {
    expect(findTreeNode(tree, "a-2-1")?.id).toBe("a-2-1")
  })
  it("找不到返回 null", () => {
    expect(findTreeNode(tree, "missing")).toBeNull()
  })
})

describe("removeTreeNode", () => {
  it("原地移除目标节点并返回移除信息，不影响兄弟", () => {
    const working = structuredClone(tree)
    const removed = removeTreeNode(working, "a-1")
    expect(removed?.node.id).toBe("a-1")
    expect(removed?.parentId).toBe("a")
    expect(working[0]?.children.map((c: KnowledgeDocumentTreeNode) => c.id)).toEqual(["a-2"])
    expect(working[1]?.id).toBe("b")
  })
})

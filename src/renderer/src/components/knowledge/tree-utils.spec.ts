import { describe, expect, it } from "vitest"
import {
  canDropTreeNode,
  collectFolderIds,
  collectFolderIdsUpToDepth,
  findTreeNode,
  normalizeNodeIds,
  removeTreeNode,
} from "./tree-utils"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

const makeNode = (
  id: string,
  type: "doc" | "folder",
  children: KnowledgeDocumentTreeNode[] = [],
): KnowledgeDocumentTreeNode => ({ id, type, children }) as KnowledgeDocumentTreeNode

const tree = [
  makeNode("a", "folder", [
    makeNode("a-1", "doc"),
    makeNode("a-2", "folder", [makeNode("a-2-1", "doc")]),
  ]),
  makeNode("b", "doc"),
]

describe("normalizeNodeIds", () => {
  it("去重并过滤空值", () => {
    expect(normalizeNodeIds(["a", "", "a", "b"])).toEqual(["a", "b"])
  })
})

describe("collectFolderIds（可展开容器 = 分组节点 + 挂子级的文档，批次 B）", () => {
  it("递归收集全部分组节点 id", () => {
    expect(collectFolderIds(tree).sort()).toEqual(["a", "a-2"])
  })

  it("挂了子级的文档算可展开容器（批次 B 文档嵌套文档）", () => {
    expect(collectFolderIds([makeNode("d", "doc", [makeNode("d-1", "doc")])])).toEqual(["d"])
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

describe("collectFolderIdsUpToDepth（#16 默认展开级别）", () => {
  it("只收集深度小于 maxDepth 的目录（根为 1 级）", () => {
    expect(collectFolderIdsUpToDepth(tree, 1)).toEqual([])
    expect(collectFolderIdsUpToDepth(tree, 2)).toEqual(["a"])
    expect(collectFolderIdsUpToDepth(tree, 3).sort()).toEqual(["a", "a-2"])
  })

  it("深度超出树高时等价于全展开", () => {
    expect(collectFolderIdsUpToDepth(tree, 9)).toEqual(["a", "a-2"])
  })

  it("非法深度（0/负数）返回空数组", () => {
    expect(collectFolderIdsUpToDepth(tree, 0)).toEqual([])
    expect(collectFolderIdsUpToDepth(tree, -1)).toEqual([])
  })
})

describe("canDropTreeNode（拖拽合法性纯函数）", () => {
  const sourceDoc = makeNode("d1", "doc")
  const sourceFolder = makeNode("f1", "folder", [
    makeNode("f1-1", "folder", [makeNode("f1-1-1", "doc")]),
  ])
  const workTree = [
    makeNode("a", "folder", [makeNode("a-1", "doc")]),
    makeNode("b", "doc"),
    sourceFolder,
    sourceDoc,
  ]

  it("不能拖到自身（inside / before 同拒）", () => {
    expect(
      canDropTreeNode(workTree, sourceFolder, { position: "inside", nodeId: "f1", parentId: null }),
    ).toBe(false)
    expect(
      canDropTreeNode(workTree, sourceDoc, { position: "before", nodeId: "d1", parentId: null }),
    ).toBe(false)
  })

  it("inside 落点：分组放行；纯净文档放行（两级文档链），带 doc 子级的文档与分组拒绝", () => {
    expect(
      canDropTreeNode(workTree, sourceDoc, { position: "inside", nodeId: "b", parentId: null }),
    ).toBe(true)
    expect(
      canDropTreeNode(workTree, makeNode("dx", "doc", [makeNode("dx-1", "doc")]), {
        position: "inside",
        nodeId: "b",
        parentId: null,
      }),
    ).toBe(false)
    expect(
      canDropTreeNode(workTree, sourceFolder, { position: "inside", nodeId: "b", parentId: null }),
    ).toBe(false)
    expect(
      canDropTreeNode(workTree, sourceDoc, { position: "inside", nodeId: "a", parentId: null }),
    ).toBe(true)
  })

  it("目录不可入自身后代：入自身子级 / 后代目录 / 后代节点旁均拒绝", () => {
    expect(
      canDropTreeNode(workTree, sourceFolder, {
        position: "inside",
        nodeId: "f1-1",
        parentId: null,
      }),
    ).toBe(false)
    expect(
      canDropTreeNode(workTree, sourceFolder, {
        position: "inside",
        nodeId: "f1-1-1",
        parentId: null,
      }),
    ).toBe(false)
    expect(
      canDropTreeNode(workTree, sourceFolder, {
        position: "after",
        nodeId: "f1-1-1",
        parentId: "f1-1",
      }),
    ).toBe(false)
  })

  it("目录拖到自身子树外正常放行", () => {
    expect(
      canDropTreeNode(workTree, sourceFolder, {
        position: "inside",
        nodeId: "a",
        parentId: null,
      }),
    ).toBe(true)
    expect(
      canDropTreeNode(workTree, sourceDoc, {
        position: "after",
        nodeId: "b",
        parentId: null,
      }),
    ).toBe(true)
  })
})

/**
 * use-tree-drag 纯逻辑单元测试。
 *
 * 边界说明：composable 的全局指针链路（handleGlobalTreeDragMove / End）依赖
 * onMounted 挂到 window 的事件监听，node 测试环境没有组件实例、监听不会挂载；
 * commitTreeDrop（提交 + 快照回滚）与命中解析也未导出。以上均不可直达、不覆盖。
 * 本文件覆盖可纯测的三块：
 * 1. 拖拽会话状态机：beginDrag / resetTreeDragState / draggingNodeId 门禁；
 * 2. isDescendantNode 防环查询：含对响应式 treeNodes 的实时跟随；
 * 3. 拖拽合法性规则：tree-utils 的 canDropTreeNode 纯函数（其文件头注明
 *    「与 use-tree-drag 的运行时判定同口径，供单测与复用」），以及
 *    commitTreeDrop「乐观更新 + 快照还原」所依赖的
 *    cloneTreeNodes / removeTreeNode 组合语义。
 *
 * 三个模块级 mock 仅为让 use-tree-drag 的静态依赖可在 node 环境加载
 * （toast 依赖 element-plus 通知样式，请求层依赖浏览器桥接），用例不触达它们。
 */
import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"

vi.mock("@/composables/use-transient-toast", () => ({
  useTransientToast: () => ({ showToastMessage: vi.fn() }),
}))

vi.mock("@/services/http-client", () => ({
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

vi.mock("@/services/knowledge-documents", () => ({
  reorderKnowledgeDocuments: vi.fn(async () => ({ ok: true })),
}))

import { useTreeDrag } from "./use-tree-drag"
import {
  canDropTreeNode,
  cloneTreeNodes,
  findTreeNode,
  removeTreeNode,
  type TreeDropPlacement,
} from "./tree-utils"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

const makeNode = (
  id: string,
  type: KnowledgeDocumentTreeNode["type"],
  children: KnowledgeDocumentTreeNode[] = [],
): KnowledgeDocumentTreeNode => ({
  id,
  title: id,
  parentId: null,
  order: 0,
  status: "published",
  type,
  updatedAt: "2026-01-01T00:00:00.000Z",
  children,
})

/** 就地补齐 parentId 链（拖拽提交/回滚语义依赖该字段）。 */
const withParentIds = (
  nodes: KnowledgeDocumentTreeNode[],
  parentId: string | null = null,
): KnowledgeDocumentTreeNode[] =>
  nodes.map((node) => {
    node.parentId = parentId
    node.children = withParentIds(node.children, node.id)
    return node
  })

/** 结构：a > (a-1, a-2 > (a-2-1 > (a-2-1-1)))，b。 */
const baseTree = withParentIds([
  makeNode("a", "folder", [
    makeNode("a-1", "doc"),
    makeNode("a-2", "folder", [makeNode("a-2-1", "doc", [makeNode("a-2-1-1", "doc")])]),
  ]),
  makeNode("b", "doc"),
])

type Harness = ReturnType<typeof createTreeDragHarness>

/**
 * 直接调用 composable（不 mount 组件）：node 环境无组件实例，
 * 内部 onMounted/onBeforeUnmount 只会打 Vue 警告，临时静音保持输出整洁。
 */
const createTreeDragHarness = () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    const treeNodes = ref<KnowledgeDocumentTreeNode[]>(cloneTreeNodes(baseTree))
    const expandedFolderIds = ref<string[]>([])
    const reordering = ref(false)
    const api = useTreeDrag({
      kbId: ref("kb-1"),
      treeNodes,
      expandedFolderIds,
      scrollRef: ref<HTMLElement | null>(null),
      disabled: () => false,
      reordering,
      refreshTree: async () => {},
      ensureFocusedNode: () => {},
    })
    return { treeNodes, expandedFolderIds, reordering, ...api }
  } finally {
    warnSpy.mockRestore()
  }
}

const nodeById = (harness: Harness, id: string): KnowledgeDocumentTreeNode => {
  const node = findTreeNode(harness.treeNodes.value, id)
  if (!node) {
    throw new Error(`fixture 缺少节点：${id}`)
  }
  return node
}

const makePointerEvent = (overrides: Partial<PointerEvent> = {}): PointerEvent =>
  ({
    pointerId: 1,
    pointerType: "mouse",
    clientX: 100,
    clientY: 120,
    ...overrides,
  }) as PointerEvent

describe("useTreeDrag 拖拽会话（beginDrag / resetTreeDragState）", () => {
  it("beginDrag 建立会话：记录来源节点、起点与鼠标输入，active 置 false", () => {
    const harness = createTreeDragHarness()
    const startedAtBefore = Date.now()

    harness.beginDrag({
      event: makePointerEvent({ pointerId: 7, clientX: 30, clientY: 40 }),
      node: nodeById(harness, "a-1"),
    })

    const session = harness.treeDragSession.value
    expect(session).not.toBeNull()
    expect(session?.sourceNodeId).toBe("a-1")
    expect(session?.pointerId).toBe(7)
    expect(session?.inputMode).toBe("mouse")
    expect(session?.active).toBe(false)
    expect(session?.startX).toBe(30)
    expect(session?.startY).toBe(40)
    expect(session?.startedAt).toBeGreaterThanOrEqual(startedAtBefore)
    expect(session?.startedAt).toBeLessThanOrEqual(Date.now())
  })

  it("输入模式判定：touch 记为 touch，其余（pen 等）回落 mouse", () => {
    const harness = createTreeDragHarness()

    harness.beginDrag({
      event: makePointerEvent({ pointerType: "touch" }),
      node: nodeById(harness, "a-1"),
    })
    expect(harness.treeDragSession.value?.inputMode).toBe("touch")

    harness.beginDrag({
      event: makePointerEvent({ pointerType: "pen" }),
      node: nodeById(harness, "a-1"),
    })
    expect(harness.treeDragSession.value?.inputMode).toBe("mouse")
  })

  it("重复 beginDrag 以最后一次会话为准", () => {
    const harness = createTreeDragHarness()

    harness.beginDrag({ event: makePointerEvent({ pointerId: 1 }), node: nodeById(harness, "a-1") })
    harness.beginDrag({
      event: makePointerEvent({ pointerId: 2, clientX: 55, clientY: 66 }),
      node: nodeById(harness, "b"),
    })

    const session = harness.treeDragSession.value
    expect(session?.pointerId).toBe(2)
    expect(session?.sourceNodeId).toBe("b")
    expect(session?.startX).toBe(55)
  })

  it("beginDrag 清空上一次遗留的落点与阻止原因", () => {
    const harness = createTreeDragHarness()
    harness.treeDropTarget.value = {
      nodeId: "a",
      parentId: null,
      index: 0,
      position: "inside",
      inputMode: "mouse",
    }
    harness.treeDragBlockedReason.value = "遗留的阻止原因"

    harness.beginDrag({ event: makePointerEvent(), node: nodeById(harness, "b") })

    expect(harness.treeDropTarget.value).toBeNull()
    expect(harness.treeDragBlockedReason.value).toBeNull()
  })

  it("未过位移阈值前 draggingNodeId 保持 null（点击/轻移不亮拖拽态）", () => {
    const harness = createTreeDragHarness()
    expect(harness.draggingNodeId.value).toBeNull()

    harness.beginDrag({ event: makePointerEvent(), node: nodeById(harness, "b") })

    expect(harness.treeDragSession.value).not.toBeNull()
    expect(harness.draggingNodeId.value).toBeNull()
  })

  it("resetTreeDragState 清空会话与全部派生态", () => {
    const harness = createTreeDragHarness()
    harness.beginDrag({ event: makePointerEvent(), node: nodeById(harness, "b") })

    harness.resetTreeDragState()

    expect(harness.treeDragSession.value).toBeNull()
    expect(harness.draggingNodeId.value).toBeNull()
    expect(harness.treeDropTarget.value).toBeNull()
    expect(harness.treeDragBlockedReason.value).toBeNull()
  })

  it("无会话时 reset 与清理函数是安全空操作", () => {
    const harness = createTreeDragHarness()

    expect(() => {
      harness.clearTreeDragHoverExpand()
      harness.stopTreeAutoScroll()
      harness.resetTreeDragState()
    }).not.toThrow()
    expect(harness.treeDragSession.value).toBeNull()
  })
})

describe("useTreeDrag.isDescendantNode（防环祖先查询）", () => {
  it("直接子级与深层后代均判为后代", () => {
    const harness = createTreeDragHarness()
    expect(harness.isDescendantNode("a", "a-1")).toBe(true)
    expect(harness.isDescendantNode("a", "a-2-1")).toBe(true)
    expect(harness.isDescendantNode("a", "a-2-1-1")).toBe(true)
    expect(harness.isDescendantNode("a-2", "a-2-1-1")).toBe(true)
  })

  it("兄弟、其他分支与节点自身不算后代", () => {
    const harness = createTreeDragHarness()
    expect(harness.isDescendantNode("a-1", "a-2")).toBe(false)
    expect(harness.isDescendantNode("b", "a-1")).toBe(false)
    expect(harness.isDescendantNode("a-2-1", "a-2-1")).toBe(false)
  })

  it("祖先 id 不存在或祖先为叶子时返回 false", () => {
    const harness = createTreeDragHarness()
    expect(harness.isDescendantNode("missing", "a-1")).toBe(false)
    expect(harness.isDescendantNode("a-1", "a-2")).toBe(false)
  })

  it("查询跟随当前 treeNodes 引用（提交/回滚后判定随之刷新）", () => {
    const harness = createTreeDragHarness()
    const snapshot = cloneTreeNodes(harness.treeNodes.value)

    removeTreeNode(harness.treeNodes.value, "a-2")
    expect(harness.isDescendantNode("a", "a-2-1-1")).toBe(false)

    harness.treeNodes.value = snapshot
    expect(harness.isDescendantNode("a", "a-2-1-1")).toBe(true)
  })
})

describe("canDropTreeNode 拖拽合法性（纯函数，与 use-tree-drag 运行时判定同口径）", () => {
  /** 规则矩阵用树：含模板/外链行与「文档 > 文档」两层嵌套。 */
  const dropTree = withParentIds([
    makeNode("a", "folder", [makeNode("a-1", "doc")]),
    makeNode("b", "doc"),
    makeNode("t", "template"),
    makeNode("l", "link"),
    makeNode("f1", "folder", [makeNode("f1-1", "folder", [makeNode("f1-1-1", "doc")])]),
    makeNode("d1", "doc", [makeNode("d1-1", "doc")]),
    makeNode("d3", "doc", [makeNode("d3-1", "doc")]),
    makeNode("d2", "doc"),
  ])

  const sourceFolder = () => findTreeNode(dropTree, "f1")!
  const docWithDocChild = () => findTreeNode(dropTree, "d1")!
  const pureDoc = () => findTreeNode(dropTree, "d2")!

  const placement = (
    overrides: Partial<TreeDropPlacement> & Pick<TreeDropPlacement, "position" | "nodeId">,
  ): TreeDropPlacement => ({ parentId: null, ...overrides })

  it("规则1 不能拖到自身：inside / before / after 同拒", () => {
    const source = sourceFolder()
    expect(canDropTreeNode(dropTree, source, placement({ position: "inside", nodeId: "f1" }))).toBe(
      false,
    )
    expect(canDropTreeNode(dropTree, source, placement({ position: "before", nodeId: "f1" }))).toBe(
      false,
    )
    expect(canDropTreeNode(dropTree, source, placement({ position: "after", nodeId: "f1" }))).toBe(
      false,
    )
  })

  it("规则2 有效父级必须是分组或文档：模板/外链行不能挂子级，根级放行", () => {
    const source = pureDoc()
    expect(canDropTreeNode(dropTree, source, placement({ position: "inside", nodeId: "t" }))).toBe(
      false,
    )
    expect(canDropTreeNode(dropTree, source, placement({ position: "inside", nodeId: "l" }))).toBe(
      false,
    )
    // before/after 的有效父级取目标行父级：挂在模板行下同拒
    expect(
      canDropTreeNode(
        dropTree,
        source,
        placement({ position: "after", nodeId: "b", parentId: "t" }),
      ),
    ).toBe(false)
    // 根级（parentId = null）没有有效父级，不受类型约束
    expect(canDropTreeNode(dropTree, source, placement({ position: "before", nodeId: "a" }))).toBe(
      true,
    )
  })

  it("规则3 分组不能挂到文档下", () => {
    const source = sourceFolder()
    expect(canDropTreeNode(dropTree, source, placement({ position: "inside", nodeId: "d2" }))).toBe(
      false,
    )
    // 文档行旁（有效父级是文档 d1）同拒
    expect(
      canDropTreeNode(
        dropTree,
        source,
        placement({ position: "after", nodeId: "d1-1", parentId: "d1" }),
      ),
    ).toBe(false)
  })

  it("规则4 文档挂文档最多两级：源自带 doc 子级则拒，纯净文档放行", () => {
    const carrying = docWithDocChild()
    expect(
      canDropTreeNode(dropTree, carrying, placement({ position: "inside", nodeId: "d2" })),
    ).toBe(false)
    expect(
      canDropTreeNode(
        dropTree,
        carrying,
        placement({ position: "after", nodeId: "d3-1", parentId: "d3" }),
      ),
    ).toBe(false)

    const pure = pureDoc()
    expect(canDropTreeNode(dropTree, pure, placement({ position: "inside", nodeId: "d1" }))).toBe(
      true,
    )
    expect(canDropTreeNode(dropTree, pure, placement({ position: "inside", nodeId: "d3" }))).toBe(
      true,
    )
  })

  it("规则5 不能进入自己或自己的子级（父→子防环）", () => {
    const source = sourceFolder()
    // 入自己的直接子级 / 深层后代
    expect(
      canDropTreeNode(dropTree, source, placement({ position: "inside", nodeId: "f1-1" })),
    ).toBe(false)
    expect(
      canDropTreeNode(dropTree, source, placement({ position: "inside", nodeId: "f1-1-1" })),
    ).toBe(false)
    // 子级行旁（有效父级即 source 自己）
    expect(
      canDropTreeNode(
        dropTree,
        source,
        placement({ position: "after", nodeId: "f1-1", parentId: "f1" }),
      ),
    ).toBe(false)
    // 子树深处行旁（有效父级在 source 子树内）
    expect(
      canDropTreeNode(
        dropTree,
        source,
        placement({ position: "before", nodeId: "f1-1-1", parentId: "f1-1" }),
      ),
    ).toBe(false)
  })

  it("合法场景放行：同级重排 / 跨级移动 / 根级落点", () => {
    const a1 = findTreeNode(dropTree, "a-1")!
    // a-1 拖到同级 a-2 旁（有效父级 a 不在 a-1 子树内）
    expect(
      canDropTreeNode(dropTree, a1, placement({ position: "after", nodeId: "a-2", parentId: "a" })),
    ).toBe(true)
    // 文档跨级移入其他分组中部
    expect(
      canDropTreeNode(dropTree, pureDoc(), placement({ position: "inside", nodeId: "a" })),
    ).toBe(true)
    // 分组移入其他分组中部
    expect(
      canDropTreeNode(dropTree, sourceFolder(), placement({ position: "inside", nodeId: "a" })),
    ).toBe(true)
    // 根级落点
    expect(
      canDropTreeNode(dropTree, sourceFolder(), placement({ position: "before", nodeId: "b" })),
    ).toBe(true)
  })

  it("落点行不存在时按有效父级判定（before/after 的 parentId 语义）", () => {
    const source = pureDoc()
    expect(
      canDropTreeNode(dropTree, source, placement({ position: "after", nodeId: "ghost" })),
    ).toBe(true)
  })
})

describe("回滚快照语义（commitTreeDrop 的可测原语）", () => {
  it("cloneTreeNodes 深拷贝：快照与源树双向隔离", () => {
    const source = cloneTreeNodes(baseTree)
    const snapshot = cloneTreeNodes(baseTree)
    expect(snapshot).toEqual(baseTree)
    expect(snapshot[0]).not.toBe(baseTree[0])
    expect(snapshot[0]?.children[0]).not.toBe(baseTree[0]?.children[0])

    // 改快照不动源树
    snapshot[0]?.children.splice(0, 1)
    expect(baseTree[0]?.children).toHaveLength(2)
    // 改源树不动快照（commitTreeDrop 的乐观更新即此类原地变更）
    removeTreeNode(source, "b")
    expect(snapshot.some((node) => node.id === "b")).toBe(true)
  })

  it("乐观变更不污染快照：复刻提交路径的摘除+改父+拼接，快照仍为原状", () => {
    const working = cloneTreeNodes(baseTree)
    const snapshot = cloneTreeNodes(working)

    // 复刻 commitTreeDrop 乐观三步：摘除 → 改 parentId → 拼入新父级
    const removed = removeTreeNode(working, "a-2-1")
    expect(removed).not.toBeNull()
    removed!.node.parentId = "b"
    findTreeNode(working, "b")!.children.splice(0, 0, removed!.node)

    expect(findTreeNode(working, "a-2-1")?.parentId).toBe("b")
    expect(findTreeNode(working, "a-2")?.children).toHaveLength(0)

    // 快照仍记录原状：a-2-1 在 a-2 下、parentId 未变、b 无子级
    const snapshotNode = findTreeNode(snapshot, "a-2-1")
    expect(snapshotNode?.parentId).toBe("a-2")
    expect(snapshotNode).not.toBe(removed!.node)
    expect(findTreeNode(snapshot, "a-2")?.children.map((node) => node.id)).toEqual(["a-2-1"])
    expect(findTreeNode(snapshot, "b")?.children).toHaveLength(0)
  })

  it("回滚 = 整树替换快照：结构与 parentId 恢复，防环查询同步恢复", () => {
    const harness = createTreeDragHarness()
    const snapshot = cloneTreeNodes(harness.treeNodes.value)

    const removed = removeTreeNode(harness.treeNodes.value, "a-2-1")
    removed!.node.parentId = "b"
    findTreeNode(harness.treeNodes.value, "b")!.children.splice(0, 0, removed!.node)
    expect(harness.isDescendantNode("a", "a-2-1-1")).toBe(false)
    expect(harness.isDescendantNode("b", "a-2-1")).toBe(true)

    // 复刻 catch 分支的回滚：treeNodes.value = previousTreeSnapshot
    harness.treeNodes.value = snapshot

    expect(harness.treeNodes.value.map((node) => node.id)).toEqual(["a", "b"])
    expect(findTreeNode(harness.treeNodes.value, "a-2-1")?.parentId).toBe("a-2")
    expect(harness.isDescendantNode("a", "a-2-1-1")).toBe(true)
    expect(harness.isDescendantNode("b", "a-2-1")).toBe(false)
  })

  it("removeTreeNode 返回的 node/parentId/index 是最小撤销信息（可原位还原）", () => {
    const working = cloneTreeNodes(baseTree)

    const removedNested = removeTreeNode(working, "a-2-1")
    expect(removedNested).toMatchObject({ parentId: "a-2", index: 0 })
    const parent = findTreeNode(working, "a-2")!
    parent.children.splice(removedNested!.index, 0, removedNested!.node)
    expect(findTreeNode(working, "a-2")?.children.map((node) => node.id)).toEqual(["a-2-1"])

    const removedRoot = removeTreeNode(working, "b")
    expect(removedRoot).toMatchObject({ parentId: null, index: 1 })
    working.splice(removedRoot!.index, 0, removedRoot!.node)
    expect(working).toEqual(baseTree)
  })
})

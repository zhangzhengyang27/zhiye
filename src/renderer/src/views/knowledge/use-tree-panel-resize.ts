/**
 * 知识库工作区目录树面板宽度拖拽与按知识库持久化。
 *
 * 拖拽与持久化机制复用 `usePanelResize`（侧栏同款），这里只提供目录列的边界值
 * 和「按知识库分键」的存储键；布局消费 `workspaceGridStyle` 与 `startTreePanelResize`。
 */
import { computed, type Ref } from "vue"
import { usePanelResize } from "@/composables/use-panel-resize"
import { buildTreePanelWidthStorageKey } from "./workspace-storage"

/** 树面板宽度使用固定上下限，避免拖拽结果影响整体布局稳定性。 */
const TREE_PANEL_MIN_WIDTH = 252
const TREE_PANEL_MAX_WIDTH = 420
const TREE_PANEL_DEFAULT_WIDTH = 296

export const useTreePanelResize = (options: {
  kbId: Ref<string>
  layoutRef: Ref<HTMLElement | null>
}) => {
  const { kbId, layoutRef } = options

  const {
    width: treePanelWidth,
    resizing: resizingTreePanel,
    gridStyle,
    start: startTreePanelResize,
  } = usePanelResize({
    containerRef: layoutRef,
    storageKey: computed(() => (kbId.value ? buildTreePanelWidthStorageKey(kbId.value) : "")),
    min: TREE_PANEL_MIN_WIDTH,
    max: TREE_PANEL_MAX_WIDTH,
    defaultWidth: TREE_PANEL_DEFAULT_WIDTH,
  })

  return {
    treePanelWidth,
    resizingTreePanel,
    workspaceGridStyle: gridStyle,
    startTreePanelResize,
  }
}

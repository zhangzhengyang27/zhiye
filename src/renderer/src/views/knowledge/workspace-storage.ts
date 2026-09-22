/**
 * 知识库工作区 localStorage 读写与存储键构造。
 *
 * 由 use-tree-panel-resize / use-workspace-persistence 共用；
 * 所有读写都吞掉异常（隐私模式等场景下 localStorage 不可用不应影响工作台）。
 */

const workspaceStoragePrefix = "knowledge-workspace"

export const buildExpandedFoldersStorageKey = (targetKbId: string) =>
  `${workspaceStoragePrefix}:${targetKbId}:expanded-folders`

export const buildFocusedNodeStorageKey = (targetKbId: string) => `${workspaceStoragePrefix}:${targetKbId}:focused-node`

export const buildTreePanelWidthStorageKey = (targetKbId: string) =>
  `${workspaceStoragePrefix}:${targetKbId}:tree-panel-width`

export const readStorageItem = (key: string) => {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export const writeStorageItem = (key: string, value: string | null) => {
  if (typeof window === "undefined") {
    return
  }

  try {
    if (value === null) {
      window.localStorage.removeItem(key)
      return
    }

    window.localStorage.setItem(key, value)
  } catch {
    // ignore localStorage write errors
  }
}

/**
 * 目录版本历史服务（B2c 对齐语雀「目录管理 → 查看历史」）。
 * 树结构变更（新建/重命名/移动/排序/删除/回收站恢复）时后端自动落快照。
 */

import { requestKbDriveApi } from "./kb-drive-http"

/** 描述一条目录快照（列表项）。 */
export interface TreeSnapshotItem {
  id: string
  createdAt: string
  user: {
    displayName: string
    avatar?: string | null
  }
}

/** 描述快照内的树节点结构。 */
export interface TreeSnapshotNode {
  id: string
  title: string
  parentId: string | null
  order: number
  type: string
}

/** 描述快照详情（含完整树结构数据）。 */
export interface TreeSnapshotDetail extends TreeSnapshotItem {
  data: TreeSnapshotNode[]
}

/**
 * 获取目录快照列表（时间倒序）。
 */
export const listTreeSnapshots = (kbId: string, token?: string | null) =>
  requestKbDriveApi<TreeSnapshotItem[]>(
    `/knowledge/knowledge-bases/${kbId}/tree-snapshots`,
    undefined,
    token,
  )

/**
 * 获取快照详情（树结构数据）。
 */
export const getTreeSnapshot = (kbId: string, snapshotId: string, token?: string | null) =>
  requestKbDriveApi<TreeSnapshotDetail>(
    `/knowledge/knowledge-bases/${kbId}/tree-snapshots/${snapshotId}`,
    undefined,
    token,
  )

/**
 * 恢复目录结构到指定快照（现存节点恢复结构、软删文档从回收站还原）。
 */
export const restoreTreeSnapshot = (kbId: string, snapshotId: string, token?: string | null) =>
  requestKbDriveApi<{ ok: boolean; restored: number; revived: number; skipped: number }>(
    `/knowledge/knowledge-bases/${kbId}/tree-snapshots/${snapshotId}/restore`,
    { method: "POST" },
    token,
  )

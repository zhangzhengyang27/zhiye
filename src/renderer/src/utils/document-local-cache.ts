/**
 * 文档本地快照缓存（#26，对齐语雀「历史记录 → 本地缓存」）：
 * 编辑期间按防抖将正文快照写入 IndexedDB（每文档保留最近 10 条），
 * 供「本地缓存」分区查看/恢复/清空；与版本历史（服务端）互不影响。
 * 断网离线编辑的排队内容天然被快照覆盖（快照只依赖本地 content 状态）。
 */
import { get, set } from "idb-keyval"

export interface DocumentLocalSnapshot {
  /** 快照时间戳（ms） */
  at: number
  /** 快照正文（与文档 content 同 scheme） */
  content: string
  /** 快照时字数（编辑器 wordCount 口径） */
  wordCount: number
}

const MAX_SNAPSHOTS = 10

const buildKey = (docId: string) => `kb-doc-local-cache:${docId}`

const isSnapshotEntry = (value: unknown): value is DocumentLocalSnapshot => {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as DocumentLocalSnapshot).at === "number" &&
    typeof (value as DocumentLocalSnapshot).content === "string",
  )
}

/**
 * 读取某文档的快照列表（新→旧）：IndexedDB 记录损坏（读取抛错或结构非法）时
 * 就地重置该键，避免一次损坏让该文档的快照永久写不进。
 */
const readSnapshotList = async (key: string): Promise<DocumentLocalSnapshot[]> => {
  let stored: unknown

  try {
    stored = await get<unknown>(key)
  } catch {
    await set(key, []).catch(() => undefined)
    return []
  }

  if (!Array.isArray(stored)) {
    if (stored !== undefined) {
      await set(key, []).catch(() => undefined)
    }
    return []
  }

  const valid = stored.filter(isSnapshotEntry)
  if (valid.length !== stored.length) {
    await set(key, valid).catch(() => undefined)
  }
  return valid
}

/** 追加一条快照：与最近一条内容相同则跳过；超出上限裁剪最旧的。 */
export const appendDocumentLocalSnapshot = async (
  docId: string,
  snapshot: DocumentLocalSnapshot,
) => {
  if (!docId) return
  const key = buildKey(docId)
  const existing = await readSnapshotList(key)
  if (existing[0]?.content === snapshot.content) {
    return
  }
  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS)
  await set(key, next)
}

/** 读取某文档的全部本地快照（新→旧）。 */
export const getDocumentLocalSnapshots = async (
  docId: string,
): Promise<DocumentLocalSnapshot[]> => {
  if (!docId) {
    return []
  }
  return readSnapshotList(buildKey(docId))
}

/** 清空某文档的本地快照。 */
export const clearDocumentLocalSnapshots = (docId: string) => {
  if (docId) {
    void set(buildKey(docId), [])
  }
}

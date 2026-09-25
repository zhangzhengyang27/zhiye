/**
 * 演示（放映）分页的切分与方案存取。
 *
 * 模型：把渲染后的文档 HTML 解析为顶层块序列，「页首块」标记决定切页——
 * 一页 = 从某个页首块到下一个页首块之前的所有块。默认页首 = 全部 H1-H3
 * 标题（无标题时整篇单页）。用户在「编辑演示分页」里勾选页首并保存方案
 * （按块文本前 40 字指纹持久化到 localStorage，按文档隔离）；放映时按指纹
 * 匹配还原方案，内容变化导致指纹失配的条目自动忽略，全部失配回落默认。
 */
import { renderKnowledgeDocumentBody } from "./knowledge-markdown"

export interface PresentationBlock {
  /** 顶层块序号 */
  index: number
  /** 块标签名（渲染后） */
  tag: string
  /** 块文本前 40 字（方案锚点指纹） */
  fingerprint: string
  /** 块文本前 80 字（编辑列表摘要） */
  text: string
  /** 块自身 HTML（含标签） */
  html: string
  isHeading: boolean
}

export interface PresentationPage {
  /** 页首块 index */
  startIndex: number
  /** 该页全部块的 HTML 拼接 */
  html: string
  /** 页首块文本（编辑预览用） */
  title: string
}

const STORAGE_PREFIX = "doc-presentation-pages:"

/** 渲染文档为顶层块序列（HTML 经 renderKnowledgeDocumentBody 的 DOMPurify 消毒出口） */
export const renderDocumentToBlocks = (
  content: string,
  scheme: "text/markdown" | "text/html",
): PresentationBlock[] => {
  const html = renderKnowledgeDocumentBody(content, scheme === "text/html" ? "html" : "markdown")
  const doc = new DOMParser().parseFromString(html, "text/html")
  return Array.from(doc.body.children).map((el, index) => {
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ")
    return {
      index,
      tag: el.tagName,
      fingerprint: text.slice(0, 40),
      text: text.slice(0, 80) || "（空块）",
      html: el.outerHTML,
      isHeading: /^H[1-3]$/.test(el.tagName),
    }
  })
}

/** 默认页首：全部 H1-H3 标题；首块恒为页首（首段前导内容归第一页） */
export const defaultPageStartIndexes = (blocks: PresentationBlock[]): number[] => {
  const starts = new Set<number>([0])
  for (const block of blocks) {
    if (block.isHeading) {
      starts.add(block.index)
    }
  }
  return [...starts].sort((left, right) => left - right)
}

/** 按页首索引切块 */
export const splitPages = (
  blocks: PresentationBlock[],
  startIndexes: number[],
): PresentationPage[] => {
  if (blocks.length === 0) {
    return []
  }
  const sorted = [...new Set(startIndexes)]
    .filter((index) => index >= 0 && index < blocks.length)
    .sort((left, right) => left - right)
  if ((sorted[0] ?? blocks.length) !== 0) {
    sorted.unshift(0)
  }

  const pages: PresentationPage[] = []
  for (let i = 0; i < sorted.length; i += 1) {
    const from = sorted[i] ?? 0
    const to = i + 1 < sorted.length ? (sorted[i + 1] ?? blocks.length) : blocks.length
    const slice = blocks.slice(from, to)
    const firstBlock = slice[0]
    if (!firstBlock) {
      continue
    }
    pages.push({
      startIndex: from,
      html: slice.map((block) => block.html).join(""),
      title: firstBlock.text.slice(0, 40),
    })
  }
  return pages
}

// ==================== 方案存取（localStorage，按文档隔离） ====================

export const loadPaginationScheme = (docId: string): string[] | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + docId)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return null
    }
    const fingerprints = parsed.filter((item): item is string => typeof item === "string")
    return fingerprints.length > 0 ? fingerprints : null
  } catch {
    return null
  }
}

export const savePaginationScheme = (docId: string, fingerprints: string[]) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + docId, JSON.stringify(fingerprints))
  } catch {
    // 存储不可用（隐私模式/超额）时分页方案仅本次会话有效，放映仍可默认分页
  }
}

export const clearPaginationScheme = (docId: string) => {
  try {
    localStorage.removeItem(STORAGE_PREFIX + docId)
  } catch {
    // 同上：忽略存储异常
  }
}

/** 应用方案：指纹匹配块为页首；无方案或全部失配回落默认分页 */
export const resolvePageStartIndexes = (
  blocks: PresentationBlock[],
  fingerprints: string[] | null,
): number[] => {
  if (!fingerprints || fingerprints.length === 0) {
    return defaultPageStartIndexes(blocks)
  }
  const byFingerprint = new Map(
    blocks.filter((block) => block.fingerprint).map((block) => [block.fingerprint, block.index]),
  )
  const starts = fingerprints
    .map((fingerprint) => byFingerprint.get(fingerprint))
    .filter((index): index is number => index !== undefined)
  if (starts.length === 0) {
    return defaultPageStartIndexes(blocks)
  }
  return starts
}

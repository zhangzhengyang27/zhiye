/**
 * 知识库整库导出（更多设置→知识库设置→导出知识库）：
 * 遍历目录树逐文档拉取 content，按 scheme 转成 Markdown（text/html 走 turndown），
 * 再用 fflate zipSync 按目录层级打包，经浏览器 a 标签下载通道产出「KB名.zip」。
 * 画板/表格/思维导图/外链节点无法转 Markdown，导出时跳过并在结果里回报计数。
 * fflate 与 turndown 均按需动态 import，不进首屏包。
 */
import type { KnowledgeBaseItem } from "@/services/knowledge-base"
import { getKnowledgeDocument, type KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import type { KnowledgeDocumentContent } from "@/types/knowledge-document"

/** 导出结果计数：exported = 成功写入 zip 的文档数，skipped = 无法转 Markdown 的节点数 */
export interface KbExportResult {
  exported: number
  skipped: number
}

/** 同时下载并发上限：文档详情接口逐篇拉取，太高会顶到后端限流 */
const EXPORT_CONCURRENCY = 6

/** 与 document-export 同口径：Windows 非法字符替换为下划线，空标题回退占位 */
const sanitizeEntryName = (title: string, fallback: string) => {
  const normalized = title.replace(/[\\/:*?"<>|]/g, "_").trim()
  return normalized || fallback
}

/** 同目录内重名追加序号（-2、-3…）直到不冲突，扩展名保持原样 */
const uniqueEntryName = (name: string, used: Set<string>) => {
  if (!used.has(name)) {
    used.add(name)
    return name
  }

  const dot = name.lastIndexOf(".")
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ""

  let index = 2
  while (used.has(`${stem}-${index}${ext}`)) {
    index += 1
  }
  const unique = `${stem}-${index}${ext}`
  used.add(unique)
  return unique
}

/** 文档 content → Markdown；非富文本 scheme（画板/表格/外链等）返回 null 走跳过 */
const contentToMarkdown = async (content: KnowledgeDocumentContent | null | undefined) => {
  if (!content || (content.scheme !== "text/markdown" && content.scheme !== "text/html")) {
    return null
  }

  if (content.scheme === "text/html") {
    const { htmlToMarkdown } = await import("./document-export")
    return htmlToMarkdown(content.value)
  }

  return content.value
}

/**
 * 将知识库整库打包为 zip 并触发浏览器下载；返回导出/跳过计数供调用方提示。
 * 目录节点对应 zip 内同名目录，文档转为「标题.md」写入所在层级。
 */
export const exportKnowledgeBaseZip = async (
  kb: KnowledgeBaseItem,
  nodes: KnowledgeDocumentTreeNode[]
): Promise<KbExportResult> => {
  const files: Record<string, Uint8Array> = {}
  let exported = 0
  let skipped = 0

  // 第一遍同步走树：分配目录与文件名（重名去重只依赖树形，不依赖网络结果），
  // 收集待拉取的文档任务
  const tasks: Array<{ docId: string; zipPath: string }> = []

  const plan = (list: KnowledgeDocumentTreeNode[], prefix: string, usedNames: Set<string>) => {
    for (const node of list) {
      const safeTitle = sanitizeEntryName(node.title || "无标题", "无标题")

      if (node.type === "folder") {
        // 空分组也留目录条目（fflate 以「名称/」空条目表示目录）
        const dirName = `${prefix}${uniqueEntryName(safeTitle, usedNames)}/`
        if (!files[dirName]) {
          files[dirName] = new Uint8Array()
        }
        plan(node.children ?? [], dirName, new Set())
        continue
      }

      // 外链节点无正文；画板/表格/思维导图无法转 Markdown，按类型直接跳过
      if (node.type === "link" || node.editorType === "board" || node.editorType === "datatable" || node.editorType === "sheet" || node.editorType === "mindmap") {
        skipped += 1
        continue
      }

      tasks.push({ docId: node.id, zipPath: `${prefix}${uniqueEntryName(`${safeTitle}.md`, usedNames)}` })
    }
  }

  plan(nodes, "", new Set())

  // 第二遍并发拉取详情并转换：小并发池兼顾耗时与后端压力
  const queue = [...tasks]
  const workers = Array.from({ length: Math.min(EXPORT_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift()
      if (!task) {
        break
      }

      const document = await getKnowledgeDocument(task.docId).catch(() => null)
      const markdown = document ? await contentToMarkdown(document.content) : null

      if (markdown) {
        files[task.zipPath] = new TextEncoder().encode(markdown)
        exported += 1
      } else {
        skipped += 1
      }
    }
  })
  await Promise.all(workers)

  if (exported === 0) {
    return { exported, skipped }
  }

  const { zipSync } = await import("fflate")
  const zipped = zipSync(files)
  const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }))
  const link = document.createElement("a")

  link.href = url
  link.download = `${sanitizeEntryName(kb.name, "知识库")}.zip`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return { exported, skipped }
}

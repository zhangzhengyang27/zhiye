/**
 * 本地文档导入（md / docx → 知识库文档）。
 *
 * - Markdown：直接读文件文本，原样写入 content（scheme = text/markdown）。
 * - Word：mammoth 提取 HTML 后经 htmlToMarkdown 降为 Markdown，
 *   与知识库文档存储形态对齐（标题/列表/引用/代码块/表格均保留结构）。
 */
import mammoth from "mammoth"
import { htmlToMarkdown } from "@/utils/html-to-markdown"
import { createKnowledgeDocument } from "./knowledge-documents"
import type { KnowledgeDocumentItem } from "./knowledge-documents"

const stripExtension = (fileName: string): string => fileName.replace(/\.[^.]+$/, "")

/**
 * 导入纯文本（md / txt）的解码：file.text() 固定按 UTF-8 解析，Windows 时代
 * 的中文导出常是 GB18030，直接读会得到乱码。改为先取字节，用 fatal 的严格
 * UTF-8 解码（见到非法字节即抛错，误判率远低于宽松解码的启发 sniff）；
 * 抛错则按 GB18030 兜底（该解码器内建单字节回退，不会抛错）。两轮都失败
 * （理论上不可达，防御 TextDecoder 构造异常的运行时）再回落非严格 UTF-8。
 */
const decodeImportText = async (file: File): Promise<string> => {
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder("gb18030").decode(bytes)
    } catch {
      return new TextDecoder("utf-8").decode(bytes)
    }
  }
}

/** 将本地 Markdown 文件导入为知识库文档，返回新文档。 */
export const importMarkdownFile = async (
  file: File,
  kbId: string,
  parentId?: string | null
): Promise<KnowledgeDocumentItem> => {
  const text = await decodeImportText(file)
  return createKnowledgeDocument({
    kbId,
    title: stripExtension(file.name),
    content: { scheme: "text/markdown", value: text },
    editorType: "nuxt-editor",
    ...(parentId ? { parentId } : {}),
  })
}

/**
 * 将本地语雀文档(.lake)文件导入为知识库文档，返回新文档。
 *
 * .lake 是本项目导出的 JSON 容器（format/scheme/exportedAt/content，
 * 见 document-export.exportAsLake）；scheme 为 markdown/html，文档模型原样回导。
 */
export const importLakeFile = async (
  file: File,
  kbId: string,
  parentId?: string | null
): Promise<KnowledgeDocumentItem> => {
  const parsed: unknown = JSON.parse(await file.text())

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { format?: unknown }).format !== "yuque-doc" ||
    typeof (parsed as { content?: unknown }).content !== "string"
  ) {
    throw new Error("不是有效的语雀文档 (.lake) 文件")
  }

  const payload = parsed as { scheme?: unknown; content: string }
  const rawScheme = payload.scheme === "html" ? "text/html" : "text/markdown"

  return createKnowledgeDocument({
    kbId,
    title: stripExtension(file.name),
    content: { scheme: rawScheme, value: payload.content },
    editorType: "nuxt-editor",
    ...(parentId ? { parentId } : {}),
  })
}

/** 将本地 Word(.docx) 文件导入为知识库文档，返回新文档。 */
export const importDocxFile = async (
  file: File,
  kbId: string,
  parentId?: string | null
): Promise<KnowledgeDocumentItem> => {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const markdown = htmlToMarkdown(result.value)
  return createKnowledgeDocument({
    kbId,
    title: stripExtension(file.name),
    content: { scheme: "text/markdown", value: markdown },
    editorType: "nuxt-editor",
    ...(parentId ? { parentId } : {}),
  })
}

/** 批量导入的单文件结果：成功带新文档，失败带原因。 */
export interface ImportedDocumentResult {
  imported: KnowledgeDocumentItem[]
  failures: Array<{ name: string; reason: string }>
}

const SUPPORTED_EXTENSIONS = [".md", ".markdown", ".txt", ".docx", ".lake"]

/** 解包 .zip，返回其中的导入文件（过滤 macOS 元数据与目录项）。 */
const unzipToFiles = async (file: File): Promise<File[]> => {
  const { unzipSync } = await import("fflate")
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: entry => !entry.name.split("/").pop()?.startsWith("._"),
  })

  return Object.entries(entries)
    .filter(([name]) => !name.endsWith("/") && !name.startsWith("__MACOSX"))
    .map(([name, data]) => new File([data], name.split("/").pop() || name))
}

/**
 * 批量导入（#19）：多选 md / markdown / txt / docx / lake 文件，或 .zip 包
 * （解包后逐个分发）。逐个创建互不回滚，失败项以清单返回。
 */
export const importLocalDocumentFiles = async (
  files: File[],
  kbId: string,
  parentId?: string | null
): Promise<ImportedDocumentResult> => {
  const result: ImportedDocumentResult = { imported: [], failures: [] }

  const dispatch = async (file: File): Promise<KnowledgeDocumentItem> => {
    const name = file.name.toLowerCase()
    if (name.endsWith(".lake")) return importLakeFile(file, kbId, parentId)
    if (name.endsWith(".docx")) return importDocxFile(file, kbId, parentId)
    if (SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext))) {
      return importMarkdownFile(file, kbId, parentId)
    }
    throw new Error("不支持的文件类型")
  }

  for (const file of files) {
    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const innerFiles = await unzipToFiles(file)
        if (innerFiles.length === 0) {
          result.failures.push({ name: file.name, reason: "压缩包内没有可导入的文件" })
          continue
        }
        for (const inner of innerFiles) {
          try {
            result.imported.push(await dispatch(inner))
          } catch (error) {
            result.failures.push({
              name: inner.name,
              reason: error instanceof Error ? error.message : "导入失败",
            })
          }
        }
        continue
      }

      result.imported.push(await dispatch(file))
    } catch (error) {
      result.failures.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "导入失败",
      })
    }
  }

  return result
}

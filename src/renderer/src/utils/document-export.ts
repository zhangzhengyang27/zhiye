/** 提供文档导出相关工具函数与辅助配置。 */

import TurndownService from "turndown"
import { renderKnowledgeDocumentHtmlWithMermaid } from "./knowledge-markdown"

const sanitizeFilename = (title: string, fallback = "document") => {
  const normalized = title.trim() || fallback
  return normalized.replace(/[\\/:*?"<>|]/g, "_")
}

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * HTML 内容转 Markdown（TipTap 时代存量 HTML scheme 文档导出 .md / 版本对比用）。
 * turndown 依赖 DOM，仅在浏览器/renderer 环境调用；本模块经动态 import 懒加载。
 *
 * 注意：这是导出/版本对比链路的 turndown 实现，与 utils/html-to-markdown.ts
 * （docx 导入链路的手写降级转换）是两套刻意不合并的实现——前者服务标签语义还原，
 * 后者服务导入容错，口径漂移属预期，修改任一侧时先确认另一侧是否需要同步。
 */
export const htmlToMarkdown = (html: string): string => {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  })
  return turndown.turndown(html)
}

/** 将文档内容导出为 Markdown 文件；HTML scheme 文档先转换为 Markdown，避免导出 HTML 源码。 */
export const exportAsMarkdown = async (
  title: string,
  content: string,
  contentType: "markdown" | "html" = "markdown",
) => {
  const markdown = contentType === "html" ? htmlToMarkdown(content) : content
  const filename = `${sanitizeFilename(title)}.md`
  downloadBlob(filename, new Blob([markdown], { type: "text/markdown;charset=utf-8" }))
}

/**
 * 将文档导出为语雀文档（.lake）格式：JSON 容器携带 scheme 与原始文档模型内容，
 * 可无损回导（导入链路按 scheme 直接 setContent）。Markdown/HTML scheme 均原样导出。
 */
export const exportAsLake = async (
  title: string,
  content: string,
  contentType: "markdown" | "html" = "markdown",
) => {
  const payload = {
    format: "yuque-doc",
    version: 1,
    scheme: contentType,
    exportedAt: new Date().toISOString(),
    content,
  }
  const filename = `${sanitizeFilename(title)}.lake`
  downloadBlob(
    filename,
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
  )
}

/** 打开独立打印窗口并触发 PDF 导出流程。 */
export const exportAsPDF = async (
  title: string,
  content: string,
  contentType: "markdown" | "html" = "markdown",
) => {
  const html = await renderKnowledgeDocumentHtmlWithMermaid(title, content, contentType)
  // features 里带 noopener/noreferrer 时按 WHATWG 规范 window.open 恒返回 null，
  // 打印窗口会永远打不开；改为打开后手动断开 opener
  const printWindow = window.open("", "_blank", "width=1024,height=768")

  if (!printWindow) {
    throw new Error("浏览器阻止了打印窗口，请允许弹窗后重试。")
  }

  printWindow.opener = null

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()

  await new Promise<void>((resolve) => {
    printWindow.onload = () => resolve()
    setTimeout(() => resolve(), 300)
  })

  printWindow.focus()
  printWindow.print()
}

/** 将当前文档内容导出为 Word 兼容的 HTML 文档。 */
export const exportAsWord = async (
  title: string,
  content: string,
  contentType: "markdown" | "html" = "markdown",
) => {
  const filename = `${sanitizeFilename(title)}.doc`
  const html = await renderKnowledgeDocumentHtmlWithMermaid(title, content, contentType)

  downloadBlob(filename, new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" }))
}

/**
 * 将编辑器正文 DOM 导出为 JPG（#18，对齐语雀导出 JPG 档）：
 * 2x 缩放、白底；导出对象为 .ne-engine 容器由调用方传入。
 * html-to-image 依赖 DOM，仅渲染端可用；动态 import 避免首屏加载。
 */
export const exportElementAsJpg = async (title: string, element: HTMLElement) => {
  const { toJpeg } = await import("html-to-image")
  const dataUrl = await toJpeg(element, {
    quality: 0.92,
    backgroundColor: "#ffffff",
    pixelRatio: 2,
  })
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = `${sanitizeFilename(title)}.jpg`
  link.click()
  link.remove()
}

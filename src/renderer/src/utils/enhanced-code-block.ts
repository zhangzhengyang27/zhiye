/** 提供增强代码块的属性约束、序列化与静态渲染辅助能力。 */

import hljs from "highlight.js/lib/core"
import { logger } from "@/utils/logger"
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import go from "highlight.js/lib/languages/go"
import java from "highlight.js/lib/languages/java"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import plaintext from "highlight.js/lib/languages/plaintext"
import python from "highlight.js/lib/languages/python"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"
import { createLowlight } from "lowlight"

/** 约束代码块支持的主题皮肤。 */
export type CodeBlockTheme = "one-dark-pro" | "github-light" | "slate"

/** 描述增强代码块在文档中保存的展示属性。 */
export interface EnhancedCodeBlockAttrs {
  language: string
  title: string | null
  theme: CodeBlockTheme
  lineNumbers: boolean
  wrap: boolean
  collapsed: boolean
}

/** 描述从 Markdown 代码围栏信息串中解析出的语言与附加属性。 */
export interface ParsedCodeFenceInfo {
  language: string
  attrs: Partial<EnhancedCodeBlockAttrs>
}

type CodeLanguageDefinition = {
  value: string
  label: string
  aliases?: string[]
}

/** 列出编辑器内置支持的代码语言候选项。 */
export const codeBlockLanguages: CodeLanguageDefinition[] = [
  { value: "text", label: "Plain Text", aliases: ["plain", "plaintext"] },
  { value: "bash", label: "Bash", aliases: ["shell", "sh", "zsh"] },
  { value: "javascript", label: "JavaScript", aliases: ["js", "jsx"] },
  { value: "typescript", label: "TypeScript", aliases: ["ts", "tsx"] },
  { value: "python", label: "Python", aliases: ["py"] },
  { value: "java", label: "Java" },
  { value: "go", label: "Go", aliases: ["golang"] },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML", aliases: ["xml"] },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML", aliases: ["yml"] },
  { value: "sql", label: "SQL" },
  { value: "markdown", label: "Markdown", aliases: ["md"] },
  { value: "mermaid", label: "Mermaid", aliases: ["mmd"] },
  { value: "vue", label: "Vue" },
]

const codeBlockLanguageSet = new Set(codeBlockLanguages.map((language) => language.value))

/** 列出增强代码块支持的主题皮肤。 */
export const codeBlockThemes: Array<{ value: CodeBlockTheme; label: string }> = [
  { value: "one-dark-pro", label: "One Dark Pro" },
  { value: "github-light", label: "GitHub Light" },
  { value: "slate", label: "Slate" },
]

/** 提供增强代码块的默认展示属性。 */
export const codeBlockDefaults: EnhancedCodeBlockAttrs = {
  language: "text",
  title: null,
  theme: "one-dark-pro",
  lineNumbers: true,
  wrap: false,
  collapsed: false,
}

/** 需要按布尔值解析的围栏元数据字段。 */
const BOOLEAN_ATTR_NAMES = new Set<keyof EnhancedCodeBlockAttrs>([
  "lineNumbers",
  "wrap",
  "collapsed",
])
/** 需要按字符串解析的围栏元数据字段。 */
const STRING_ATTR_NAMES = new Set<keyof EnhancedCodeBlockAttrs>(["title"])
/** 用于校验主题值是否合法的集合。 */
const THEME_SET = new Set<CodeBlockTheme>(codeBlockThemes.map((theme) => theme.value))

const registerLanguages = () => {
  if (hljs.getLanguage("bash")) {
    return
  }

  hljs.registerLanguage("bash", bash)
  hljs.registerLanguage("css", css)
  hljs.registerLanguage("go", go)
  hljs.registerLanguage("html", xml)
  hljs.registerLanguage("java", java)
  hljs.registerLanguage("javascript", javascript)
  hljs.registerLanguage("json", json)
  hljs.registerLanguage("markdown", markdown)
  hljs.registerLanguage("plaintext", plaintext)
  hljs.registerLanguage("python", python)
  hljs.registerLanguage("sql", sql)
  hljs.registerLanguage("typescript", typescript)
  hljs.registerLanguage("xml", xml)
  hljs.registerLanguage("yaml", yaml)

  hljs.registerAliases(["text", "plain"], { languageName: "plaintext" })
  hljs.registerAliases(["html", "vue"], { languageName: "xml" })
  hljs.registerAliases(["js", "jsx"], { languageName: "javascript" })
  hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" })
  hljs.registerAliases(["shell", "sh", "zsh"], { languageName: "bash" })
}

registerLanguages()

/** 创建供编辑器节点复用的 lowlight 实例。 */
export const createCodeBlockLowlight = () => {
  const lowlight = createLowlight()

  lowlight.register({
    bash,
    css,
    go,
    html: xml,
    java,
    javascript,
    json,
    markdown,
    plaintext,
    python,
    sql,
    typescript,
    xml,
    yaml,
  })

  lowlight.registerAlias({
    plaintext: ["text", "plain"],
    xml: ["html", "vue"],
    javascript: ["js", "jsx"],
    typescript: ["ts", "tsx"],
    bash: ["shell", "sh", "zsh"],
  })

  return lowlight
}

/** 转义 HTML 文本中的保留字符（全仓唯一实现，静态渲染/消毒兜底共用）。 */
export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    if (value === "true") return true
    if (value === "false") return false
  }

  return fallback
}

const normalizeLanguage = (value: unknown) => {
  if (typeof value !== "string") {
    return codeBlockDefaults.language
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return codeBlockDefaults.language
  }

  return normalized
}

const normalizeTitle = (value: unknown) => {
  if (typeof value !== "string") {
    return codeBlockDefaults.title
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

/** 规范化代码块属性。 */
export const normalizeCodeBlockAttrs = (
  input?: Partial<EnhancedCodeBlockAttrs> | null,
): EnhancedCodeBlockAttrs => {
  const theme = input?.theme && THEME_SET.has(input.theme) ? input.theme : codeBlockDefaults.theme

  return {
    language: normalizeLanguage(input?.language),
    title: normalizeTitle(input?.title),
    theme,
    lineNumbers: normalizeBoolean(input?.lineNumbers, codeBlockDefaults.lineNumbers),
    wrap: normalizeBoolean(input?.wrap, codeBlockDefaults.wrap),
    collapsed: normalizeBoolean(input?.collapsed, codeBlockDefaults.collapsed),
  }
}

const unescapeMetadataValue = (value: string) => value.replace(/\\(["\\])/g, "$1")

/** 转义 Markdown 围栏元数据中的引号与反斜杠。 */
export const escapeCodeFenceMetadataValue = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

const parseMetadataPairs = (raw: string) => {
  const attrs: Partial<EnhancedCodeBlockAttrs> = {}
  const pairPattern = /([A-Za-z][A-Za-z0-9]*)="((?:\\.|[^"])*)"/g

  for (const match of raw.matchAll(pairPattern)) {
    const key = match[1] as keyof EnhancedCodeBlockAttrs
    const value = unescapeMetadataValue(match[2] || "")

    if (BOOLEAN_ATTR_NAMES.has(key)) {
      attrs[key] = (value === "true") as never
      continue
    }

    if (STRING_ATTR_NAMES.has(key)) {
      attrs[key] = value as never
      continue
    }

    if (key === "theme" && THEME_SET.has(value as CodeBlockTheme)) {
      attrs.theme = value as CodeBlockTheme
    }
  }

  return attrs
}

/** 解析 Markdown 代码围栏的语言与附加属性。 */
export const parseCodeFenceInfo = (info: string): ParsedCodeFenceInfo => {
  const trimmed = info.trim()
  if (!trimmed) {
    return {
      language: codeBlockDefaults.language,
      attrs: {},
    }
  }

  const languageMatch = trimmed.match(/^(\S+)/)
  const language = normalizeLanguage(languageMatch?.[1] ?? codeBlockDefaults.language)
  const metadataRaw = languageMatch ? trimmed.slice(languageMatch[0].length).trim() : trimmed

  return {
    language,
    attrs: parseMetadataPairs(metadataRaw),
  }
}

/** 将代码块属性序列化为 Markdown 围栏信息字符串。 */
export const stringifyCodeFenceInfo = (input?: Partial<EnhancedCodeBlockAttrs> | null) => {
  const attrs = normalizeCodeBlockAttrs(input)
  const parts = [attrs.language]

  if (attrs.title) {
    parts.push(`title="${escapeCodeFenceMetadataValue(attrs.title)}"`)
  }

  if (attrs.theme !== codeBlockDefaults.theme) {
    parts.push(`theme="${attrs.theme}"`)
  }

  if (attrs.lineNumbers !== codeBlockDefaults.lineNumbers) {
    parts.push(`lineNumbers="${String(attrs.lineNumbers)}"`)
  }

  if (attrs.wrap !== codeBlockDefaults.wrap) {
    parts.push(`wrap="${String(attrs.wrap)}"`)
  }

  if (attrs.collapsed !== codeBlockDefaults.collapsed) {
    parts.push(`collapsed="${String(attrs.collapsed)}"`)
  }

  return parts.join(" ")
}

/** 获取代码语言标签。 */
export const getCodeLanguageLabel = (language: string) => {
  const normalized = normalizeLanguage(language)
  const matched = codeBlockLanguages.find((item) => {
    return item.value === normalized || item.aliases?.includes(normalized)
  })

  return matched?.label || normalized
}

/** 判断语言标识是否在内置或 highlight.js 能识别的范围内。 */
export const isKnownCodeLanguage = (language: string) => {
  const normalized = normalizeLanguage(language)
  return codeBlockLanguageSet.has(normalized) || Boolean(hljs.getLanguage(normalized))
}

/** 从 DOM dataset 中读取增强代码块属性。 */
export const getCodeBlockAttrsFromDataset = (
  dataset: DOMStringMap | Record<string, string | undefined>,
): Partial<EnhancedCodeBlockAttrs> => {
  return {
    language: dataset.language,
    title: dataset.title,
    theme: dataset.theme as CodeBlockTheme | undefined,
    lineNumbers: dataset.lineNumbers,
    wrap: dataset.wrap,
    collapsed: dataset.collapsed,
  } as Partial<EnhancedCodeBlockAttrs>
}

/** 根据语言高亮代码，失败时回退为纯文本 HTML。 */
export const highlightCodeHtml = (code: string, language?: string) => {
  const normalized = normalizeLanguage(language)

  if (
    normalized &&
    normalized !== "text" &&
    normalized !== "plaintext" &&
    hljs.getLanguage(normalized)
  ) {
    try {
      return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value
    } catch (error) {
      logger.warn("enhanced-code-block", "代码高亮失败，回退为纯文本渲染。", error)
    }
  }

  return escapeHtml(code)
}

const buildLineNumbersHtml = (code: string) => {
  const lineCount = Math.max(1, code.split("\n").length)
  return Array.from({ length: lineCount }, (_, index) => `<span>${index + 1}</span>`).join("")
}

/** 渲染增强代码块的静态 HTML。 */
export const renderEnhancedCodeBlockHtml = (
  code: string,
  input?: Partial<EnhancedCodeBlockAttrs> | null,
) => {
  const attrs = normalizeCodeBlockAttrs(input)
  const languageLabel = escapeHtml(getCodeLanguageLabel(attrs.language))
  const titleLabel = escapeHtml(attrs.title || "请输入代码块名称")
  const themeLabel = escapeHtml(
    codeBlockThemes.find((theme) => theme.value === attrs.theme)?.label || attrs.theme,
  )
  const highlightedHtml = highlightCodeHtml(code, attrs.language)
  const lineNumbersHtml = attrs.lineNumbers
    ? `<div class="kb-code-block__line-numbers">${buildLineNumbersHtml(code)}</div>`
    : ""

  return `<div data-type="enhanced-code-block" class="kb-code-block kb-code-block--${attrs.theme}" data-theme="${
    attrs.theme
  }" data-language="${escapeHtml(
    attrs.language,
  )}" data-title="${escapeHtml(attrs.title || "")}" data-line-numbers="${String(
    attrs.lineNumbers,
  )}" data-wrap="${String(attrs.wrap)}" data-collapsed="${String(
    attrs.collapsed,
  )}"><div class="kb-code-block__toolbar"><div class="kb-code-block__toolbar-left"><span class="kb-code-block__caret">${
    attrs.collapsed ? "▶" : "▼"
  }</span><span class="kb-code-block__title ${attrs.title ? "" : "is-placeholder"}">${titleLabel}</span></div><div class="kb-code-block__toolbar-right"><span class="kb-code-block__badge">${languageLabel}</span><span class="kb-code-block__divider"></span><span class="kb-code-block__badge">${themeLabel}</span></div></div><div class="kb-code-block__body${
    attrs.collapsed ? " is-collapsed" : ""
  }">${lineNumbersHtml}<pre class="kb-code-block__pre"><code class="hljs language-${escapeHtml(
    attrs.language,
  )}">${highlightedHtml}</code></pre></div></div>`
}

/** 提供增强代码块导出或预览时复用的静态样式。 */
export const enhancedCodeBlockStyles = `
.kb-code-block {
  margin: 1.25rem 0;
  overflow: hidden;
  border: 1px solid #d9d9d9;
  border-radius: 14px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}
.kb-code-block__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1;
}
.kb-code-block__toolbar-left,
.kb-code-block__toolbar-right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.kb-code-block__caret {
  font-size: 11px;
  opacity: 0.8;
}
.kb-code-block__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.kb-code-block__title.is-placeholder {
  opacity: 0.62;
}
.kb-code-block__badge {
  white-space: nowrap;
}
.kb-code-block__divider {
  display: inline-block;
  width: 1px;
  height: 12px;
  opacity: 0.28;
}
.kb-code-block__body {
  display: flex;
  align-items: stretch;
}
.kb-code-block__body.is-collapsed {
  display: none;
}
.kb-code-block__line-numbers {
  display: flex;
  min-width: 48px;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  padding: 14px 10px 14px 0;
  font: 13px/1.7 "SFMono-Regular", "JetBrains Mono", Consolas, monospace;
  user-select: none;
}
.kb-code-block__line-numbers span {
  height: 1.7em;
}
.kb-code-block__pre {
  margin: 0;
  flex: 1;
  overflow: auto;
  padding: 14px 16px 14px 0;
  background: transparent;
}
.kb-code-block__pre code {
  display: block;
  min-width: 100%;
  font: 13px/1.7 "SFMono-Regular", "JetBrains Mono", Consolas, monospace;
}
.kb-code-block__mermaid-static {
  margin: 0;
  padding: 16px;
}
.kb-code-block__mermaid-static svg {
  display: block;
  width: 100%;
  height: auto;
}
.kb-code-block__mermaid-static-error {
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.6;
}
.kb-code-block[data-language="mermaid"][data-mermaid-rendered="true"] .kb-code-block__body {
  display: none;
}
.kb-code-block[data-wrap="true"] .kb-code-block__pre code {
  white-space: pre-wrap;
  word-break: break-word;
}
.kb-code-block[data-wrap="false"] .kb-code-block__pre code {
  white-space: pre;
}
.kb-code-block--one-dark-pro {
  background: #282c34;
}
.kb-code-block--one-dark-pro .kb-code-block__toolbar {
  color: rgba(255, 255, 255, 0.88);
  background: #1f2329;
}
.kb-code-block--one-dark-pro .kb-code-block__line-numbers {
  color: rgba(171, 178, 191, 0.72);
  background: #282c34;
}
.kb-code-block--one-dark-pro .kb-code-block__pre code {
  color: #abb2bf;
}
.kb-code-block--one-dark-pro .kb-code-block__mermaid-static {
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
}
.kb-code-block--one-dark-pro .kb-code-block__mermaid-static-error {
  background: rgba(245, 34, 45, 0.12);
  color: #ffccc7;
}
.kb-code-block--slate {
  background: #1f2937;
}
.kb-code-block--slate .kb-code-block__toolbar {
  color: rgba(255, 255, 255, 0.9);
  background: #0f172a;
}
.kb-code-block--slate .kb-code-block__line-numbers {
  color: rgba(148, 163, 184, 0.76);
  background: #1f2937;
}
.kb-code-block--slate .kb-code-block__pre code {
  color: #dbe4f0;
}
.kb-code-block--slate .kb-code-block__mermaid-static {
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
}
.kb-code-block--slate .kb-code-block__mermaid-static-error {
  background: rgba(245, 34, 45, 0.12);
  color: #ffccc7;
}
.kb-code-block--github-light {
  background: #f8fafc;
}
.kb-code-block--github-light .kb-code-block__toolbar {
  color: rgba(0, 0, 0, 0.72);
  background: #f3f4f6;
}
.kb-code-block--github-light .kb-code-block__line-numbers {
  color: rgba(0, 0, 0, 0.38);
  background: #f8fafc;
}
.kb-code-block--github-light .kb-code-block__pre code {
  color: #1f2328;
}
.kb-code-block--github-light .kb-code-block__mermaid-static {
  background: linear-gradient(180deg, #ffffff, #f8fafc);
}
.kb-code-block--github-light .kb-code-block__mermaid-static-error {
  background: #fff1f0;
  color: #cf1322;
}
.kb-code-block .hljs-comment,
.kb-code-block .hljs-quote {
  color: #7f848e;
}
.kb-code-block .hljs-keyword,
.kb-code-block .hljs-selector-tag,
.kb-code-block .hljs-literal,
.kb-code-block .hljs-section,
.kb-code-block .hljs-link {
  color: #c678dd;
}
.kb-code-block .hljs-string,
.kb-code-block .hljs-title,
.kb-code-block .hljs-name,
.kb-code-block .hljs-attribute {
  color: #98c379;
}
.kb-code-block .hljs-number,
.kb-code-block .hljs-symbol,
.kb-code-block .hljs-bullet,
.kb-code-block .hljs-variable,
.kb-code-block .hljs-template-variable {
  color: #d19a66;
}
.kb-code-block .hljs-type,
.kb-code-block .hljs-built_in,
.kb-code-block .hljs-builtin-name {
  color: #56b6c2;
}
.kb-code-block .hljs-function,
.kb-code-block .hljs-title.function_ {
  color: #61afef;
}
.kb-code-block .hljs-emphasis {
  font-style: italic;
}
.kb-code-block .hljs-strong {
  font-weight: 700;
}
.kb-code-block--github-light .hljs-comment,
.kb-code-block--github-light .hljs-quote {
  color: #6a737d;
}
.kb-code-block--github-light .hljs-keyword,
.kb-code-block--github-light .hljs-selector-tag,
.kb-code-block--github-light .hljs-literal,
.kb-code-block--github-light .hljs-section,
.kb-code-block--github-light .hljs-link {
  color: #cf222e;
}
.kb-code-block--github-light .hljs-string,
.kb-code-block--github-light .hljs-title,
.kb-code-block--github-light .hljs-name,
.kb-code-block--github-light .hljs-attribute {
  color: #116329;
}
.kb-code-block--github-light .hljs-number,
.kb-code-block--github-light .hljs-symbol,
.kb-code-block--github-light .hljs-bullet,
.kb-code-block--github-light .hljs-variable,
.kb-code-block--github-light .hljs-template-variable {
  color: #953800;
}
.kb-code-block--github-light .hljs-type,
.kb-code-block--github-light .hljs-built_in,
.kb-code-block--github-light .hljs-builtin-name {
  color: #0550ae;
}
.kb-code-block--github-light .hljs-function,
.kb-code-block--github-light .hljs-title.function_ {
  color: #8250df;
}
`

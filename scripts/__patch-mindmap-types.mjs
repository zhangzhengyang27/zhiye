import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/types/knowledge-document.ts"
let t = readFileSync(p, "utf8")

t = t.replace(
  '  /** 表格文档（B7 #24b，自由网格 v1） */\n  sheet: "sheet",',
  [
    '  /** 表格文档（B7 #24b，自由网格 v1） */',
    '  sheet: "sheet",',
    "  /** 思维导图（B7 #24c） */",
    '  mindmap: "mindmap",',
  ].join("\n")
)

const schemeAnchor = 'export const KNOWLEDGE_DATATABLE_CONTENT_SCHEME = "application/vnd.kb-datatable+json"'
const schemeAddition = [
  'export const KNOWLEDGE_DATATABLE_CONTENT_SCHEME = "application/vnd.kb-datatable+json"',
  "",
  'export const KNOWLEDGE_MINDMAP_CONTENT_SCHEME = "application/vnd.kb-mindmap+json"',
  "",
  "/** 思维导图节点（B7 #24c）：simple-mind-map 的 nodeTree 数据形态 */",
  "export interface KnowledgeMindmapNodeData {",
  "  /** 节点文案 */",
  "  text: string",
  "  /** 节点唯一 id（simple-mind-map 内部用于增量更新） */",
  "  uid?: string",
  "  /** 是否展开子级（缺省展开） */",
  "  expand?: boolean",
  "}",
  "",
  "export interface KnowledgeMindmapNode {",
  "  data: KnowledgeMindmapNodeData",
  "  children?: KnowledgeMindmapNode[]",
  "}",
].join("\n")

if (!t.includes(schemeAnchor)) {
  console.error("scheme anchor missing")
  process.exit(1)
}
t = t.replace(schemeAnchor, schemeAddition)

const unionAnchor = [
  "  | {",
  "      scheme: typeof KNOWLEDGE_DATATABLE_CONTENT_SCHEME",
  "      value: KnowledgeDataTableDocument",
  "    }",
].join("\n")
const unionNew = [
  unionAnchor,
  "  | {",
  "      scheme: typeof KNOWLEDGE_MINDMAP_CONTENT_SCHEME",
  "      value: KnowledgeMindmapNode",
  "    }",
].join("\n")

if (!t.includes(unionAnchor)) {
  console.error("union anchor missing")
  process.exit(1)
}
t = t.replace(unionAnchor, unionNew)

writeFileSync(p, t)
console.log("types ok")

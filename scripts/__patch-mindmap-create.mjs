import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/views/knowledge/use-tree-node-actions.ts"
let c = readFileSync(p, "utf8")

c = c.replace(
  '      editorType: "richText" | "board" | "datatable" | "flowchart" | "sheet"',
  '      editorType: "richText" | "board" | "datatable" | "flowchart" | "sheet" | "mindmap"'
)

const oldCreate = `        const useSheet = !isFolder && !useBoard && !useDatatable && editorType === "sheet"`
const newCreate = [
  '        const useSheet = !isFolder && !useBoard && !useDatatable && editorType === "sheet"',
  '        const useMindmap = !isFolder && !useBoard && !useDatatable && !useSheet && editorType === "mindmap"',
].join("\n")
if (!c.includes(oldCreate)) {
  console.error("create anchor missing")
  process.exit(1)
}
c = c.replace(oldCreate, newCreate)

c = c.replace(
  '            type: useBoard || useDatatable || useSheet ? "doc" : type,',
  '            type: useBoard || useDatatable || useSheet || useMindmap ? "doc" : type,'
)

const oldEditor = [
  "                : useSheet",
  "                  ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet",
  "                  : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,",
].join("\n")
const newEditor = [
  "                : useSheet",
  "                  ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet",
  "                  : useMindmap",
  "                    ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap",
  "                    : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,",
].join("\n")
if (!c.includes(oldEditor)) {
  console.error("editorType anchor missing")
  process.exit(1)
}
c = c.replace(oldEditor, newEditor)

const oldContent = [
  "                  : useSheet",
  "                    ? {",
  "                        scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,",
  "                        value: { fields: [], rows: [] },",
  "                      }",
].join("\n")
const newContent = [
  "                  : useSheet",
  "                    ? {",
  "                        scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,",
  "                        value: { fields: [], rows: [] },",
  "                      }",
  "                  : useMindmap",
  "                    ? {",
  "                        scheme: KNOWLEDGE_MINDMAP_CONTENT_SCHEME,",
  "                        value: {",
  "                          data: { text: normalizedTitle, uid: Math.random().toString(36).slice(2, 14) },",
  "                          children: [],",
  "                        },",
  "                      }",
].join("\n")
if (!c.includes(oldContent)) {
  console.error("content anchor missing")
  process.exit(1)
}
c = c.replace(oldContent, newContent)

c = c.replace(
  'useDatatable ? "数据表已创建。" : useSheet ? "表格已创建。" : "文档已创建。"',
  'useDatatable ? "数据表已创建。" : useSheet ? "表格已创建。" : useMindmap ? "思维导图已创建。" : "文档已创建。"'
)

// import scheme 常量
c = c.replace(
  "  KNOWLEDGE_DATATABLE_CONTENT_SCHEME,",
  "  KNOWLEDGE_DATATABLE_CONTENT_SCHEME,\n  KNOWLEDGE_MINDMAP_CONTENT_SCHEME,"
)

writeFileSync(p, c)
console.log("mindmap create ok")

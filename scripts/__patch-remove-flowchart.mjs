import { readFileSync, writeFileSync } from "node:fs"

const FLOW = '"flowchart"'
const FLOW_BAR = '"board" | "datatable" | "sheet" | "mindmap" | "flowchart"'
const FLOW_BAR_NEW = '"board" | "datatable" | "sheet" | "mindmap"'
const FLOW_CTX = '  | "flowchart"'

// 1) CreateDialog：撤选项与类型成员
const dialogPath = "src/renderer/src/components/knowledge/KnowledgeDocCreateDialog.vue"
let d = readFileSync(dialogPath, "utf8")
d = d.replace(
  'type DocCreateEditorType = "richText" | "board" | "datatable" | "flowchart" | "sheet" | "mindmap"',
  'type DocCreateEditorType = "richText" | "board" | "datatable" | "sheet" | "mindmap"',
)
d = d.replace("                { value: 'flowchart', label: '流程图' },\n", "")
writeFileSync(dialogPath, d)
console.log("dialog ok")

// 2) SidebarHeader
const shPath = "src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
let s = readFileSync(shPath, "utf8")
s = s.replace(
  'create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]',
  'create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"]',
)
s = s.replace(
  '  action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"',
  '  action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"',
)
// 撤按钮块（含前面的按钮间空白）
const btnStart = s.indexOf("            @click=\"handleCreateAction('flowchart')\"")
if (btnStart < 0) {
  console.error("sidebar flowchart btn missing")
  process.exit(1)
}
const btnBlockStart = s.lastIndexOf("            <button", btnStart)
const btnBlockEnd = s.indexOf("</button>", btnStart) + "</button>".length
s = s.slice(0, btnBlockStart) + s.slice(btnBlockEnd)
// 清掉可能残留的空行
s = s.replace(/\n{3,}/g, "\n\n")
writeFileSync(shPath, s)
console.log("sidebar header ok")

// 3) TreePanelHeader
const thPath = "src/renderer/src/components/knowledge/KnowledgeWorkspaceTreePanelHeader.vue"
let t = readFileSync(thPath, "utf8")
t = t.replace(
  '  create: [action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]',
  '  create: [action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap"]',
)
t = t.replace(
  '  action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"',
  '  action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap"',
)
const tb = t.indexOf("              @click=\"handleCreateAction('flowchart')\"")
if (tb < 0) {
  console.error("tree flowchart btn missing")
  process.exit(1)
}
const tbStart = t.lastIndexOf("            <button", tb)
const tbEnd = t.indexOf("</button>", tb) + "</button>".length
t = t.slice(0, tbStart) + t.slice(tbEnd)
t = t.replace(/\n{3,}/g, "\n\n")
writeFileSync(thPath, t)
console.log("tree header ok")

// 4) SidebarMenu
const smPath = "src/renderer/src/components/knowledge/KnowledgeSidebarMenu.vue"
let m = readFileSync(smPath, "utf8")
m = m.replace(
  '"doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"',
  '"doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"',
)
m = m.replace('  flowchart: "create-flowchart",\n', "")
m = m.replace(
  '  action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"',
  '  action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"',
)
writeFileSync(smPath, m)
console.log("sidebar menu ok")

// 5) workspace-context
const ctxPath = "src/renderer/src/views/knowledge/workspace-context.ts"
let c = readFileSync(ctxPath, "utf8")
c = c.replace(FLOW_CTX + "\n", "")
writeFileSync(ctxPath, c)
console.log("ctx ok")

// 6) Layout
const layoutPath = "src/renderer/src/views/knowledge/KnowledgeWorkspaceLayout.vue"
let l = readFileSync(layoutPath, "utf8")
l = l.replace(
  '  action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"',
  '  action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap"',
)
l = l.replace('  "create-flowchart": () => handleRootCreateMenuAction("flowchart"),\n', "")
writeFileSync(layoutPath, l)
console.log("layout ok")

// 7) use-tree-node-actions：handleRoot 联合 + createNode 分支 + onConfirm 联合与分支
const actionsPath = "src/renderer/src/views/knowledge/use-tree-node-actions.ts"
let a = readFileSync(actionsPath, "utf8")
a = a.replace(
  `  const handleRootCreateMenuAction = (
    action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"
  ) => {`,
  `  const handleRootCreateMenuAction = (
    action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap"
  ) => {`,
)
a = a.replace('    const isFlowchart = type === "flowchart"\n', "")
// typeLabel / defaultTitle 里撤 isFlowchart 分支
a = a.replace(
  `              : isFlowchart
                ? "流程图"
                : "文档"`,
  `              : "文档"`,
)
a = a.replace(
  "      : isBoard || isDatatable || isSheet || isMindmap || isFlowchart",
  "      : isBoard || isDatatable || isSheet || isMindmap",
)
// createNode 里编辑器类型分支撤 isFlowchart
a = a.replace(
  `              : isMindmap
                ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap
                : isFlowchart
                  ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
                  : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,`,
  `              : isMindmap
                ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap
                : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,`,
)
// createNode content 分支撤 isFlowchart
a = a.replace(
  `            content: isBoard
          ? undefined
          : useBoard`,
  `            content: isBoard
          ? undefined
          : useBoard`,
)
// onConfirm 签名与分支
a = a.replace(
  '      editorType: "richText" | "board" | "datatable" | "flowchart" | "sheet" | "mindmap"',
  '      editorType: "richText" | "board" | "datatable" | "sheet" | "mindmap"',
)
a = a.replace(
  `        const useBoard = isBoard || editorType === "board" || editorType === "flowchart"
        // 流程图（B7 #24d）= 画板文档 + 预置 mermaid 模板场景
        const flowchartContent =
          !isFolder && editorType === "flowchart" ? await buildFlowchartPresetBoardDocument() : null`,
  `        const useBoard = isBoard || editorType === "board"`,
)
a = a.replace(
  `              : useBoard
                ? flowchartContent
                  ? { scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME, value: flowchartContent }
                  : {
                      scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
                      value: createKnowledgeBoardDocument(),
                    }`,
  `              : useBoard
                ? {
                    scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
                    value: createKnowledgeBoardDocument(),
                  }`,
)
a = a.replace('editorType === "flowchart" ? "流程图已创建。" : ', "")
// presetEditorType 联合撤 flowchart
a = a.replace(
  '    presetEditorType?: "richText" | "board" | "datatable" | "flowchart" | "sheet" | "mindmap"',
  '    presetEditorType?: "richText" | "board" | "datatable" | "sheet" | "mindmap"',
)
// buildFlowchartPresetBoardDocument 导入撤除
a = a.replace(
  'import { buildFlowchartPresetBoardDocument } from "@/utils/knowledge-board-ai"\n',
  "",
)
writeFileSync(actionsPath, a)
console.log("actions ok")

// 8) utils：撤预置工厂（入口没了即死代码）
const utilPath = "src/renderer/src/utils/knowledge-board-ai.ts"
let u = readFileSync(utilPath, "utf8")
const utilStart = u.indexOf("/** 流程图新建预设（B7 #24d v1）")
if (utilStart >= 0) {
  u = u.slice(0, utilStart).trimEnd() + "\n"
  writeFileSync(utilPath, u)
  console.log("util preset removed")
} else {
  console.log("util preset not found (skip)")
}

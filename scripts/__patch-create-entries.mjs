import { readFileSync, writeFileSync } from "node:fs"

const NEW_KINDS = ["datatable", "sheet", "mindmap", "flowchart"] as const

// ============ 1) workspace-context：创建类型别名扩展 ============
const ctxPath = "src/renderer/src/views/knowledge/workspace-context.ts"
let ctx = readFileSync(ctxPath, "utf8")
ctx = ctx.replace(
  'export type KnowledgeWorkspaceCreateNodeType = KnowledgeDocumentType | "board"',
  [
    'export type KnowledgeWorkspaceCreateNodeType =',
    '  | KnowledgeDocumentType',
    '  | "board"',
    '  | "datatable"',
    '  | "sheet"',
    '  | "mindmap"',
    '  | "flowchart"',
  ].join("\n")
)
writeFileSync(ctxPath, ctx)
console.log("ctx ok")

// ============ 2) use-tree-node-actions：createNode 分支 + preset + handleRoot 扩展 ============
const actionsPath = "src/renderer/src/views/knowledge/use-tree-node-actions.ts"
let a = readFileSync(actionsPath, "utf8")

// inputDialog 类型 + 默认值：加 presetEditorType
a = a.replace(
  "    onConfirm: (value: string, parentId: string, editorType: \"richText\" | \"board\" | \"datatable\" | \"flowchart\" | \"sheet\" | \"mindmap\") => void",
  [
    "    onConfirm: (",
    "      value: string,",
    '      parentId: string,',
    '      editorType: "richText" | "board" | "datatable" | "flowchart" | "sheet" | "mindmap",',
    "    ) => void",
    "    /** 菜单直达类型时的预选（B7 入口补全）；缺省 richText */",
    '    presetEditorType?: "richText" | "board" | "datatable" | "flowchart" | "sheet" | "mindmap",',
  ].join("\n")
)

// createNode：标题/预设按类型分流
const createOld = `    const isFolder = type === "folder"
    const isBoard = type === "board"`
const createNew = [
  "    const isFolder = type === \"folder\"",
  "    const isBoard = type === \"board\"",
  "    const isDatatable = type === \"datatable\"",
  "    const isSheet = type === \"sheet\"",
  "    const isMindmap = type === \"mindmap\"",
  "    const isFlowchart = type === \"flowchart\"",
  "    const typeLabel = isFolder",
  "      ? \"文件夹\"",
  "      : isBoard",
  "        ? \"画板\"",
  "        : isDatatable",
  "          ? \"数据表\"",
  "          : isSheet",
  "            ? \"表格\"",
  "            : isMindmap",
  "              ? \"思维导图\"",
  "              : isFlowchart",
  "                ? \"流程图\"",
  "                : \"文档\"",
  "    const defaultTitle = isFolder",
  "      ? \"新建文件夹\"",
  "      : isBoard",
  "        ? \"无标题画板\"",
  "        : isDatatable || isSheet || isMindmap || isFlowchart",
  "          ? `无标题${typeLabel}`",
  "          : \"新建文档\"",
].join("\n")
if (!a.includes(createOld)) {
  console.error("createNode anchor missing")
  process.exit(1)
}
a = a.replace(createOld, createNew)

// inputDialog open：标题/默认值/preset
const dialogOld = [
  "    inputDialog.value = {",
  "      open: true,",
  "      title: isFolder ? \"新建文件夹\" : isBoard ? \"新建画板\" : \"新建文档\",",
  "      defaultValue: isFolder ? \"新建文件夹\" : isBoard ? \"无标题画板\" : \"新建文档\",",
  "      folders,",
  '      defaultFolderId: parentId ?? "",',
].join("\n")
const dialogNew = [
  "    inputDialog.value = {",
  "      open: true,",
  "      title: `新建${typeLabel}`,",
  "      defaultValue: defaultTitle,",
  "      folders,",
  '      defaultFolderId: parentId ?? "",',
  "      // 菜单直达：类型预选并展开高级选项（B7 入口补全）",
  "      presetEditorType: isBoard",
  "        ? \"board\"",
  "        : isDatatable",
  "          ? \"datatable\"",
  "          : isSheet",
  "            ? \"sheet\"",
  "            : isMindmap",
  "              ? \"mindmap\"",
  "              : isFlowchart",
  "                ? \"flowchart\"",
  "                : \"richText\",",
].join("\n")
if (!a.includes(dialogOld)) {
  console.error("dialog anchor missing")
  process.exit(1)
}
a = a.replace(dialogOld, dialogNew)

// 默认值对象补字段
a = a.replace(
  '    }>({ open: false, title: "", defaultValue: "", onConfirm: () => {} })',
  '    }>({ open: false, title: "", defaultValue: "", onConfirm: () => {} })'
)

// handleRootCreateMenuAction 扩展
const rootOld = `  const handleRootCreateMenuAction = (action: "doc" | "folder" | "template") => {
    if (action === "doc") {
      createNode("doc")
      return
    }

    if (action === "folder") {
      createNode("folder")
      return
    }

    openTemplateLibrary()
  }`
const rootNew = `  const handleRootCreateMenuAction = (
    action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"
  ) => {
    if (action === "template") {
      openTemplateLibrary()
      return
    }

    // 文档/文件夹/画板/数据表/表格/思维导图/流程图均走创建对话框（类型预选）
    createNode(action)
  }`
if (!a.includes(rootOld)) {
  console.error("root anchor missing")
  process.exit(1)
}
a = a.replace(rootOld, rootNew)

writeFileSync(actionsPath, a)
console.log("actions ok")

// ============ 3) CreateDialog：defaultEditorType prop ============
const dialogPath = "src/renderer/src/components/knowledge/KnowledgeDocCreateDialog.vue"
let d = readFileSync(dialogPath, "utf8")

d = d.replace(
  "const props = defineProps<{",
  `const props = withDefaults(
  defineProps<{`
)
// 找 defineProps 块结尾补 withDefaults 收口与 default
d = d.replace(
  /const props = withDefaults\(\n  defineProps<\{([\s\S]*?)\}>\)/,
  (match, inner) => {
    if (inner.includes("defaultEditorType")) return match
    return [
      "const props = withDefaults(",
      "  defineProps<{",
      inner.replace(/\n$/, ""),
      "    /** 菜单直达时的类型预选（B7 入口补全）；缺省 richText */",
      '    defaultEditorType?: DocCreateEditorType',
      "  }>(),",
      "  {",
      '    defaultEditorType: "richText",',
      "  }",
      ")",
    ].join("\n")
  }
)

// open 重置改为按 prop
d = d.replace(
  /      advancedOpen\.value = false\n      editorType\.value = "richText"/,
  `      editorType.value = props.defaultEditorType
      // 菜单直达非富文本类型时展开高级选项，让用户看到当前类型
      advancedOpen.value = props.defaultEditorType !== "richText"`
)

// emits confirm 的 editorType 类型随 dialog 自身联合，无需改
writeFileSync(dialogPath, d)
console.log("dialog ok")

// ============ 4) TreePanelHeader：菜单项 + 事件类型 ============
const headerPath = "src/renderer/src/components/knowledge/KnowledgeWorkspaceTreePanelHeader.vue"
let h = readFileSync(headerPath, "utf8")
h = h.replace(
  'const handleCreateAction = (action: "doc" | "folder" | "template" | "link") => {',
  'const handleCreateAction = (action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart") => {'
)
const menuOld = [
  '            <button',
  '              type="button"',
  '              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"handleCreateAction('link')\"",
  '            >',
  '              <Icon icon="ph:link-simple" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>添加链接</span>',
  '            </button>',
].join("\n")
const menuNew = [
  menuOld,
  '            <div class="my-1 h-px bg-grey-200" />',
  '            <button',
  '              type="button"',
  '              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"handleCreateAction('board')\"",
  '            >',
  '              <Icon icon="ph:frame-corners" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建画板</span>',
  '            </button>',
  '            <button',
  '              type="button"',
  '              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"handleCreateAction('datatable')\"",
  '            >',
  '              <Icon icon="ph:table" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建数据表</span>',
  '            </button>',
  '            <button',
  '              type="button"',
  '              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"handleCreateAction('sheet')\"",
  '            >',
  '              <Icon icon="ph:grid-3x3" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建表格</span>',
  '            </button>',
  '            <button',
  '              type="button"',
  '              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"handleCreateAction('mindmap')\"",
  '            >',
  '              <Icon icon="ph:tree-structure" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建思维导图</span>',
  '            </button>',
  '            <button',
  '              type="button"',
  '              class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"handleCreateAction('flowchart')\"",
  '            >',
  '              <Icon icon="ph:flow-arrow" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建流程图</span>',
  '            </button>',
].join("\n")
if (!h.includes(menuOld)) {
  console.error("tree header menu anchor missing")
  process.exit(1)
}
h = h.replace(menuOld, menuNew)

// emits 类型
h = h.replace(
  '  create: [kind: "doc" | "folder" | "template" | "link"]',
  '  create: [kind: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]'
)
writeFileSync(headerPath, h)
console.log("tree header ok")

// ============ 5) SidebarHeader：新建菜单加类型 ============
const sideHeaderPath = "src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
let s = readFileSync(sideHeaderPath, "utf8")
s = s.replace(
  '  create: [kind: "doc" | "folder" | "template"]',
  '  create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]'
)
s = s.replace(
  '  create: [kind: "doc" | "folder" | "template"]',
  '  create: [kind: "doc" | "folder" | "template"]'
)
const sideMenuOld = [
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('template')\"",
  '          >',
  '            <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>从模板创建</span>',
  '          </button>',
].join("\n")
const sideMenuNew = [
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('template')\"",
  '          >',
  '            <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>从模板创建</span>',
  '          </button>',
  '          <div class="my-1 h-px bg-grey-200" />',
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('board')\"",
  '          >',
  '            <Icon icon="ph:frame-corners" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>新建画板</span>',
  '          </button>',
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('datatable')\"",
  '          >',
  '            <Icon icon="ph:table" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>新建数据表</span>',
  '          </button>',
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('sheet')\"",
  '          >',
  '            <Icon icon="ph:grid-3x3" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>新建表格</span>',
  '          </button>',
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('mindmap')\"",
  '          >',
  '            <Icon icon="ph:tree-structure" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>新建思维导图</span>',
  '          </button>',
  '          <button',
  '            type="button"',
  '            class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "            @click=\"handleCreateAction('flowchart')\"",
  '          >',
  '            <Icon icon="ph:flow-arrow" :width="15" :height="15" class="text-ink-tertiary" />',
  '            <span>新建流程图</span>',
  '          </button>',
].join("\n")
if (!s.includes(sideMenuOld)) {
  console.error("sidebar header menu anchor missing")
  process.exit(1)
}
s = s.replace(sideMenuOld, sideMenuNew)

// handleCreateAction 类型
s = s.replace(
  'const handleCreateAction = (action: "doc" | "folder" | "template") => {',
  'const handleCreateAction = (action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart") => {'
)
writeFileSync(sideHeaderPath, s)
console.log("sidebar header ok")

// ============ 6) SidebarMenu：分发类型 + 意图映射 ============
const menuPath = "src/renderer/src/components/knowledge/KnowledgeSidebarMenu.vue"
let m = readFileSync(menuPath, "utf8")
m = m.replace(
  'const handleSidebarCreate = async (action: "doc" | "folder" | "template") => {',
  'const handleSidebarCreate = async (action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart") => {'
)
m = m.replace(
  'const sidebarCreateIntents: Record<"doc" | "folder" | "template", string> = {',
  'const sidebarCreateIntents: Record<\n    "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart",\n    string\n  > = {'
)
m = m.replace(
  '  template: "create-template",\n}',
  [
    '  template: "create-template",',
    '  board: "create-board",',
    '  datatable: "create-datatable",',
    '  sheet: "create-sheet",',
    '  mindmap: "create-mindmap",',
    '  flowchart: "create-flowchart",',
    "}",
  ].join("\n")
)
writeFileSync(menuPath, m)
console.log("sidebar menu ok")

// ============ 7) Layout：意图 handlers + 列头 action 类型 + 对话框 preset 透传 ============
const layoutPath = "src/renderer/src/views/knowledge/KnowledgeWorkspaceLayout.vue"
let l = readFileSync(layoutPath, "utf8")
l = l.replace(
  '  "create-template": () => handleRootCreateMenuAction("template"),',
  [
    '  "create-template": () => handleRootCreateMenuAction("template"),',
    '  "create-board": () => handleRootCreateMenuAction("board"),',
    '  "create-datatable": () => handleRootCreateMenuAction("datatable"),',
    '  "create-sheet": () => handleRootCreateMenuAction("sheet"),',
    '  "create-mindmap": () => handleRootCreateMenuAction("mindmap"),',
    '  "create-flowchart": () => handleRootCreateMenuAction("flowchart"),',
  ].join("\n")
)
// 列头 create 事件类型（layout handleHeaderCreateAction 的参数类型）
l = l.replace(
  'const handleHeaderCreateAction = (action: "doc" | "folder" | "template" | "link") => {',
  'const handleHeaderCreateAction = (\n  action: "doc" | "folder" | "template" | "link" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"\n) => {'
)
// 对话框透传 preset
l = l.replace(
  '      :default-folder-id="inputDialog.defaultFolderId"',
  '      :default-folder-id="inputDialog.defaultFolderId"\n      :default-editor-type="inputDialog.presetEditorType"'
)
writeFileSync(layoutPath, l)
console.log("layout ok")

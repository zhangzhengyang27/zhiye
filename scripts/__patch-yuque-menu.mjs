import { readFileSync, writeFileSync } from "node:fs"

// ============ SidebarHeader：菜单重排对齐语雀 OCR 布局 ============
const headerPath = "src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
let h = readFileSync(headerPath, "utf8")

// emits：加 note / ai-writing / import 无 kind 版；create-kb 保留
h = h.replace(
  '  create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]',
  [
    '  create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]',
    '  /** 打开小记页 / AI 写作页（语雀新建下拉直达项） */',
    '  "open-notes": []',
    '  "open-ai-writing": []',
    '  /** 统一导入入口（语雀下拉为单条「导入…」） */',
    '  import: [kind: "md" | "docx" | "lake" | "any"]',
  ].join("\n")
)

// 重写整个下拉菜单区（从 class="absolute right-0 的菜单容器到导入三项结束）
const menuStart = h.indexOf('          <div\n            class="absolute right-0 top-[calc(100%+8px)]')
if (menuStart < 0) {
  // 备选锚点：单行 class 写法
  console.error("menu container anchor v1 missing")
  process.exit(1)
}
// 找菜单容器结束：从 menuStart 起找对应的导入 Word 项后第一个 </div> 前——直接定位「导入语雀文档」按钮块结束
const importLakeEnd = h.indexOf("</button>", h.indexOf('handleImportAction(\'lake\')'))
if (importLakeEnd < 0) {
  console.error("import lake end missing")
  process.exit(1)
}
const menuEnd = importLakeEnd + "</button>".length

const newMenu = [
  '          <div class="flex w-45 flex-col rounded-kb-xl border border-line bg-surface p-1.5 shadow-[var(--kb-float-shadow)]">',
  "            <!-- 上段：内容类型（对齐语雀 OCR 实测：小记/文档/表格/画板/数据表/知识库；思维导图/流程图为自有项） -->",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="emit(\'open-notes\')">',
  '              <Icon icon="ph:note-pencil" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>小记</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center justify-between gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'doc\')">',
  '              <span class="flex items-center gap-2"><Icon icon="ph:file-plus" :width="15" :height="15" class="text-ink-tertiary" />新建文档</span>',
  '              <span class="text-[11px] text-ink-quaternary">⌘N</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'sheet\')">',
  '              <Icon icon="ph:grid-nine" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建表格</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'board\')">',
  '              <Icon icon="ph:frame-corners" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建画板</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'datatable\')">',
  '              <Icon icon="ph:table" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建数据表</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'mindmap\')">',
  '              <Icon icon="ph:tree-structure" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建思维导图</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'flowchart\')">',
  '              <Icon icon="ph:flow-arrow" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建流程图</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="emit(\'create-kb\')">',
  '              <Icon icon="ph:book-plus" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>新建知识库</span>',
  "            </button>",
  '            <div class="my-1 h-px bg-grey-200" />',
  "            <!-- 下段：模板 / AI / 导入（对齐语雀：导入为单条统一入口） -->",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'template\')">',
  '              <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>从模板新建…</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="emit(\'open-ai-writing\')">',
  '              <Icon icon="ph:sparkle" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>AI 帮你写</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleImportAction(\'any\')">',
  '              <Icon icon="ph:download-simple" :width="15" :height="15" class="text-ink-tertiary" />',
  '              <span>导入…</span>',
  "            </button>",
  "          </div>",
].join("\n")

h = h.slice(0, menuStart) + newMenu + h.slice(menuEnd)

// handleImportAction 类型加 any
h = h.replace(
  'const handleImportAction = (kind: "md" | "docx" | "lake") => {',
  'const handleImportAction = (kind: "md" | "docx" | "lake" | "any") => {'
)

writeFileSync(headerPath, h)
console.log("header menu rebuilt")

// ============ SidebarMenu：分发扩展 ============
const menuPath = "src/renderer/src/components/knowledge/KnowledgeSidebarMenu.vue"
let m = readFileSync(menuPath, "utf8")

m = m.replace(
  'const handleSidebarImport = async (kind: "md" | "docx" | "lake") => {',
  'const handleSidebarImport = async (kind: "md" | "docx" | "lake" | "any") => {'
)
m = m.replace(
  "  const targetKbId = resolveCreateTargetKbId()\n\n  if (!targetKbId) {\n    await router.push({ name: \"knowledge\" })\n    return\n  }\n\n  await router.push({",
  "  const targetKbId = resolveCreateTargetKbId()\n\n  if (!targetKbId) {\n    await router.push({ name: \"knowledge\" })\n    return\n  }\n\n  await router.push({"
)

// 新增直达页处理 + 绑定新事件
m = m.replace(
  "const handleSpaceChanged = (spaceId: string | null) => {",
  [
    "/** 新建下拉直达项：小记 / AI 写作（语雀同款直达，不依赖工作台意图） */",
    "const openNotesPage = () => {",
    '  void router.push({ name: "knowledge-notes" })',
    "}",
    "",
    "const openAiWritingPage = () => {",
    '  void router.push({ name: "knowledge-ai-writing" })',
    "}",
    "",
    "const handleSpaceChanged = (spaceId: string | null) => {",
  ].join("\n")
)
m = m.replace(
  '      @create-space="handleSpaceCreated"',
  '      @create-space="handleSpaceCreated"\n      @open-notes="openNotesPage"\n      @open-ai-writing="openAiWritingPage"'
)
m = m.replace(
  '      @import="handleSidebarImport"',
  '      @import="handleSidebarImport"'
)
writeFileSync(menuPath, m)
console.log("menu dispatch ok")

// ============ Layout：import-any 意图 + accept 全格式 ============
const layoutPath = "src/renderer/src/views/knowledge/KnowledgeWorkspaceLayout.vue"
let l = readFileSync(layoutPath, "utf8")
l = l.replace(
  '  "import-md": () => handleImportAction("md"),',
  '  "import-md": () => handleImportAction("md"),\n  "import-any": () => handleImportAction("any"),'
)
l = l.replace(
  `const importAccept = computed(() =>
  importKind.value === "md"
    ? ".md,.markdown,text/markdown"
    : importKind.value === "lake"
      ? ".lake,application/json"
      : ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)`,
  `const importAccept = computed(() =>
  importKind.value === "md"
    ? ".md,.markdown,text/markdown"
    : importKind.value === "lake"
      ? ".lake,application/json"
      : importKind.value === "any"
        ? ".md,.markdown,.txt,.docx,.lake,.zip"
        : ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)`
)
l = l.replace(
  'const handleImportAction = (kind: "md" | "docx" | "lake") => {',
  'const handleImportAction = (kind: "md" | "docx" | "lake" | "any") => {'
)
// import-any 的即时提示文案
l = l.replace(
  "  const kind = importKind.value\n  const importingMessage =",
  "  const kind = importKind.value\n  const importingMessage ="
)
l = l.replace(
  '    kind === "md" ? "正在导入 Markdown…" : kind === "lake" ? "正在导入语雀文档…" : "正在导入 Word…"',
  '    kind === "md"\n      ? "正在导入 Markdown…"\n      : kind === "lake"\n        ? "正在导入语雀文档…"\n        : kind === "any"\n          ? "正在导入…"\n          : "正在导入 Word…"'
)
// SidebarMenu import intent 值 "import-any" 由 handleSidebarImport 拼接——查其 intent 拼法
writeFileSync(layoutPath, l)
console.log("layout ok")

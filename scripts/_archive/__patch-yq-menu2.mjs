import { readFileSync, writeFileSync } from "node:fs"

const headerPath = "src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
let h = readFileSync(headerPath, "utf8")

// emits 扩展（幂等）
if (!h.includes('"open-notes": []')) {
  h = h.replace(
    '  create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]',
    [
      '  create: [kind: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"]',
      "  /** 打开小记页 / AI 写作页（语雀新建下拉直达项） */",
      '  "open-notes": []',
      '  "open-ai-writing": []',
      "  /** 统一导入入口（语雀下拉为单条「导入…」） */",
      '  import: [kind: "md" | "docx" | "lake" | "any"]',
    ].join("\n"),
  )
}

// 菜单容器三行锚点 → 导入语雀文档按钮块结束
const menuStart = h.indexOf('          v-if="createMenuOpen"')
if (menuStart < 0) {
  console.error("v-if anchor missing")
  process.exit(1)
}
const containerStart = h.lastIndexOf("<div", menuStart)
const importLakeIdx = h.indexOf("handleImportAction('lake')")
if (importLakeIdx < 0) {
  console.error("import lake missing")
  process.exit(1)
}
const menuEnd = h.indexOf("</button>", importLakeIdx) + "</button>".length

const newMenu = [
  '          <div class="flex w-45 flex-col rounded-kb-xl border border-line bg-surface p-1.5 shadow-[var(--kb-float-shadow)]">',
  "            <!-- 上段：内容类型（对齐语雀新建下拉 OCR 实测：小记/文档/表格/画板/数据表/知识库；思维导图/流程图为自有项） -->",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="emit(\'open-notes\')">',
  '              <Icon icon="ph:note-pencil" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>小记</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center justify-between gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'doc\')">',
  '              <span class="flex items-center gap-2"><Icon icon="ph:file-plus" :width="15" :height="15" class="text-ink-tertiary" />新建文档</span>',
  '              <span class="text-[11px] text-ink-quaternary">⌘N</span>',
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'sheet\')">',
  '              <Icon icon="ph:grid-nine" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>新建表格</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'board\')">',
  '              <Icon icon="ph:frame-corners" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>新建画板</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'datatable\')">',
  '              <Icon icon="ph:table" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>新建数据表</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'mindmap\')">',
  '              <Icon icon="ph:tree-structure" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>新建思维导图</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'flowchart\')">',
  '              <Icon icon="ph:flow-arrow" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>新建流程图</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="emit(\'create-kb\')">',
  '              <Icon icon="ph:book-plus" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>新建知识库</span>",
  "            </button>",
  '            <div class="my-1 h-px bg-grey-200" />',
  "            <!-- 下段：模板 / AI / 导入（对齐语雀：导入为单条统一入口） -->",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleCreateAction(\'template\')">',
  '              <Icon icon="ph:clipboard-text" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>从模板新建…</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="emit(\'open-ai-writing\')">',
  '              <Icon icon="ph:sparkle" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>AI 帮你写</span>",
  "            </button>",
  '            <button type="button" class="flex w-full items-center gap-2 rounded-kb-md px-3 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-muted" @click="handleImportAction(\'any\')">',
  '              <Icon icon="ph:download-simple" :width="15" :height="15" class="text-ink-tertiary" />',
  "              <span>导入…</span>",
  "            </button>",
  "          </div>",
].join("\n")

h = h.slice(0, containerStart) + newMenu + h.slice(menuEnd)

h = h.replace(
  'const handleImportAction = (kind: "md" | "docx" | "lake") => {',
  'const handleImportAction = (kind: "md" | "docx" | "lake" | "any") => {',
)

writeFileSync(headerPath, h)
console.log("header menu rebuilt")

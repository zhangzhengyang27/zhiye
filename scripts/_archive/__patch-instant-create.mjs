import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/views/knowledge/use-tree-node-actions.ts"
let c = readFileSync(p, "utf8")

// 1) 即时创建函数（语雀逻辑：菜单点类型 → 直接建 → 进编辑器，命名走顶栏/树行内改名）
const anchor = "  const handleRootCreateMenuAction = ("
const instantFn = `  /**
   * 根级即时创建（对齐语雀新建逻辑）：「新建」菜单点类型即创建并进入编辑器，
   * 不弹命名对话框——命名在编辑器顶栏或树行内改名完成。文件夹/模板/链接/从
   * 节点菜单新建子级仍走既有对话框路径（目录选择/模板中心/文件选择有真实交互）。
   */
  const createNodeInstantly = async (type: KnowledgeWorkspaceCreateNodeType) => {
    if (!ensureEditPermission()) {
      return
    }

    const isFolder = type === "folder"
    const isBoard = type === "board"
    const isDatatable = type === "datatable"
    const isSheet = type === "sheet"
    const isMindmap = type === "mindmap"
    const isFlowchart = type === "flowchart"
    const typeLabel = isFolder
      ? "文件夹"
      : isBoard
        ? "画板"
        : isDatatable
          ? "数据表"
          : isSheet
            ? "表格"
            : isMindmap
              ? "思维导图"
              : isFlowchart
                ? "流程图"
                : "文档"
    const defaultTitle = isFolder
      ? "新建文件夹"
      : isBoard || isDatatable || isSheet || isMindmap || isFlowchart
        ? \`无标题\${typeLabel}\`
        : "新建文档"

    try {
      const created = await createKnowledgeDocument({
        kbId: kbId.value,
        title: defaultTitle,
        type: isFolder ? "folder" : "doc",
        editorType: isBoard
          ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
          : isDatatable
            ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.datatable
            : isSheet
              ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.sheet
              : isMindmap
                ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.mindmap
                : isFlowchart
                  ? KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board
                  : KNOWLEDGE_DOCUMENT_EDITOR_TYPES.richText,
        status: "draft",
        parentId: null,
        content: isBoard
          ? {
              scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
              value: createKnowledgeBoardDocument(),
            }
          : isDatatable
            ? {
                scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
                value: { fields: [], rows: [] },
              }
            : isSheet
              ? {
                  scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
                  value: { fields: [], rows: [] },
                }
              : isMindmap
                ? {
                    scheme: KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
                    value: {
                      data: { text: defaultTitle, uid: Math.random().toString(36).slice(2, 14) },
                      children: [],
                    },
                  }
                : undefined,
      })
      options.showToastMessage(\`\${typeLabel}「\${defaultTitle}」已创建，可直接开始编辑。\`, "success")
      await options.refreshTree()
      if (!isFolder) {
        options.openDoc(created.id, created.editorType)
      }
    } catch (error) {
      options.showToastMessage(getApiErrorMessage(error, "创建失败，请稍后重试。"), "error")
    }
  }

  const handleRootCreateMenuAction = (`

if (!c.includes(anchor)) {
  console.error("anchor missing")
  process.exit(1)
}
c = c.replace(anchor, instantFn)

// 2) handleRootCreateMenuAction：六类即时创建，目录/模板保持原路径
const oldRoot = c.match(
  / {2}const handleRootCreateMenuAction = \(\n {4}action: "doc" \| "folder" \| "template" \| "board" \| "datatable" \| "sheet" \| "mindmap" \| "flowchart"\n {2}\) => \{\n {4}if \(action === "template"\) \{\n {6}openTemplateLibrary\(\)\n {6}return\n {4}\}\n\n {4}\/\/ 文档\/文件夹\/画板\/数据表\/表格\/思维导图\/流程图均走创建对话框（类型预选）\n {4}createNode\(action\)\n {2}\}/,
)
if (!oldRoot) {
  console.error("root fn not matched")
  process.exit(1)
}
const newRoot = `  const handleRootCreateMenuAction = (
    action: "doc" | "folder" | "template" | "board" | "datatable" | "sheet" | "mindmap" | "flowchart"
  ) => {
    if (action === "template") {
      openTemplateLibrary()
      return
    }

    if (action === "folder") {
      // 语雀的「新建分组」在根级也是即时创建；目录选择仅从节点菜单新建子级时需要
      void createNodeInstantly("folder")
      return
    }

    // 文档/画板/数据表/表格/思维导图/流程图：即时创建并进入编辑器（对齐语雀）
    void createNodeInstantly(action as KnowledgeWorkspaceCreateNodeType)
  }`
c = c.replace(oldRoot[0], newRoot)

writeFileSync(p, c)
console.log("instant create ok")

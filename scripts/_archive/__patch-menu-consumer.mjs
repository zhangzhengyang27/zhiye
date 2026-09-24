import { readFileSync, writeFileSync } from "node:fs"

// in-app-menu 渲染层消费端（#29）：编辑页监听 ⌘F/⌘Y/演示模式
const p = "src/renderer/src/views/knowledge/KnowledgeDocEditorView.vue"
let c = readFileSync(p, "utf8")

const anchor = "const openVersions = async () => {"
const handler = `// 应用菜单命令消费端（B6 #29）：主进程菜单「在当页查找/查看文档历史/演示模式」
const handleInAppMenuCommand = (command: string) => {
  if (command === "find-in-page") {
    const editor = editorInstance.value as YuqueEditorRef | null
    editor?.execCommand("openSearchPanel")
  } else if (command === "doc-history") {
    void openVersions()
  } else if (command === "presentation-mode") {
    enterReadingMode()
  }
}

let inAppMenuOff: (() => void) | null = null

onMounted(() => {
  const desktop = (window as unknown as { xiaoyeDesktop?: { onInAppMenu?: (cb: (command: string) => void) => (() => void) | void } }).xiaoyeDesktop
  const result = desktop?.onInAppMenu?.(handleInAppMenuCommand)
  inAppMenuOff = typeof result === "function" ? result : null
})

onBeforeUnmount(() => {
  inAppMenuOff?.()
})

const openVersions = async () => {`

if (!c.includes(anchor)) {
  console.error("anchor missing")
  process.exit(1)
}
c = c.replace(anchor, handler)

writeFileSync(p, c)
console.log("menu consumer wired")

import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/views/knowledge/KnowledgeMindmapEditorView.vue"
let c = readFileSync(p, "utf8")

// 1) 挂起待挂载的树；loadDocument 不再直接 mount（v-show 隐藏态量到 0 尺寸）
c = c.replace(
  `const snapshot = ref("")`,
  `const snapshot = ref("")
/** 就绪后待挂载的树（画布 v-show 翻转后再 mount，避免 0 尺寸） */
const pendingTree = ref<KnowledgeMindmapNode | null>(null)`,
)

c = c.replace(
  `    const nodeTree =
      content?.scheme === KNOWLEDGE_MINDMAP_CONTENT_SCHEME
        ? normalizeNode(content.value)
        : makeRoot(title.value || "中心主题")
    mountMindMap(nodeTree ?? makeRoot("中心主题"))`,
  `    pendingTree.value =
      (content?.scheme === KNOWLEDGE_MINDMAP_CONTENT_SCHEME
        ? normalizeNode(content.value)
        : null) ?? makeRoot(title.value || "中心主题")`,
)

// 2) 加载/错误态翻转后挂载
const anchor = `// 标题改动防抖保存（与内容同一节奏）`
const watcher = [
  `// 加载完成后再挂画布（v-show 已翻转、容器有真实尺寸）`,
  `watch(
  [loading, loadError, pendingTree],
  ([isLoading, loadErr]) => {
    if (isLoading || loadErr || !pendingTree.value) {
      return
    }
    void nextTick(() => {
      const tree = pendingTree.value
      pendingTree.value = null
      if (tree) {
        mountMindMap(tree)
      }
    })
  },
  { immediate: true }
)`,
  ``,
  `// 标题改动防抖保存（与内容同一节奏）`,
].join("\n")
if (!c.includes(anchor)) {
  console.error("watch anchor missing")
  process.exit(1)
}
c = c.replace(anchor, watcher)

// 3) nextTick 导入
c = c.replace(
  'import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"',
  'import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"',
)

writeFileSync(p, c)
console.log("mount timing fixed")

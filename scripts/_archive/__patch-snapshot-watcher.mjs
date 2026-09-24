import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/views/knowledge/KnowledgeDocEditorView.vue"
let c = readFileSync(p, "utf8")

const anchor = `watch([title, status, scheme, content], () => {
  scheduleAutoSave()
  scheduleRemoteConflictCheck()
  // 内容变更后锚点路径会错位，让高亮跟随重绘（引擎内部 rAF 节流）
  commentManager?.refreshHighlights()
})`

const watcher = `${anchor}

// 本地快照（#26）：编辑停顿 3s 落一条 IndexedDB 快照（每文档最近 10 条），
// 与自动保存互不影响——保存失败/断网时快照仍在
let localSnapshotTimer: number | null = null
watch(
  () => [docId.value, content.value] as const,
  ([targetDocId, nextContent]) => {
    if (localSnapshotTimer !== null) {
      window.clearTimeout(localSnapshotTimer)
      localSnapshotTimer = null
    }
    if (!targetDocId || typeof nextContent !== "string") {
      return
    }
    localSnapshotTimer = window.setTimeout(() => {
      localSnapshotTimer = null
      const editor = editorInstance.value as YuqueEditorRef | null
      void appendDocumentLocalSnapshot(targetDocId, {
        at: Date.now(),
        content: nextContent,
        wordCount: editor ? editor.wordCount() : 0,
      })
    }, 3000)
  }
)`

if (!c.includes(anchor)) {
  console.error("anchor missing")
  process.exit(1)
}
c = c.replace(anchor, watcher)

const versionsWatchOld = `watch(
  () => versionsDialogOpen.value,
  open => {
    if (!open) {
      clearVersionSelection()
    }
  }
)`
const versionsWatchNew = `watch(
  () => versionsDialogOpen.value,
  open => {
    if (open) {
      void refreshLocalSnapshots()
    } else {
      clearVersionSelection()
    }
  }
)`
if (!c.includes(versionsWatchOld)) {
  console.error("versions watch missing")
  process.exit(1)
}
c = c.replace(versionsWatchOld, versionsWatchNew)

writeFileSync(p, c)
console.log("watchers added")

import { readFileSync, writeFileSync } from "node:fs"

// 1) DocumentVersionsPanel：把快照 helper 从文件尾移进 script setup
const panelPath = "src/renderer/src/components/version/DocumentVersionsPanel.vue"
let c = readFileSync(panelPath, "utf8")
const helperStart = c.indexOf("/** 快照相对时间（#26）")
if (helperStart < 0) {
  console.error("helper missing")
  process.exit(1)
}
const helperBlock = c.slice(helperStart)
c = c.slice(0, helperStart).trimEnd() + "\n"
const scriptClose = c.indexOf("</script>")
c = c.slice(0, scriptClose) + helperBlock + "\n" + c.slice(scriptClose)
writeFileSync(panelPath, c)
console.log("helper moved")

// 2) Editor view：绑定快照 props 与事件
const viewPath = "src/renderer/src/views/knowledge/KnowledgeDocEditorView.vue"
let v = readFileSync(viewPath, "utf8")
v = v.replace(
  `      :local-cache-items="versionsLocalCacheItems"`,
  `      :local-cache-items="versionsLocalCacheItems"
      :local-snapshots="localSnapshots"`
)
v = v.replace(
  `      @rollback-version="rollbackVersion"`,
  `      @rollback-version="rollbackVersion"
      @restore-snapshot="handleRestoreSnapshot"
      @clear-snapshots="handleClearSnapshots"`
)
writeFileSync(viewPath, v)
console.log("bindings done")

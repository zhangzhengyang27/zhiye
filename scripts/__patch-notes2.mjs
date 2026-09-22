import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/views/knowledge/KnowledgeNotesView.vue"
let c = readFileSync(p, "utf8")

// 两处卡片正文（缩进不同）统一替换为 NoteContentBody
const pattern = /<p class="mt-2 whitespace-pre-wrap break-words text-\[13px\] leading-6 text-ink-secondary">\n\s*\{\{ note\.content \}\}\n\s*<\/p>/g
const replacement = `<NoteContentBody
                    :content="note.content"
                    @toggle-todo="lineIndex => handleToggleTodo(note, lineIndex)"
                  />`

const matches = c.match(pattern)
if (!matches || matches.length < 2) {
  console.error("body matches=" + (matches?.length ?? 0))
  process.exit(1)
}
c = c.replace(pattern, replacement)

writeFileSync(p, c)
console.log("bodies replaced:", matches.length)

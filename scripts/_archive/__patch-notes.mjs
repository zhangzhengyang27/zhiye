import { readFileSync, writeFileSync } from "node:fs"

const p = "src/renderer/src/views/knowledge/KnowledgeNotesView.vue"
let c = readFileSync(p, "utf8")

// 1) imports：NoteContentBody + 上传服务 + 快照插入 helper
c = c.replace(
  `import Icon from "@/components/common/UiIcon.vue"`,
  `import Icon from "@/components/common/UiIcon.vue"
import NoteContentBody from "@/components/knowledge/NoteContentBody.vue"
import { uploadKnowledgeAsset } from "@/services/knowledge-oss"`,
)

// 2) script：光标插入 / 文件上传 / 待办勾选回写
const anchor = `const formatNoteTime = (input: string) => {`
const additions = `// ==================== 小记富内容（#17 markdown-lite） ====================
const draftTextareaRef = ref<HTMLTextAreaElement | null>(null)
const noteFileInputRef = ref<HTMLInputElement | null>(null)
/** 上传通道：image → ![描述](url)；attachment → [文件名](url) */
const noteUploadKind = ref<"image" | "attachment">("image")
const uploadingNoteAsset = ref(false)

/** 在光标处插入文本（无光标焦点时追加到末尾） */
const insertAtCursor = (snippet: string) => {
  const textarea = draftTextareaRef.value
  if (!textarea) {
    draftContent.value = \`\${draftContent.value}\${draftContent.value ? "\\n" : ""}\${snippet}\`
    return
  }
  const start = textarea.selectionStart ?? draftContent.value.length
  const end = textarea.selectionEnd ?? start
  const before = draftContent.value.slice(0, start)
  const after = draftContent.value.slice(end)
  const needsLeading = before.length > 0 && !before.endsWith("\\n") && snippet.startsWith("- [")
  draftContent.value = \`\${before}\${needsLeading ? "\\n" : ""}\${snippet}\${after}\`
  void nextTick(() => {
    const caret = start + (needsLeading ? 1 : 0) + snippet.length
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
  })
}

const insertTodo = () => insertAtCursor("- [ ] ")

const pickNoteFile = (kind: "image" | "attachment") => {
  noteUploadKind.value = kind
  noteFileInputRef.value?.click()
}

const handleNoteFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file || uploadingNoteAsset.value) {
    return
  }

  uploadingNoteAsset.value = true
  try {
    const url = await uploadKnowledgeAsset(file)
    insertAtCursor(
      noteUploadKind.value === "image" ? \`![\${file.name}](\${url})\` : \`[\${file.name}](\${url})\`
    )
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "上传失败，请稍后重试", "error")
  } finally {
    uploadingNoteAsset.value = false
  }
}

/** 卡片待办勾选：回写内容并持久化 */
const handleToggleTodo = async (note: Note, lineIndex: number) => {
  const nextContent = toggleTodoLine(note.content, lineIndex)
  if (nextContent === note.content) {
    return
  }
  try {
    const updated = await updateNote(note.id, { content: nextContent })
    notes.value = notes.value.map(item => (item.id === updated.id ? updated : item))
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "待办状态保存失败", "error")
  }
}

const formatNoteTime = (input: string) => {`

if (!c.includes(anchor)) {
  console.error("script anchor missing")
  process.exit(1)
}
c = c.replace(anchor, additions)

// 3) imports 补 toggleTodoLine / nextTick / ref 已有
c = c.replace(
  `import { createNote, deleteNote, listNotes, updateNote, type Note } from "@/services/notes"`,
  `import { nextTick, ref } from "vue"
import { createNote, deleteNote, listNotes, updateNote, type Note } from "@/services/notes"
import { toggleTodoLine } from "@/utils/notes-markdown"`,
)

// 4) 记事卡：textarea 加 ref + 工具栏（图片/待办/附件 + 隐藏 file input）
c = c.replace(
  `            <textarea
              v-model="draftContent"
              rows="10"`,
  `            <!-- 小记工具栏（#17，对齐语雀：图片/待办/附件；收藏=置顶在卡片行） -->
            <div class="mb-1 flex items-center gap-1">
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                title="插入图片"
                :disabled="uploadingNoteAsset"
                @click="pickNoteFile('image')"
              >
                <Icon icon="ph:image" :width="14" :height="14" />
              </button>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                title="插入待办"
                @click="insertTodo"
              >
                <Icon icon="ph:check-square" :width="14" :height="14" />
              </button>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                title="插入附件"
                :disabled="uploadingNoteAsset"
                @click="pickNoteFile('attachment')"
              >
                <Icon icon="ph:paperclip" :width="14" :height="14" />
              </button>
              <span v-if="uploadingNoteAsset" class="text-[11px] text-ink-quaternary">上传中…</span>
              <input
                ref="noteFileInputRef"
                type="file"
                class="hidden"
                :accept="noteUploadKind === 'image' ? 'image/*' : undefined"
                @change="handleNoteFileChange"
              />
            </div>

            <textarea
              ref="draftTextareaRef"
              v-model="draftContent"
              rows="10"`,
)

// 5) 卡片正文两处替换为 NoteContentBody（置顶卡与普通卡相同文案）
const oldBody = `                  <p class="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-ink-secondary">
                    {{ note.content }}
                  </p>`
const newBody = `                  <NoteContentBody
                    :content="note.content"
                    @toggle-todo="lineIndex => handleToggleTodo(note, lineIndex)"
                  />`
const count = c.split(oldBody).length - 1
if (count < 2) {
  console.error("note body occurrences=" + count)
  process.exit(1)
}
c = c.split(oldBody).join(newBody)

writeFileSync(p, c)
console.log("notes view wired")

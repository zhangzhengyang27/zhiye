<!-- 组件说明：KnowledgeNotesView 组件，负责「小记」页的展示与交互。 -->
<script setup lang="ts">
/**
 * 页面组件：对齐语雀桌面端「小记」页——左侧快速记事卡（内容 + 添加标签 +
 * 小记一下/⌘Enter 发布），右侧标签筛选与「置顶/小记」分组卡片流。
 * 点卡片进入编辑（内容/标签回填），支持置顶与删除。
 * 卡片正文走 NoteContentBody 富渲染（待办可勾选回写/图片/附件，#17）；
 * 记事卡工具栏提供 图片/待办/附件 三钮（语雀小记工具栏子集，附件/图片经 OSS 上传后
 * 在光标处插入 markdown-lite 语法）。
 */
import { computed, nextTick, onMounted, ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import NoteContentBody from "@/components/knowledge/NoteContentBody.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { createNote, deleteNote, listNotes, updateNote, type Note } from "@/services/notes"
import { uploadKnowledgeAsset } from "@/services/knowledge-oss"
import { isImeComposing } from "@/utils/keyboard"
import { formatDateTime } from "@/utils/date-format"
import { toggleTodoLine } from "@/utils/notes-markdown"

const { showToastMessage } = useTransientToast()

const notes = ref<Note[]>([])
const loading = ref(false)
const submitting = ref(false)
const searchKeyword = ref("")
const activeTag = ref<string | null>(null)

/** 左侧记事卡状态：editingId 为空 = 新建；非空 = 编辑该条 */
const editingId = ref<string | null>(null)
const draftContent = ref("")
const draftTags = ref<string[]>([])
const tagInputVisible = ref(false)
const tagInputValue = ref("")

/** 记事卡 textarea 引用：工具栏插入语法需定位光标 */
const draftTextareaRef = ref<HTMLTextAreaElement | null>(null)

/** 卡片待办勾选回写（#17）：翻转对应行后整条 updateNote 持久化 */
const handleToggleTodo = async (note: Note, lineIndex: number) => {
  const nextContent = toggleTodoLine(note.content, lineIndex)

  if (nextContent === note.content) {
    return
  }

  // 乐观更新：先改本地再回写，失败回滚到原内容
  const previousContent = note.content
  notes.value = notes.value.map((item) =>
    item.id === note.id ? { ...item, content: nextContent } : item,
  )

  try {
    await updateNote(note.id, { content: nextContent })
  } catch (error) {
    notes.value = notes.value.map((item) =>
      item.id === note.id ? { ...item, content: previousContent } : item,
    )
    showToastMessage(error instanceof Error ? error.message : "待办状态保存失败。", "error")
  }
}

/** 在光标处插入文本并归还焦点（选区整体替换，未聚焦时追加到末尾） */
const insertAtCursor = (snippet: string) => {
  const textarea = draftTextareaRef.value
  const current = draftContent.value

  if (!textarea) {
    draftContent.value = `${current}${current && !current.endsWith("\n") ? "\n" : ""}${snippet}`
    return
  }

  const start = textarea.selectionStart ?? current.length
  const end = textarea.selectionEnd ?? current.length
  // 待办片段行内直接续写；图片/附件语法独占一行（markdown-lite 按行解析）
  const lineStart = start === 0 || current[start - 1] === "\n"
  const prefix = snippet.startsWith("- [ ] ") ? "" : lineStart ? "" : "\n"
  const next = `${current.slice(0, start)}${prefix}${snippet}${current.slice(end)}`
  draftContent.value = next

  void nextTick(() => {
    const caret = start + prefix.length + snippet.length
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
  })
}

/** 记事卡工具栏：待办插入未勾语法；图片/附件先上传 OSS 再在光标处插语法 */
const handleInsertTodo = () => {
  insertAtCursor("- [ ] ")
}

const uploadAndInsert = async (file: File, kind: "image" | "attachment") => {
  const uploadingToast = kind === "image" ? "正在上传图片…" : `正在上传附件「${file.name}」…`
  showToastMessage(uploadingToast, "info")

  try {
    const url = await uploadKnowledgeAsset(file)
    if (typeof url !== "string" || !url) {
      throw new Error("上传结果为空")
    }
    insertAtCursor(kind === "image" ? `![](${url})` : `[${file.name}](${url})`)
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "上传失败，请稍后重试。", "error")
  }
}

const noteFileInputRef = ref<HTMLInputElement | null>(null)
const noteUploadKind = ref<"image" | "attachment">("image")

const pickNoteFile = (kind: "image" | "attachment") => {
  noteUploadKind.value = kind
  noteFileInputRef.value?.click()
}

const handleNoteFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""

  if (!file) {
    return
  }

  await uploadAndInsert(file, noteUploadKind.value)
}

/** 标签 chips：全部 / 各标签（带计数）/ 无标签 */
const tagChips = computed(() => {
  const counts = new Map<string, number>()
  let untagged = 0

  for (const note of notes.value) {
    if (note.tags.length === 0) {
      untagged += 1
      continue
    }
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return { counts: [...counts.entries()], untagged }
})

/** 置顶/未置顶两组（当前标签与搜索过滤后） */
const pinnedNotes = computed(() => filteredNotes.value.filter((note) => note.pinned))
const normalNotes = computed(() => filteredNotes.value.filter((note) => !note.pinned))
/** 有筛选条件时不能把「筛选无结果」说成「还没有小记」 */
const filterActive = computed(() => Boolean(searchKeyword.value.trim()) || Boolean(activeTag.value))

const filteredNotes = computed(() => {
  let result = notes.value

  if (activeTag.value === "__untagged__") {
    result = result.filter((note) => note.tags.length === 0)
  } else if (activeTag.value) {
    result = result.filter((note) => note.tags.includes(activeTag.value!))
  }

  const keyword = searchKeyword.value.trim()
  if (keyword) {
    result = result.filter((note) => note.content.includes(keyword))
  }

  return result
})

const canSubmit = computed(() => draftContent.value.trim().length > 0 && !submitting.value)

const loadNotes = async () => {
  loading.value = true
  try {
    // listNotes 已分页化（NoteListResult）：本页无加载更多 UI，按上限一页取全量
    // （后端 clamp 到 [1, 200]，默认每页 50）
    notes.value = (await listNotes({ pageSize: 200 })).items
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "小记加载失败，请稍后重试。", "error")
  } finally {
    loading.value = false
  }
}

const resetDraft = () => {
  editingId.value = null
  draftContent.value = ""
  draftTags.value = []
  tagInputVisible.value = false
  tagInputValue.value = ""
}

const addTag = () => {
  const tag = tagInputValue.value.trim()
  if (!tag) {
    tagInputVisible.value = false
    return
  }

  if (!draftTags.value.includes(tag) && draftTags.value.length < 10) {
    draftTags.value = [...draftTags.value, tag]
  }
  tagInputValue.value = ""
  tagInputVisible.value = false
}

const removeTag = (tag: string) => {
  draftTags.value = draftTags.value.filter((item) => item !== tag)
}

const submitDraft = async () => {
  const content = draftContent.value.trim()
  if (!content || submitting.value) {
    return
  }

  submitting.value = true
  try {
    if (editingId.value) {
      const updated = await updateNote(editingId.value, { content, tags: draftTags.value })
      notes.value = notes.value.map((note) => (note.id === updated.id ? updated : note))
      showToastMessage("小记已更新。", "success")
    } else {
      const created = await createNote({ content, tags: draftTags.value })
      notes.value = [created, ...notes.value]
      showToastMessage("小记一下成功。", "success")
    }
    resetDraft()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "小记保存失败，请稍后重试。", "error")
  } finally {
    submitting.value = false
  }
}

const handleDraftKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || isImeComposing(event)) {
    return
  }

  event.preventDefault()
  void submitDraft()
}

const startEdit = (note: Note) => {
  editingId.value = note.id
  draftContent.value = note.content
  draftTags.value = [...note.tags]
}

const togglePinned = async (note: Note) => {
  try {
    const updated = await updateNote(note.id, { pinned: !note.pinned })
    notes.value = notes.value.map((item) => (item.id === updated.id ? updated : item))
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。", "error")
  }
}

const noteToDelete = ref<Note | null>(null)
const deletingNote = ref(false)

/** 小记是硬删（无回收站），删除前必须二次确认，与文档侧的删除语义保持一致 */
const confirmRemoveNote = async () => {
  const note = noteToDelete.value

  if (!note || deletingNote.value) {
    return
  }

  deletingNote.value = true
  try {
    await deleteNote(note.id)
    notes.value = notes.value.filter((item) => item.id !== note.id)
    if (editingId.value === note.id) {
      resetDraft()
    }
    showToastMessage("小记已删除。", "success")
    noteToDelete.value = null
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "删除失败，请稍后重试。", "error")
  } finally {
    deletingNote.value = false
  }
}

const formatNoteTime = (input: string) => {
  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? "-" : formatDateTime(date)
}

onMounted(() => {
  void loadNotes()
})
</script>

<template>
  <KnowledgePageShell active-menu="notes">
    <div class="kb-page-scroll kb-fade-in">
      <div class="flex h-full min-h-0 gap-6">
        <!-- 左：快速记事卡（对齐语雀小记左侧卡） -->
        <div class="flex w-[400px] shrink-0 flex-col">
          <div
            class="flex min-h-[420px] flex-1 flex-col rounded-kb-2xl border border-line bg-surface p-4 transition-colors focus-within:border-brand-lighter"
          >
            <!-- 工具栏（语雀小记子集）：图片 / 待办 / 附件，插入点为光标处 -->
            <div class="mb-2 flex items-center gap-1">
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
                title="插入图片"
                @click="pickNoteFile('image')"
              >
                <Icon icon="ph:image" :width="15" :height="15" />
              </button>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
                title="插入待办"
                @click="handleInsertTodo"
              >
                <Icon icon="ph:check-square" :width="15" :height="15" />
              </button>
              <button
                type="button"
                class="inline-flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
                title="插入附件"
                @click="pickNoteFile('attachment')"
              >
                <Icon icon="ph:paperclip" :width="15" :height="15" />
              </button>
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
              rows="10"
              class="w-full flex-1 resize-none bg-transparent text-[14px] leading-6 text-ink outline-none placeholder:text-ink-quaternary"
              placeholder="记你想记…"
              @keydown="handleDraftKeydown"
            />

            <!-- 标签：已加标签 chips + 添加标签入口 -->
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span
                v-for="tag in draftTags"
                :key="tag"
                class="inline-flex items-center gap-1 rounded-kb-sm border border-line px-2 py-0.5 text-[12px] text-ink-tertiary"
              >
                {{ tag }}
                <button
                  type="button"
                  class="text-ink-quaternary transition hover:text-ink"
                  @click="removeTag(tag)"
                >
                  <Icon icon="ph:x" :width="11" :height="11" />
                </button>
              </span>
              <el-input
                v-if="tagInputVisible"
                v-model="tagInputValue"
                type="text"
                size="small"
                maxlength="20"
                class="w-24 px-2"
                placeholder="标签名"
                @keydown.enter.prevent="addTag"
                @blur="addTag"
              />
              <button
                v-else
                type="button"
                class="inline-flex h-6 items-center gap-1 rounded-kb-sm border border-dashed border-line px-2 text-[12px] text-ink-tertiary transition hover:border-brand-lighter hover:text-brand"
                @click="tagInputVisible = true"
              >
                <Icon icon="ph:plus" :width="11" :height="11" />
                添加标签
              </button>
            </div>

            <div class="mt-4 flex items-center justify-between gap-3">
              <button
                v-if="editingId"
                type="button"
                class="text-[12px] text-ink-tertiary transition hover:text-ink"
                @click="resetDraft"
              >
                取消编辑
              </button>
              <span v-else />
              <div class="flex items-center gap-3">
                <span class="text-[11px] text-ink-quaternary">按 ⌘ Enter 发布</span>
                <button
                  type="button"
                  class="inline-flex h-8 items-center rounded-kb-md border border-line bg-surface px-4 text-[13px] font-medium text-ink-tertiary transition hover:border-brand-lighter hover:text-brand disabled:cursor-not-allowed disabled:opacity-55"
                  :disabled="!canSubmit"
                  @click="submitDraft"
                >
                  {{ submitting ? "发布中…" : editingId ? "保存" : "小记一下" }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 右：小记流（标签筛选 + 置顶/小记分组卡片） -->
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="inline-flex h-7 items-center rounded-full px-3 text-[12px] transition"
                :class="
                  activeTag === null
                    ? 'bg-grey-300 text-ink'
                    : 'text-ink-tertiary hover:bg-grey-200'
                "
                @click="activeTag = null"
              >
                全部
              </button>
              <button
                v-for="[tag, count] in tagChips.counts"
                :key="tag"
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] transition"
                :class="
                  activeTag === tag ? 'bg-grey-300 text-ink' : 'text-ink-tertiary hover:bg-grey-200'
                "
                @click="activeTag = activeTag === tag ? null : tag"
              >
                {{ tag }} ({{ count }})
              </button>
              <button
                v-if="tagChips.untagged > 0"
                type="button"
                class="inline-flex h-7 items-center rounded-full px-3 text-[12px] transition"
                :class="
                  activeTag === '__untagged__'
                    ? 'bg-grey-300 text-ink'
                    : 'text-ink-tertiary hover:bg-grey-200'
                "
                @click="activeTag = activeTag === '__untagged__' ? null : '__untagged__'"
              >
                无标签 ({{ tagChips.untagged }})
              </button>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <div
                class="flex h-8 w-44 items-center gap-1.5 rounded-kb-md bg-grey-200 px-2.5 focus-within:bg-surface focus-within:ring-1 focus-within:ring-brand-lighter"
              >
                <Icon
                  icon="ph:magnifying-glass"
                  :width="13"
                  :height="13"
                  class="shrink-0 text-ink-quaternary"
                />
                <input
                  v-model="searchKeyword"
                  type="text"
                  class="w-full border-none bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-quaternary"
                  placeholder="搜索小记"
                />
              </div>
            </div>
          </div>

          <div class="mt-4 min-h-0 flex-1 space-y-6 overflow-y-auto pb-6 pr-1">
            <template v-if="pinnedNotes.length > 0">
              <p class="flex items-center gap-1 text-[12px] text-ink-quaternary">
                <Icon icon="ph:push-pin" :width="12" :height="12" />
                置顶
              </p>
              <div class="-mt-4 space-y-3">
                <article
                  v-for="note in pinnedNotes"
                  :key="note.id"
                  class="group relative rounded-kb-xl border border-line bg-surface p-4 transition-colors hover:border-line-input"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[12px] text-ink-quaternary"
                      >更新于 {{ formatNoteTime(note.updatedAt) }}</span
                    >
                    <div
                      class="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                    >
                      <button
                        type="button"
                        class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                        title="取消置顶"
                        @click="togglePinned(note)"
                      >
                        <Icon icon="ph:push-pin-slash" :width="13" :height="13" />
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                        title="编辑"
                        @click="startEdit(note)"
                      >
                        <Icon icon="ph:pencil-simple" :width="13" :height="13" />
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                        title="删除"
                        @click="noteToDelete = note"
                      >
                        <Icon icon="ph:trash" :width="13" :height="13" />
                      </button>
                    </div>
                  </div>
                  <NoteContentBody
                    :content="note.content"
                    @toggle-todo="(lineIndex) => handleToggleTodo(note, lineIndex)"
                  />
                  <div v-if="note.tags.length > 0" class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-for="tag in note.tags"
                      :key="tag"
                      class="rounded-kb-sm border border-line px-2 py-0.5 text-[11px] text-ink-tertiary"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </article>
              </div>
            </template>

            <p class="text-[12px] text-ink-quaternary">小记</p>
            <div v-if="normalNotes.length > 0" class="-mt-4 space-y-3">
              <article
                v-for="note in normalNotes"
                :key="note.id"
                class="group relative rounded-kb-xl border border-line bg-surface p-4 transition-colors hover:border-line-input"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-[12px] text-ink-quaternary"
                    >更新于 {{ formatNoteTime(note.updatedAt) }}</span
                  >
                  <div
                    class="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                  >
                    <button
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                      title="置顶"
                      @click="togglePinned(note)"
                    >
                      <Icon icon="ph:push-pin" :width="13" :height="13" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                      title="编辑"
                      @click="startEdit(note)"
                    >
                      <Icon icon="ph:pencil-simple" :width="13" :height="13" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                      title="删除"
                      @click="noteToDelete = note"
                    >
                      <Icon icon="ph:trash" :width="13" :height="13" />
                    </button>
                  </div>
                </div>
                <NoteContentBody
                  :content="note.content"
                  @toggle-todo="(lineIndex) => handleToggleTodo(note, lineIndex)"
                />
                <div v-if="note.tags.length > 0" class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in note.tags"
                    :key="tag"
                    class="rounded-kb-sm border border-line px-2 py-0.5 text-[11px] text-ink-tertiary"
                  >
                    {{ tag }}
                  </span>
                </div>
              </article>
            </div>
            <p v-else-if="!loading" class="-mt-4 text-[13px] text-ink-quaternary">
              {{ filterActive ? "没有符合条件的小记。" : "还没有小记，左边记一条吧。" }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(noteToDelete)"
      danger
      :message="
        noteToDelete
          ? `确认删除这条小记吗？删除后无法找回。${noteToDelete.content.slice(0, 40)}`
          : ''
      "
      confirm-text="删除小记"
      :loading="deletingNote ? true : null"
      @update:open="
        (value) => {
          if (!value) noteToDelete = null
        }
      "
      @confirm="confirmRemoveNote"
    />
  </KnowledgePageShell>
</template>

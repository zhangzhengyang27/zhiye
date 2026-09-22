<script setup lang="ts">
/**
 * 表格文档编辑器（B7 #24b，自由网格 v1）。
 *
 * 语雀的表格文档（.lakesheet）为独立编辑器；v1 以文本网格承载（列标 A–H 可加列、
 * 行号 + 加行，纯文本单元格；合并/公式等登记偏差）。数据契约复用数据表的
 * kb-datatable scheme（fields 即列定义、全 text 类型），存储与 CRUD 完全同构。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from "vue-router"
import AppIcon from "@/components/common/AppIcon.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import {
  getKnowledgeDocument,
  updateKnowledgeDocument,
  type KnowledgeDocumentContent,
} from "@/services/knowledge-documents"
import { KNOWLEDGE_DATATABLE_CONTENT_SCHEME } from "@/types/knowledge-document"

const route = useRoute()
const docId = computed(() => String(route.params.docId ?? ""))

const INITIAL_COLS = 8
const INITIAL_ROWS = 20
const COLUMN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

const loading = ref(true)
const loadError = ref("")
const title = ref("未命名表格")
const canEdit = ref(false)
const saving = ref(false)
const saveError = ref("")
const savedAtLabel = ref("")

const cols = ref(INITIAL_COLS)
const rows = ref(INITIAL_ROWS)
/** 网格值矩阵：行 × 列 的文本值 */
const cells = ref<string[][]>([])

const colLabel = (index: number) => COLUMN_LETTERS[index] ?? `列${index + 1}`

const normalizeCells = (value: unknown) => {
  const grid: string[][] = []
  if (value && typeof value === "object" && Array.isArray((value as { rows?: unknown }).rows)) {
    const docRows = (value as { rows: Array<{ cells?: Record<string, string> }> }).rows
    docRows.forEach((row, rowIndex) => {
      grid[rowIndex] = []
      for (let col = 0; col < cols.value; col++) {
        const columnLetter = COLUMN_LETTERS[col] ?? String(col)
        grid[rowIndex]?.push(String(row.cells?.[columnLetter] ?? ""))
      }
    })
  }
  while (grid.length < rows.value) {
    grid.push(Array.from({ length: cols.value }, () => ""))
  }
  return grid
}

/** 单元格输入：行对象直传写值（规避索引可能未定义的分支），cells 深度 watch 随之计脏 */
const onCellInput = (row: string[], colIndex: number, event: Event) => {
  row[colIndex] = (event.target as HTMLInputElement).value
}

/**
 * 脏版本号方案：网格/标题任一修改 +1（sync 深度 watcher 计数），与保存基线
 * savedVersion 的差值即脏态——原实现每次脏检查都要跑一遍 serialize + JSON.stringify。
 */
const editVersion = ref(0)
const savedVersion = ref(0)

const isDirty = computed(() => editVersion.value !== savedVersion.value)

let saveTimer: number | null = null
const clearSaveTimer = () => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
}

const scheduleSave = () => {
  clearSaveTimer()
  if (!canEdit.value || loading.value || !isDirty.value) return
  saveTimer = window.setTimeout(() => void saveNow(), 1200)
}

const saveNow = async () => {
  clearSaveTimer()
  if (!canEdit.value || saving.value || !isDirty.value) return

  // 发起保存时的文档 id：await 期间切走后，旧表格的响应不能回写新文档状态
  const savedDocId = docId.value

  saving.value = true
  saveError.value = ""
  try {
    const content: KnowledgeDocumentContent = {
      scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
      value: JSON.parse(JSON.stringify(serialize())),
    }
    const updated = await updateKnowledgeDocument(savedDocId, {
      title: title.value,
      content: content as never,
    })
    if (docId.value !== savedDocId) {
      return
    }
    if (typeof updated.updatedAt === "string") {
      savedAtLabel.value = `已保存 ${formatClock(updated.updatedAt)}`
    }
    savedVersion.value = editVersion.value
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "保存失败"
  } finally {
    saving.value = false
  }
}

const formatClock = (input: string) => {
  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? "" : date.toTimeString().slice(0, 8)
}

// 行列操作状态（声明在前，供下方 docId watch 重置）
const pendingColIndex = ref<number | null>(null)
const pendingRowIndex = ref<number | null>(null)

/** 网格 → 数据表契约（fields 即列定义、全 text 类型），保存与恢复共用同一序列化口径 */
const serialize = () => ({
  fields: Array.from({ length: cols.value }, (_, index) => ({
    id: COLUMN_LETTERS[index] ?? String(index),
    name: colLabel(index),
    type: "text" as const,
  })),
  rows: cells.value.map(rowValues => ({
    id: `row-${cells.value.indexOf(rowValues)}`,
    cells: Object.fromEntries(rowValues.map((value, col) => [COLUMN_LETTERS[col] ?? String(col), value])),
  })),
})

// ==================== 加载与保存 ====================
let loadSeq = 0

const loadDocument = async () => {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ""
  try {
    const document = await getKnowledgeDocument(docId.value)
    if (seq !== loadSeq) return
    title.value = document.title || "未命名表格"
    canEdit.value = Boolean(document.myDocPermissions?.canEdit)
    const content = document.content as KnowledgeDocumentContent | null
    const raw =
      content?.scheme === KNOWLEDGE_DATATABLE_CONTENT_SCHEME
        ? (content.value as { fields?: unknown[]; rows?: unknown[] })
        : null
    if (raw && Array.isArray(raw.fields) && raw.fields.length > 0) {
      // 恢复上次保存的列数（A–N…）
      cols.value = Math.max(INITIAL_COLS, raw.fields.length)
    }
    rows.value = Math.max(INITIAL_ROWS, raw && Array.isArray(raw.rows) ? raw.rows.length : 0)
    cells.value = normalizeCells(raw ? { rows: raw.rows } : null)
    // 网格赋值已同步计入 editVersion，此处对齐保存基线即干净态
    savedVersion.value = editVersion.value
  } catch (error) {
    if (seq === loadSeq) {
      loadError.value = error instanceof Error ? error.message : "表格加载失败"
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

const flushBeforeLeave = async () => {
  if (isDirty.value && canEdit.value) {
    await saveNow()
  }
}

watch(
  [cells, title],
  () => {
    editVersion.value += 1
    scheduleSave()
  },
  { deep: true, flush: "sync" }
)

watch(
  () => docId.value,
  () => {
    // 切换文档先取消挂起的自动保存：防抖定时器晚于切换触发时，会用新 docId
    // 提交旧网格内容（跨文档数据污染）；正常切换由 onBeforeRouteUpdate 落盘
    clearSaveTimer()
    // 使在途的旧文档加载请求失效，避免其晚归覆盖新文档状态
    loadSeq++
    loading.value = true
    loadError.value = ""
    // 头部状态重置：不留旧文档的标题/保存态/待确认删除
    title.value = ""
    savedAtLabel.value = ""
    saveError.value = ""
    pendingColIndex.value = null
    pendingRowIndex.value = null
    savedVersion.value = editVersion.value
    void loadDocument()
  },
  { immediate: true }
)

// 目录树点另一篇文档时路由组件被复用（仅 params.docId 变化），onBeforeRouteLeave
// 不会触发；不在此落盘的话，1200ms 防抖窗口内的最后修改会以新 docId 提交
onBeforeRouteUpdate(async () => {
  await flushBeforeLeave()
  return true
})

onBeforeRouteLeave(async () => {
  await flushBeforeLeave()
  return true
})

onBeforeUnmount(() => {
  clearSaveTimer()
  if (isDirty.value && canEdit.value) {
    void saveNow()
  }
})

// ==================== 行列操作 ====================
const addColumn = () => {
  if (!canEdit.value || cols.value >= COLUMN_LETTERS.length) return
  cols.value += 1
  for (const row of cells.value) {
    row.push("")
  }
}

const addRow = () => {
  if (!canEdit.value) return
  rows.value += 1
  cells.value.push(Array.from({ length: cols.value }, () => ""))
}

const confirmRemoveCol = () => {
  if (pendingColIndex.value === null || cols.value <= 1) return
  cols.value -= 1
  for (const row of cells.value) {
    row.splice(pendingColIndex.value, 1)
  }
  pendingColIndex.value = null
}

const confirmRemoveRow = () => {
  if (pendingRowIndex.value === null || rows.value <= 1) return
  rows.value -= 1
  cells.value.splice(pendingRowIndex.value, 1)
  pendingRowIndex.value = null
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface">
    <!-- 头部：标题 + 保存状态（切换文档时由 docId watch 整体重置） -->
    <header class="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
      <input
        v-model="title"
        type="text"
        class="h-7 w-64 max-w-full rounded-kb-sm border border-transparent bg-transparent px-2 text-[14px] font-medium text-ink outline-none transition hover:border-line focus:border-info disabled:text-ink-tertiary"
        :disabled="!canEdit || loading"
        aria-label="表格标题"
        placeholder="未命名表格"
      />
      <span v-if="saving" class="inline-flex items-center gap-1 text-[12px] text-ink-tertiary">
        <UiIcon icon="ph:circle-notch" :width="12" :height="12" class="animate-spin" />
        保存中…
      </span>
      <span v-else-if="saveError" class="text-[12px] text-error">{{ saveError }}</span>
      <span v-else-if="isDirty" class="text-[12px] text-ink-quaternary">有未保存的修改</span>
      <span v-else-if="savedAtLabel" class="text-[12px] text-ink-quaternary">{{ savedAtLabel }}</span>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="flex flex-1 items-center justify-center gap-2 text-kb-sm text-ink-tertiary">
      <UiIcon icon="ph:circle-notch" :width="16" :height="16" class="animate-spin" />
      正在加载表格…
    </div>

    <!-- 加载失败：整页错误 + 重试 -->
    <div v-else-if="loadError" class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <UiIcon icon="ph:warning-circle" :width="28" :height="28" class="text-ink-quaternary" />
      <p class="text-kb-sm text-ink-secondary">{{ loadError }}</p>
      <button
        type="button"
        class="h-8 rounded-kb-md border border-line bg-surface px-3 text-[13px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
        @click="loadDocument"
      >
        重试
      </button>
    </div>

    <!-- 网格：列标 A–H（可删列/加列）+ 行号（可删行）+ 纯文本单元格 -->
    <div v-else class="min-h-0 flex-1 overflow-auto">
      <table class="w-full min-w-max border-separate border-spacing-0 text-[13px]">
        <thead>
          <tr>
            <th class="sticky top-0 z-10 w-12 border-b border-r border-line bg-grey-200"></th>
            <th
              v-for="colIndex in cols"
              :key="colIndex"
              class="sticky top-0 z-10 h-8 min-w-[120px] border-b border-r border-line bg-grey-200 px-2 text-[11px] font-normal text-ink-quaternary"
            >
              <span class="inline-flex items-center gap-1">
                {{ colLabel(colIndex - 1) }}
                <button
                  v-if="canEdit"
                  type="button"
                  class="rounded-kb-xs p-0.5 transition hover:bg-fill-muted hover:text-error"
                  title="删除该列"
                  @click="pendingColIndex = colIndex - 1"
                >
                  <AppIcon name="i-lucide-x" class="h-3 w-3" />
                </button>
              </span>
            </th>
            <th v-if="canEdit" class="sticky top-0 z-10 border-b border-line bg-grey-200 px-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 text-[12px] text-ink-tertiary transition hover:text-brand"
                title="加列"
                @click="addColumn"
              >
                <UiIcon icon="ph:plus" :width="12" :height="12" />
                加列
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in cells" :key="rowIndex">
            <th
              class="h-8 w-12 border-b border-r border-line bg-grey-200 px-1 text-[11px] font-normal text-ink-quaternary"
            >
              <span class="inline-flex items-center gap-1">
                {{ rowIndex + 1 }}
                <button
                  v-if="canEdit"
                  type="button"
                  class="rounded-kb-xs p-0.5 transition hover:bg-fill-muted hover:text-error"
                  title="删除该行"
                  @click="pendingRowIndex = rowIndex"
                >
                  <AppIcon name="i-lucide-x" class="h-3 w-3" />
                </button>
              </span>
            </th>
            <td v-for="(cell, colIndex) in row" :key="colIndex" class="border-b border-r border-line p-0">
              <input
                :value="cell"
                :disabled="!canEdit"
                class="h-8 w-full min-w-[120px] bg-transparent px-2 text-[13px] text-ink outline-none transition focus:bg-surface focus:ring-1 focus:ring-inset focus:ring-brand disabled:text-ink-tertiary"
                aria-label="单元格"
                @input="onCellInput(row, colIndex, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <button
        v-if="canEdit"
        type="button"
        class="m-2 inline-flex items-center gap-1 rounded-kb-md border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-tertiary transition hover:border-brand-lighter hover:text-brand"
        @click="addRow"
      >
        <UiIcon icon="ph:plus" :width="12" :height="12" />
        加行
      </button>
    </div>

    <!-- 删除列/行确认：pending 索引非空即弹出，确认后走 confirmRemoveCol / confirmRemoveRow -->
    <ConfirmDialog
      :open="pendingColIndex !== null"
      title="删除该列"
      message="确认删除该列吗？列内所有单元格数据将一并清除。"
      danger
      confirm-text="删除"
      @confirm="confirmRemoveCol"
      @update:open="value => !value && (pendingColIndex = null)"
    />
    <ConfirmDialog
      :open="pendingRowIndex !== null"
      title="删除该行"
      message="确认删除该行吗？行内所有单元格数据将一并清除。"
      danger
      confirm-text="删除"
      @confirm="confirmRemoveRow"
      @update:open="value => !value && (pendingRowIndex = null)"
    />
  </div>
</template>

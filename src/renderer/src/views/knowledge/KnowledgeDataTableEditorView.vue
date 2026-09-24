<script setup lang="ts">
/**
 * 数据表编辑器（B7 #24a，多维表格 v1）。
 *
 * 语雀形态（09-04 实测 5.1）：顶部保留文档头（标题/分享/收藏），下方表格视图
 * （字段列 + 行 + 尾部加行加列 + 「N 条记录」）。v1 范围：单「表格视图」、
 * 三种字段类型（文本/单选/日期）、行内编辑、加删列与加删行；视图系统/筛选/
 * 分组/表单生成等登记为后续迭代（登记偏差）。
 *
 * 数据契约：content = { scheme: application/vnd.kb-datatable+json, value: DataTableDocument }，
 * 复用 documents CRUD 与自动保存节奏（1200ms 防抖，与富文本编辑页一致）。
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
import {
  KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
  type KnowledgeDataTableDocument,
  type KnowledgeDataTableField,
} from "@/types/knowledge-document"

const route = useRoute()

/** 客户端行/字段 id：Crypto UUID，后端对 content JSON 不校验 id 形态 */
const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 12)
  }
  return Math.random().toString(36).slice(2, 14)
}

const docId = computed(() => String(route.params.docId ?? ""))

const loading = ref(true)
const loadError = ref("")
const title = ref("未命名数据表")
const canEdit = ref(false)
const saving = ref(false)
const saveError = ref("")
const savedAtLabel = ref("")

const EMPTY_DOC: KnowledgeDataTableDocument = { fields: defaultFields(), rows: [] }
const table = ref<KnowledgeDataTableDocument>(EMPTY_DOC)

function defaultFields(): KnowledgeDataTableField[] {
  // 对齐语雀新建数据表的默认三列：文本、单选、日期
  return [
    { id: generateId(), name: "文本", type: "text" },
    { id: generateId(), name: "单选", type: "select", options: ["选项一", "选项二"] },
    { id: generateId(), name: "日期", type: "date" },
  ]
}

const normalizeTable = (value: unknown): KnowledgeDataTableDocument => {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_DOC, fields: defaultFields() }
  }
  const raw = value as Partial<KnowledgeDataTableDocument>
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter(
        (field) => field && typeof field.id === "string" && typeof field.name === "string",
      )
    : []
  const rows = Array.isArray(raw.rows)
    ? raw.rows.filter(
        (row) => row && typeof row.id === "string" && row.cells && typeof row.cells === "object",
      )
    : []
  return { fields, rows }
}

// ==================== 加载与保存 ====================
let loadSeq = 0

const loadDocument = async () => {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ""
  try {
    const document = await getKnowledgeDocument(docId.value)
    if (seq !== loadSeq) return
    title.value = document.title || "未命名数据表"
    canEdit.value = Boolean(document.myDocPermissions?.canEdit)
    const content = document.content as KnowledgeDocumentContent | null
    table.value =
      content?.scheme === KNOWLEDGE_DATATABLE_CONTENT_SCHEME
        ? normalizeTable(content.value)
        : { ...EMPTY_DOC, fields: defaultFields() }
    // 标题/表格的赋值已同步计入 editVersion，此处对齐保存基线即干净态
    savedVersion.value = editVersion.value
  } catch (error) {
    if (seq === loadSeq) {
      loadError.value = error instanceof Error ? error.message : "数据表加载失败"
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

/**
 * 脏版本号方案：正文/标题任一修改 +1（sync 深度 watcher 计数），与保存基线
 * savedVersion 的差值即脏态——避免每击键做一次全量 JSON.stringify 比对。
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
  // 发起保存时的脏版本号：基线必须对齐「实际发出的内容」——请求体在此刻序列化，
  // 若对齐 await 后的当前版本，在途期间的编辑会既不在请求里又不再被视为脏（静默丢失）
  const versionAtRequest = editVersion.value

  saving.value = true
  saveError.value = ""
  try {
    const content: KnowledgeDocumentContent = {
      scheme: KNOWLEDGE_DATATABLE_CONTENT_SCHEME,
      value: JSON.parse(JSON.stringify(table.value)),
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
    savedVersion.value = versionAtRequest
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

// 字段/行操作状态（声明在前，供下方 docId watch 重置）
const fieldEditingStyleId = ref<string | null>(null)
const pendingFieldDeleteId = ref<string | null>(null)
const pendingRowIndex = ref<number | null>(null)

watch(
  [table, title],
  () => {
    editVersion.value += 1
    scheduleSave()
  },
  { deep: true, flush: "sync" },
)

const flushBeforeLeave = async () => {
  if (isDirty.value && canEdit.value) {
    await saveNow()
  }
}

watch(
  () => docId.value,
  () => {
    // 切换文档先取消挂起的自动保存：防抖定时器晚于切换触发时，会用新 docId
    // 提交旧表格内容（跨文档数据污染）；正常切换由 onBeforeRouteUpdate 落盘
    clearSaveTimer()
    // 使在途的旧文档加载请求失效，避免其晚归覆盖新文档状态
    loadSeq++
    loading.value = true
    loadError.value = ""
    // 头部状态重置：不留旧文档的标题/保存态/待确认删除
    title.value = ""
    savedAtLabel.value = ""
    saveError.value = ""
    pendingFieldDeleteId.value = null
    pendingRowIndex.value = null
    savedVersion.value = editVersion.value
    void loadDocument()
  },
  { immediate: true },
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
  void flushBeforeLeave()
})

// ==================== 字段与行操作 ====================

const addField = () => {
  if (!canEdit.value) return
  table.value.fields.push({
    id: generateId(),
    name: `字段 ${table.value.fields.length + 1}`,
    type: "text",
  })
  fieldEditingStyleId.value = table.value.fields[table.value.fields.length - 1]?.id ?? null
}

// 字段名编辑进入时备份原名：v-model 会先把空串写进 field.name，blur 时原值已不可得
const fieldNameBackup = ref("")

const beginFieldNameEdit = (field: KnowledgeDataTableField) => {
  fieldNameBackup.value = field.name
  fieldEditingStyleId.value = field.id
}

const FIELD_TYPE_FALLBACK_LABEL: Record<KnowledgeDataTableField["type"], string> = {
  text: "文本",
  select: "单选",
  date: "日期",
}

const updateFieldName = (field: KnowledgeDataTableField, name: string) => {
  // 空名回退：先还原进入编辑前的名字，本就为空则退回类型默认名，避免无名列落库
  field.name = name.trim() || fieldNameBackup.value || FIELD_TYPE_FALLBACK_LABEL[field.type]
}

const changeFieldType = (field: KnowledgeDataTableField, type: KnowledgeDataTableField["type"]) => {
  field.type = type
  if (type === "select" && (!field.options || field.options.length === 0)) {
    field.options = ["选项一", "选项二"]
  }
  if (type !== "select") {
    delete field.options
  }
}

const requestRemoveField = (fieldId: string) => {
  pendingFieldDeleteId.value = fieldId
}

const confirmRemoveField = () => {
  const fieldId = pendingFieldDeleteId.value
  if (fieldId === null) return
  table.value.fields = table.value.fields.filter((field) => field.id !== fieldId)
  for (const row of table.value.rows) {
    delete row.cells[fieldId]
  }
  pendingFieldDeleteId.value = null
}

const addRow = () => {
  if (!canEdit.value) return
  table.value.rows.push({ id: generateId(), cells: {} })
}

const requestRemoveRow = (index: number) => {
  pendingRowIndex.value = index
}

const confirmRemoveRow = () => {
  if (pendingRowIndex.value === null) return
  table.value.rows.splice(pendingRowIndex.value, 1)
  pendingRowIndex.value = null
}

const cellValue = (row: KnowledgeDataTableDocument["rows"][number], fieldId: string) =>
  row.cells[fieldId] ?? ""

const setCellValue = (
  row: KnowledgeDataTableDocument["rows"][number],
  fieldId: string,
  value: string,
) => {
  row.cells[fieldId] = value
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface-soft">
    <!-- 文档头（对齐语雀数据表顶部：标题可编辑 + 保存状态） -->
    <div class="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-kb-md bg-brand-faint text-brand"
          aria-hidden="true"
        >
          <AppIcon name="i-lucide-table-2" class="h-4 w-4" />
        </span>
        <input
          v-model="title"
          type="text"
          class="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-ink outline-none"
          :readonly="!canEdit"
          :placeholder="'未命名数据表'"
          maxlength="200"
          aria-label="数据表标题"
        />
      </div>
      <div class="flex shrink-0 items-center gap-3 text-[12px] text-ink-quaternary">
        <span v-if="saving" class="flex items-center gap-1">
          <UiIcon icon="i-lucide-loader-circle" class="h-3.5 w-3.5 animate-spin" />
          保存中…
        </span>
        <span v-else-if="saveError" class="text-error">{{ saveError }}</span>
        <span v-else-if="savedAtLabel">{{ savedAtLabel }}</span>
        <span v-else-if="isDirty">未保存</span>
      </div>
    </div>

    <div
      v-if="loading"
      class="flex flex-1 items-center justify-center text-[13px] text-ink-tertiary"
    >
      <UiIcon icon="i-lucide-loader-circle" class="mr-2 h-4 w-4 animate-spin" />
      正在加载数据表…
    </div>

    <div v-else-if="loadError" class="flex flex-1 flex-col items-center justify-center gap-3">
      <p class="text-[13px] text-error">{{ loadError }}</p>
      <el-button plain size="small" class="rounded-kb-lg" @click="() => void loadDocument()"
        >重试</el-button
      >
    </div>

    <!-- 表格主体 -->
    <div v-else class="min-h-0 flex-1 overflow-auto p-6">
      <div
        class="inline-block min-w-full overflow-hidden rounded-kb-xl border border-line bg-surface"
      >
        <table class="w-full border-collapse text-[13px]">
          <thead>
            <tr class="border-b border-line bg-muted">
              <th class="w-10 px-2 py-2 text-center text-[11px] font-normal text-ink-quaternary">
                #
              </th>
              <th
                v-for="field in table.fields"
                :key="field.id"
                class="min-w-[160px] border-l border-line px-3 py-2 text-left"
              >
                <div class="flex items-center gap-2">
                  <AppIcon
                    :name="
                      field.type === 'date'
                        ? 'i-lucide-calendar'
                        : field.type === 'select'
                          ? 'i-lucide-list'
                          : 'i-lucide-type'
                    "
                    class="h-3.5 w-3.5 shrink-0 text-ink-quaternary"
                  />
                  <input
                    v-if="fieldEditingStyleId === field.id && canEdit"
                    v-model="field.name"
                    type="text"
                    class="min-w-0 flex-1 bg-transparent font-medium text-ink outline-none"
                    @blur="updateFieldName(field, field.name)"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <button
                    v-else
                    type="button"
                    class="min-w-0 flex-1 truncate text-left font-medium text-ink"
                    :disabled="!canEdit"
                    @click="beginFieldNameEdit(field)"
                  >
                    {{ field.name }}
                  </button>
                  <el-dropdown v-if="canEdit" trigger="click" :offset="6">
                    <button
                      type="button"
                      class="shrink-0 rounded-kb-sm p-0.5 text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
                      :aria-label="`字段设置：${field.name}`"
                    >
                      <AppIcon name="i-lucide-chevron-down" class="h-3.5 w-3.5" />
                    </button>
                    <template #dropdown>
                      <div class="kb-menu min-w-[160px] py-1">
                        <button
                          v-for="typeOption in ['text', 'select', 'date'] as const"
                          :key="typeOption"
                          type="button"
                          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted hover:text-ink"
                          @click="changeFieldType(field, typeOption)"
                        >
                          <AppIcon
                            :name="
                              typeOption === 'date'
                                ? 'i-lucide-calendar'
                                : typeOption === 'select'
                                  ? 'i-lucide-list'
                                  : 'i-lucide-type'
                            "
                            class="h-3.5 w-3.5"
                          />
                          {{
                            typeOption === "text"
                              ? "文本"
                              : typeOption === "select"
                                ? "单选"
                                : "日期"
                          }}
                          <AppIcon
                            v-if="field.type === typeOption"
                            name="i-lucide-check"
                            class="ml-auto h-3.5 w-3.5 text-brand"
                          />
                        </button>
                        <div class="my-1 border-t border-line" />
                        <button
                          type="button"
                          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-error transition hover:bg-muted"
                          @click="requestRemoveField(field.id)"
                        >
                          <AppIcon name="i-lucide-trash-2" class="h-3.5 w-3.5" />
                          删除字段
                        </button>
                      </div>
                    </template>
                  </el-dropdown>
                </div>
              </th>
              <th v-if="canEdit" class="w-10 border-l border-line px-2 py-2">
                <button
                  type="button"
                  class="flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
                  title="添加字段"
                  @click="addField"
                >
                  <AppIcon name="i-lucide-plus" class="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in table.rows"
              :key="row.id"
              class="group border-b border-line last:border-b-0 hover:bg-muted/60"
            >
              <td class="px-2 py-1.5 text-center text-[11px] text-ink-quaternary">
                {{ rowIndex + 1 }}
              </td>
              <td
                v-for="field in table.fields"
                :key="field.id"
                class="border-l border-line px-2 py-1.5"
              >
                <el-select
                  v-if="field.type === 'select' && canEdit"
                  :model-value="cellValue(row, field.id)"
                  class="w-full"
                  :offset="6"
                  :show-arrow="false"
                  placeholder="—"
                  allow-create
                  filterable
                  @update:model-value="(value) => setCellValue(row, field.id, String(value ?? ''))"
                >
                  <el-option
                    v-for="option in field.options ?? []"
                    :key="option"
                    :label="option"
                    :value="option"
                  />
                </el-select>
                <span v-else-if="field.type === 'select'" class="block px-1 py-0.5">
                  {{ cellValue(row, field.id) || "—" }}
                </span>
                <input
                  v-else
                  :type="field.type === 'date' ? 'date' : 'text'"
                  :value="cellValue(row, field.id)"
                  :readonly="!canEdit"
                  class="w-full bg-transparent px-1 py-0.5 text-ink outline-none placeholder:text-ink-quaternary"
                  @input="setCellValue(row, field.id, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td v-if="canEdit" class="border-l border-line px-2 py-1.5 text-center">
                <button
                  type="button"
                  class="rounded-kb-sm p-1 text-ink-quaternary opacity-0 transition hover:bg-grey-200 hover:text-error group-hover:opacity-100"
                  title="删除行"
                  @click="requestRemoveRow(rowIndex)"
                >
                  <AppIcon name="i-lucide-trash-2" class="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>

            <tr v-if="table.rows.length === 0">
              <td
                :colspan="table.fields.length + 2"
                class="px-4 py-10 text-center text-[13px] text-ink-tertiary"
              >
                还没有记录，点击右下角「添加记录」开始。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 底部：记录数 + 添加记录（对齐语雀数据表底部） -->
    <div
      v-if="!loading && !loadError"
      class="flex items-center justify-between border-t border-line bg-surface px-6 py-2.5 text-[12px] text-ink-tertiary"
    >
      <span>{{ table.rows.length }} 条记录</span>
      <el-button v-if="canEdit" plain size="small" class="rounded-kb-lg gap-1" @click="addRow">
        <AppIcon name="i-lucide-plus" class="h-3.5 w-3.5" />
        <span class="truncate">添加记录</span>
      </el-button>
    </div>

    <ConfirmDialog
      :open="pendingFieldDeleteId !== null"
      message="确认删除该字段吗？字段下的所有单元格数据将一并清除。"
      danger
      confirm-text="删除字段"
      @update:open="(value) => !value && (pendingFieldDeleteId = null)"
      @confirm="confirmRemoveField"
    />
    <ConfirmDialog
      :open="pendingRowIndex !== null"
      message="确认删除该行记录吗？"
      danger
      confirm-text="删除"
      @update:open="(value) => !value && (pendingRowIndex = null)"
      @confirm="confirmRemoveRow"
    />
  </div>
</template>

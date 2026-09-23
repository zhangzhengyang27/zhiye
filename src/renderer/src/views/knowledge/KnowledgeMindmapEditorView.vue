<script setup lang="ts">
/**
 * 思维导图编辑器（B7 #24c v1）。
 *
 * 渲染内核：simple-mind-map（选型依据《差距修复批次计划》：可编辑 + 离线包体；
 * MIT、无外部服务依赖）。交互沿用库默认：双击/Enter 编辑文案、Tab 加子级、
 * Delete 删除节点、拖拽节点调整层级；画布滚轮缩放、拖空白平移。
 * 数据契约：content = { scheme: application/vnd.kb-mindmap+json, value: nodeTree }，
 * 复用 documents CRUD，data_change 防抖 1200ms 自动保存（与富文本编辑页一致）。
 * 暗色主题适配登记偏差（v1 固定浅色画布，跟随后续批次）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from "vue-router"
import AppIcon from "@/components/common/AppIcon.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import MindMap from "simple-mind-map"
import {
  getKnowledgeDocument,
  updateKnowledgeDocument,
  type KnowledgeDocumentContent,
} from "@/services/knowledge-documents"
import {
  KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
  type KnowledgeMindmapNode,
} from "@/types/knowledge-document"

const route = useRoute()
const docId = computed(() => String(route.params.docId ?? ""))

const loading = ref(true)
const loadError = ref("")
const title = ref("未命名思维导图")
const canEdit = ref(false)
const saving = ref(false)
const saveError = ref("")
const savedAtLabel = ref("")

const canvasRef = ref<HTMLDivElement | null>(null)
let mindMapInstance: MindMap | null = null

const makeUid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14)

const makeRoot = (text: string): KnowledgeMindmapNode => ({
  data: { text: text || "中心主题", uid: makeUid() },
  children: [],
})

const normalizeNode = (value: unknown): KnowledgeMindmapNode | null => {
  if (!value || typeof value !== "object") {
    return null
  }
  const raw = value as {
    data?: { text?: unknown; uid?: unknown; expand?: unknown }
    children?: unknown
  }
  if (!raw.data || typeof raw.data.text !== "string") {
    return null
  }
  const node: KnowledgeMindmapNode = {
    data: {
      text: raw.data.text,
      uid: typeof raw.data.uid === "string" ? raw.data.uid : makeUid(),
      ...(raw.data.expand === false ? { expand: false } : {}),
    },
  }
  if (Array.isArray(raw.children)) {
    node.children = raw.children
      .map((child) => normalizeNode(child))
      .filter((child): child is KnowledgeMindmapNode => child !== null)
  }
  return node
}

/** 就绪后待挂载的树（画布 v-show 翻转后再 mount，避免 0 尺寸） */
const pendingTree = ref<KnowledgeMindmapNode | null>(null)

// ==================== 加载与保存 ====================
let loadSeq = 0

const loadDocument = async () => {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ""
  try {
    const document = await getKnowledgeDocument(docId.value)
    if (seq !== loadSeq) return
    title.value = document.title || "未命名思维导图"
    canEdit.value = Boolean(document.myDocPermissions?.canEdit)
    const content = document.content as KnowledgeDocumentContent | null
    pendingTree.value =
      (content?.scheme === KNOWLEDGE_MINDMAP_CONTENT_SCHEME
        ? normalizeNode(content.value)
        : null) ?? makeRoot(title.value || "中心主题")
  } catch (error) {
    if (seq === loadSeq) {
      loadError.value = error instanceof Error ? error.message : "思维导图加载失败"
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

const snapshotRef = ref("")

const isDirtyNow = () => {
  if (!mindMapInstance) return false
  return JSON.stringify(mindMapInstance.getData()) !== snapshotRef.value
}

let saveTimer: number | null = null
const clearSaveTimer = () => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
}

const scheduleSave = () => {
  clearSaveTimer()
  if (!canEdit.value || loading.value) return
  saveTimer = window.setTimeout(() => void saveNow(), 1200)
}

const saveNow = async () => {
  clearSaveTimer()
  if (!canEdit.value || saving.value || !mindMapInstance) return

  saving.value = true
  saveError.value = ""
  try {
    const data = mindMapInstance.getData() as unknown as KnowledgeMindmapNode
    const content: KnowledgeDocumentContent = {
      scheme: KNOWLEDGE_MINDMAP_CONTENT_SCHEME,
      value: JSON.parse(JSON.stringify(data)),
    }
    const updated = await updateKnowledgeDocument(docId.value, {
      title: title.value,
      content: content as never,
    })
    if (typeof updated.updatedAt === "string") {
      savedAtLabel.value = `已保存 ${formatClock(updated.updatedAt)}`
    }
    snapshotRef.value = JSON.stringify(data)
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

// ==================== 画布装配 ====================
const mountMindMap = (nodeTree: KnowledgeMindmapNode) => {
  if (!canvasRef.value || mindMapInstance) {
    return
  }

  snapshotRef.value = JSON.stringify(nodeTree)
  mindMapInstance = new MindMap({
    el: canvasRef.value,
    data: JSON.parse(JSON.stringify(nodeTree)),
    readonly: !canEdit.value,
    layout: "logicalStructure",
    theme: "default",
    initRootNodePosition: ["center", "center"],
    maxZoomRatio: 3,
    minZoomRatio: 0.3,
    scaleRatio: 0.2,
  })

  mindMapInstance.on("data_change", () => {
    if (!mindMapInstance) return
    scheduleSave()
  })
}

const recenter = () => {
  mindMapInstance?.renderer?.setRootNodeCenter?.()
}

// 加载完成后再挂画布（v-show 已翻转、容器有真实尺寸）
watch(
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
  { immediate: true },
)

/** 路由守卫已按旧 docId 落盘的标记：卸载兜底据此避免以切换后的新 docId 再提交旧画布。 */
let leaveFlushed = false

// 目录树点另一张思维导图时路由组件被复用（仅 params.docId 变化）：必须先取消
// 挂起的自动保存并销毁重建画布——否则防抖定时器晚于切换触发，会把旧画布数据
// + 旧标题以新 docId 提交（跨文档数据污染）；正常切换由路由守卫按旧 docId 落盘
watch(
  () => docId.value,
  (next, prev) => {
    if (next === prev) {
      return
    }
    clearSaveTimer()
    loadSeq++
    loading.value = true
    loadError.value = ""
    title.value = ""
    savedAtLabel.value = ""
    saveError.value = ""
    pendingTree.value = null
    snapshotRef.value = ""
    // mountMindMap 检测到已有实例会跳过挂载，切换文档必须先销毁
    mindMapInstance?.destroy()
    mindMapInstance = null
    leaveFlushed = false
    void loadDocument()
  },
  { immediate: true },
)

const flushBeforeLeave = async () => {
  if (canEdit.value && isDirtyNow()) {
    await saveNow()
  }
}

onBeforeRouteUpdate(async () => {
  leaveFlushed = true
  await flushBeforeLeave()
  return true
})

onBeforeRouteLeave(async () => {
  leaveFlushed = true
  await flushBeforeLeave()
  return true
})

onBeforeUnmount(() => {
  clearSaveTimer()
  // 兜底「不经路由切换的卸载」（如整树刷新）；此时 route.params 可能已指向
  // 别的文档，routeFlushed=false 意味着旧画布尚未落盘，但 docId 已不可信——
  // 仅在仍指向本文档时提交
  if (!leaveFlushed && canEdit.value && isDirtyNow() && docId.value) {
    void saveNow()
  }
  mindMapInstance?.destroy()
  mindMapInstance = null
})

// 标题改动防抖保存（与内容同一节奏）
watch(title, () => {
  if (canEdit.value && !loading.value) {
    scheduleSave()
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface-soft">
    <!-- 文档头（与其他编辑器同构：标题 + 保存状态） -->
    <div class="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-kb-md bg-brand-faint text-brand"
          aria-hidden="true"
        >
          <AppIcon name="i-lucide-network" class="h-4 w-4" />
        </span>
        <input
          v-model="title"
          type="text"
          class="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-ink outline-none"
          :readonly="!canEdit"
          aria-label="思维导图标题"
        />
      </div>
      <div class="flex shrink-0 items-center gap-3 text-[12px] text-ink-quaternary">
        <span v-if="saving" class="flex items-center gap-1">
          <UiIcon icon="i-lucide-loader-circle" class="h-3.5 w-3.5 animate-spin" />
          保存中…
        </span>
        <span v-else-if="saveError" class="text-error">{{ saveError }}</span>
        <span v-else-if="savedAtLabel">{{ savedAtLabel }}</span>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-kb-md border border-line px-2.5 transition hover:border-brand-lighter hover:text-brand"
          title="画布回正"
          @click="recenter"
        >
          <AppIcon name="i-lucide-locate" class="h-3.5 w-3.5" />
          回正
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="flex flex-1 items-center justify-center text-[13px] text-ink-tertiary"
    >
      <UiIcon icon="i-lucide-loader-circle" class="mr-2 h-4 w-4 animate-spin" />
      正在加载思维导图…
    </div>

    <div v-else-if="loadError" class="flex flex-1 flex-col items-center justify-center gap-3">
      <p class="text-[13px] text-error">{{ loadError }}</p>
      <el-button plain size="small" class="rounded-kb-lg" @click="() => void loadDocument()"
        >重试</el-button
      >
    </div>

    <!-- 画布：simple-mind-map 自行管理内部滚动/缩放 -->
    <div v-show="!loading && !loadError" class="relative min-h-0 flex-1">
      <div ref="canvasRef" class="h-full w-full bg-white" aria-label="思维导图画布" />

      <div
        class="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white"
      >
        {{ canEdit ? "双击编辑 · Tab 加子级 · Delete 删除 · 滚轮缩放" : "只读模式" }}
      </div>
    </div>
  </div>
</template>

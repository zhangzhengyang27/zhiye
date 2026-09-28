<script setup lang="ts">
/**
 * 画板编辑器视图（Excalidraw）。
 *
 * 按删除事故前的编译缓存（_compiled-from-cache/views__knowledge__KnowledgeBoardEditorView.vue.compiled.js）
 * 重建原架构：getKnowledgeDocument 加载 → resolveKnowledgeBoardDocument 规范化（含旧版画板迁移）
 * → ExcalidrawBoardSurface 渲染；变更防抖自动保存 + Cmd/Ctrl+S 手动保存 + 路由离开/更新/卸载三路落盘；
 * AI 生成面板（生成草稿 → 替换/追加）；模型配置统一在偏好设置页「AI 模型」分组维护
 * （useAiModelConfig 共享状态），画板内只读当前模型摘要并保留设置跳转入口。
 * 素材库（board-library）条目与二进制资源随画布 libraryChange 同步上传/落库。
 *
 * 与编译缓存的三处对齐差异（均为任务显式要求）：
 * 1. 自动保存防抖 900ms → 1200ms（与 DataTable/富文本编辑页节奏一致）；
 * 2. 加载错误态补「重试」入口（对齐 DataTable 视图）；
 * 3. canEdit 优先取文档级 myDocPermissions.canEdit（含协作者升权，B2f），缺省回落工作区权限。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import BoardAiPanel from "@/components/board/BoardAiPanel.vue"
import ExcalidrawBoardSurface from "@/components/board/ExcalidrawBoardSurface.vue"
import { useAiModelConfig } from "@/composables/use-ai-model-config"
import { useTransientToast } from "@/composables/use-transient-toast"
import { getApiErrorMessage } from "@/services/http-client"
import { generateKnowledgeBoardAi } from "@/services/knowledge-board-ai"
import {
  getKnowledgeBoardLibrary,
  updateKnowledgeBoardLibrary,
  uploadKnowledgeBoardLibraryAsset,
} from "@/services/knowledge-board-library"
import {
  getKnowledgeDocument,
  recordKnowledgeDocumentView,
  updateKnowledgeDocument,
} from "@/services/knowledge-documents"
import { useAuthStore } from "@/stores/auth"
import {
  KNOWLEDGE_BOARD_AI_PROVIDERS,
  type KnowledgeBoardAiKind,
  type KnowledgeBoardAiMode,
} from "@/types/knowledge-board-ai"
import {
  KNOWLEDGE_BOARD_CONTENT_SCHEME,
  KNOWLEDGE_DOCUMENT_EDITOR_TYPES,
} from "@/types/knowledge-document"
import type { KnowledgeBoardDocument } from "@/types/knowledge-board"
import type {
  KnowledgeBoardLibraryAsset,
  KnowledgeBoardLibraryBinaryFile,
  KnowledgeBoardLibraryChangePayload,
  KnowledgeBoardLibraryItem,
} from "@/types/knowledge-board-library"
import {
  appendKnowledgeBoardSceneToRight,
  buildKnowledgeBoardSceneFromAiResult,
  replaceKnowledgeBoardWithGeneratedScene,
} from "@/utils/knowledge-board-ai"
import { getKnowledgeBoardAiSystemPrompt } from "@/utils/knowledge-board-ai-prompts"
import { createKnowledgeBoardDocument } from "@/utils/knowledge-board"
import {
  createKnowledgeBoardLibraryBinaryFilesFromAssets,
  knowledgeBoardLibraryBinaryFileToFile,
  mergeKnowledgeBoardLibraryBinaryFiles,
  normalizeKnowledgeBoardLibraryBinaryFiles,
  pruneKnowledgeBoardLibraryBinaryFiles,
} from "@/utils/knowledge-board-library"
import { resolveKnowledgeBoardDocument } from "@/utils/knowledge-board-migration"
import {
  getKnowledgeDocumentRouteTarget,
  isBoardContent,
  isBoardDocument,
} from "@/utils/knowledge-document"
import { knowledgeWorkspaceContextKey } from "@/views/knowledge/workspace-context"
import { formatDateTime } from "@/utils/date-format"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const workspaceContext = inject(knowledgeWorkspaceContextKey)
if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

const { showToastMessage } = useTransientToast()

const docId = computed(() => {
  return typeof route.params.docId === "string" ? route.params.docId : ""
})

// 编辑权限：文档详情的 myDocPermissions（含文档级协作者升权）优先，缺省回落工作区权限
const canEdit = ref(false)

const loading = ref(false)
const saving = ref(false)
const autoSaving = ref(false)
const errorMessage = ref("")
const saveError = ref("")
const lastSavedAt = ref("")

const title = ref("")
const board = ref<KnowledgeBoardDocument>(createKnowledgeBoardDocument())
const migratedFromLegacy = ref(false)
// 脏态基于 JSON 串比对：snapshot 是上次保存/加载基线，serializedState 跟随实时内容
const snapshot = ref("")
const serializedState = ref("")
const saveTimer = ref<number | null>(null)
const boardResetToken = ref(0)

const aiPanelOpen = ref(false)
const aiLoading = ref(false)
const aiPrompt = ref("")
const aiMode = ref<KnowledgeBoardAiMode>("auto")
const aiError = ref("")
const aiSummary = ref("")
const aiWarnings = ref<string[]>([])
const aiResultKind = ref<KnowledgeBoardAiKind | null>(null)
const aiGeneratedBoard = ref<KnowledgeBoardDocument | null>(null)

const boardLibraryItems = ref<KnowledgeBoardLibraryItem[]>([])
const boardLibrarySaveTimer = ref<number | null>(null)
const boardLibraryLoading = ref(false)
const boardLibrarySaving = ref(false)
const boardLibraryAssets = ref<KnowledgeBoardLibraryAsset[]>([])
const boardLibraryFiles = ref<KnowledgeBoardLibraryBinaryFile[]>([])
const boardLibrarySnapshot = ref("[]")
const boardLibraryAssetUploadTasks = new Map<string, Promise<void>>()

const isMigratedBoard = computed(() => migratedFromLegacy.value)
const isDirty = computed(() => serializedState.value !== snapshot.value)

// 模型配置：统一收在偏好设置页「AI 模型」分组编辑，画板只读激活 profile
const { activeProfile: aiActiveProfile, summary: aiConfigSummary } = useAiModelConfig()

const aiSystemPromptPreview = computed(() => getKnowledgeBoardAiSystemPrompt(aiMode.value))

const saveStatusLabel = computed(() => {
  if (saveError.value) {
    return "保存异常"
  }
  if (saving.value) {
    return "正在保存"
  }
  if (autoSaving.value) {
    return "自动保存中"
  }
  if (isDirty.value) {
    return "尚未保存"
  }
  return lastSavedAt.value ? `已保存 ${formatDateTime(lastSavedAt.value)}` : "已同步"
})

const saveStatusClass = computed(() => {
  if (saveError.value) {
    return "border-error-light bg-error-bg text-error"
  }
  if (saving.value || autoSaving.value) {
    return "border-brand-lighter bg-brand-faint text-brand"
  }
  if (isDirty.value) {
    return "border-warning-light bg-warning-bg text-warning-hover"
  }
  return "border-brand-lighter bg-brand-faint text-brand"
})

const serializeBoardState = () => {
  return JSON.stringify({
    title: title.value,
    board: board.value,
  })
}

const syncSerializedState = () => {
  serializedState.value = serializeBoardState()
}

const clearSaveTimer = () => {
  if (saveTimer.value !== null) {
    window.clearTimeout(saveTimer.value)
    saveTimer.value = null
  }
}

const clearBoardLibrarySaveTimer = () => {
  if (boardLibrarySaveTimer.value !== null) {
    window.clearTimeout(boardLibrarySaveTimer.value)
    boardLibrarySaveTimer.value = null
  }
}

const triggerManualSave = () => {
  if (!canEdit.value || loading.value || saving.value || autoSaving.value) {
    return
  }
  void saveBoard({
    silent: false,
    auto: false,
  })
}

const syncBoardLibrarySnapshot = (items: KnowledgeBoardLibraryItem[]) => {
  boardLibrarySnapshot.value = JSON.stringify(items)
}

const isBoardLibraryDirty = computed(
  () => JSON.stringify(boardLibraryItems.value) !== boardLibrarySnapshot.value,
)

const setBoardLibraryAssets = (assets: KnowledgeBoardLibraryAsset[]) => {
  boardLibraryAssets.value = Array.isArray(assets) ? assets : []
}

const mergeBoardLibraryFiles = (files: KnowledgeBoardLibraryBinaryFile[]) => {
  boardLibraryFiles.value = pruneKnowledgeBoardLibraryBinaryFiles(
    mergeKnowledgeBoardLibraryBinaryFiles(
      boardLibraryFiles.value,
      normalizeKnowledgeBoardLibraryBinaryFiles(files),
    ),
    boardLibraryItems.value,
  )
}

const hydrateBoardLibraryFilesFromAssets = (assets: KnowledgeBoardLibraryAsset[]) => {
  const hydratedFiles = createKnowledgeBoardLibraryBinaryFilesFromAssets(assets)
  boardLibraryFiles.value = pruneKnowledgeBoardLibraryBinaryFiles(
    mergeKnowledgeBoardLibraryBinaryFiles(boardLibraryFiles.value, hydratedFiles),
    boardLibraryItems.value,
  )
}

const flushBoardLibraryAssetUploads = async () => {
  const tasks = [...boardLibraryAssetUploadTasks.values()]
  if (tasks.length === 0) {
    return
  }
  await Promise.allSettled(tasks)
}

const queueAutoSave = () => {
  if (!docId.value || !canEdit.value) {
    return
  }
  clearSaveTimer()
  saveTimer.value = window.setTimeout(() => {
    saveTimer.value = null
    if (!isDirty.value) {
      return
    }
    void saveBoard({
      silent: true,
      auto: true,
    })
  }, 1200)
}

const saveBoardLibrary = async (options?: { silent?: boolean }) => {
  if (boardLibraryLoading.value || boardLibrarySaving.value || !authStore.user?.id) {
    return
  }
  boardLibrarySaving.value = true
  try {
    await flushBoardLibraryAssetUploads()
    const response = await updateKnowledgeBoardLibrary(boardLibraryItems.value)
    boardLibraryItems.value = Array.isArray(response.items) ? response.items : []
    setBoardLibraryAssets(Array.isArray(response.assets) ? response.assets : [])
    hydrateBoardLibraryFilesFromAssets(boardLibraryAssets.value)
    syncBoardLibrarySnapshot(boardLibraryItems.value)
    if (!options?.silent) {
      showToastMessage("素材库已同步。", "success")
    }
  } catch (error) {
    if (!options?.silent) {
      showToastMessage(getApiErrorMessage(error, "保存素材库失败。"), "error")
    }
  } finally {
    boardLibrarySaving.value = false
  }
}

const queueBoardLibrarySave = () => {
  clearBoardLibrarySaveTimer()
  boardLibrarySaveTimer.value = window.setTimeout(() => {
    boardLibrarySaveTimer.value = null
    if (!isBoardLibraryDirty.value) {
      return
    }
    void saveBoardLibrary({
      silent: true,
    })
  }, 600)
}

// 程序化整体更新画板（AI 替换/追加）：要 bump resetToken 强制 Surface 重建画布
const applyProgrammaticBoardUpdate = (nextBoard: KnowledgeBoardDocument) => {
  board.value = nextBoard
  boardResetToken.value += 1
  syncSerializedState()
  if (!snapshot.value || loading.value || !canEdit.value || !isDirty.value) {
    return
  }
  queueAutoSave()
}

const uploadBoardLibraryImageAsset = async (file: KnowledgeBoardLibraryBinaryFile) => {
  if (!authStore.user?.id) {
    return
  }
  const existingTask = boardLibraryAssetUploadTasks.get(file.id)
  if (existingTask) {
    await existingTask
    return
  }
  const task = (async () => {
    const uploadFile = await knowledgeBoardLibraryBinaryFileToFile(file)
    const asset = await uploadKnowledgeBoardLibraryAsset({
      fileId: file.id,
      file: uploadFile,
      kbId: workspaceContext.kbId.value,
      docId: docId.value || undefined,
    })
    setBoardLibraryAssets(
      [...boardLibraryAssets.value.filter((item) => item.fileId !== asset.fileId), asset].sort(
        (left, right) => right.updatedAt.localeCompare(left.updatedAt),
      ),
    )
  })()
    .catch((error) => {
      showToastMessage(
        getApiErrorMessage(error, "图片素材上传失败，刷新后可能无法恢复该素材。"),
        "error",
      )
    })
    .finally(() => {
      boardLibraryAssetUploadTasks.delete(file.id)
    })
  boardLibraryAssetUploadTasks.set(file.id, task)
  await task
}

const syncBoardLibraryAssets = async (
  items: KnowledgeBoardLibraryItem[],
  runtimeFiles: KnowledgeBoardLibraryBinaryFile[],
) => {
  mergeBoardLibraryFiles(runtimeFiles)
  const uploadedFileIds = new Set(boardLibraryAssets.value.map((asset) => asset.fileId))
  const uploadCandidates = runtimeFiles.filter((file) => {
    return file.dataURL.startsWith("data:") && !uploadedFileIds.has(file.id)
  })
  if (uploadCandidates.length > 0) {
    await Promise.all(uploadCandidates.map((file) => uploadBoardLibraryImageAsset(file)))
  }
  boardLibraryFiles.value = pruneKnowledgeBoardLibraryBinaryFiles(boardLibraryFiles.value, items)
  queueBoardLibrarySave()
}

const loadBoardLibrary = async () => {
  if (!authStore.user?.id) {
    boardLibraryItems.value = []
    setBoardLibraryAssets([])
    boardLibraryFiles.value = []
    syncBoardLibrarySnapshot(boardLibraryItems.value)
    return
  }
  boardLibraryLoading.value = true
  try {
    const response = await getKnowledgeBoardLibrary()
    boardLibraryItems.value = Array.isArray(response.items) ? response.items : []
    setBoardLibraryAssets(Array.isArray(response.assets) ? response.assets : [])
    boardLibraryFiles.value = []
    hydrateBoardLibraryFilesFromAssets(boardLibraryAssets.value)
    syncBoardLibrarySnapshot(boardLibraryItems.value)
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "加载素材库失败。"), "error")
  } finally {
    boardLibraryLoading.value = false
  }
}

const handleBoardChange = (nextBoard: KnowledgeBoardDocument) => {
  board.value = nextBoard
  syncSerializedState()
  if (!snapshot.value || loading.value || !canEdit.value || !isDirty.value) {
    return
  }
  queueAutoSave()
}

const handleBoardLibraryChange = (payload: KnowledgeBoardLibraryChangePayload) => {
  boardLibraryItems.value = payload.items
  if (!authStore.user?.id) {
    return
  }
  void syncBoardLibraryAssets(payload.items, payload.files)
}

const handleSaveShortcut = (event: KeyboardEvent) => {
  if (
    !docId.value ||
    !canEdit.value ||
    event.isComposing ||
    event.defaultPrevented ||
    event.altKey ||
    event.shiftKey ||
    !(event.metaKey || event.ctrlKey) ||
    event.key.toLowerCase() !== "s"
  ) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  triggerManualSave()
}

// 同一文档同一时刻只允许一个在途保存：自动保存与手动保存共用，后到者复用前者
let activeBoardSave: Promise<void> | null = null
const saveBoard = async (options?: { silent?: boolean; auto?: boolean }): Promise<void> => {
  if (!docId.value || !canEdit.value) {
    return
  }
  if (activeBoardSave) {
    return activeBoardSave
  }
  const savedDocId = docId.value
  // 发起保存时捕获实际发送的内容：基线只对齐「发出的内容」——若保存后重新序列化
  // 当前值（旧写法 syncSerializedState），在途期间的编辑会既不在请求里又不再被视为
  // 脏（静默丢失）；在途标题也要防被服务端回包覆盖（旧写法 title.value = updated.title）
  const rawTitleAtRequest = title.value
  const titleAtRequest = rawTitleAtRequest.trim() || "无标题画板"
  const boardAtRequest = JSON.parse(JSON.stringify(board.value)) as KnowledgeBoardDocument
  saveError.value = ""
  saving.value = !(options?.auto ?? false)
  autoSaving.value = options?.auto ?? false
  activeBoardSave = (async () => {
    try {
      const updated = await updateKnowledgeDocument(savedDocId, {
        title: titleAtRequest,
        editorType: KNOWLEDGE_DOCUMENT_EDITOR_TYPES.board,
        content: {
          scheme: KNOWLEDGE_BOARD_CONTENT_SCHEME,
          value: boardAtRequest,
        },
      })
      // await 期间切走了文档：旧响应不能回写新文档状态
      if (docId.value !== savedDocId) {
        return
      }
      lastSavedAt.value = updated.updatedAt
      // 标题在途未被继续编辑时才归一到发送值（与服务端存储一致，基线才能对齐）；
      // 在途有编辑则保留用户输入，保持脏态交由下一次保存
      if (title.value === rawTitleAtRequest) {
        title.value = titleAtRequest
      }
      snapshot.value = JSON.stringify({ title: titleAtRequest, board: boardAtRequest })
      if (!options?.silent) {
        showToastMessage("画板已保存。", "success")
      }
    } catch (error) {
      saveError.value = getApiErrorMessage(error, "保存画板失败。")
      if (!options?.silent) {
        showToastMessage(saveError.value, "error")
      }
    } finally {
      saving.value = false
      autoSaving.value = false
      activeBoardSave = null
    }
  })()
  return activeBoardSave
}

const resetAiState = () => {
  aiError.value = ""
  aiSummary.value = ""
  aiWarnings.value = []
  aiResultKind.value = null
  aiGeneratedBoard.value = null
}

const openAiPanel = () => {
  if (!canEdit.value) {
    return
  }
  aiPanelOpen.value = true
  if (!aiPrompt.value.trim()) {
    aiPrompt.value = title.value.trim() ? `请基于“${title.value.trim()}”生成一个画板草稿。` : ""
  }
}

const closeAiPanel = () => {
  aiPanelOpen.value = false
}

/** 模型配置已统一收进偏好设置页「AI 模型」分组，画板头部仅保留跳转入口。 */
const openModelSettings = () => {
  void router.push({ name: "settings" })
}

const validateAiProviderConfig = () => {
  const config = aiActiveProfile.value
  if (!config.apiKey.trim()) {
    return "请先在「偏好设置 → AI 模型」填写模型服务的 API Key。"
  }
  if (!config.baseUrl.trim()) {
    return "请先在「偏好设置 → AI 模型」填写 Base URL。"
  }
  if (!config.model.trim()) {
    return "请先在「偏好设置 → AI 模型」填写模型名称。"
  }
  if (
    !Number.isFinite(config.timeoutMs) ||
    config.timeoutMs < 5_000 ||
    config.timeoutMs > 120_000
  ) {
    return "超时时间需在 5000 到 120000 毫秒之间。"
  }
  if (
    config.provider === KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible &&
    !/^https?:\/\//i.test(config.baseUrl.trim())
  ) {
    return "OpenAI 兼容模型需要填写完整的 Base URL。"
  }
  return ""
}

const handleGenerateAiBoard = async () => {
  if (!docId.value || !canEdit.value || !aiPrompt.value.trim()) {
    return
  }
  const configError = validateAiProviderConfig()
  if (configError) {
    aiError.value = configError
    showToastMessage(configError, "error")
    return
  }
  aiLoading.value = true
  aiError.value = ""
  try {
    const result = await generateKnowledgeBoardAi(docId.value, {
      prompt: aiPrompt.value.trim(),
      mode: aiMode.value,
      providerConfig: {
        provider: aiActiveProfile.value.provider,
        apiKey: aiActiveProfile.value.apiKey.trim(),
        baseUrl: aiActiveProfile.value.baseUrl.trim(),
        model: aiActiveProfile.value.model.trim(),
        timeoutMs: aiActiveProfile.value.timeoutMs,
      },
    })
    aiSummary.value = result.summary
    aiWarnings.value = Array.isArray(result.warnings) ? result.warnings : []
    aiResultKind.value = result.kind
    aiGeneratedBoard.value = await buildKnowledgeBoardSceneFromAiResult(result)
    showToastMessage("AI 草稿已生成，可直接替换当前画板或追加到右侧。", "success")
  } catch (error) {
    aiGeneratedBoard.value = null
    aiResultKind.value = null
    aiSummary.value = ""
    aiWarnings.value = []
    aiError.value = getApiErrorMessage(error, "AI 生成失败。")
    showToastMessage(aiError.value, "error")
  } finally {
    aiLoading.value = false
  }
}

const handleApplyAiGeneratedBoard = (mode: "replace" | "append") => {
  if (!aiGeneratedBoard.value || !canEdit.value) {
    return
  }
  const nextBoard =
    mode === "replace"
      ? replaceKnowledgeBoardWithGeneratedScene(aiGeneratedBoard.value)
      : appendKnowledgeBoardSceneToRight(board.value, aiGeneratedBoard.value)
  applyProgrammaticBoardUpdate(nextBoard)
  closeAiPanel()
  showToastMessage(
    mode === "replace" ? "AI 草稿已替换当前画板。" : "AI 草稿已追加到当前画板右侧。",
    "success",
  )
}

let documentLoadSeq = 0
const loadDocument = async () => {
  if (!docId.value) {
    return
  }
  const loadSeq = ++documentLoadSeq
  loading.value = true
  errorMessage.value = ""
  try {
    const document = await getKnowledgeDocument(docId.value)
    // 在途请求过期丢弃：切换文档后旧响应不得回写
    if (loadSeq !== documentLoadSeq) {
      return
    }
    if (!isBoardDocument(document)) {
      await router.replace(
        getKnowledgeDocumentRouteTarget({
          kbId: workspaceContext.kbId.value,
          docId: document.id,
          editorType: document.editorType,
        }),
      )
      return
    }
    canEdit.value =
      document.myDocPermissions?.canEdit ?? workspaceContext.permissions.value?.canEdit ?? false
    title.value = document.title
    const documentContent = document.content
    const resolvedBoard = resolveKnowledgeBoardDocument(
      documentContent && isBoardContent(documentContent) ? documentContent.value : null,
    )
    board.value = resolvedBoard.document
    migratedFromLegacy.value = resolvedBoard.migratedFromLegacy
    lastSavedAt.value = document.updatedAt
    saveError.value = ""
    resetAiState()
    boardResetToken.value += 1
    syncSerializedState()
    snapshot.value = serializedState.value
    recordKnowledgeDocumentView(docId.value).catch(() => undefined)
  } catch (error) {
    if (loadSeq === documentLoadSeq) {
      errorMessage.value = getApiErrorMessage(error, "加载画板失败。")
    }
  } finally {
    if (loadSeq === documentLoadSeq) {
      loading.value = false
    }
  }
}

watch(
  () => docId.value,
  () => {
    // 切换文档先取消挂起的自动保存，防抖定时器晚于切换触发会以新 docId 提交旧内容
    clearSaveTimer()
    void loadDocument()
  },
  { immediate: true },
)

watch(
  () => authStore.user?.id,
  () => {
    clearBoardLibrarySaveTimer()
    void loadBoardLibrary()
  },
  { immediate: true },
)

watch(title, () => {
  syncSerializedState()
  if (!snapshot.value || loading.value || !canEdit.value || !isDirty.value) {
    return
  }
  queueAutoSave()
})

// 离开路由（切库/回工作区）：脏内容静默落盘，素材上传等落地后按需同步素材库
onBeforeRouteLeave(async () => {
  if (!isDirty.value || !canEdit.value || !docId.value) {
    await flushBoardLibraryAssetUploads()
    if (isBoardLibraryDirty.value) {
      await saveBoardLibrary({
        silent: true,
      })
    }
    return true
  }
  clearSaveTimer()
  clearBoardLibrarySaveTimer()
  await saveBoard({
    silent: true,
    auto: false,
  })
  if (isBoardLibraryDirty.value) {
    await saveBoardLibrary({
      silent: true,
    })
  }
  return true
})

// 目录树点另一篇文档时组件被复用（仅 params.docId 变化），同样要先落盘
onBeforeRouteUpdate(async () => {
  clearSaveTimer()
  clearBoardLibrarySaveTimer()
  if (isDirty.value && canEdit.value && docId.value) {
    await saveBoard({
      silent: true,
      auto: false,
    })
  }
  await flushBoardLibraryAssetUploads()
  if (isBoardLibraryDirty.value) {
    await saveBoardLibrary({
      silent: true,
    })
  }
  return true
})

onBeforeUnmount(() => {
  clearSaveTimer()
  clearBoardLibrarySaveTimer()
  window.removeEventListener("keydown", handleSaveShortcut, true)
  // 卸载兜底（登出等不走路由守卫的路径）：脏内容尽量静默落盘
  if (isDirty.value && canEdit.value && docId.value) {
    void saveBoard({
      silent: true,
      auto: false,
    })
  }
  void flushBoardLibraryAssetUploads().then(() => {
    if (isBoardLibraryDirty.value && authStore.user?.id) {
      return saveBoardLibrary({
        silent: true,
      })
    }
    return undefined
  })
  boardLibraryAssetUploadTasks.clear()
})

onMounted(() => {
  // capture 阶段拦截 Cmd/Ctrl+S，抢在浏览器/Electron 默认保存行为之前
  window.addEventListener("keydown", handleSaveShortcut, true)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface-soft">
    <!-- 加载失败：错误态 + 重试（对齐 DataTable 视图） -->
    <div
      v-if="errorMessage"
      class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12"
    >
      <p class="rounded-kb-2xl border border-error-light bg-error-bg px-4 py-3 text-sm text-error">
        {{ errorMessage }}
      </p>
      <el-button plain class="py-2" @click="() => void loadDocument()">
        <span class="truncate">重试</span>
      </el-button>
    </div>

    <template v-else>
      <header class="border-b border-line bg-surface-soft px-6 py-4">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="min-w-0 flex-1">
            <input
              v-model="title"
              type="text"
              :readonly="!canEdit"
              placeholder="无标题画板"
              maxlength="200"
              aria-label="画板标题"
              class="w-full border-none bg-transparent text-[28px] font-semibold tracking-[-0.03em] text-ink outline-none placeholder:text-ink-quaternary"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="isMigratedBoard"
              class="inline-flex items-center rounded-full border border-warning-light bg-warning-bg px-3 py-1 text-xs font-medium text-warning-hover"
            >
              已迁移旧版画板
            </span>
            <span
              class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
              :class="saveStatusClass"
            >
              {{ saveStatusLabel }}
            </span>
            <el-button
              plain
              class="py-2"
              :disabled="loading || saving || autoSaving || !canEdit"
              @click="openAiPanel"
            >
              <span class="truncate">AI 生成</span>
            </el-button>
            <el-button
              plain
              class="py-2"
              :title="`当前模型：${aiConfigSummary}（点击前往偏好设置修改）`"
              @click="openModelSettings"
            >
              <Icon icon="ph:sliders-horizontal" :width="16" :height="16" />
              <span class="truncate">模型设置</span>
            </el-button>
            <el-button
              type="primary"
              class="py-2 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="saving || autoSaving || !canEdit"
              @click="triggerManualSave"
            >
              <span class="truncate">{{ saving ? "保存中…" : "立即保存" }}</span>
            </el-button>
          </div>
        </div>
      </header>

      <div
        v-if="loading"
        class="flex flex-1 items-center justify-center px-6 py-12 text-sm text-ink-tertiary"
      >
        正在加载画板…
      </div>
      <div v-else class="min-h-0 flex-1">
        <main class="relative h-full min-h-0">
          <ExcalidrawBoardSurface
            :scene="board"
            :library-items="boardLibraryItems"
            :library-files="boardLibraryFiles"
            :readonly="!canEdit"
            :reset-token="boardResetToken"
            height-class="h-full"
            @change="handleBoardChange"
            @library-change="handleBoardLibraryChange"
            @request-save="triggerManualSave"
          />

          <!-- AI 生成面板：生成草稿后按「替换 / 追加到右侧」两种动作落画板 -->
          <div v-if="aiPanelOpen" class="absolute inset-y-0 right-0 z-20 w-full max-w-[420px]">
            <BoardAiPanel
              v-model:prompt="aiPrompt"
              v-model:mode="aiMode"
              :system-prompt="aiSystemPromptPreview"
              :loading="aiLoading"
              :error="aiError"
              :summary="aiSummary"
              :warnings="aiWarnings"
              :has-generated-result="Boolean(aiGeneratedBoard)"
              :result-kind="aiResultKind"
              @close="closeAiPanel"
              @generate="handleGenerateAiBoard"
              @apply-replace="handleApplyAiGeneratedBoard('replace')"
              @apply-append="handleApplyAiGeneratedBoard('append')"
            />
          </div>

          <!-- 保存异常浮层：自动保存失败的错误保底可见，不阻塞继续编辑 -->
          <section
            v-if="saveError"
            class="pointer-events-none absolute bottom-4 left-4 max-w-md rounded-kb-3xl border border-error-light bg-error-bg/95 p-4 text-sm leading-6 text-error shadow-[var(--kb-float-shadow)]"
          >
            <div class="flex items-center gap-2 font-semibold">
              <Icon icon="ph:sparkle" :width="16" :height="16" />
              保存提醒
            </div>
            <p class="mt-3">{{ saveError }}</p>
          </section>
        </main>
      </div>
    </template>
  </div>
</template>

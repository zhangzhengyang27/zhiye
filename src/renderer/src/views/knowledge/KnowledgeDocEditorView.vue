<!-- 组件说明：KnowledgeDocEditorView 组件，负责页面展示与交互逻辑。 -->
<script setup lang="ts">
/** 页面组件，负责知识库文档编辑、保存、评论与版本侧栏的主流程编排。 */
import { formatClockTime, formatDateTime } from "@/utils/date-format"
import { isImeComposing } from "@/utils/keyboard"
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from "vue-router"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import { useTransientToast } from "@/composables/use-transient-toast"
import { getApiErrorStatus } from "@/services/http-client"
import { resolveWebBaseUrl } from "@/services/desktop-bridge"
import { logger } from "@/utils/logger"
import { addKnowledgeFavorite, checkKnowledgeFavorite, removeKnowledgeFavorite } from "@/services/knowledge-favorites"
import { uploadKnowledgeAsset } from "@/services/knowledge-oss"
import { getKnowledgeBaseMembers, type KnowledgeBaseMember } from "@/services/knowledge-permissions"
import { openDocCollabChannel, type CollabPresenceMember, type DocCollabChannel } from "@/services/knowledge-collab"
import {
  deleteKnowledgeDocumentVersion,
  getKnowledgeDocument,
  listKnowledgeDocumentVersions,
  recordKnowledgeDocumentView,
  rollbackKnowledgeDocumentVersion,
  trashKnowledgeDocument,
  updateKnowledgeDocument,
  type KnowledgeDocumentItem,
  type KnowledgeDocumentVersionItem,
} from "@/services/knowledge-documents"
import { getKnowledgeDocumentRouteTarget, isBoardDocument } from "@/utils/knowledge-document"
import {
  addDocumentCollaborator,
  listDocumentCollaborators,
  removeDocumentCollaborator,
  updateDocumentCollaborator,
  type DocumentCollaboratorItem,
} from "@/services/document-collaborators"
import {
  extractDocumentOutline,
  extractDocumentPlainText,
  type DocumentOutlineItem,
} from "@/utils/document-content-metadata"
import { getSharedMarkdown, renderKnowledgeDocumentHtmlWithMermaid } from "@/utils/knowledge-markdown"
import { useAuthStore } from "@/stores/auth"
import {
  createComment,
  deleteComment as deleteCommentApi,
  getDocumentComments,
  resolveComment as resolveCommentApi,
  unresolveComment as unresolveCommentApi,
  type Comment as CommentRecord,
} from "@/services/comments"
import { CommentManager } from "yuque-editor-core"
import type { HighlightSelection } from "yuque-editor-core"
import DocumentCommentsPanel from "@/components/editor/DocumentCommentsPanel.vue"
import type { DocCommentItem } from "@/components/editor/DocumentCommentsPanel.vue"
import DocumentAiPanel from "@/components/editor/DocumentAiPanel.vue"
import EditorMoreMenu from "@/components/editor/EditorMoreMenu.vue"
import type { DropdownMenuItem } from "@/composables/use-dropdown-menu"
import MentionMemberPicker from "./MentionMemberPicker.vue"
import type { DocEditorStyle } from "@/components/editor/DocumentStyleSettingsDialog.vue"
import type { YuqueEditorRef } from "yuque-editor-core/editor"
import { escapeHtml } from "@/utils/enhanced-rich-blocks"
import { knowledgeWorkspaceContextKey } from "./workspace-context"

const YuqueDocEditor = defineAsyncComponent(() => import("@/components/editor/YuqueDocEditor.vue"))

/** 对齐语雀桌面端工具栏的可见项，保留常用格式化工具。 */
const EDITOR_TOOLBAR_ITEMS = [
  "cardSelect",
  "|",
  "undo",
  "redo",
  "formatPainter",
  "clearFormat",
  "|",
  "style",
  "fontsize",
  "|",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "|",
  "color",
  "bgColor",
  "|",
  "alignment",
  "unorderedList",
  "orderedList",
  "|",
  "link",
  "quote",
  "hr",
  // Lake 内置查找替换（⇧⌘F 唤起面板；内核 search 插件提供 search/replaceText/replaceAll 命令）
  "search",
]
const DocumentInfoPanel = defineAsyncComponent(() => import("@/components/editor/DocumentInfoPanel.vue"))
const DocumentStyleSettingsDialog = defineAsyncComponent(
  () => import("@/components/editor/DocumentStyleSettingsDialog.vue")
)
const EditorShortcutPanel = defineAsyncComponent(() => import("@/components/editor/EditorShortcutPanel.vue"))
const EditorSelectionToolbar = defineAsyncComponent(() => import("@/components/editor/EditorSelectionToolbar.vue"))
const ShareDialog = defineAsyncComponent(() => import("@/components/share/ShareDialog.vue"))
const VersionCompareDialog = defineAsyncComponent(() => import("@/components/version/VersionCompareDialog.vue"))
const DocumentVersionsPanel = defineAsyncComponent(() => import("@/components/version/DocumentVersionsPanel.vue"))
const ConfirmDialog = defineAsyncComponent(() => import("@/components/common/ConfirmDialog.vue"))

const loadDocumentExportTools = () => import("@/utils/document-export")

const route = useRoute()
const router = useRouter()
const markdown = getSharedMarkdown()

const workspaceContext = inject(knowledgeWorkspaceContextKey)

if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

type DocSidePanelTab = "search" | "comments" | "versions" | "info" | "ai"

// 菜单项结构：T7 解散 AppDropdownMenu 后统一走 composables/use-dropdown-menu.ts 的
// DropdownMenuItem（children 由 EditorMoreMenu 展开为面板内缩进二级菜单项）

const { showToastMessage } = useTransientToast()

/**
 * 路由派生状态决定当前文档上下文、权限和侧边面板可见性，是页面主流程的入口。
 */
const docId = computed(() => {
  if (typeof route.params.docId === "string") {
    return route.params.docId
  }

  return ""
})

/**
 * 页面级状态负责承载文档内容、保存队列、评论/版本面板和分享弹窗的运行时数据。
 * 这些引用会被编辑器主体、头部操作区和侧边面板同时消费。
 */
const loading = ref(false)
const saving = ref(false)
const autoSaving = ref(false)
const errorMessage = ref("")
const saveError = ref("")
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine)
const pendingSaveRequest = ref<{
  silent: boolean
  auto: boolean
  reason: "typing" | "manual" | "retry" | "offline"
} | null>(null)
const retrySaveTimer = ref<number | null>(null)
const retryAttempt = ref(0)
const remoteConflict = ref<{
  title: string
  updatedAt: string
} | null>(null)
const remoteCheckTimer = ref<number | null>(null)
const workspaceMembers = ref<KnowledgeBaseMember[]>([])

/** @提及成员选择器：工具栏按钮触发，选中后向光标处插入 @名字 文本 */
const mentionPickerOpen = ref(false)
const mentionPickerPos = ref({ left: 0, top: 0 })
const openMentionPicker = async (e: MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  mentionPickerPos.value = { left: rect.left, top: rect.bottom + 6 }
  if (workspaceMembers.value.length === 0) {
    await loadCollaborators()
  }
  mentionPickerOpen.value = !mentionPickerOpen.value
}
const handleMentionSelect = (member: KnowledgeBaseMember) => {
  mentionPickerOpen.value = false
  const editor = editorInstance.value as { focusToStart?: (offset?: number) => void } | null
  if (!editor?.focusToStart) {
    showToastMessage("编辑器尚未就绪，请稍后再试。", "error")
    return
  }
  // Lake 输入通道为 beforeinput（execCommand/insertText 在 markdown 方案下均不生效）：
  // 先聚焦编辑器，再合成与真实键盘输入同路径的 insertText 事件
  editor.focusToStart()
  const editable = document.querySelector<HTMLElement>('.ne-engine[contenteditable="true"]')
  if (!editable) {
    showToastMessage("编辑器尚未就绪，请稍后再试。", "error")
    return
  }
  editable.dispatchEvent(
    new InputEvent("beforeinput", {
      inputType: "insertText",
      data: `@${member.user.displayName} `,
      bubbles: true,
      cancelable: true,
    })
  )
  showToastMessage(`已插入 @${member.user.displayName}`, "success")
}

/** 文档 AI 面板「插入文末」：AI 结果以转义段落追加到文档末尾（Lake appendContent 官方 API） */
const handleAiInsertToEnd = (text: string) => {
  const editor = editorInstance.value as YuqueEditorRef | null
  if (!editor?.appendContent) {
    showToastMessage("编辑器尚未就绪，请稍后再试。", "error")
    return
  }

  // Lake appendContent 在 execCommand 可用时走 insertAtSelection（插入到当前光标处），
  // 而光标位置不可控，无法保证“文末”语义。改为在文档模型层拼接后整体 setContent：
  // getContent(scheme) 取当前全文 → 追加生成块 → setContent(scheme) 重设，与光标位置无关。
  const paragraphs = text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
  if (!paragraphs.length) {
    showToastMessage("没有可插入的内容。", "error")
    return
  }
  const targetScheme = scheme.value === "text/html" ? "text/html" : "text/markdown"
  const current = editor.getContent(targetScheme) || ""
  const appended =
    targetScheme === "text/html" ? paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("") : paragraphs.join("\n\n")
  const next = current.trimEnd() + (current.trimEnd() ? "\n\n" : "") + appended + "\n\n"
  editor.setContent(next, targetScheme)
  showToastMessage("已插入到文档末尾", "success")
}

const title = ref("")
const status = ref("draft")
const scheme = ref<"text/markdown" | "text/html">("text/markdown")
const content = ref("")

const versionsDialogOpen = ref(false)
const versionsLoading = ref(false)
const versions = ref<KnowledgeDocumentVersionItem[]>([])
const deletingVersionId = ref<string | null>(null)
const selectedVersionIds = ref<string[]>([])
const batchDeletingVersions = ref(false)
const favorited = ref(false)

/** 版本面板「本地缓存」分区：展示未保存改动 / 保存失败等仅存在于本地的状态 */
const versionsLocalCacheItems = computed(() => {
  const items: Array<{ key: string; title: string; detail: string; tone?: "default" | "warning" }> = []

  if (saveError.value) {
    items.push({
      key: "save-error",
      title: "上次保存失败",
      detail: `${saveError.value} 内容仍保留在当前编辑器中，可重试保存。`,
      tone: "warning",
    })
  }

  if (isDirty.value) {
    items.push({
      key: "dirty",
      title: "未保存的改动",
      detail: "最新编辑暂存在当前编辑器中，保存后写入服务端并生成历史记录。",
      tone: "warning",
    })
  }

  return items
})
const togglingFavorite = ref(false)
const docType = ref<string>("doc")

const editorInstance = ref<unknown>(null)

const showInfoPanel = ref(false)
const showShareDialog = ref(false) // 控制分享对话框显示/隐藏
const showStyleSettings = ref(false) // 控制样式设置对话框显示/隐藏
const showShortcutPanel = ref(false) // 控制快捷键速查面板显示/隐藏

/**
 * 文档级编辑样式（字号/段间距）：以服务端 documents.editorStyle 为准，
 * localStorage 仅作离线兜底；服务端尚未配置但本地有旧值时静默迁移一次。
 */
const DOC_STYLE_STORAGE_PREFIX = "xiaoye:doc-style:"
const DEFAULT_DOC_STYLE: DocEditorStyle = { fontSize: 16, paragraphSpacing: "default" }
const docStyle = ref<DocEditorStyle>({ ...DEFAULT_DOC_STYLE })

/** 存储值可能被手改/损坏：字号收敛到滑杆区间并取整，段间距只认合法档位 */
const normalizeDocStyle = (value: Partial<DocEditorStyle> | null | undefined): DocEditorStyle => {
  const parsed = Number(value?.fontSize)
  const fontSize = Number.isFinite(parsed) ? Math.min(20, Math.max(12, Math.round(parsed))) : DEFAULT_DOC_STYLE.fontSize
  return { fontSize, paragraphSpacing: value?.paragraphSpacing === "relax" ? "relax" : "default" }
}

const readLocalDocStyle = (id: string): DocEditorStyle | null => {
  try {
    const raw = window.localStorage.getItem(DOC_STYLE_STORAGE_PREFIX + id)
    return raw ? normalizeDocStyle(JSON.parse(raw) as Partial<DocEditorStyle>) : null
  } catch {
    return null
  }
}

const writeLocalDocStyle = () => {
  if (!docId.value) return

  try {
    window.localStorage.setItem(DOC_STYLE_STORAGE_PREFIX + docId.value, JSON.stringify(docStyle.value))
  } catch {
    // 存储不可用（隐私模式/配额）时静默降级：样式仅本次会话内生效
  }
}

/** 把样式持久化到服务端；失败不打断编辑（本地 localStorage 仍是兜底） */
const persistEditorStyleToServer = async (style: DocEditorStyle) => {
  try {
    const updated = await updateKnowledgeDocument(docId.value, { editorStyle: style })
    // 样式 PATCH 同样会刷新 updatedAt，同步冲突检测基准避免误报远端更新
    if (snapshot.value) {
      snapshot.value.updatedAt = updated.updatedAt
    }
    return true
  } catch (error) {
    logger.warn("KnowledgeDocEditorView", "persist editor style failed:", error)
    return false
  }
}

/** 文档加载时应用样式：服务端有配置用服务端，否则回落本地并迁移一次 */
const applyServerDocStyle = (document: KnowledgeDocumentItem) => {
  const serverStyle = document.editorStyle
  if (serverStyle && (serverStyle.fontSize !== undefined || serverStyle.paragraphSpacing !== undefined)) {
    docStyle.value = normalizeDocStyle(serverStyle)
    writeLocalDocStyle()
    return
  }

  const localStyle = readLocalDocStyle(document.id)
  docStyle.value = localStyle ?? { ...DEFAULT_DOC_STYLE }
  if (localStyle && canEdit.value) {
    void persistEditorStyleToServer(docStyle.value)
  }
}

const handleDocStyleUpdate = (style: DocEditorStyle) => {
  docStyle.value = style
  writeLocalDocStyle()
  if (canEdit.value) {
    void persistEditorStyleToServer(style)
  }
}

// ==================== 划词评论（锚点持久化在 comments.position） ====================

const authStore = useAuthStore()

/** 编辑器 surface 容器：CommentManager 的 Canvas 高亮与选区监听都挂在它上面 */
const commentSurface = ref<HTMLElement | null>(null)
/** 非响应式：CommentManager 是命令式对象，暴露到模板反而会被代理破坏 */
let commentManager: CommentManager | null = null
const commentItems = ref<DocCommentItem[]>([])
const commentsLoading = ref(false)
const submittingComment = ref(false)
const commentComposeQuote = ref<string | null>(null)
let commentDraftAnchor: HighlightSelection | null = null

const isHighlightAnchor = (value: CommentRecord["position"]): boolean =>
  !!value &&
  typeof value === "object" &&
  Array.isArray((value as unknown as HighlightSelection).startPath) &&
  Array.isArray((value as unknown as HighlightSelection).endPath) &&
  typeof (value as unknown as HighlightSelection).startOffset === "number" &&
  typeof (value as unknown as HighlightSelection).endOffset === "number" &&
  typeof (value as unknown as HighlightSelection).text === "string"

const formatCommentTime = (input: string) => formatDateTime(input)

/** 服务端评论树 → 编辑器核心的评论模型（锚点即 position） */
const toManagerComment = (record: CommentRecord) => ({
  id: record.id,
  content: record.content,
  user: {
    id: record.user?.id ?? "",
    name: record.user?.displayName || record.user?.name || "用户",
    avatar: record.user?.avatar ?? "",
  },
  highlight: isHighlightAnchor(record.position) ? (record.position as unknown as HighlightSelection) : undefined,
  replies: (record.replies ?? []).map(reply => ({
    id: reply.id,
    content: reply.content,
    user: {
      id: reply.user?.id ?? "",
      name: reply.user?.displayName || reply.user?.name || "用户",
      avatar: reply.user?.avatar ?? "",
    },
    createdAt: Date.parse(reply.createdAt) || 0,
  })),
  resolved: record.resolved,
  createdAt: Date.parse(record.createdAt) || 0,
})

/** 服务端评论树 → 面板展示模型 */
const toCommentItems = (records: CommentRecord[]): DocCommentItem[] =>
  records
    .filter(record => !record.parentId)
    .map(record => ({
      id: record.id,
      content: record.content,
      authorName: record.user?.displayName || record.user?.name || "用户",
      authorAvatar: record.user?.avatar ?? null,
      createdAtText: formatCommentTime(record.createdAt),
      resolved: record.resolved,
      quote: isHighlightAnchor(record.position)
        ? String((record.position as unknown as HighlightSelection).text ?? "")
        : null,
      replies: (record.replies ?? []).map(reply => ({
        id: reply.id,
        content: reply.content,
        authorName: reply.user?.displayName || reply.user?.name || "用户",
        createdAtText: formatCommentTime(reply.createdAt),
      })),
    }))

const reloadDocComments = async () => {
  // 阅读模式无评论管理器（无正文高亮），但评论列表仍需可刷新
  if (!docId.value) {
    return
  }

  const requestedDocId = docId.value
  commentsLoading.value = true

  try {
    const records = await getDocumentComments(requestedDocId)
    // 切文档后旧请求晚归：把旧文档的评论 hydrate 进新文档上下文
    if (docId.value !== requestedDocId) {
      return
    }
    commentManager?.hydrate(records.map(toManagerComment))
    commentItems.value = toCommentItems(records)
  } catch (error) {
    logger.warn("KnowledgeDocEditorView", "load comments failed:", error)
  } finally {
    commentsLoading.value = false
  }
}

/** 编辑器或 surface 就绪后初始化评论系统（编辑器重建也会再次触发，需幂等） */
const initCommentSystem = () => {
  const surface = commentSurface.value
  const user = authStore.user

  if (!surface || !user || !editorInstance.value) {
    return
  }

  commentManager?.destroy()
  commentManager = new CommentManager({
    container: surface,
    currentUser: {
      id: user.id,
      name: user.displayName || user.email || user.phone || "用户",
      avatar: user.avatar ?? "",
    },
    showFloatingButton: false,
    onChange: () => undefined,
  })

  void reloadDocComments()
}

const handleCommentSurfaceReady = (surface: HTMLElement) => {
  commentSurface.value = surface
  initCommentSystem()
}

/** 模板不直接访问非响应式的管理器实例，统一走这两个转发 */
const scrollCommentIntoView = (id: string) => {
  commentManager?.scrollToComment(id)
}

const setHoveredComment = (id: string | null) => {
  commentManager?.setHoveredComment(id)
}

const beginCommentFromSelection = () => {
  const anchor = commentManager?.captureSelection() ?? null

  if (!anchor || !anchor.text.trim()) {
    showToastMessage("请先选中正文内容再评论。", "info")
    return
  }

  commentDraftAnchor = anchor
  commentComposeQuote.value = anchor.text
  void openSidePanel("comments")
}

const cancelCommentCompose = () => {
  commentComposeQuote.value = null
  commentDraftAnchor = null
}

const submitDocComment = async (content: string) => {
  if (!docId.value || !commentDraftAnchor || submittingComment.value) return

  submittingComment.value = true

  try {
    const created = await createComment(docId.value, {
      content,
      position: commentDraftAnchor as unknown as Record<string, unknown>,
    })
    cancelCommentCompose()
    await reloadDocComments()
    commentManager?.scrollToComment(created.id)
    showToastMessage("评论已发布。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "发布评论失败", "error")
  } finally {
    submittingComment.value = false
  }
}

const commentActionBusy = ref(false)

const handleCommentReply = async (parentId: string, content: string) => {
  if (!docId.value || commentActionBusy.value) return
  commentActionBusy.value = true
  try {
    await createComment(docId.value, { content, parentId })
    await reloadDocComments()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "回复失败", "error")
  } finally {
    commentActionBusy.value = false
  }
}

const handleCommentResolve = async (id: string, resolved: boolean) => {
  if (commentActionBusy.value) return
  commentActionBusy.value = true
  try {
    await (resolved ? resolveCommentApi(id) : unresolveCommentApi(id))
    await reloadDocComments()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "更新评论状态失败", "error")
  } finally {
    commentActionBusy.value = false
  }
}

const handleCommentDelete = (id: string) => {
  confirmDialog.value = {
    open: true,
    message: "确认删除这条评论吗？",
    onConfirm: async () => {
      try {
        await deleteCommentApi(id)
        await reloadDocComments()
        showToastMessage("评论已删除。", "success")
      } catch (error) {
        showToastMessage(error instanceof Error ? error.message : "删除评论失败", "error")
      }
    },
  }
}

const showVersionCompare = ref(false) // 控制版本对比对话框显示/隐藏
const confirmDialog = ref<{
  open: boolean
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
}>({
  open: false,
  message: "",
  onConfirm: () => {},
})

const snapshot = ref<{
  title: string
  status: string
  scheme: "text/markdown" | "text/html"
  content: string
  updatedAt?: string
} | null>(null)

const autoSaveTimer = ref<number | null>(null)
const lastSavedAt = ref("")
/** 只有本次会话真正保存过才显示「已保存 HH:mm:ss」；载入时的 updatedAt 不代表刚保存 */
const hasSavedInSession = ref(false)

/** 文档信息面板元信息：创建者 / 创建时间（来自详情接口） */
const docCreatorLabel = ref("")
const docCreatedAt = ref("")

/** 文档级有效编辑权限（B2f：KB 权限 或 文档协作者 editor 升权） */
const docCanEdit = ref(false)
const canEdit = computed(() => workspaceContext.permissions.value?.canEdit || docCanEdit.value)
/** 目录行 👁 进入阅读模式：route query preview=1 时强制只读并隐藏工具栏 */
const isPreviewMode = computed(() => route.query.preview === "1")
/**
 * 阅读模式（B2a 对齐语雀阅读页形态）：preview=1 显式进入；
 * 无编辑权限的读者（reader）自动进入。正文只读 + 文末互动区。
 */
const isReadingMode = computed(() => isPreviewMode.value || !canEdit.value)
const docUpdatedAtText = computed(() => (snapshot.value?.updatedAt ? formatDateTime(snapshot.value.updatedAt) : "—"))
const readingCommentDraft = ref("")
const readingCommentsAnchor = ref<HTMLElement | null>(null)

const enterReadingMode = () => {
  void router.replace({ query: { ...route.query, preview: "1" } })
}

const exitReadingMode = () => {
  // query 值置 undefined 时 vue-router 会移除该键
  void router.replace({ query: { ...route.query, preview: undefined } })
}

const scrollToReadingComments = () => {
  readingCommentsAnchor.value?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** 顶栏「讨论」：阅读态滚动到文末评论区，编辑态打开评论侧栏 */
const handleDiscussClick = () => {
  if (isReadingMode.value) {
    scrollToReadingComments()
    return
  }

  void switchSidePanel("comments")
}

/** 文内评论 ⌘/Ctrl+Enter 发布；输入法组词中的 Enter 是确认候选 */
const handleReadingCommentKeydown = (event: KeyboardEvent | Event) => {
  if (!(event instanceof KeyboardEvent)) {
    return
  }
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || isImeComposing(event)) {
    return
  }

  event.preventDefault()
  void submitReadingComment()
}

/** 文内评论（无锚点普通评论）：发布后刷新评论列表 */
const submitReadingComment = async () => {
  const content = readingCommentDraft.value.trim()
  if (!docId.value || !content || submittingComment.value) {
    return
  }

  submittingComment.value = true
  try {
    await createComment(docId.value, { content })
    readingCommentDraft.value = ""
    await reloadDocComments()
    showToastMessage("评论已发布。", "success")
  } catch (error) {
    logger.warn("KnowledgeDocEditorView", "submit reading comment failed:", error)
    showToastMessage(error instanceof Error ? error.message : "评论发布失败，请稍后重试。", "error")
  } finally {
    submittingComment.value = false
  }
}

watch(isReadingMode, reading => {
  // 阅读态不提供侧栏面板入口；进入时收起避免残留
  if (reading) {
    closeAllSidePanels()
  }
})
const workspaceName = computed(() => workspaceContext.knowledgeBase.value?.name || "知识库")
const schemeLabel = computed(() => (scheme.value === "text/html" ? "HTML" : "Markdown"))
const documentModeLabel = computed(() => (canEdit.value ? "编辑态" : "只读态"))
const selectedVersionCount = computed(() => selectedVersionIds.value.length)
const allVersionsSelected = computed(() => {
  if (versions.value.length === 0) {
    return false
  }

  return versions.value.every(version => selectedVersionIds.value.includes(version.id))
})
const versionDeleteBusy = computed(() => batchDeletingVersions.value || deletingVersionId.value !== null)
// 顶栏协作者头像堆叠：对齐语雀心智，仅展示“其他协作者”（自己在右上角全局头像体现）
const collaboratorsForHeader = computed(() =>
  workspaceMembers.value.filter(member => member.userId !== authStore.user?.id)
)
const visibleCollaborators = computed(() => collaboratorsForHeader.value.slice(0, 3))
const remainingCollaboratorCount = computed(() =>
  Math.max(collaboratorsForHeader.value.length - visibleCollaborators.value.length, 0)
)
const collaboratorsDialogOpen = ref(false)
const collaboratorsDialog = useDialogBehavior({
  open: () => collaboratorsDialogOpen.value,
})
// P-C1 协作感知：WS 房间在线成员与本人保存广播
const collabChannel = ref<DocCollabChannel | null>(null)
const onlinePresence = ref<CollabPresenceMember[]>([])
const onlineUserIds = computed(() => new Set(onlinePresence.value.map(m => m.userId)))
const onlineCollabCount = computed(() => onlinePresence.value.length)
const collaboratorButtonTitle = computed(() => {
  const base = `查看协作者（${collaboratorsForHeader.value.length} 人`
  return onlineCollabCount.value > 0 ? `${base} · ${onlineCollabCount.value} 人在线）` : `${base}）`
})
const collaboratorRoleLabel: Record<KnowledgeBaseMember["role"], string> = {
  owner: "创建者",
  admin: "管理员",
  editor: "可编辑",
  reader: "只读",
}

// ==================== B2f 文档级协作者 ====================
const docCollaborators = ref<DocumentCollaboratorItem[]>([])
const docCollaboratorsLoading = ref(false)
const docCollabBusy = ref(false)
const inviteEmail = ref("")
const inviteRole = ref<"editor" | "reader">("editor")
/** 是否可管理文档协作者（详情接口返回：KB manage 或文档创建者） */
const canManageDocCollaborators = ref(false)
const docCollabRoleLabel: Record<"editor" | "reader", string> = {
  editor: "可编辑",
  reader: "只读",
}

const loadDocCollaborators = async () => {
  if (!docId.value) {
    return
  }

  docCollaboratorsLoading.value = true
  try {
    docCollaborators.value = await listDocumentCollaborators(docId.value, authStore.accessToken)
  } catch {
    docCollaborators.value = []
  } finally {
    docCollaboratorsLoading.value = false
  }
}

const handleAddDocCollaborator = async () => {
  const email = inviteEmail.value.trim()
  if (!email || docCollabBusy.value) {
    return
  }

  docCollabBusy.value = true
  try {
    await addDocumentCollaborator(docId.value!, { email, role: inviteRole.value }, authStore.accessToken)
    inviteEmail.value = ""
    showToastMessage("协作者已添加。", "success")
    await loadDocCollaborators()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "添加协作者失败。", "error")
  } finally {
    docCollabBusy.value = false
  }
}

const handleDocCollaboratorRoleChange = async (collaborator: DocumentCollaboratorItem, role: "editor" | "reader") => {
  if (collaborator.role === role || docCollabBusy.value) {
    return
  }

  docCollabBusy.value = true
  try {
    const updated = await updateDocumentCollaborator(docId.value!, collaborator.id, { role }, authStore.accessToken)
    docCollaborators.value = docCollaborators.value.map(item => (item.id === updated.id ? updated : item))
    showToastMessage(`已设为${docCollabRoleLabel[updated.role]}。`, "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "修改角色失败。", "error")
  } finally {
    docCollabBusy.value = false
  }
}

const handleRemoveDocCollaborator = async (collaborator: DocumentCollaboratorItem) => {
  if (docCollabBusy.value) {
    return
  }

  docCollabBusy.value = true
  try {
    await removeDocumentCollaborator(docId.value!, collaborator.id, authStore.accessToken)
    docCollaborators.value = docCollaborators.value.filter(item => item.id !== collaborator.id)
    showToastMessage("协作者已移除。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "移除协作者失败。", "error")
  } finally {
    docCollabBusy.value = false
  }
}

watch(collaboratorsDialogOpen, open => {
  if (open) {
    void loadDocCollaborators()
  }
})
const activeSidePanel = computed<DocSidePanelTab | null>(() => {
  if (versionsDialogOpen.value) {
    return "versions"
  }

  if (commentsPanelOpen.value) {
    return "comments"
  }

  if (aiPanelOpen.value) {
    return "ai"
  }

  if (showInfoPanel.value) {
    return "info"
  }

  return null
})
const statusMeta = computed(() => {
  if (status.value === "published") {
    return {
      label: "已发布",
      className: "border-brand-lighter bg-brand-faint text-brand",
      icon: "i-lucide-check",
    }
  }

  if (status.value === "pending") {
    return {
      label: "待审核",
      className: "border-warning-light bg-warning-bg text-warning-hover",
      icon: "i-lucide-clock",
    }
  }

  if (status.value === "archived") {
    return {
      label: "已归档",
      className: "border-line bg-muted text-ink-tertiary",
      icon: "i-lucide-archive",
    }
  }

  return {
    label: "草稿",
    className: "border-line bg-surface text-ink-tertiary",
    icon: "i-lucide-file-edit",
  }
})
const saveStatusLabel = computed(() => {
  if (saveError.value) {
    return "同步异常"
  }

  if (!isOnline.value) {
    return "离线编辑"
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

  return "已加载最新版"
})

/** 干净态文案：刚保存过就报「已保存 时刻」（语雀顶栏口径），否则报已加载最新版本 */
const loadedStateLabel = computed(() =>
  hasSavedInSession.value ? `已保存 ${formatClockTime(lastSavedAt.value)}` : "已加载最新版本"
)

const savePrimaryActionLabel = computed(() => {
  if (saveError.value) {
    return "重试保存"
  }

  if (isDirty.value) {
    return "保存"
  }

  return "再次保存"
})

const outlineItems = computed<DocumentOutlineItem[]>(() => {
  return extractDocumentOutline(content.value, scheme.value)
})

const plainTextContent = computed(() => {
  return extractDocumentPlainText(content.value, scheme.value)
})

const editorWordCountLabel = computed(() => `${plainTextContent.value.length} 字`)
const headerFeedbackItems = computed(() => {
  const items: Array<{
    key: string
    label: string
    detail?: string
    icon: string
    className: string
    onClick: () => void
  }> = []

  if (saveError.value && canEdit.value) {
    items.push({
      key: "save-error",
      label: "同步异常，重试保存",
      detail: saveError.value,
      icon: "i-lucide-cloud-alert",
      className:
        "border-error-light bg-error-bg text-error-hover hover:border-error-hover hover:bg-error-bg hover:text-error-active",
      onClick: () => {
        void saveDocument()
      },
    })
  }

  if (remoteConflict.value) {
    items.push({
      key: "remote-conflict",
      label: "远端已有更新，加载最新版本",
      detail: `${remoteConflict.value.title} · ${formatDateTime(remoteConflict.value.updatedAt)}`,
      icon: "i-lucide-refresh-cw",
      className:
        "border-warning-light bg-warning-bg text-warning-active hover:border-warning-hover hover:bg-warning-bg hover:text-warning-active",
      onClick: () => {
        void reloadRemoteDocument()
      },
    })
  }

  return items
})
const canOpenVersionCompare = computed(() => versions.value.length >= 2)
const activeSidePanelLabel = computed(() => {
  if (activeSidePanel.value === "comments") {
    return "讨论"
  }

  if (activeSidePanel.value === "versions") {
    return "历史版本"
  }

  if (activeSidePanel.value === "info") {
    return "文档信息"
  }

  if (activeSidePanel.value === "ai") {
    return "AI 助手"
  }

  return ""
})

const documentInfoStats = computed(() => [
  { label: "字数", value: `${plainTextContent.value.length}` },
  { label: "标题", value: `${outlineItems.value.length}` },
  { label: "协作", value: `${workspaceMembers.value.length}` },
])

/** 对齐语雀信息面板：创建者 / 创建时间 / 更新时间 */
const documentInfoMeta = computed(() => [
  { label: "创建者", value: docCreatorLabel.value || "—" },
  { label: "创建时间", value: docCreatedAt.value ? formatDateTime(docCreatedAt.value) : "—" },
  { label: "更新时间", value: snapshot.value?.updatedAt ? formatDateTime(snapshot.value.updatedAt) : "—" },
])

const documentInfoShortcuts = computed(() => {
  // 注意：全文搜索与 "/" 块菜单随 TipTap 下线后均未经 Lake 内核实测，不再展示为可用快捷键
  const shortcuts: Array<{ id: string; label: string; keys: string[]; description: string }> = []

  if (canEdit.value) {
    shortcuts.unshift({
      id: "save",
      label: "保存文档",
      keys: ["Ctrl/Cmd", "S"],
      description: "手动触发一次立即保存，适合确认修改已同步。",
    })
  }

  return shortcuts
})

const infoPanelCollaborators = computed(() =>
  workspaceMembers.value.slice(0, 8).map(member => ({
    id: member.id,
    label: member.user.displayName || member.user.email || "协作者",
    role:
      member.role === "owner"
        ? "所有者"
        : member.role === "admin"
          ? "管理员"
          : member.role === "editor"
            ? "编辑者"
            : "阅读者",
    avatar: member.user.avatar || null,
  }))
)

const handleEditorReady = (editor: unknown) => {
  editorInstance.value = editor
  // 编辑器重建（字号/段间距切换、docId 变化）都会再次走到这里，需要幂等重建
  initCommentSystem()
  mountDocTitleHost()
}

/**
 * 语雀编辑页的文档标题以大字号呈现在正文列顶部（工具栏之下、正文之上）。
 * Lake 的 DOM 由内核自管，这里在 .ne-ui（工具栏）后插入宿主节点，
 * 由模板里的 Teleport 渲染标题；编辑器重建时旧宿主随旧 DOM 一起丢弃。
 */
const docTitleHost = ref<HTMLElement | null>(null)
const mountDocTitleHost = () => {
  const surface = document.querySelector(".yuque-doc-editor__surface .ne-editor")
  const toolbar = surface?.querySelector(".ne-ui")

  if (!surface || !toolbar) {
    return
  }

  const host = document.createElement("div")
  host.className = "doc-title-host"
  toolbar.after(host)
  docTitleHost.value = host
}

const handleRequestTemplateLibrary = () => {
  workspaceContext.openTemplateLibrary()
}

const ensureEditPermission = (message = "当前角色没有编辑权限。") => {
  if (canEdit.value) {
    return true
  }

  showToastMessage(message, "error")
  return false
}

// 编辑器媒体上传公共链路：权限/文档校验 → OSS 服务端中转 → 公开 URL。
// 图片/视频/音频/附件四类卡片共用；URL 组装与降级策略在 knowledge-oss.ts。
const uploadEditorAsset = async (file: File, kind: string): Promise<string> => {
  if (!ensureEditPermission(`当前文档为只读模式，无法上传${kind}。`)) {
    throw new Error(`当前文档为只读模式，无法上传${kind}。`)
  }

  if (!docId.value) {
    throw new Error(`文档标识缺失，无法上传${kind}。`)
  }

  try {
    const uploadResult = await uploadKnowledgeAsset({
      file,
      kbId: workspaceContext.kbId.value,
      docId: docId.value,
    })

    return uploadResult.url
  } catch (error) {
    logger.error("KnowledgeDocEditorView", `${kind} upload failed:`, error)
    throw error
  }
}

const handleImageUpload = (file: File) => uploadEditorAsset(file, "图片")
const handleVideoUpload = (file: File) => uploadEditorAsset(file, "视频")
const handleFileUpload = (file: File) => uploadEditorAsset(file, "附件")
const handleAudioUpload = (file: File) => uploadEditorAsset(file, "音频")

const editorContentType = computed<"markdown" | "html">(() => {
  return scheme.value === "text/html" ? "html" : "markdown"
})

const isDirty = computed(() => {
  if (!snapshot.value) {
    return false
  }

  return (
    title.value !== snapshot.value.title ||
    status.value !== snapshot.value.status ||
    scheme.value !== snapshot.value.scheme ||
    content.value !== snapshot.value.content
  )
})

const getCollaboratorInitial = (member: KnowledgeBaseMember) => {
  const source = member.user.displayName || member.user.email || "协作者"
  return source.trim().charAt(0).toUpperCase()
}

const clearRetrySaveTimer = () => {
  if (retrySaveTimer.value !== null) {
    window.clearTimeout(retrySaveTimer.value)
    retrySaveTimer.value = null
  }
}

const queueSaveRequest = (options?: {
  silent?: boolean
  auto?: boolean
  reason?: "typing" | "manual" | "retry" | "offline"
}) => {
  const existing = pendingSaveRequest.value
  const next: NonNullable<typeof existing> = {
    silent: options?.silent ?? true,
    auto: options?.auto ?? true,
    reason: options?.reason ?? "typing",
  }

  // 合并而非整体覆盖：先排队的 manual/offline 意图不被后到的 typing/auto 挤掉
  if (existing) {
    next.silent = next.silent && existing.silent
    next.auto = next.auto && existing.auto
    if (existing.reason === "offline" || next.reason === "offline") {
      next.reason = "offline"
    } else if (existing.reason === "manual" || next.reason === "manual") {
      next.reason = "manual"
    }
  }

  pendingSaveRequest.value = next
}

const clearRemoteCheckTimer = () => {
  if (remoteCheckTimer.value !== null) {
    window.clearTimeout(remoteCheckTimer.value)
    remoteCheckTimer.value = null
  }
}

const clearVersionSelection = () => {
  selectedVersionIds.value = []
}

const syncSelectedVersions = () => {
  const validVersionIds = new Set(versions.value.map(version => version.id))
  selectedVersionIds.value = selectedVersionIds.value.filter(id => validVersionIds.has(id))
}

const toggleVersionSelection = (versionId: string) => {
  if (versionDeleteBusy.value) {
    return
  }

  if (selectedVersionIds.value.includes(versionId)) {
    selectedVersionIds.value = selectedVersionIds.value.filter(id => id !== versionId)
    return
  }

  selectedVersionIds.value = [...selectedVersionIds.value, versionId]
}

const toggleAllVersions = () => {
  if (versionDeleteBusy.value) {
    return
  }

  selectedVersionIds.value = allVersionsSelected.value ? [] : versions.value.map(version => version.id)
}

const normalizeDocument = (document: KnowledgeDocumentItem) => {
  const docContent =
    document.content?.scheme === "text/html" || document.content?.scheme === "text/markdown"
      ? document.content.value
      : ""
  const docScheme = document.content?.scheme === "text/html" ? "text/html" : "text/markdown"

  title.value = document.title
  status.value = document.status || "draft"
  scheme.value = docScheme
  content.value = docContent
  docType.value = document.type || "doc"
  // PATCH 等部分响应可能不带 creator，保留旧值避免清空；详情接口始终返回
  if (document.creator) {
    docCreatorLabel.value = document.creator.displayName || ""
  }

  if (document.createdAt) {
    docCreatedAt.value = document.createdAt
  }
  applyServerDocStyle(document)

  snapshot.value = {
    title: document.title,
    status: status.value,
    scheme: docScheme,
    content: docContent,
    updatedAt: document.updatedAt,
  }

  lastSavedAt.value = document.updatedAt
  hasSavedInSession.value = false

  saveError.value = ""
  remoteConflict.value = null
}

const loadCollaborators = async () => {
  if (!workspaceContext.kbId.value) {
    workspaceMembers.value = []
    return
  }

  try {
    workspaceMembers.value = await getKnowledgeBaseMembers(workspaceContext.kbId.value)
  } catch {
    workspaceMembers.value = []
  }
}

/**
 * 加载文档的请求序号：docId 快速切换时旧请求晚归会以过期数据覆盖新文档。
 * 每次 loadDocument 令序号 +1，只有在途序号仍等于最新时才会写回页面状态。
 */
let documentLoadSeq = 0

const loadDocument = async () => {
  const targetDocId = docId.value

  if (!targetDocId) {
    return
  }

  const seq = ++documentLoadSeq
  loading.value = true
  errorMessage.value = ""

  try {
    const document = await getKnowledgeDocument(targetDocId)

    if (seq !== documentLoadSeq) {
      return
    }

    docCanEdit.value = Boolean(document.myDocPermissions?.canEdit)
    canManageDocCollaborators.value = Boolean(document.myDocPermissions?.canManageCollaborators)

    if (isBoardDocument(document)) {
      await router.replace(
        getKnowledgeDocumentRouteTarget({
          kbId: workspaceContext.kbId.value,
          docId: document.id,
          editorType: document.editorType,
        })
      )
      return
    }

    normalizeDocument(document)
    void loadCollaborators()
    recordKnowledgeDocumentView(targetDocId).catch(() => undefined)
    checkKnowledgeFavorite(targetDocId)
      .then(result => {
        if (seq === documentLoadSeq) {
          favorited.value = result.favorited
        }
      })
      .catch(() => {
        if (seq === documentLoadSeq) {
          favorited.value = false
        }
      })
  } catch (error) {
    if (seq === documentLoadSeq) {
      errorMessage.value = error instanceof Error ? error.message : "加载文档失败。"
    }
  } finally {
    if (seq === documentLoadSeq) {
      loading.value = false
    }
  }
}

const toggleFavorite = async () => {
  if (!docId.value || togglingFavorite.value) {
    return
  }

  togglingFavorite.value = true

  try {
    if (favorited.value) {
      await removeKnowledgeFavorite(docId.value)
      favorited.value = false
      showToastMessage("已取消收藏。", "success")
      return
    }

    await addKnowledgeFavorite(docId.value)
    favorited.value = true
    showToastMessage("已收藏。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "更新收藏状态失败。", "error")
  } finally {
    togglingFavorite.value = false
  }
}

const toggleTemplate = async () => {
  if (!ensureEditPermission()) return
  if (!docId.value) return
  const newType = docType.value === "template" ? "doc" : "template"
  try {
    const updated = await updateKnowledgeDocument(docId.value, { type: newType })
    docType.value = updated.type || "doc"
    showToastMessage(newType === "template" ? "已设为模板。" : "已取消模板。", "success")
    await workspaceContext.refreshTree()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "操作失败。", "error")
  }
}

const saveDocument = async (options?: { silent?: boolean; auto?: boolean }) => {
  if (!canEdit.value) {
    if (!options?.silent) {
      showToastMessage("当前文档为只读模式，无法保存。", "error")
    }

    return false
  }

  if (!docId.value) {
    return false
  }

  // Lake 内部命令（如查找替换 replaceAll）不触发 contentchange，content ref 会
  // 停留在替换前的内容——保存前以编辑器实时内容为准同步一次，避免保存旧值。
  // 仅保存路径同步：不用于打开态的脏检查（内核序列化与存储原文存在恒定格式差异）。
  const liveEditor = editorInstance.value as YuqueEditorRef | null
  if (liveEditor && isOnline.value) {
    const liveContent = liveEditor.getContent(scheme.value === "text/html" ? "text/html" : "text/markdown")
    if (liveContent && liveContent !== content.value) {
      content.value = liveContent
    }
  }

  if (!isDirty.value) {
    pendingSaveRequest.value = null
    return false
  }

  if (saving.value || autoSaving.value) {
    queueSaveRequest({
      silent: options?.silent ?? false,
      auto: options?.auto ?? false,
      reason: options?.auto ? "typing" : "manual",
    })
    return false
  }

  const normalizedTitle = title.value.trim()

  if (!normalizedTitle) {
    showToastMessage("标题不能为空。", "error")
    return false
  }

  if (!isOnline.value) {
    queueSaveRequest({
      silent: true,
      auto: true,
      reason: "offline",
    })
    saveError.value = "当前网络不可用，已加入自动重试队列。"

    if (!options?.silent) {
      showToastMessage("当前离线，恢复网络后会自动重试保存。", "error")
    }

    return false
  }

  if (options?.auto) {
    autoSaving.value = true
  } else {
    saving.value = true
  }

  saveError.value = ""
  clearRetrySaveTimer()

  // 快照发起保存时的文档 id：await 期间用户可能已切走，
  // 旧文档的响应绝不能回写新文档的状态（否则 A 的内容会被标进 B，再次保存即污染）
  const savedDocId = docId.value

  try {
    const updated = await updateKnowledgeDocument(savedDocId, {
      title: normalizedTitle,
      status: status.value,
      content: {
        scheme: scheme.value,
        value: content.value,
      },
    })

    if (docId.value !== savedDocId) {
      // 请求已成功提交到旧文档，但当前编辑器已是另一篇，不回写任何状态
      return true
    }

    normalizeDocument(updated)
    pendingSaveRequest.value = null
    retryAttempt.value = 0
    collabChannel.value?.sendDocUpdated()
    lastSavedAt.value = new Date().toISOString()
    hasSavedInSession.value = true
    await workspaceContext.refreshTree()

    if (!options?.silent) {
      showToastMessage("文档已保存。", "success")
    }

    return true
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "保存失败，请稍后重试。"
    const errorStatus = getApiErrorStatus(error)
    const retryable =
      !isOnline.value ||
      errorStatus === null ||
      errorStatus >= 500 ||
      /network|fetch|timeout|超时|离线|断网/i.test(saveError.value)

    if (retryable) {
      queueSaveRequest({
        silent: true,
        auto: true,
        reason: !isOnline.value ? "offline" : "retry",
      })
      retryAttempt.value = Math.min(retryAttempt.value + 1, 6)
    }

    if (!options?.silent) {
      showToastMessage(
        retryable ? `${saveError.value} 已加入重试队列。` : saveError.value,
        retryable ? "info" : "error"
      )
    }

    return false
  } finally {
    if (options?.auto) {
      autoSaving.value = false
    } else {
      saving.value = false
    }

    if (pendingSaveRequest.value && isOnline.value && !saving.value && !autoSaving.value) {
      const delay = pendingSaveRequest.value.reason === "retry" ? Math.min(12000, 1500 * 2 ** retryAttempt.value) : 160
      retrySaveTimer.value = window.setTimeout(() => {
        retrySaveTimer.value = null
        void flushPendingSave()
      }, delay)
    }
  }
}

const flushPendingSave = async () => {
  if (!pendingSaveRequest.value || !isOnline.value || saving.value || autoSaving.value || !isDirty.value) {
    return false
  }

  const request = pendingSaveRequest.value
  pendingSaveRequest.value = null

  return saveDocument({
    silent: request.silent,
    auto: request.auto,
  })
}

const clearAutoSaveTimer = () => {
  if (autoSaveTimer.value !== null) {
    window.clearTimeout(autoSaveTimer.value)
    autoSaveTimer.value = null
  }
}

const scheduleAutoSave = () => {
  clearAutoSaveTimer()
  if (!canEdit.value || loading.value || !isDirty.value) {
    return
  }

  if (!isOnline.value) {
    queueSaveRequest({
      silent: true,
      auto: true,
      reason: "offline",
    })
    return
  }

  if (saving.value || autoSaving.value) {
    queueSaveRequest({
      silent: true,
      auto: true,
      reason: "typing",
    })
    return
  }

  autoSaveTimer.value = window.setTimeout(() => {
    autoSaveTimer.value = null
    void saveDocument({ auto: true, silent: true })
  }, 1200)
}

const deleteDocument = () => {
  if (!ensureEditPermission()) return
  if (!docId.value) return
  confirmDialog.value = {
    open: true,
    message: "确认将当前文档移入回收站吗？",
    onConfirm: async () => {
      try {
        await trashKnowledgeDocument(docId.value)
        await workspaceContext.refreshTree()
        showToastMessage("文档已移入回收站。", "success")
        router.push({ name: "knowledge-workspace-home", params: { kbId: workspaceContext.kbId.value } })
      } catch (error) {
        showToastMessage(error instanceof Error ? error.message : "删除失败。", "error")
      }
    },
  }
}

const openVersions = async () => {
  if (!docId.value) {
    return
  }

  await openSidePanel("versions")
}

let versionsLoadSeq = 0

const loadVersions = async () => {
  if (!docId.value) {
    return false
  }

  const seq = ++versionsLoadSeq
  const requestedDocId = docId.value
  versionsLoading.value = true

  try {
    const loaded = await listKnowledgeDocumentVersions(requestedDocId)
    // 序号比对防同文档重复刷新互踩；docId 比对防切换文档后旧响应晚归回写
    if (seq !== versionsLoadSeq || docId.value !== requestedDocId) {
      return false
    }
    versions.value = loaded
    syncSelectedVersions()
    return true
  } catch (error) {
    if (seq === versionsLoadSeq && docId.value === requestedDocId) {
      showToastMessage(error instanceof Error ? error.message : "加载历史版本失败。", "error")
    }
    return false
  } finally {
    if (seq === versionsLoadSeq && docId.value === requestedDocId) {
      versionsLoading.value = false
    }
  }
}

const ensureVersionsLoaded = async () => {
  if (!docId.value) {
    return false
  }

  if (versionsLoading.value) {
    return false
  }

  if (versions.value.length > 0) {
    return true
  }

  return loadVersions()
}

const openVersionCompare = async () => {
  const loaded = await ensureVersionsLoaded()

  if (!loaded) {
    return
  }

  if (versions.value.length < 2) {
    showToastMessage("至少需要两个历史版本才能进行对比。", "info")
    return
  }

  showVersionCompare.value = true
}

const deleteVersion = (versionId: string) => {
  if (!docId.value || versionDeleteBusy.value) {
    return
  }

  confirmDialog.value = {
    open: true,
    message: "确认删除此历史版本吗？该操作不可恢复。",
    onConfirm: async () => {
      if (!docId.value) {
        return
      }

      deletingVersionId.value = versionId

      try {
        await deleteKnowledgeDocumentVersion(docId.value, versionId)
        await loadVersions()

        if (versions.value.length < 2) {
          showVersionCompare.value = false
        }

        showToastMessage("历史版本已删除。", "success")
      } catch (error) {
        showToastMessage(error instanceof Error ? error.message : "删除历史版本失败。", "error")
      } finally {
        deletingVersionId.value = null
      }
    },
  }
}

const deleteSelectedVersions = () => {
  if (!docId.value || selectedVersionIds.value.length === 0 || versionDeleteBusy.value) {
    return
  }

  const targetVersionIds = [...selectedVersionIds.value]

  confirmDialog.value = {
    open: true,
    message: `确认删除选中的 ${targetVersionIds.length} 个历史版本吗？该操作不可恢复。`,
    onConfirm: async () => {
      if (!docId.value) {
        return
      }

      batchDeletingVersions.value = true
      let deletedCount = 0

      try {
        for (const versionId of targetVersionIds) {
          deletingVersionId.value = versionId
          await deleteKnowledgeDocumentVersion(docId.value, versionId)
          deletedCount += 1
        }

        await loadVersions()
        clearVersionSelection()

        if (versions.value.length < 2) {
          showVersionCompare.value = false
        }

        showToastMessage(`已删除 ${deletedCount} 个历史版本。`, "success")
      } catch (error) {
        await loadVersions()

        if (versions.value.length < 2) {
          showVersionCompare.value = false
        }

        const fallbackMessage = error instanceof Error ? error.message : "批量删除历史版本失败。"
        showToastMessage(
          deletedCount > 0 ? `已删除 ${deletedCount} 个历史版本，剩余删除失败：${fallbackMessage}` : fallbackMessage,
          deletedCount > 0 ? "info" : "error"
        )
      } finally {
        deletingVersionId.value = null
        batchDeletingVersions.value = false
      }
    },
  }
}

const rollbackVersion = (versionId: string) => {
  if (!docId.value || versionDeleteBusy.value) return
  confirmDialog.value = {
    open: true,
    message: "确认回滚到此版本吗？当前未保存内容将丢失。",
    onConfirm: async () => {
      try {
        const updated = await rollbackKnowledgeDocumentVersion(docId.value, versionId)
        normalizeDocument(updated)
        await workspaceContext.refreshTree()
        closeSidePanels(null)
        showToastMessage("已回滚到选中版本。", "success")
      } catch (error) {
        showToastMessage(error instanceof Error ? error.message : "回滚失败。", "error")
      }
    },
  }
}

const printDocument = async () => {
  const win = window.open("", "_blank")
  if (!win) return
  win.document.write(
    await renderKnowledgeDocumentHtmlWithMermaid(title.value, content.value, editorContentType.value, markdown)
  )
  win.document.close()

  await new Promise<void>(resolve => {
    win.onload = () => resolve()
    window.setTimeout(() => resolve(), 300)
  })

  win.focus()
  win.print()
}

const exportMarkdown = async () => {
  const { exportAsMarkdown } = await loadDocumentExportTools()
  // 优先用编辑器实例跨 scheme 转出 Markdown（Lake 模型级转换，卡片语义更准）；
  // 编辑器未就绪时 HTML 文档退回 turndown 转换，Markdown 文档直接用原文
  const editor = editorInstance.value as YuqueEditorRef | null
  if (editor) {
    exportAsMarkdown(title.value, editor.getContent("text/markdown"))
    return
  }
  await exportAsMarkdown(title.value, content.value, editorContentType.value)
}

/** 导出语雀文档（.lake）：JSON 容器原样携带 scheme 与文档模型内容，可无损回导 */
const exportLake = async () => {
  const { exportAsLake } = await loadDocumentExportTools()
  await exportAsLake(title.value, content.value, editorContentType.value)
}

/**
 * 复制为 Markdown（对齐语雀文档头「复制为 markdown 格式」）。
 * 优先走 Lake 的 getContent("text/markdown")——即便文档本体是 HTML scheme，
 * 内核也能从内部文档模型转出 Markdown；编辑器未就绪时回退到原文（仅 Markdown 文档）。
 */
const copyDocumentAsMarkdown = async () => {
  const editor = editorInstance.value as YuqueEditorRef | null
  const markdownText = editor
    ? editor.getContent("text/markdown")
    : editorContentType.value === "markdown"
      ? content.value
      : ""

  if (!markdownText.trim()) {
    // HTML 文档在编辑器未就绪时拿不到内核模型，无法就地转 Markdown（与空文档区分提示）
    showToastMessage(
      editor ? "文档内容为空，没有可复制的内容。" : "编辑器尚未就绪，无法转换 Markdown，请稍后重试。",
      "info"
    )
    return
  }

  if (typeof navigator === "undefined" || !navigator.clipboard) {
    showToastMessage("当前环境不支持剪贴板，请使用导出功能。", "error")
    return
  }

  try {
    await navigator.clipboard.writeText(markdownText)
    showToastMessage("已复制为 Markdown。", "success")
  } catch (error) {
    logger.error("KnowledgeDocEditorView", "copy as markdown failed:", error)
    showToastMessage("复制失败，请稍后重试。", "error")
  }
}

const exportPDF = async () => {
  try {
    const { exportAsPDF } = await loadDocumentExportTools()
    showToastMessage("正在生成 PDF，请稍候…", "info")
    await exportAsPDF(title.value, content.value, editorContentType.value)
    showToastMessage("PDF 导出成功", "success")
  } catch (error) {
    logger.error("KnowledgeDocEditorView", "PDF export failed:", error)
    showToastMessage("PDF 导出失败", "error")
  }
}

const exportWord = async () => {
  try {
    const { exportAsWord } = await loadDocumentExportTools()
    showToastMessage("正在生成 Word 文档，请稍候…", "info")
    await exportAsWord(title.value, content.value, editorContentType.value)
    showToastMessage("Word 导出成功", "success")
  } catch (error) {
    logger.error("KnowledgeDocEditorView", "Word export failed:", error)
    showToastMessage("Word 导出失败", "error")
  }
}

// P-C1 增强：轮询（20s）与 WS 即时触发可能并发检查，用序号丢弃过期结果，
// 避免慢请求的旧数据覆盖新拉取内容
let remoteCheckSeq = 0

const checkRemoteConflict = async () => {
  if (
    !docId.value ||
    !isOnline.value ||
    loading.value ||
    saving.value ||
    autoSaving.value ||
    (typeof document !== "undefined" && document.visibilityState !== "visible")
  ) {
    return
  }

  const seq = ++remoteCheckSeq
  try {
    const latestDocument = await getKnowledgeDocument(docId.value)
    // 期间已有更新的检查发起，本次结果已过期
    if (seq !== remoteCheckSeq) {
      return
    }
    const latestUpdatedAt = latestDocument.updatedAt
    const baseUpdatedAt = snapshot.value?.updatedAt ?? ""

    if (!latestUpdatedAt || !baseUpdatedAt || latestUpdatedAt === baseUpdatedAt) {
      remoteConflict.value = null
      return
    }

    if (isDirty.value) {
      remoteConflict.value = {
        title: latestDocument.title,
        updatedAt: latestUpdatedAt,
      }
      return
    }

    normalizeDocument(latestDocument)
  } catch {
    // ignore background conflict checks
  }
}

const scheduleRemoteConflictCheck = () => {
  clearRemoteCheckTimer()

  if (!docId.value || !canEdit.value) {
    return
  }

  remoteCheckTimer.value = window.setTimeout(async () => {
    remoteCheckTimer.value = null
    await checkRemoteConflict()
    scheduleRemoteConflictCheck()
  }, 20000)
}

/**
 * P-C1 协作感知：建立/拆除当前文档的 WS 房间连接。
 * presence 驱动顶栏头像在线绿点；doc:changed 驱动即时远端冲突检测
 * （非脏直接拉取最新，脏则落入 remoteConflict 提示）。
 */
const teardownCollabChannel = () => {
  collabChannel.value?.close()
  collabChannel.value = null
  onlinePresence.value = []
}

const setupCollabChannel = () => {
  teardownCollabChannel()
  const token = authStore.accessToken
  const kbId = workspaceContext.kbId.value
  if (!docId.value || !token || !kbId) {
    return
  }

  collabChannel.value = openDocCollabChannel({
    token,
    kbId,
    docId: docId.value,
    onPresence: members => {
      onlinePresence.value = members
    },
    onDocChanged: actor => {
      if (isDirty.value) {
        showToastMessage(`${actor.displayName || "协作者"} 已更新文档，请留意冲突提示。`, "info")
      } else {
        showToastMessage(`${actor.displayName || "协作者"} 已更新文档，已加载最新内容。`, "info")
      }
      void checkRemoteConflict()
    },
  })
}

const performReloadRemoteDocument = async () => {
  if (!docId.value) {
    return
  }

  await loadDocument()
  remoteConflict.value = null
  showToastMessage("已加载远端最新版本。", "success")
}

const reloadRemoteDocument = async () => {
  if (!docId.value) {
    return
  }

  if (isDirty.value) {
    // 有未保存修改时必须显式确认覆盖；走全站统一的 ConfirmDialog 而非原生 confirm
    confirmDialog.value = {
      open: true,
      message: "检测到远端已更新文档。刷新后会覆盖当前未保存修改，是否继续加载远端版本？",
      confirmText: "重新加载",
      danger: false,
      onConfirm: () => {
        confirmDialog.value.open = false
        void performReloadRemoteDocument()
      },
    }
    return
  }

  await performReloadRemoteDocument()
}

const handleOnline = () => {
  isOnline.value = true

  if (pendingSaveRequest.value) {
    showToastMessage("网络已恢复，正在继续同步文档。", "success")
    void flushPendingSave()
  }

  void checkRemoteConflict()
}

const handleOffline = () => {
  isOnline.value = false

  if (isDirty.value) {
    queueSaveRequest({
      silent: true,
      auto: true,
      reason: "offline",
    })
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState !== "visible") {
    return
  }

  if (pendingSaveRequest.value) {
    void flushPendingSave()
  }

  void checkRemoteConflict()
}

const handleSaveShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    // 输入法组词中的 ⌘S 属于输入法操作序列，不触发保存
    if (!canEdit.value || isImeComposing(event)) {
      return
    }

    event.preventDefault()
    void saveDocument()
  }
}

const commentsPanelOpen = ref(false)
const aiPanelOpen = ref(false)

const closeSidePanels = (nextTab: DocSidePanelTab | null = null) => {
  versionsDialogOpen.value = nextTab === "versions"
  showInfoPanel.value = nextTab === "info"
  commentsPanelOpen.value = nextTab === "comments"
  aiPanelOpen.value = nextTab === "ai"
}

const openSidePanel = async (tab: DocSidePanelTab) => {
  closeSidePanels(tab)

  if (tab === "versions") {
    await loadVersions()
  }

  if (tab === "comments") {
    await reloadDocComments()
  }

  return true
}

const switchSidePanel = async (tab: DocSidePanelTab | null) => {
  if (tab === null || activeSidePanel.value === tab) {
    closeSidePanels(null)
    return
  }

  await openSidePanel(tab)
}

const toggleInfoPanel = () => {
  void switchSidePanel("info")
}

const handleSidePanelSwitch = (tab: DocSidePanelTab) => {
  void openSidePanel(tab)
}

const jumpToOutlineItem = async (itemId: string) => {
  const opened = await openSidePanel("info")

  if (!opened) {
    return
  }

  const targetIndex = outlineItems.value.findIndex(item => item.id === itemId)

  if (targetIndex < 0 || typeof document === "undefined") {
    return
  }

  requestAnimationFrame(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".yuque-doc-editor__surface h1, .yuque-doc-editor__surface h2, .yuque-doc-editor__surface h3, .yuque-doc-editor__surface h4"
      )
    )

    headings[targetIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    })
  })
}

const openShareDialog = () => {
  if (!ensureEditPermission("当前角色没有分享权限。")) {
    return
  }

  showShareDialog.value = true
}

/**
 * 当前文档的可分享绝对地址。
 * 桌面端页面自身是 app://bundle/... ，直接取 window.location.href 会得到对收件人无效的链接。
 */
const currentDocumentUrl = () => `${resolveWebBaseUrl()}${route.path}`

const copyCurrentDocumentLink = async () => {
  if (typeof window === "undefined") {
    return
  }

  try {
    await navigator.clipboard.writeText(currentDocumentUrl())
    showToastMessage("当前文档链接已复制。", "success")
  } catch {
    showToastMessage("复制链接失败，请手动复制地址栏。", "error")
  }
}

const copyCurrentDocumentMarkdownLink = async () => {
  if (typeof window === "undefined") {
    return
  }

  const docTitle = title.value.trim() || "未命名文档"
  const markdownLink = `[${docTitle}](${currentDocumentUrl()})`

  try {
    await navigator.clipboard.writeText(markdownLink)
    showToastMessage("标题链接已复制，可直接粘贴到 Markdown 中。", "success")
  } catch {
    showToastMessage("复制标题链接失败，请稍后重试。", "error")
  }
}

const openCurrentDocumentInNewTab = () => {
  if (typeof window === "undefined") {
    return
  }

  window.open(window.location.href, "_blank", "noopener,noreferrer")
}

const buildWorkspaceHref = (target: "home" | "overview") => {
  if (typeof window === "undefined") {
    return ""
  }

  const routeTarget =
    target === "home"
      ? {
          name: "knowledge-workspace-home" as const,
          params: { kbId: workspaceContext.kbId.value },
        }
      : {
          name: "knowledge-overview" as const,
          params: { kbId: workspaceContext.kbId.value },
        }

  return `${resolveWebBaseUrl()}${router.resolve(routeTarget).href}`
}

const openKnowledgeWorkspacePage = async (target: "home" | "overview") => {
  await router.push({
    name: target === "home" ? "knowledge-workspace-home" : "knowledge-overview",
    params: { kbId: workspaceContext.kbId.value },
  })
}

const openKnowledgeWorkspacePageInNewTab = (target: "home" | "overview") => {
  const href = buildWorkspaceHref(target)

  if (!href) {
    return
  }

  window.open(href, "_blank", "noopener,noreferrer")
}

const copyKnowledgeWorkspacePageLink = async (target: "home" | "overview") => {
  const href = buildWorkspaceHref(target)

  if (!href) {
    return
  }

  try {
    await navigator.clipboard.writeText(href)
    showToastMessage(target === "home" ? "知识库主页链接已复制。" : "知识库目录链接已复制。", "success")
  } catch {
    showToastMessage("复制空间链接失败，请稍后重试。", "error")
  }
}

const saveDocumentManually = () => {
  if (!canEdit.value) {
    showToastMessage("当前文档为只读模式，无法保存。", "info")
    return
  }

  void saveDocument()
}

const closeAllSidePanels = () => {
  closeSidePanels(null)
}

/** 顶栏 Docx 导出按钮的下拉菜单（对齐语雀：顶栏直出导出入口，与「更多」内项同链路） */
const exportMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    { label: "打印文档", icon: "i-lucide-printer", onSelect: () => void printDocument() },
    { label: "导出为 Markdown", icon: "i-lucide-file-text", onSelect: () => void exportMarkdown() },
    { label: "导出为 PDF", icon: "i-lucide-file-down", onSelect: () => void exportPDF() },
    { label: "导出为 Word", icon: "i-lucide-file-type", onSelect: () => void exportWord() },
    { label: "导出为语雀文档 (.lake)", icon: "i-lucide-file-json", onSelect: () => void exportLake() },
  ],
])

const moreMenuItems = computed<DropdownMenuItem[][]>(() => {
  const syncItems: DropdownMenuItem[] = [{ type: "label", label: "状态与同步" }]

  if (canEdit.value) {
    syncItems.push({
      label: saveError.value ? "重试同步保存" : isDirty.value ? "立即保存文档" : "再次保存文档",
      icon: saveError.value ? "i-lucide-cloud-alert" : "i-lucide-save",
      onSelect: () => saveDocumentManually(),
    })
  }

  if (pendingSaveRequest.value) {
    syncItems.push({
      label: isOnline.value ? "继续处理同步队列" : "等待网络恢复后同步",
      icon: isOnline.value ? "i-lucide-cloud-upload" : "i-lucide-cloud-off",
      disabled: !isOnline.value,
      onSelect: () => void flushPendingSave(),
    })
  }

  syncItems.push({
    label: remoteConflict.value ? "加载远端最新版本（发现更新）" : "重新加载当前文档",
    icon: remoteConflict.value ? "i-lucide-refresh-cw" : "i-lucide-rotate-cw",
    onSelect: () => void reloadRemoteDocument(),
  })

  const items: DropdownMenuItem[][] = [
    syncItems,
    [
      { type: "label", label: "视图与面板" },
      {
        label: activeSidePanel.value ? `切换右侧面板（当前${activeSidePanelLabel.value}）` : "打开右侧面板",
        icon: "i-lucide-panels-top-left",
        children: [
          {
            label: showInfoPanel.value ? "关闭文档信息" : "打开文档信息",
            icon: "i-lucide-panel-right-open",
            onSelect: () => toggleInfoPanel(),
          },
        ].filter(Boolean) as DropdownMenuItem[],
      },
      activeSidePanel.value
        ? {
            label: `收起${activeSidePanelLabel.value}`,
            icon: "i-lucide-panel-right-close",
            onSelect: () => closeAllSidePanels(),
          }
        : null,
    ].filter(Boolean) as DropdownMenuItem[],
    [
      { type: "label", label: "协作与版本" },
      canEdit.value
        ? {
            label: "打开分享设置",
            icon: "i-lucide-send",
            onSelect: () => openShareDialog(),
          }
        : null,
      canEdit.value
        ? {
            label: "打开模板库",
            icon: "i-lucide-book-copy",
            onSelect: () => handleRequestTemplateLibrary(),
          }
        : null,
      {
        label: "历史版本与对比",
        icon: "i-lucide-history",
        children: [
          {
            label: versionsDialogOpen.value ? "刷新历史版本" : "打开历史版本",
            icon: "i-lucide-history",
            onSelect: () => void openVersions(),
          },
          {
            label: "对比历史版本",
            icon: "i-lucide-git-compare-arrows",
            disabled: !canOpenVersionCompare.value,
            onSelect: () => void openVersionCompare(),
          },
        ],
      },
    ].filter(Boolean) as DropdownMenuItem[],
    [
      { type: "label", label: "链接与流转" },
      {
        label: "复制与打开",
        icon: "i-lucide-link-2",
        children: [
          { label: "复制标题链接", icon: "i-lucide-brackets", onSelect: () => void copyCurrentDocumentMarkdownLink() },
          { label: "复制当前链接", icon: "i-lucide-link-2", onSelect: () => void copyCurrentDocumentLink() },
          { label: "复制为 Markdown", icon: "i-lucide-clipboard-type", onSelect: () => void copyDocumentAsMarkdown() },
          {
            label: "在新标签打开",
            icon: "i-lucide-square-arrow-out-up-right",
            onSelect: () => openCurrentDocumentInNewTab(),
          },
        ],
      },
      {
        label: "所在空间",
        icon: "i-lucide-book-open-text",
        children: [
          {
            label: "打开空间主页",
            icon: "i-lucide-house",
            onSelect: () => void openKnowledgeWorkspacePage("home"),
          },
          {
            label: "打开目录视图",
            icon: "i-lucide-list-tree",
            onSelect: () => void openKnowledgeWorkspacePage("overview"),
          },
          {
            label: "复制空间主页链接",
            icon: "i-lucide-link-2",
            onSelect: () => void copyKnowledgeWorkspacePageLink("home"),
          },
          {
            label: "在新标签打开目录",
            icon: "i-lucide-square-arrow-out-up-right",
            onSelect: () => openKnowledgeWorkspacePageInNewTab("overview"),
          },
        ],
      },
      {
        label: favorited.value ? "取消收藏" : "收藏文档",
        icon: favorited.value ? "i-lucide-star-off" : "i-lucide-star",
        onSelect: () => void toggleFavorite(),
      },
    ],
    [
      { type: "label", label: "导出与输出" },
      {
        label: "导出与打印",
        icon: "i-lucide-download",
        children: [
          { label: "打印文档", icon: "i-lucide-printer", onSelect: () => void printDocument() },
          { label: "导出为 Markdown", icon: "i-lucide-file-text", onSelect: () => void exportMarkdown() },
          { label: "导出为 PDF", icon: "i-lucide-file-down", onSelect: () => void exportPDF() },
          { label: "导出为 Word", icon: "i-lucide-file-type", onSelect: () => void exportWord() },
          { label: "导出为语雀文档 (.lake)", icon: "i-lucide-file-json", onSelect: () => void exportLake() },
        ],
      },
    ],
  ]

  if (canEdit.value) {
    items.push([
      { type: "label", label: "文档管理" },
      {
        label: docType.value === "template" ? "取消模板" : "设为模板",
        icon: "i-lucide-layout-template",
        onSelect: () => void toggleTemplate(),
      },
      {
        label: "移入回收站",
        icon: "i-lucide-trash-2",
        color: "error",
        onSelect: () => deleteDocument(),
      },
    ])
  }

  return items
})

watch(
  () => docId.value,
  async () => {
    clearAutoSaveTimer()
    clearRetrySaveTimer()
    clearRemoteCheckTimer()
    clearVersionSelection()
    editorInstance.value = null
    favorited.value = false
    togglingFavorite.value = false
    showInfoPanel.value = false
    showShareDialog.value = false
    showStyleSettings.value = false
    showShortcutPanel.value = false
    showVersionCompare.value = false
    commentsPanelOpen.value = false
    commentComposeQuote.value = null
    commentDraftAnchor = null
    versionsDialogOpen.value = false
    versions.value = []
    // 使在途的旧文档版本请求失效，避免其 finally/loading 态波及新文档
    versionsLoadSeq++
    versionsLoading.value = false
    deletingVersionId.value = null
    batchDeletingVersions.value = false
    pendingSaveRequest.value = null
    retryAttempt.value = 0
    remoteConflict.value = null
    void loadDocument()
  },
  { immediate: true }
)

watch(
  () => versionsDialogOpen.value,
  open => {
    if (!open) {
      clearVersionSelection()
    }
  }
)

watch([title, status, scheme, content], () => {
  scheduleAutoSave()
  scheduleRemoteConflictCheck()
  // 内容变更后锚点路径会错位，让高亮跟随重绘（引擎内部 rAF 节流）
  commentManager?.refreshHighlights()
})

/** 等待在途保存（autosave/retry）结束，30ms 轮询，最长 timeoutMs */
const waitUntilSaveIdle = async (timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs

  while ((saving.value || autoSaving.value) && Date.now() < deadline) {
    await new Promise<void>(resolve => window.setTimeout(resolve, 30))
  }
}

/** 切换文档/离开页面前落盘未保存修改：等待在途保存结束后补一次真实保存。 */
const flushBeforeDocSwitch = async () => {
  if (!canEdit.value || !isDirty.value) return

  // 若保存正在途中，原逻辑会走 queue 分支提前放行，路由切换后组件卸载时
  // onBeforeUnmount 又清掉 pending，导致最后一次修改丢失。这里先等途中保存
  // 结束，再补一次真实保存（此时已空闲，saveDocument 会同步发送）。
  await waitUntilSaveIdle()

  if (isDirty.value) {
    await saveDocument({ silent: true, auto: true })
    await waitUntilSaveIdle()
  }
}

onBeforeRouteLeave(async () => {
  await flushBeforeDocSwitch()
  return true
})

// 目录树点另一篇文档时路由组件被复用（仅 params.docId 变化），onBeforeRouteLeave
// 不会触发；若不在此落盘，自动保存窗口内（1200ms）的最后修改会被静默丢弃
onBeforeRouteUpdate(async () => {
  await flushBeforeDocSwitch()
  return true
})

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!canEdit.value || !isDirty.value) {
    return
  }

  event.preventDefault()
  event.returnValue = ""
}

onMounted(() => {
  window.addEventListener("keydown", handleSaveShortcut)
  window.addEventListener("beforeunload", handleBeforeUnload)
  window.addEventListener("online", handleOnline)
  window.addEventListener("offline", handleOffline)
  document.addEventListener("visibilitychange", handleVisibilityChange)
  scheduleRemoteConflictCheck()
  setupCollabChannel()
})

// 同一路由组件内文档切换（左侧目录点开另一篇）时重连 WS 房间
watch(docId, () => {
  if (docId.value) {
    setupCollabChannel()
  } else {
    teardownCollabChannel()
  }
})

onBeforeUnmount(() => {
  teardownCollabChannel()
  commentManager?.destroy()
  commentManager = null
  clearAutoSaveTimer()
  clearRetrySaveTimer()
  clearRemoteCheckTimer()
  editorInstance.value = null
  window.removeEventListener("keydown", handleSaveShortcut)
  window.removeEventListener("beforeunload", handleBeforeUnload)
  window.removeEventListener("online", handleOnline)
  window.removeEventListener("offline", handleOffline)
  document.removeEventListener("visibilitychange", handleVisibilityChange)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-surface">
    <header class="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div class="grid h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4">
        <!-- 对齐语雀桌面端：左侧文档标题（可编辑）、居中同步状态、右侧动作区；
               三段 grid 保证居中状态不会与左右两组件重叠，空间不足时标题/状态各自截断 -->
        <div class="min-w-0 justify-self-start">
          <input
            v-if="canEdit"
            v-model="title"
            type="text"
            placeholder="无标题文档"
            class="w-full border-none bg-transparent px-0 text-[15px] font-medium text-ink outline-none placeholder:text-ink-quaternary"
          />
          <span v-else class="block truncate text-[15px] font-medium text-ink" :title="title || '无标题文档'">
            {{ title || "无标题文档" }}
          </span>
        </div>

        <div class="hidden min-w-0 items-center gap-1.5 text-[12px] text-ink-tertiary md:flex">
          <!-- 对齐语雀：已加载态为锁 +「已加载最新版本」+ 云图标（阅读态只留锁，对齐语雀阅读顶栏）；
               同步状态是功能性信息，用 tertiary 保证可读 -->
          <template v-if="saveStatusLabel === '已加载最新版'">
            <AppIcon name="i-lucide-lock" class="h-3.5 w-3.5 shrink-0" />
            <span v-if="!isReadingMode" class="max-w-[320px] truncate">{{ loadedStateLabel }}</span>
            <AppIcon v-if="!isReadingMode" name="i-lucide-cloud" class="h-3.5 w-3.5 shrink-0" />
          </template>
          <template v-else>
            <AppIcon name="i-lucide-check" class="h-3.5 w-3.5 shrink-0" />
            <span class="max-w-[320px] truncate">{{ saveStatusLabel }}</span>
          </template>
        </div>

        <div class="flex min-w-0 shrink-0 items-center justify-end gap-1">
          <el-button
            text
            size="small"
            :loading="togglingFavorite"
            :class="
              favorited
                ? 'h-8 w-8 rounded-kb-sm bg-warning-bg p-0 text-warning'
                : 'h-8 w-8 rounded-kb-sm p-0 text-ink-secondary'
            "
            :title="favorited ? '取消收藏' : '收藏文档'"
            @click="toggleFavorite"
            ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
            <UiIcon
              v-if="!togglingFavorite"
              :icon="favorited ? 'i-lucide-star' : 'i-lucide-star-off'"
              class="h-[1.2em] w-[1.2em] shrink-0"
            />
          </el-button>
          <!-- 对齐语雀顶栏：收藏后为 Docx 导出入口（点击展开格式菜单，复用导出链路） -->
          <EditorMoreMenu :items="exportMenuItems">
            <el-button
              text
              size="small"
              class="h-8 w-8 rounded-kb-sm p-0 text-ink-secondary aspect-square p-0"
              title="导出与打印"
              ><UiIcon icon="i-lucide-file-type" class="h-[1.2em] w-[1.2em] shrink-0" />
            </el-button>
          </EditorMoreMenu>
          <!-- 协作者头像堆叠：常显（对齐语雀编辑页顶栏），点击打开协作者弹层 -->
          <button
            v-if="collaboratorsForHeader.length > 0"
            type="button"
            class="flex shrink-0 items-center -space-x-2 rounded-full transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light"
            :title="collaboratorButtonTitle"
            @click="collaboratorsDialogOpen = true"
          >
            <div
              v-for="member in visibleCollaborators"
              :key="member.id"
              class="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-line bg-fill-muted text-[11px] font-semibold text-ink-secondary dark:text-ink"
              :title="member.user.displayName || member.user.email"
            >
              <img
                v-if="member.user.avatar"
                :src="member.user.avatar"
                :alt="member.user.displayName || member.user.email"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ getCollaboratorInitial(member) }}</span>
              <span
                v-if="onlineUserIds.has(member.userId)"
                class="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-surface bg-green-500"
                title="在线"
              ></span>
            </div>
            <div
              v-if="remainingCollaboratorCount > 0"
              class="flex h-7 min-w-7 items-center justify-center rounded-full border border-line bg-fill-muted px-1.5 text-[11px] font-medium text-ink-tertiary dark:text-ink-secondary"
            >
              +{{ remainingCollaboratorCount }}
            </div>
          </button>

          <el-button
            v-if="!isReadingMode"
            text
            size="small"
            :loading="versionsLoading && versionsDialogOpen"
            :class="
              versionsDialogOpen
                ? 'h-8 w-8 rounded-kb-sm bg-brand-faint p-0 text-brand'
                : 'h-8 w-8 rounded-kb-sm p-0 text-ink-secondary'
            "
            title="历史版本"
            @click="openVersions"
            ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
            <UiIcon
              v-if="!(versionsLoading && versionsDialogOpen)"
              icon="i-lucide-clock"
              class="h-[1.2em] w-[1.2em] shrink-0"
            />
          </el-button>
          <el-button
            v-if="!isReadingMode"
            text
            size="small"
            :class="
              mentionPickerOpen
                ? 'h-8 w-8 rounded-kb-sm bg-brand-faint p-0 text-brand'
                : 'h-8 w-8 rounded-kb-sm p-0 text-ink-secondary'
            "
            title="提及成员（@）"
            @click="openMentionPicker"
            ><UiIcon icon="i-lucide-at-sign" class="h-[1.2em] w-[1.2em] shrink-0" />
          </el-button>
          <el-button
            text
            size="small"
            :class="
              commentsPanelOpen
                ? 'h-8 w-8 rounded-kb-sm bg-brand-faint p-0 text-brand'
                : 'h-8 w-8 rounded-kb-sm p-0 text-ink-secondary'
            "
            title="讨论"
            @click="handleDiscussClick"
            ><UiIcon icon="i-lucide-message-circle" class="h-[1.2em] w-[1.2em] shrink-0" />
          </el-button>
          <!-- 语雀常态没有保存按钮：仅在存在未保存改动或同步异常时出现 -->
          <el-button
            v-if="canEdit && !isReadingMode && (saveError || isDirty)"
            plain
            size="small"
            :loading="saving && !autoSaving"
            class="h-8 border-line-input bg-surface px-3 text-ink-secondary py-0"
            @click="saveDocument()"
            ><template #loading><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin" /></template>
            <span class="truncate">{{ savePrimaryActionLabel }}</span>
          </el-button>
          <el-button
            plain
            size="small"
            class="h-8 border-line-input bg-surface px-4 text-[13px] text-ink hover:bg-muted py-0 [line-height:inherit] font-semibold"
            @click="openShareDialog"
            ><span class="truncate">分享</span>
          </el-button>
          <!-- 对齐语雀阅读页顶栏：绿色实心「编辑」按钮，点击退回编辑态 -->
          <el-button
            v-if="isReadingMode && canEdit"
            size="small"
            class="h-8 border border-brand bg-brand px-4 text-[13px] text-on-brand! py-0 [line-height:inherit] font-semibold hover:bg-brand-hover"
            @click="exitReadingMode"
            ><span class="truncate">编辑</span>
          </el-button>
          <el-button
            v-if="!isReadingMode"
            text
            size="small"
            class="h-8 w-8 rounded-kb-sm p-0 text-ink-secondary aspect-square p-0"
            title="复制链接"
            @click="copyCurrentDocumentLink"
            ><UiIcon icon="i-lucide-link" class="h-[1.2em] w-[1.2em] shrink-0" />
          </el-button>
          <el-button
            v-if="canEdit && !isReadingMode"
            text
            size="small"
            class="h-8 w-8 rounded-kb-sm p-0 text-ink-secondary aspect-square p-0"
            title="样式设置"
            @click="showStyleSettings = true"
            ><UiIcon icon="i-lucide-settings-2" class="h-[1.2em] w-[1.2em] shrink-0" />
          </el-button>
          <!-- 对齐语雀顶栏：目录开关（原大纲面板）+ AI 开关收尾，AI 开启态蓝色高亮（编辑态专属） -->
          <template v-if="!isReadingMode">
            <el-button
              text
              size="small"
              :class="
                showInfoPanel
                  ? 'h-8 w-8 rounded-kb-sm bg-brand-faint p-0 text-brand'
                  : 'h-8 w-8 rounded-kb-sm p-0 text-ink-secondary'
              "
              title="目录"
              @click="toggleInfoPanel"
              ><UiIcon icon="i-lucide-book-open" class="h-[1.2em] w-[1.2em] shrink-0" />
            </el-button>
            <el-button
              text
              size="small"
              :class="
                aiPanelOpen
                  ? 'h-8 w-8 rounded-kb-sm bg-brand-faint p-0 text-brand'
                  : 'h-8 w-8 rounded-kb-sm p-0 text-ink-secondary'
              "
              title="AI 助手"
              @click="void switchSidePanel('ai')"
              ><UiIcon icon="i-lucide-sparkles" class="h-[1.2em] w-[1.2em] shrink-0" />
            </el-button>
          </template>
          <EditorMoreMenu v-if="!isReadingMode" :items="moreMenuItems">
            <el-button
              text
              size="small"
              class="h-8 w-8 rounded-kb-sm p-0 text-ink-secondary aspect-square p-0"
              title="更多操作"
              ><UiIcon icon="i-lucide-more-horizontal" class="h-[1.2em] w-[1.2em] shrink-0" />
            </el-button>
          </EditorMoreMenu>
        </div>
      </div>
    </header>

    <div v-if="loading" class="flex flex-1 items-center justify-center bg-surface p-6">
      <div class="kb-card-elevated px-10 py-12 text-center">
        <AppIcon name="i-lucide-loader-circle" class="mx-auto h-8 w-8 animate-spin text-ink-quaternary" />
        <p class="mt-3 text-sm text-ink-tertiary">加载中…</p>
      </div>
    </div>

    <div v-else-if="errorMessage" class="flex flex-1 items-center justify-center bg-surface p-6">
      <div class="max-w-md rounded-kb-3xl border border-error-light bg-surface px-8 py-10 text-center">
        <AppIcon name="i-lucide-alert-circle" class="mx-auto h-16 w-16 text-error-hover" />
        <p class="mt-4 text-base text-ink-secondary">{{ errorMessage }}</p>
        <el-button
          type="primary"
          class="mt-6 inline-flex items-center gap-2 rounded-kb-sm py-2 font-semibold"
          @click="loadDocument"
          ><span class="truncate">重新加载</span>
        </el-button>
      </div>
    </div>

    <div v-if="!loading && !errorMessage" class="relative min-h-0 flex flex-1 overflow-hidden bg-surface">
      <!-- 阅读态：本层为滚动容器（正文自适应高度 + 文末互动区同流滚动）；编辑态 contents 保持原布局 -->
      <div :class="isReadingMode ? 'min-h-0 w-full flex-1 overflow-y-auto' : 'contents'">
        <!-- 阅读态标题兜底：doc-hero-title 宿主节点在工具栏之后，阅读态无工具栏故静态渲染 -->
        <div v-if="isReadingMode" class="w-full px-8 pt-6 sm:px-12 lg:px-[72px]">
          <h1 class="doc-hero-title">{{ title || "无标题文档" }}</h1>
        </div>
        <YuqueDocEditor
          :key="docId"
          v-model="content"
          :content-type="editorContentType"
          :editable="canEdit && !isReadingMode"
          :on-image-upload="handleImageUpload"
          :on-video-upload="handleVideoUpload"
          :on-file-upload="handleFileUpload"
          :on-audio-upload="handleAudioUpload"
          :show-toolbar="canEdit && !isReadingMode"
          :show-code-block-button="canEdit && !isReadingMode"
          :auto-height="isReadingMode"
          :toolbar-items="EDITOR_TOOLBAR_ITEMS"
          :default-font-size="docStyle.fontSize"
          :paragraph-spacing="docStyle.paragraphSpacing === 'relax'"
          @editor-ready="handleEditorReady"
          @surface-ready="handleCommentSurfaceReady"
        >
          <template #surface-header>
            <!-- 语雀编辑页的正文大标题：渲染进 lake 工具栏下方的宿主节点 -->
            <Teleport v-if="docTitleHost" :to="docTitleHost">
              <input v-if="canEdit" v-model="title" type="text" placeholder="无标题文档" class="doc-hero-title" />
              <h1 v-else class="doc-hero-title">{{ title || "无标题文档" }}</h1>
            </Teleport>
            <div v-if="headerFeedbackItems.length > 0 && !isReadingMode" class="w-full px-8 pt-4 sm:px-12 lg:px-[72px]">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-for="item in headerFeedbackItems"
                  :key="item.key"
                  type="button"
                  class="inline-flex min-w-0 items-center gap-2 rounded-kb-md border px-3 py-1.5 text-[12px] font-medium transition"
                  :class="item.className"
                  @click="item.onClick"
                >
                  <AppIcon :name="item.icon" class="h-3.5 w-3.5 shrink-0" />
                  <span class="truncate">{{ item.label }}</span>
                  <span v-if="item.detail" class="hidden max-w-[280px] truncate text-[11px] opacity-75 2xl:inline">
                    {{ item.detail }}
                  </span>
                </button>
              </div>
            </div>
          </template>

          <template #surface-footer>
            <!-- 对齐语雀：字数固定在编辑区左下角（footer 随高度链贴底）；阅读态不展示 -->
            <div v-if="!isReadingMode" class="inline-flex items-center pb-3 pl-5 text-[12px] text-ink-quaternary">
              {{ editorWordCountLabel }}
            </div>
          </template>
        </YuqueDocEditor>

        <!-- 文末互动区（B2a 对齐语雀阅读页）：元信息行 + 文内评论；点赞/阅读数/IP 属地待后端模型后补 -->
        <div
          v-if="isReadingMode"
          ref="readingCommentsAnchor"
          class="mx-auto w-full max-w-[820px] px-8 pb-16 pt-10 sm:px-12"
        >
          <div
            class="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-5 text-[12px] text-ink-tertiary"
          >
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="i-lucide-user" class="h-3.5 w-3.5 shrink-0" />
              {{ docCreatorLabel || "未知用户" }}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="i-lucide-clock" class="h-3.5 w-3.5 shrink-0" />
              更新于 {{ docUpdatedAtText }}
            </span>
            <span class="inline-flex items-center gap-1.5">
              <AppIcon name="i-lucide-message-circle" class="h-3.5 w-3.5 shrink-0" />
              {{ commentItems.length }} 条评论
            </span>
          </div>

          <section class="mt-5">
            <h2 class="text-[15px] font-semibold text-ink">全部评论 ({{ commentItems.length }})</h2>

            <!-- 评论输入：盒面交给 el-textarea 默认档，外层只留间距（避免套盒） -->
            <div class="mt-3">
              <el-input
                v-model="readingCommentDraft"
                type="textarea"
                :rows="2"
                resize="none"
                placeholder="写下你的评论…"
                class="resize-none overflow-hidden"
                @keydown="handleReadingCommentKeydown"
              />
              <div class="mt-2 flex items-center justify-end gap-2">
                <span class="mr-auto text-[11px] text-ink-quaternary">⌘ Enter 发布</span>
                <button
                  type="button"
                  class="inline-flex h-7 items-center rounded-kb-md bg-brand px-3 text-[12px] font-medium text-on-brand! transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
                  :disabled="!readingCommentDraft.trim() || submittingComment"
                  @click="submitReadingComment"
                >
                  {{ submittingComment ? "发布中…" : "发布" }}
                </button>
              </div>
            </div>

            <!-- 评论列表 -->
            <div v-if="commentItems.length > 0" class="mt-4 space-y-4">
              <article v-for="item in commentItems" :key="item.id" class="flex items-start gap-2.5">
                <div
                  class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted text-[11px] font-semibold text-ink-secondary"
                >
                  <img
                    v-if="item.authorAvatar"
                    :src="item.authorAvatar"
                    :alt="item.authorName"
                    class="h-full w-full object-cover"
                  />
                  <span v-else>{{ item.authorName.slice(0, 1) }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span class="text-[13px] font-medium text-ink">{{ item.authorName }}</span>
                    <span class="text-[11px] text-ink-quaternary">{{ item.createdAtText }}</span>
                  </div>
                  <p
                    v-if="item.quote"
                    class="mt-1 rounded-kb-sm bg-muted px-2.5 py-1.5 text-[12px] leading-5 text-ink-tertiary"
                  >
                    {{ item.quote }}
                  </p>
                  <p class="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-ink-secondary">
                    {{ item.content }}
                  </p>
                  <div v-if="item.replies.length > 0" class="mt-2 space-y-2 border-l-2 border-line pl-3">
                    <div v-for="reply in item.replies" :key="reply.id">
                      <div class="flex flex-wrap items-center gap-x-2">
                        <span class="text-[12px] font-medium text-ink">{{ reply.authorName }}</span>
                        <span class="text-[11px] text-ink-quaternary">{{ reply.createdAtText }}</span>
                      </div>
                      <p class="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-ink-secondary">
                        {{ reply.content }}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="mt-6 text-center text-[13px] text-ink-quaternary">
              {{ commentsLoading ? "评论加载中…" : "还没有评论，来抢沙发吧。" }}
            </p>
          </section>
        </div>
      </div>

      <!-- 快捷键速查入口：对齐语雀编辑器右下角的悬浮按钮（阅读态换为评论直达） -->
      <button
        v-if="!isReadingMode"
        type="button"
        class="absolute bottom-16 right-8 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-tertiary shadow-sm transition hover:border-brand-lighter hover:text-brand"
        title="快捷键"
        @click="showShortcutPanel = true"
      >
        <AppIcon name="i-lucide-keyboard" class="h-4.5 w-4.5" />
      </button>
      <button
        v-if="isReadingMode"
        type="button"
        class="absolute bottom-16 right-8 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-tertiary shadow-sm transition hover:border-brand-lighter hover:text-brand"
        title="评论"
        @click="scrollToReadingComments"
      >
        <AppIcon name="i-lucide-message-circle" class="h-4.5 w-4.5" />
      </button>

      <!-- 划选文字后的快捷浮动条（挂 body，fixed 定位在选区上方） -->
      <EditorSelectionToolbar
        :editor="editorInstance"
        :editable="canEdit && !isPreviewMode"
        @comment="beginCommentFromSelection"
      />

      <DocumentCommentsPanel
        v-if="commentsPanelOpen"
        :open="commentsPanelOpen"
        :comments="commentItems"
        :current-user-id="authStore.user?.id ?? ''"
        :compose-quote="commentComposeQuote"
        :submitting="submittingComment"
        :loading="commentsLoading"
        :action-busy="commentActionBusy"
        @close="closeSidePanels(null)"
        @switch-tab="handleSidePanelSwitch"
        @submit="submitDocComment"
        @cancel-compose="cancelCommentCompose"
        @resolve="id => handleCommentResolve(id, true)"
        @unresolve="id => handleCommentResolve(id, false)"
        @delete="handleCommentDelete"
        @reply="handleCommentReply"
        @scroll-to="scrollCommentIntoView"
        @hover="setHoveredComment"
        @leave="setHoveredComment(null)"
      />

      <DocumentAiPanel
        v-if="aiPanelOpen"
        :open="aiPanelOpen"
        :document-id="docId"
        :token="authStore.accessToken"
        :user-id="authStore.user?.id ?? null"
        @close="closeSidePanels(null)"
        @switch-tab="handleSidePanelSwitch"
        @insert-to-end="handleAiInsertToEnd"
      />
    </div>

    <DocumentStyleSettingsDialog
      :open="showStyleSettings"
      :doc-style="docStyle"
      @close="showStyleSettings = false"
      @update:doc-style="handleDocStyleUpdate"
    />
    <EditorShortcutPanel :open="showShortcutPanel" @close="showShortcutPanel = false" />

    <!-- 协作者弹层：只读展示知识库成员与角色（对齐语雀协作者弹层的信息区；邀请/权限编辑属文档级协作者管理，另项跟进）
         T9 起直用 el-dialog + useDialogBehavior（AppDialog 已解散） -->
    <el-dialog
      v-bind="collaboratorsDialog.elDialogBindings"
      class="max-w-md"
      :model-value="collaboratorsDialogOpen"
      title="协作者"
      close-on-click-modal
      close-on-press-escape
      @update:model-value="value => !value && (collaboratorsDialogOpen = false)"
    >
      <template #header>
        <KbDialogHeader
          title="协作者"
          eyebrow="协作"
          :description="`文档协作者（${docCollaborators.length} 人） · 知识库成员（${workspaceMembers.length} 人）`"
          @close="collaboratorsDialogOpen = false"
        />
      </template>

      <!-- 文档协作者段（B2f）：管理者可邀请/改角色/移除；升权语义见服务注释 -->
      <div class="rounded-kb-xl border border-line p-3">
        <p class="text-[12px] font-medium text-ink-secondary">文档协作者（仅对该文档生效）</p>

        <form
          v-if="canManageDocCollaborators"
          class="mt-2.5 flex items-center gap-2"
          @submit.prevent="handleAddDocCollaborator"
        >
          <el-input
            v-model="inviteEmail"
            type="email"
            maxlength="120"
            placeholder="输入对方邮箱，如 name@example.com"
            class="h-8 min-w-0 flex-1"
          />
          <el-dropdown
            trigger="click"
            placement="bottom-end"
            :show-arrow="false"
            @command="(role: 'editor' | 'reader') => (inviteRole = role)"
          >
            <button
              type="button"
              class="inline-flex h-8 shrink-0 items-center gap-1 rounded-kb-md border border-line bg-surface px-2.5 text-[12px] text-ink-secondary transition hover:border-brand-lighter"
            >
              {{ docCollabRoleLabel[inviteRole] }}
              <Icon icon="ph:caret-down" :width="12" :height="12" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="editor">可编辑</el-dropdown-item>
                <el-dropdown-item command="reader">只读</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <button
            type="submit"
            class="inline-flex h-8 shrink-0 items-center rounded-kb-md bg-brand px-3 text-[12px] font-medium text-on-brand! transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
            :disabled="docCollabBusy || !inviteEmail.trim()"
          >
            {{ docCollabBusy ? "添加中…" : "添加" }}
          </button>
        </form>

        <ul v-if="docCollaborators.length > 0 || docCollaboratorsLoading" class="mt-2 space-y-0.5">
          <li
            v-for="collaborator in docCollaborators"
            :key="collaborator.id"
            class="flex items-center gap-3 rounded-kb-xl px-2 py-1.5 hover:bg-fill-subtle"
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-fill-muted text-[11px] font-semibold text-ink-secondary dark:text-ink"
            >
              <img
                v-if="collaborator.user.avatar"
                :src="collaborator.user.avatar"
                :alt="collaborator.user.displayName || collaborator.user.email"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ (collaborator.user.displayName || collaborator.user.email).slice(0, 1) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-[13px] font-medium text-ink">
                  {{ collaborator.user.displayName || collaborator.user.email }}
                </span>
                <span
                  v-if="collaborator.user.id === authStore.user?.id"
                  class="shrink-0 text-[11px] text-ink-quaternary"
                  >（我）</span
                >
              </div>
              <div class="truncate text-[12px] text-ink-tertiary">{{ collaborator.user.email }}</div>
            </div>

            <el-dropdown
              v-if="canManageDocCollaborators"
              trigger="click"
              placement="bottom-end"
              :show-arrow="false"
              @command="(role: 'editor' | 'reader') => handleDocCollaboratorRoleChange(collaborator, role)"
            >
              <button
                type="button"
                class="inline-flex h-7 shrink-0 items-center gap-1 rounded-kb-md border border-line bg-surface px-2.5 text-[12px] text-ink-secondary transition hover:border-brand-lighter"
              >
                {{ docCollabRoleLabel[collaborator.role] }}
                <Icon icon="ph:caret-down" :width="11" :height="11" />
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="editor" :disabled="collaborator.role === 'editor'"
                    >可编辑</el-dropdown-item
                  >
                  <el-dropdown-item command="reader" :disabled="collaborator.role === 'reader'">只读</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <span
              v-else
              class="shrink-0 rounded-full bg-fill-subtle px-2 py-0.5 text-[11px] font-medium text-ink-tertiary dark:text-ink-secondary"
            >
              {{ docCollabRoleLabel[collaborator.role] }}
            </span>

            <button
              v-if="canManageDocCollaborators"
              type="button"
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md text-ink-quaternary transition hover:bg-grey-200 hover:text-error"
              title="移除协作者"
              :disabled="docCollabBusy"
              @click="handleRemoveDocCollaborator(collaborator)"
            >
              <Icon icon="ph:x" :width="14" :height="14" />
            </button>
          </li>
        </ul>
        <p v-else class="mt-2 px-1 text-[12px] text-ink-quaternary">
          {{ canManageDocCollaborators ? "还没有文档协作者，通过上方邮箱邀请。" : "暂无文档协作者。" }}
        </p>
      </div>

      <p class="mt-4 px-1 text-[12px] font-medium text-ink-secondary">
        知识库成员（{{ workspaceMembers.length }} 人，继承知识库权限）
      </p>
      <ul class="max-h-[240px] space-y-0.5 overflow-y-auto py-1">
        <li
          v-for="member in workspaceMembers"
          :key="member.id"
          class="flex items-center gap-3 rounded-kb-xl px-3 py-2 hover:bg-fill-subtle"
        >
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-fill-muted text-[12px] font-semibold text-ink-secondary dark:text-ink"
          >
            <img
              v-if="member.user.avatar"
              :src="member.user.avatar"
              :alt="member.user.displayName || member.user.email"
              class="h-full w-full object-cover"
            />
            <span v-else>{{ getCollaboratorInitial(member) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate text-[13px] font-medium text-ink">
                {{ member.user.displayName || member.user.email }}
              </span>
              <span v-if="member.userId === authStore.user?.id" class="shrink-0 text-[11px] text-ink-quaternary"
                >（我）</span
              >
            </div>
            <div class="truncate text-[12px] text-ink-tertiary">{{ member.user.email }}</div>
          </div>
          <span
            class="shrink-0 rounded-full bg-fill-subtle px-2 py-0.5 text-[11px] font-medium text-ink-tertiary dark:text-ink-secondary"
          >
            {{ collaboratorRoleLabel[member.role] }}
          </span>
        </li>
      </ul>
      <template #footer>
        <div class="flex justify-end">
          <el-button plain class="py-2" @click="collaboratorsDialogOpen = false"
            ><span class="truncate">关闭</span>
          </el-button>
        </div>
      </template>
    </el-dialog>

    <DocumentVersionsPanel
      v-if="versionsDialogOpen"
      :open="versionsDialogOpen"
      active-tab="versions"
      :document-title="title || '无标题文档'"
      :workspace-name="workspaceName"
      :document-mode-label="documentModeLabel"
      :document-scheme-label="schemeLabel"
      :document-status-label="statusMeta.label"
      :save-status-label="saveStatusLabel"
      :versions-loading="versionsLoading"
      :versions="versions"
      :local-cache-items="versionsLocalCacheItems"
      :selected-version-ids="selectedVersionIds"
      :selected-version-count="selectedVersionCount"
      :all-versions-selected="allVersionsSelected"
      :version-delete-busy="versionDeleteBusy"
      :deleting-version-id="deletingVersionId"
      :batch-deleting-versions="batchDeletingVersions"
      @close="closeSidePanels(null)"
      @open-compare="openVersionCompare"
      @toggle-all="toggleAllVersions"
      @delete-selected="deleteSelectedVersions"
      @clear-selection="clearVersionSelection"
      @toggle-version="toggleVersionSelection"
      @delete-version="deleteVersion"
      @rollback-version="rollbackVersion"
      @switch-tab="handleSidePanelSwitch"
    />

    <DocumentInfoPanel
      v-if="showInfoPanel"
      :open="showInfoPanel"
      active-tab="info"
      :document-title="title || '无标题文档'"
      :workspace-name="workspaceName"
      :document-mode-label="documentModeLabel"
      :document-scheme-label="schemeLabel"
      :document-status-label="statusMeta.label"
      :save-status-label="saveStatusLabel"
      :outline-items="outlineItems"
      :collaborators="infoPanelCollaborators"
      :stats="documentInfoStats"
      :meta="documentInfoMeta"
      :favorite="favorited"
      :visible-actions="[
        'enter-reading',
        'copy-link',
        'open-template-library',
        'open-share',
        'open-history',
        'toggle-favorite',
      ]"
      :shortcuts="documentInfoShortcuts"
      @close="closeSidePanels(null)"
      @switch-tab="handleSidePanelSwitch"
      @jump-outline="jumpToOutlineItem"
      @enter-reading="enterReadingMode"
      @copy-link="copyCurrentDocumentLink"
      @toggle-favorite="toggleFavorite"
      @open-share="openShareDialog"
      @open-history="openVersions"
      @open-template-library="handleRequestTemplateLibrary"
    />
    <ShareDialog
      v-if="docId && showShareDialog"
      :document-id="docId"
      :visible="showShareDialog"
      :document-title="title || '无标题文档'"
      :workspace-name="workspaceName"
      :document-mode-label="documentModeLabel"
      :document-scheme-label="schemeLabel"
      :document-status-label="statusMeta.label"
      :save-status-label="saveStatusLabel"
      :allow-edit-permission="canEdit"
      @close="showShareDialog = false"
    />
    <VersionCompareDialog
      v-if="docId && showVersionCompare"
      :document-id="docId"
      :document-title="title || '无标题文档'"
      :workspace-name="workspaceName"
      :document-mode-label="documentModeLabel"
      :document-scheme-label="schemeLabel"
      :document-status-label="statusMeta.label"
      :save-status-label="saveStatusLabel"
      :versions="versions"
      :deleting-version-id="deletingVersionId || (batchDeletingVersions ? '__batch__' : null)"
      :visible="showVersionCompare"
      @delete-version="deleteVersion"
      @close="showVersionCompare = false"
    />

    <ConfirmDialog
      v-model:open="confirmDialog.open"
      :message="confirmDialog.message"
      :danger="confirmDialog.danger ?? true"
      :confirm-text="confirmDialog.confirmText ?? '删除'"
      @confirm="confirmDialog.onConfirm"
    />
  </div>

  <MentionMemberPicker
    :members="workspaceMembers"
    :open="mentionPickerOpen"
    :position="mentionPickerPos"
    @select="handleMentionSelect"
    @close="mentionPickerOpen = false"
  />
</template>

<style>
/* 编辑器页懒注入的 antd.css reset `button, input { overflow: visible }`（unlayered）
   会打翻 Tailwind @layer 的 truncate（目录列头 KB 名等 button.truncate 文字溢出）。
   同为 unlayered 的对抗规则 + !important 压回（坑 6/13 同链路） */
aside button.truncate {
  overflow: hidden !important;
}

/* 正文大标题（对齐语雀 ≈27pt 粗体）：Teleport 到 lake 工具栏下方，
   必须用全局样式（scoped 不覆盖 Teleport 目标节点）；
   unlayered 作者样式可覆盖 antd.css 的 input{font-size:inherit}。
   字色走 --kb-text* 档随主题自换，原先两条 .dark 覆写已删（暗色占位曾写 #5a5a5a，
   深底上只有 2.2:1 几乎看不见；亮色占位 #bfbfbf 同理，1.75:1） */
.doc-hero-title {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: 26px;
  line-height: 1.45;
  font-weight: 700;
  color: var(--kb-text);
}
.doc-hero-title::placeholder {
  color: var(--kb-text-quaternary);
  font-weight: 500;
}
</style>

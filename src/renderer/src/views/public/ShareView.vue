<script setup lang="ts">
/** 页面组件，负责分享页面展示与交互流程。 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"
import UiIcon from "@/components/common/UiIcon.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { updateSharedDocument, verifyShare, type SharedDocument } from "@/services/document-share"

import { getApiErrorMessage, getApiErrorStatus } from "@/services/http-client"
import { normalizeKnowledgeBoardDocument } from "@/utils/knowledge-board-migration"
import { isImeComposing } from "@/utils/keyboard"
import {
  extractDocumentOutline,
  extractDocumentPlainText,
  type DocumentOutlineItem,
} from "@/utils/document-content-metadata"
import {
  getKnowledgeDocumentEditorLabel,
  isBoardContent,
  isBoardEditorType,
} from "@/utils/knowledge-document"

const YuqueDocEditor = defineAsyncComponent(() => import("@/components/editor/YuqueDocEditor.vue"))
const DocumentInfoPanel = defineAsyncComponent(
  () => import("@/components/editor/DocumentInfoPanel.vue"),
)
const ReadonlyBoardSurface = defineAsyncComponent(
  () => import("@/components/board/ReadonlyBoardSurface.vue"),
)

type SharedContent = {
  scheme: "text/markdown" | "text/html"
  value: string
}

type ShareSidePanelTab = "search" | "comments" | "info"

const route = useRoute()
/** 响应式 shareKey：路由复用（仅 params 变化）时 const 快照会把 A 分享渲染在 B 的 URL 下 */
const shareKey = computed(() => {
  const value = route.params.shareKey
  return typeof value === "string" ? value : ""
})
const { showToastMessage } = useTransientToast()

const loading = ref(false)
const needPassword = ref(false)
const password = ref("")
const verifying = ref(false)
const saving = ref(false)
const error = ref("")
const saveError = ref("")
const sharedDoc = ref<SharedDocument | null>(null)
const showInfoPanel = ref(false)
const shareAvailableTabs = ["info"] as const
const sharePanelTabs: Array<"search" | "comments" | "versions" | "info"> = [...shareAvailableTabs]

const title = ref("")
const scheme = ref<"text/markdown" | "text/html">("text/markdown")
const content = ref("")
const snapshot = ref<(SharedContent & { title: string }) | null>(null)

const canEdit = computed(() => sharedDoc.value?.permission === "edit")
const isBoardShare = computed(() => {
  return (
    isBoardEditorType(sharedDoc.value?.document.editorType) ||
    isBoardContent(sharedDoc.value?.document.content)
  )
})
const canEditShareContent = computed(() => canEdit.value && !isBoardShare.value)
const editorContentType = computed<"markdown" | "html">(() => {
  return scheme.value === "text/html" ? "html" : "markdown"
})
const shareSchemeLabel = computed(() => (scheme.value === "text/html" ? "HTML" : "Markdown"))
const shareModeLabel = computed(() => (canEditShareContent.value ? "公开可编辑" : "公开只读"))
const shareStatusLabel = computed(() => (canEditShareContent.value ? "可编辑分享" : "只读分享"))
const boardContent = computed(() => {
  if (!sharedDoc.value?.document.content || !isBoardContent(sharedDoc.value.document.content)) {
    return null
  }

  return normalizeKnowledgeBoardDocument(sharedDoc.value.document.content.value)
})
const isDirty = computed(() => {
  if (!snapshot.value) {
    return false
  }

  return (
    title.value !== snapshot.value.title ||
    scheme.value !== snapshot.value.scheme ||
    content.value !== snapshot.value.value
  )
})
const activeShareSidePanel = computed<ShareSidePanelTab | null>(() => {
  if (showInfoPanel.value) {
    return "info"
  }

  return null
})

const shareOutlineItems = computed<DocumentOutlineItem[]>(() => {
  if (isBoardShare.value) {
    return []
  }

  return extractDocumentOutline(content.value, scheme.value)
})

const sharePlainTextContent = computed(() => {
  if (isBoardShare.value) {
    return ""
  }

  return extractDocumentPlainText(content.value, scheme.value)
})

const shareInfoStats = computed(() => [
  { label: "字数", value: `${sharePlainTextContent.value.length}` },
  { label: "标题", value: `${shareOutlineItems.value.length}` },
  { label: "权限", value: canEditShareContent.value ? "编辑" : "只读" },
])

const shareInfoShortcuts = computed(() => {
  // 全文搜索随编辑器能力下线，不展示；仅编辑态分享保留保存快捷键
  const shortcuts: Array<{ id: string; label: string; keys: string[]; description: string }> = []

  if (canEditShareContent.value) {
    shortcuts.unshift({
      id: "save",
      label: "保存分享修改",
      keys: ["Ctrl/Cmd", "S"],
      description: "当前分享具备编辑权限时，可直接保存当前修改。",
    })
  }

  return shortcuts
})

const shareInfoCollaborators = computed<
  Array<{ id: string; label: string; role: string; avatar?: string | null }>
>(() => [])

const normalizeSharedContent = (rawContent: unknown): SharedContent => {
  if (rawContent && typeof rawContent === "object") {
    const maybeContent = rawContent as Partial<SharedContent>

    return {
      scheme: maybeContent.scheme === "text/html" ? "text/html" : "text/markdown",
      value: typeof maybeContent.value === "string" ? maybeContent.value : "",
    }
  }

  if (typeof rawContent === "string") {
    return {
      scheme: "text/markdown",
      value: rawContent,
    }
  }

  return {
    scheme: "text/markdown",
    value: "",
  }
}

const applySharedDocument = (document: SharedDocument) => {
  const normalizedContent = normalizeSharedContent(document.document.content)

  title.value = document.document.title
  scheme.value = normalizedContent.scheme
  content.value = normalizedContent.value
  saveError.value = ""
  snapshot.value = {
    title: document.document.title,
    scheme: normalizedContent.scheme,
    value: normalizedContent.value,
  }
}

/** verify 请求序号：重复提交或 shareKey 切换后，晚归的旧响应不得写入当前上下文 */
let verifySeq = 0

async function handleVerify() {
  const seq = ++verifySeq
  const requestedShareKey = shareKey.value
  loading.value = true
  verifying.value = true
  error.value = ""
  try {
    const result = await verifyShare(requestedShareKey, password.value || undefined)
    if (seq !== verifySeq || requestedShareKey !== shareKey.value) {
      return
    }
    sharedDoc.value = result
    applySharedDocument(result)
    closeShareSidePanels(null)
    needPassword.value = false
  } catch (err: unknown) {
    if (seq !== verifySeq) {
      return
    }
    const errorMessage = getApiErrorMessage(err, "")
    const httpStatus = getApiErrorStatus(err)

    if (httpStatus === 403) {
      if (errorMessage.includes("密码")) {
        needPassword.value = true
        error.value = "密码错误，请重试"
      } else if (errorMessage.includes("过期")) {
        error.value = "分享已过期"
      } else {
        error.value = "无权访问此分享"
      }
    } else if (httpStatus === 404) {
      error.value = "分享不存在或已失效"
    } else if (httpStatus === 429) {
      // 限流是「稍后再试」而非加载失败，单列文案避免误导
      error.value = "访问过于频繁，请稍后再试"
    } else {
      error.value = "加载失败，请稍后重试"
    }
  } finally {
    if (seq === verifySeq) {
      loading.value = false
      verifying.value = false
    }
  }
}

/** 输入法组词期间的 Enter 是「确认候选」，不能当作提交 */
const handleVerifyEnter = (event: KeyboardEvent) => {
  if (isImeComposing(event)) {
    return
  }

  void handleVerify()
}

const closeShareSidePanels = (nextTab: ShareSidePanelTab | null = null) => {
  showInfoPanel.value = nextTab === "info"
}

const openShareSidePanel = (tab: ShareSidePanelTab) => {
  closeShareSidePanels(tab)
  return true
}

const switchShareSidePanel = (tab: ShareSidePanelTab | null) => {
  if (tab === null || activeShareSidePanel.value === tab) {
    closeShareSidePanels(null)
    return
  }

  openShareSidePanel(tab)
}

const handleShareSidePanelSwitch = (
  tab: "search" | "comments" | "versions" | "info" | "style" | "ai",
) => {
  if (tab === "versions" || tab === "ai" || tab === "style") {
    return
  }

  openShareSidePanel(tab)
}

const toggleShareInfoPanel = () => {
  if (isBoardShare.value) {
    return
  }

  switchShareSidePanel("info")
}

const jumpToShareOutlineItem = (itemId: string) => {
  const targetIndex = shareOutlineItems.value.findIndex((item) => item.id === itemId)

  if (targetIndex < 0 || typeof document === "undefined") {
    return
  }

  requestAnimationFrame(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".yuque-doc-editor__surface h1, .yuque-doc-editor__surface h2, .yuque-doc-editor__surface h3, .yuque-doc-editor__surface h4",
      ),
    )

    headings[targetIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    })
  })
}

const copyShareLink = async () => {
  if (typeof window === "undefined") {
    return
  }

  try {
    await navigator.clipboard.writeText(window.location.href)
    showToastMessage("分享链接已复制。", "success")
  } catch {
    showToastMessage("复制链接失败，请手动复制地址栏。", "error")
  }
}

const handleShareShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    if (!canEditShareContent.value) {
      return
    }

    event.preventDefault()
    void handleSave()
    return
  }
}

async function handleSave() {
  if (!sharedDoc.value || !canEditShareContent.value || !isDirty.value) {
    return
  }

  const normalizedTitle = title.value.trim()

  if (!normalizedTitle) {
    saveError.value = "标题不能为空。"
    return
  }

  saving.value = true
  saveError.value = ""

  try {
    const updated = await updateSharedDocument(shareKey.value, {
      password: password.value || undefined,
      title: normalizedTitle,
      content: {
        scheme: scheme.value,
        value: content.value,
      },
    })

    const nextSharedDoc: SharedDocument = {
      ...sharedDoc.value,
      document: {
        ...sharedDoc.value.document,
        title: updated.document.title,
        content: updated.document.content,
      },
    }

    sharedDoc.value = nextSharedDoc
    applySharedDocument(nextSharedDoc)
  } catch (err: unknown) {
    saveError.value = getApiErrorMessage(err, "保存失败，请稍后重试。")
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void handleVerify()
  window.addEventListener("keydown", handleShareShortcut)
})

// 组件被路由复用（仅 shareKey 变化）时重新验证加载新分享；在途的旧 verify 由序号丢弃
watch(
  () => route.params.shareKey,
  (next, prev) => {
    if (next && next !== prev) {
      sharedDoc.value = null
      needPassword.value = false
      password.value = ""
      void handleVerify()
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleShareShortcut)
})
</script>

<template>
  <div class="min-h-screen bg-muted px-4 py-6 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-[1200px]">
      <header class="kb-toolbar-strip px-5 py-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-quaternary">
              <span>公开分享</span>
              <span class="rounded-full bg-surface px-2.5 py-1 text-ink-tertiary">
                {{ sharedDoc?.document.kb.name || "文档分享" }}
              </span>
            </div>
            <h1 class="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-ink">
              {{ sharedDoc?.document.kb.name || "文档分享" }}
            </h1>
          </div>

          <RouterLink
            to="/knowledge"
            class="inline-flex items-center rounded-kb-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
          >
            返回知识库
          </RouterLink>
        </div>
      </header>

      <div class="mt-6">
        <div
          v-if="loading && !needPassword"
          class="kb-section-card px-6 py-10 text-center text-sm text-ink-tertiary"
        >
          正在加载分享内容…
        </div>

        <div v-else-if="needPassword || (!sharedDoc && !error)" class="mx-auto max-w-md">
          <div class="kb-panel-shell p-8">
            <div class="flex justify-center">
              <div
                class="flex h-16 w-16 items-center justify-center rounded-kb-3xl bg-brand-light text-brand"
              >
                <AppIcon name="i-lucide-lock" class="h-7 w-7" />
              </div>
            </div>

            <div class="mt-6 text-center">
              <h2 class="text-2xl font-semibold text-ink">此分享需要密码</h2>
              <p class="mt-2 text-sm leading-6 text-ink-tertiary">请输入访问密码后继续查看内容。</p>
            </div>

            <div class="mt-6 space-y-4">
              <el-input
                v-model="password"
                type="password"
                placeholder="请输入密码"
                class="w-full"
                @keydown.enter="handleVerifyEnter($event as KeyboardEvent)"
              />

              <p v-if="error" class="text-sm text-error">
                {{ error }}
              </p>

              <el-button
                type="primary"
                class="w-full py-3 font-semibold"
                :disabled="verifying"
                @click="handleVerify"
                ><span class="truncate">{{ verifying ? "验证中…" : "验证密码" }}</span>
              </el-button>
            </div>
          </div>
        </div>

        <div v-else-if="error" class="kb-section-card px-6 py-10 text-center">
          <p class="text-base font-medium text-error">{{ error }}</p>
        </div>

        <section v-else-if="sharedDoc" class="kb-panel-shell overflow-hidden">
          <div class="kb-toolbar-strip px-6 py-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 text-sm text-ink-tertiary">
                  <span>{{ sharedDoc.document.kb.name }}</span>
                  <span
                    class="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-tertiary"
                  >
                    {{ shareStatusLabel }}
                  </span>
                  <span
                    class="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-ink-tertiary"
                  >
                    {{ getKnowledgeDocumentEditorLabel(sharedDoc.document.editorType) }}
                  </span>
                </div>

                <input
                  v-model="title"
                  :disabled="!canEditShareContent"
                  maxlength="200"
                  class="mt-4 w-full border-0 bg-transparent p-0 text-[30px] font-semibold tracking-[-0.04em] text-ink outline-none focus:ring-0 disabled:cursor-default disabled:text-ink"
                />

                <p v-if="saveError" class="mt-2 text-sm text-error">
                  {{ saveError }}
                </p>
                <p v-if="isBoardShare && canEdit" class="mt-2 text-sm text-ink-tertiary">
                  画板分享在当前阶段仅开放只读预览，公共链接中的在线编辑后续再补。
                </p>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-tertiary">
                  <span class="rounded-full bg-fill-muted px-2.5 py-1">
                    {{ shareSchemeLabel }}
                  </span>
                  <span class="rounded-full bg-fill-muted px-2.5 py-1">
                    {{ shareStatusLabel }}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <div v-if="!isBoardShare" class="kb-toolbar-strip flex items-center gap-1 p-1">
                  <el-button
                    text
                    size="small"
                    :class="
                      showInfoPanel
                        ? 'h-8 w-8 rounded-kb-lg bg-brand-faint p-0 text-brand'
                        : 'h-8 w-8 rounded-kb-lg p-0 text-ink-tertiary'
                    "
                    title="文档信息"
                    @click="toggleShareInfoPanel"
                    ><UiIcon
                      icon="i-lucide-panel-right-open"
                      class="h-[1.2em] w-[1.2em] shrink-0"
                    />
                  </el-button>
                </div>
                <RouterLink
                  to="/knowledge"
                  class="inline-flex items-center rounded-kb-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
                >
                  返回知识库
                </RouterLink>
                <el-button
                  v-if="canEditShareContent"
                  type="primary"
                  class="py-2 font-semibold"
                  :disabled="!isDirty || saving"
                  @click="handleSave"
                  ><span class="truncate">{{ saving ? "保存中…" : "保存修改" }}</span>
                </el-button>
              </div>
            </div>
          </div>

          <div class="px-6 py-6">
            <YuqueDocEditor
              v-if="!boardContent"
              v-model="content"
              :content-type="editorContentType"
              :editable="canEditShareContent"
              :show-toolbar="canEditShareContent"
            />
            <ReadonlyBoardSurface v-else :board="boardContent" height-class="h-[640px]" />
          </div>
        </section>

        <DocumentInfoPanel
          v-if="sharedDoc && showInfoPanel && !isBoardShare"
          :open="showInfoPanel"
          active-tab="info"
          :document-title="title || '无标题文档'"
          :workspace-name="sharedDoc.document.kb.name"
          :document-mode-label="shareModeLabel"
          :document-scheme-label="shareSchemeLabel"
          :document-status-label="shareStatusLabel"
          :outline-items="shareOutlineItems"
          :collaborators="shareInfoCollaborators"
          :stats="shareInfoStats"
          :favorite="false"
          :available-tabs="sharePanelTabs"
          :visible-actions="['copy-link']"
          :shortcuts="shareInfoShortcuts"
          actions-badge-label="分享页"
          @close="closeShareSidePanels(null)"
          @switch-tab="handleShareSidePanelSwitch"
          @jump-outline="jumpToShareOutlineItem"
          @copy-link="copyShareLink"
        />
      </div>
    </div>
  </div>
</template>

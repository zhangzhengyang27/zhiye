<script setup lang="ts">
/**
 * ⌘J 命令面板（对齐语雀桌面端搜索弹层）。
 *
 * 结构：面包屑定位（用户 / 知识库）+ 搜索输入 → 「页面」快捷项分组 +
 * 「文档」分组（当前知识库，标题 + 时间），键盘上下选择、Enter 跳转、Esc 关闭。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import { useAuthStore } from "@/stores/auth"
import { useThemeMode } from "@/composables/useThemeMode"
import {
  getKnowledgeDocumentTree,
  listRecentKnowledgeDocumentsAll,
  type KnowledgeDocumentTreeNode,
} from "@/services/knowledge-documents"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { isImeComposing } from "@/utils/keyboard"
import { formatShortDate } from "@/utils/date-format"

const props = defineProps<{
  open: boolean
  kbId?: string | null
}>()

const emit = defineEmits<{
  "update:open": [value: boolean]
}>()

const router = useRouter()
const authStore = useAuthStore()

const keyword = ref("")
const docs = ref<
  Array<{ id: string; title: string; editorType?: string; updatedAt: string; kbId: string }>
>([])
const loadingDocs = ref(false)
/** 对齐语雀「切换内容」：当前知识库文档 ↔ 全部知识库最近文档 */
const scopeAll = ref(false)
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const kbId = computed(() => {
  if (typeof props.kbId === "string" && props.kbId) {
    return props.kbId
  }

  if (typeof router.currentRoute.value.params.kbId === "string") {
    return router.currentRoute.value.params.kbId
  }

  return ""
})

// localStorage 无响应式依赖，computed 会永久缓存旧库名——改为每次打开时重读
const kbName = ref("知识库")

const userName = computed(() => authStore.user?.displayName || authStore.user?.email || "我")

interface PalettePageItem {
  key: string
  label: string
  icon: string
  action: () => void
}

const pageItems = computed<PalettePageItem[]>(() => {
  const items: PalettePageItem[] = []

  if (kbId.value) {
    items.push({
      key: "kb-home",
      label: "知识库首页",
      icon: "ph:house-simple",
      action: () => router.push({ name: "knowledge-workspace-home", params: { kbId: kbId.value } }),
    })
    items.push({
      key: "kb-settings",
      label: "知识库设置",
      icon: "ph:gear",
      action: () => router.push({ name: "knowledge-settings", params: { kbId: kbId.value } }),
    })
  }

  items.push({
    key: "start",
    label: "工作台",
    icon: "ph:rocket-launch",
    action: () => router.push({ name: "knowledge-start" }),
  })
  items.push({
    key: "boards",
    label: "画板",
    icon: "ph:palette",
    action: () => router.push({ name: "knowledge-boards" }),
  })

  return items
})

const filteredPages = computed(() => {
  const text = keyword.value.trim().toLowerCase()

  if (!text) {
    return pageItems.value
  }

  return pageItems.value.filter((item) => item.label.toLowerCase().includes(text))
})

// ==================== > 命令模式（#20，对齐语雀：输入 > 唤醒命令清单） ====================
const { colorTheme } = useThemeMode()

interface PaletteCommandItem {
  key: string
  label: string
  icon: string
  action: () => void
}

/** 关键词以 > 开头时进入命令态：只展示命令清单，不再展示页面/文档搜索结果 */
const isCommandMode = computed(() => keyword.value.startsWith(">"))

/** 命令全集：页面导航（全集，含命令面板常规态不出现的回收站等）+ 主题三态切换 */
const commandItems = computed<PaletteCommandItem[]>(() => {
  const items: PaletteCommandItem[] = []

  if (kbId.value) {
    items.push({
      key: "cmd-kb-home",
      label: "知识库首页",
      icon: "ph:house-simple",
      action: () => router.push({ name: "knowledge-workspace-home", params: { kbId: kbId.value } }),
    })
    items.push({
      key: "cmd-kb-settings",
      label: "知识库设置",
      icon: "ph:gear",
      action: () => router.push({ name: "knowledge-settings", params: { kbId: kbId.value } }),
    })
  }

  items.push(
    {
      key: "cmd-start",
      label: "开始页",
      icon: "ph:rocket-launch",
      action: () => router.push({ name: "knowledge-start" }),
    },
    {
      key: "cmd-ai-writing",
      label: "AI 写作",
      icon: "ph:sparkle",
      action: () => router.push({ name: "knowledge-ai-writing" }),
    },
    {
      key: "cmd-notes",
      label: "小记",
      icon: "ph:feather",
      action: () => router.push({ name: "knowledge-notes" }),
    },
    {
      key: "cmd-recent",
      label: "最近访问",
      icon: "ph:clock-counter-clockwise",
      action: () => router.push({ name: "knowledge-recent" }),
    },
    {
      key: "cmd-boards",
      label: "画板",
      icon: "ph:palette",
      action: () => router.push({ name: "knowledge-boards" }),
    },
    {
      key: "cmd-favorites",
      label: "收藏",
      icon: "ph:star",
      action: () => router.push({ name: "knowledge-favorites" }),
    },
    {
      key: "cmd-trash",
      label: "回收站",
      icon: "ph:trash-simple",
      action: () => router.push({ name: "knowledge-trash" }),
    },
    {
      key: "cmd-theme-dark",
      label: "主题：切换到暗黑模式",
      icon: "ph:moon",
      action: () => (colorTheme.value = "dark"),
    },
    {
      key: "cmd-theme-light",
      label: "主题：切换到浅色模式",
      icon: "ph:sun",
      action: () => (colorTheme.value = "light"),
    },
    {
      key: "cmd-theme-system",
      label: "主题：跟随系统",
      icon: "ph:monitor",
      action: () => (colorTheme.value = "system"),
    },
  )

  return items
})

/** 命令过滤：取 > 之后的串做包含匹配；仅 > 时展示全集 */
const filteredCommands = computed<PaletteCommandItem[]>(() => {
  const text = keyword.value.slice(1).trim().toLowerCase()

  if (!text) {
    return commandItems.value
  }

  return commandItems.value.filter((item) => item.label.toLowerCase().includes(text))
})

const runCommand = (item: PaletteCommandItem) => {
  close()
  item.action()
}

const filteredDocs = computed(() => {
  const text = keyword.value.trim().toLowerCase()

  if (!text) {
    return docs.value.slice(0, 8)
  }

  return docs.value.filter((item) => item.title.toLowerCase().includes(text)).slice(0, 8)
})

const flatCount = computed(() =>
  isCommandMode.value
    ? filteredCommands.value.length
    : filteredPages.value.length + filteredDocs.value.length,
)

const close = () => {
  emit("update:open", false)
}

const runPageItem = (item: PalettePageItem) => {
  close()
  item.action()
}

const runDocItem = (doc: (typeof docs.value)[number]) => {
  close()
  void router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: doc.kbId,
      docId: doc.id,
      editorType: doc.editorType,
    }),
  )
}

const activate = (index: number) => {
  if (isCommandMode.value) {
    const command = filteredCommands.value[index]

    if (command) {
      runCommand(command)
    }
    return
  }

  const pageItem = filteredPages.value[index]

  if (pageItem) {
    runPageItem(pageItem)
    return
  }

  const doc = filteredDocs.value[index - filteredPages.value.length]

  if (doc) {
    runDocItem(doc)
  }
}

const onKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
    event.preventDefault()
    emit("update:open", !props.open)
    return
  }

  if (!props.open) {
    return
  }

  // 输入法组词期间：Enter 是确认候选、方向键在切候选、Esc 在取消组词，
  // 都属于输入法操作，不能触发面板的选中/跳转/关闭
  if (isImeComposing(event)) {
    return
  }

  if (event.key === "Escape") {
    event.preventDefault()
    close()
    return
  }

  if (event.key === "ArrowDown") {
    event.preventDefault()
    activeIndex.value = flatCount.value > 0 ? (activeIndex.value + 1) % flatCount.value : 0
    return
  }

  if (event.key === "ArrowUp") {
    event.preventDefault()
    activeIndex.value =
      flatCount.value > 0 ? (activeIndex.value - 1 + flatCount.value) % flatCount.value : 0
    return
  }

  if (event.key === "Enter") {
    event.preventDefault()
    activate(activeIndex.value)
  }
}

const flattenDocs = (nodes: KnowledgeDocumentTreeNode[], kbIdValue: string) => {
  const result: Array<{
    id: string
    title: string
    editorType?: string
    updatedAt: string
    kbId: string
  }> = []

  const walk = (list: KnowledgeDocumentTreeNode[]) => {
    list.forEach((node) => {
      if (node.type === "doc") {
        result.push({
          id: node.id,
          title: node.title,
          editorType: node.editorType,
          updatedAt: node.updatedAt,
          kbId: kbIdValue,
        })
      }

      if (node.children.length > 0) {
        walk(node.children)
      }
    })
  }

  walk(nodes)

  return result
}

// 请求序号守卫：快速连点「切换内容」/切库时，慢的旧请求晚归不得覆盖新结果
let loadDocsSeq = 0

const loadDocs = async () => {
  const seq = ++loadDocsSeq
  loadingDocs.value = true

  try {
    if (!kbId.value || scopeAll.value) {
      const recent = await listRecentKnowledgeDocumentsAll({ limit: 60 })
      if (seq !== loadDocsSeq) return
      docs.value = recent.map((item) => ({
        id: item.id,
        title: item.title,
        editorType: item.editorType,
        updatedAt: item.updatedAt,
        kbId: item.kbId,
      }))
      return
    }

    const tree = await getKnowledgeDocumentTree(kbId.value)
    if (seq !== loadDocsSeq) return
    docs.value = flattenDocs(tree, kbId.value)
  } catch {
    if (seq !== loadDocsSeq) return
    docs.value = []
  } finally {
    if (seq === loadDocsSeq) {
      loadingDocs.value = false
    }
  }
}

// 打开时统一初始化：重读库名（localStorage 无响应式，computed 会永久缓存旧值）、
// 清空输入态并加载文档（唯一一个 open watcher，避免双 watcher 各做一半）
watch(
  () => props.open,
  (open) => {
    if (!open) return
    const stored = window.localStorage.getItem("knowledge:last-active-kb-name") ?? ""
    kbName.value = stored && stored !== "未命名知识库" ? stored : "知识库"
    keyword.value = ""
    activeIndex.value = 0
    scopeAll.value = false
    void loadDocs()

    window.setTimeout(() => {
      inputRef.value?.focus()
    }, 30)
  },
  // 挂载时 open 可能已为 true，immediate 保证首次初始化不遗漏
  { immediate: true },
)

watch(keyword, () => {
  activeIndex.value = 0
})

onMounted(() => {
  window.addEventListener("keydown", onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[var(--kb-z-dropdown-backdrop)]" @click.self="close">
      <div class="absolute inset-0 bg-black/20" @click="close" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        class="absolute left-1/2 top-[15%] w-full max-w-[720px] -translate-x-1/2 overflow-hidden rounded-kb-lg border border-line bg-surface shadow-[var(--kb-modal-shadow)]"
      >
        <div class="flex items-center gap-2 border-b border-line px-4 py-3">
          <Icon
            icon="ph:magnifying-glass"
            :width="15"
            :height="15"
            class="shrink-0 text-ink-quaternary"
          />
          <span class="hidden shrink-0 items-center gap-1 text-[13px] text-ink-quaternary md:flex">
            <span>{{ userName }}</span>
            <span>/</span>
            <span>{{ kbName }}</span>
            <span>/</span>
          </span>
          <input
            ref="inputRef"
            v-model="keyword"
            type="text"
            aria-label="搜索文档与页面"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            class="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-quaternary"
            placeholder="搜索内容，或输入 > 唤醒更多"
            @keydown.stop="onKeydown"
          />
          <button
            v-if="kbId"
            type="button"
            class="inline-flex h-6 shrink-0 items-center gap-1 rounded-kb-sm px-1.5 text-[12px] transition"
            :class="
              scopeAll
                ? 'text-brand hover:bg-brand-light'
                : 'text-ink-quaternary hover:bg-grey-200 hover:text-ink'
            "
            :title="scopeAll ? '当前：全部知识库的最近文档' : '当前：本知识库全部文档'"
            @click="
              () => {
                scopeAll = !scopeAll
                activeIndex = 0
                void loadDocs()
              }
            "
          >
            <Icon icon="ph:arrows-left-right" :width="12" :height="12" />
            切换内容
          </button>
          <button
            type="button"
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
            title="关闭"
            @click="close"
          >
            <Icon icon="ph:x" :width="13" :height="13" />
          </button>
        </div>

        <div class="max-h-[420px] overflow-y-auto p-2">
          <!-- 命令态（关键词以 > 开头）：只渲染命令清单 -->
          <template v-if="isCommandMode">
            <button
              v-for="(item, index) in filteredCommands"
              :key="item.key"
              type="button"
              class="flex h-9 w-full items-center gap-2.5 rounded-kb-md px-2.5 text-left text-[14px] transition"
              :class="
                activeIndex === index
                  ? 'bg-fill-muted text-ink'
                  : 'text-ink-secondary hover:bg-fill-subtle'
              "
              @click="runCommand(item)"
              @mousemove="activeIndex = index"
            >
              <Icon :icon="item.icon" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
              <span class="flex-1 truncate">{{ item.label }}</span>
              <span
                v-if="activeIndex === index"
                class="shrink-0 rounded-kb-sm border border-line px-1.5 py-0.5 text-[11px] text-ink-quaternary"
              >
                执行
              </span>
            </button>

            <div
              v-if="filteredCommands.length === 0"
              class="px-3 py-10 text-center text-[13px] text-ink-quaternary"
            >
              没有匹配的命令
            </div>
          </template>

          <template v-else>
            <template v-if="filteredPages.length > 0">
              <p class="px-2 pb-1 pt-2 text-[12px] text-ink-quaternary">页面</p>
              <button
                v-for="(item, index) in filteredPages"
                :key="item.key"
                type="button"
                class="flex h-9 w-full items-center gap-2.5 rounded-kb-md px-2.5 text-left text-[14px] transition"
                :class="
                  activeIndex === index
                    ? 'bg-fill-muted text-ink'
                    : 'text-ink-secondary hover:bg-fill-subtle'
                "
                @click="runPageItem(item)"
                @mousemove="activeIndex = index"
              >
                <Icon
                  :icon="item.icon"
                  :width="15"
                  :height="15"
                  class="shrink-0 text-ink-tertiary"
                />
                <span class="flex-1 truncate">{{ item.label }}</span>
                <span
                  v-if="activeIndex === index"
                  class="shrink-0 rounded-kb-sm border border-line px-1.5 py-0.5 text-[11px] text-ink-quaternary"
                >
                  跳转
                </span>
              </button>
            </template>

            <template v-if="filteredDocs.length > 0">
              <p class="px-2 pb-1 pt-3 text-[12px] text-ink-quaternary">文档</p>
              <button
                v-for="(doc, docIndex) in filteredDocs"
                :key="doc.id"
                type="button"
                class="flex h-9 w-full items-center gap-2.5 rounded-kb-md px-2.5 text-left text-[14px] transition"
                :class="
                  activeIndex === filteredPages.length + docIndex
                    ? 'bg-fill-muted text-ink'
                    : 'text-ink-secondary hover:bg-fill-subtle'
                "
                @click="runDocItem(doc)"
                @mousemove="activeIndex = filteredPages.length + docIndex"
              >
                <Icon
                  :icon="doc.editorType === 'board' ? 'ph:frame-corners' : 'ph:file-text'"
                  :width="15"
                  :height="15"
                  class="shrink-0 text-ink-tertiary"
                />
                <span class="min-w-0 flex-1 truncate">{{ doc.title || "无标题文档" }}</span>
                <span class="shrink-0 text-[12px] tabular-nums text-ink-quaternary">
                  {{ formatShortDate(doc.updatedAt) }}
                </span>
              </button>
            </template>

            <div
              v-if="!isCommandMode && flatCount === 0"
              class="px-3 py-10 text-center text-[13px] text-ink-quaternary"
            >
              {{ loadingDocs ? "加载中…" : "没有匹配的内容" }}
            </div>
          </template>
        </div>

        <div
          class="flex items-center justify-end gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-quaternary"
        >
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span>esc 关闭</span>
          <span>输入 &gt; 唤醒更多</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

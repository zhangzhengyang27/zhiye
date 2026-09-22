<script setup lang="ts">
/**
 * 通知铃铛：展示未读角标，点击展开通知面板。
 * 单条点击会标记已读并跳转到对应文档；支持全部已读与单条删除。
 * 未读数使用定时轮询刷新。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import {
  batchDeleteNotifications,
  deleteNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationsRead,
  type AppNotification,
} from "@/services/notifications"
import { getKnowledgeDocument } from "@/services/knowledge-documents"
import { getApiErrorMessage } from "@/services/http-client"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { formatDate } from "@/utils/date-format"

const POLL_INTERVAL_MS = 30_000

const router = useRouter()
const bellRef = ref<HTMLElement | null>(null)
const panelOpen = ref(false)
const items = ref<AppNotification[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const loadError = ref("")
const popupStyle = ref<Record<string, string>>({})
let pollTimer: number | null = null

const emptyText = computed(() => {
  if (loadError.value) {
    return "通知加载失败，请稍后重试。"
  }
  return "暂无通知"
})

const formatTimeAgo = (isoText: string) => {
  const timestamp = new Date(isoText).getTime()

  if (!Number.isFinite(timestamp)) {
    return ""
  }

  const diffMs = Date.now() - timestamp
  const minuteMs = 60_000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (diffMs < minuteMs) {
    return "刚刚"
  }

  if (diffMs < hourMs) {
    return `${Math.floor(diffMs / minuteMs)} 分钟前`
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)} 小时前`
  }

  if (diffMs < 7 * dayMs) {
    return `${Math.floor(diffMs / dayMs)} 天前`
  }

  return formatDate(timestamp)
}

/**
 * 系统通知增量基准：-1 表示尚未建立基线。
 * 首次轮询只建立基线不通知（避免应用启动时把历史未读全部弹一遍），
 * 之后未读数相对基线增长才弹系统通知。
 */
let lastUnreadCount = -1

const refreshUnreadCount = async () => {
  try {
    const result = await getUnreadNotificationCount()
    const next = result.count

    if (lastUnreadCount === -1) {
      lastUnreadCount = next
      unreadCount.value = next
      return
    }

    const increased = next > lastUnreadCount
    lastUnreadCount = next
    unreadCount.value = next

    if (increased && window.xiaoyeDesktop) {
      // 拉取最新一条通知作为系统通知内容；失败时降级为纯计数提示
      const page = await getNotifications({ page: 1, pageSize: 1 }).catch(() => null)
      const latest = page?.items?.[0]
      void window.xiaoyeDesktop.notify(
        latest?.title || "知识库通知",
        latest?.content || `你有 ${next} 条新通知`,
      )
    }
  } catch {
    // 未读数刷新失败不影响展示
  }
}

const loadNotifications = async () => {
  loading.value = true
  loadError.value = ""

  try {
    const page = await getNotifications({ page: 1, pageSize: 20 })
    items.value = page.items
  } catch (error) {
    loadError.value = getApiErrorMessage(error, "加载通知失败。")
  } finally {
    loading.value = false
  }
}

const positionPopup = () => {
  const bellRect = bellRef.value?.getBoundingClientRect()

  if (!bellRect || typeof window === "undefined") {
    popupStyle.value = {}
    return
  }

  const width = 360
  const maxHeight = 480
  const margin = 12
  const gap = 8
  // 水平：与按钮左缘对齐，右溢出时收进视口
  const left = Math.max(margin, Math.min(bellRect.left, window.innerWidth - width - margin))
  const style: Record<string, string> = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  }

  // 垂直：按钮在视口下部时向下放不下 480px 面板，改向上弹（面板底边贴按钮
  // 顶部上方），否则会被 clamp 到窗口顶与按钮脱节；高度同时受上方空间约束
  const spaceBelow = window.innerHeight - bellRect.bottom - gap

  if (spaceBelow >= maxHeight) {
    style.top = `${bellRect.bottom + gap}px`
  } else {
    const spaceAbove = bellRect.top - margin - gap
    style.bottom = `${window.innerHeight - bellRect.top + gap}px`
    style.maxHeight = `${Math.max(160, Math.min(maxHeight, spaceAbove))}px`
  }

  popupStyle.value = style
}

const togglePanel = async () => {
  panelOpen.value = !panelOpen.value

  if (panelOpen.value) {
    positionPopup()
    await loadNotifications()
  }
}

const closePanel = () => {
  panelOpen.value = false
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target instanceof Node ? event.target : null
  const insideBell = bellRef.value?.contains(target) ?? false
  const insidePanel =
    target instanceof Element && Boolean(target.closest("[data-notification-panel]"))

  if (!insideBell && !insidePanel) {
    closePanel()
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    closePanel()
  }
}

const openNotificationDocument = async (item: AppNotification) => {
  if (!item.read) {
    item.read = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    void markNotificationsRead([item.id])
  }

  closePanel()

  const documentId = item.data?.documentId

  if (!documentId) {
    return
  }

  try {
    const document = await getKnowledgeDocument(documentId)
    await router.push(
      getKnowledgeDocumentRouteTarget({
        kbId: document.kbId,
        docId: document.id,
        editorType: document.editorType,
      }),
    )
  } catch {
    // 文档可能已被删除或失去权限：跳转失败时静默留在当前页
  }
}

const markAllRead = async () => {
  const targetIds = items.value.filter((item) => !item.read).map((item) => item.id)

  if (targetIds.length === 0) {
    return
  }

  items.value = items.value.map((item) => ({ ...item, read: true }))
  unreadCount.value = 0

  try {
    await markAllNotificationsRead()
  } catch {
    // 与 removeItem/clearAll 的失败策略对齐：整体重载，让本地已读标记随服务端回滚
    await loadNotifications()
  }
}

const removeItem = async (item: AppNotification) => {
  items.value = items.value.filter((current) => current.id !== item.id)

  if (!item.read) {
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }

  try {
    await deleteNotification(item.id)
  } catch {
    await loadNotifications()
  }
}

const clearAll = async () => {
  const targetIds = items.value.map((item) => item.id)

  if (targetIds.length === 0) {
    return
  }

  items.value = []
  unreadCount.value = 0

  try {
    await batchDeleteNotifications(targetIds)
  } catch {
    await loadNotifications()
  }
}

onMounted(() => {
  void refreshUnreadCount()
  pollTimer = window.setInterval(() => {
    void refreshUnreadCount()
  }, POLL_INTERVAL_MS)
  window.addEventListener("click", handleClickOutside)
  window.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  window.removeEventListener("click", handleClickOutside)
  window.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
  <div ref="bellRef" class="relative">
    <button
      type="button"
      class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-kb-md text-ink-secondary transition duration-150 hover:bg-grey-400/50 hover:text-ink"
      title="通知"
      aria-label="通知"
      @click.stop="togglePanel"
    >
      <Icon :icon="unreadCount > 0 ? 'ph:bell-ringing' : 'ph:bell'" :width="16" :height="16" />

      <span
        v-if="unreadCount > 0"
        class="absolute right-0 top-0 flex h-4 min-w-4 -translate-y-1/3 translate-x-1/3 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white"
      >
        {{ unreadCount > 99 ? "99+" : unreadCount }}
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="panelOpen"
        data-notification-panel
        class="fixed z-[var(--kb-z-dropdown)] flex flex-col overflow-hidden rounded-kb-lg border border-line-input bg-surface shadow-[var(--kb-float-shadow)]"
        :style="popupStyle"
        @click.stop
      >
        <div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div class="flex items-center gap-2">
            <Icon icon="ph:bell" :width="15" :height="15" class="text-ink-tertiary" />
            <span class="text-sm font-semibold text-ink">通知</span>
            <span
              v-if="unreadCount > 0"
              class="rounded-full bg-brand-light px-1.5 py-0.5 text-[11px] font-medium text-brand"
            >
              {{ unreadCount }} 条未读
            </span>
          </div>

          <div class="flex items-center gap-1">
            <button
              type="button"
              class="rounded-kb-sm px-2 py-1 text-xs text-ink-tertiary transition hover:bg-grey-200 hover:text-ink-secondary disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
              :disabled="unreadCount === 0"
              @click="markAllRead"
            >
              全部已读
            </button>
            <button
              type="button"
              class="rounded-kb-sm px-2 py-1 text-xs text-ink-tertiary transition hover:bg-grey-200 hover:text-ink-secondary disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
              :disabled="items.length === 0"
              @click="clearAll"
            >
              清空
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="loading && items.length === 0" class="space-y-2 px-4 py-4">
            <div
              v-for="index in 4"
              :key="index"
              class="h-12 animate-pulse rounded-kb-md bg-grey-200"
            />
          </div>

          <div
            v-else-if="items.length === 0"
            class="flex flex-col items-center justify-center px-6 py-12 text-center"
          >
            <Icon
              icon="ph:bell-simple-slash"
              :width="30"
              :height="30"
              class="text-ink-quaternary"
            />
            <p class="mt-3 text-sm text-ink-tertiary">{{ emptyText }}</p>
          </div>

          <ul v-else class="py-1.5">
            <li
              v-for="item in items"
              :key="item.id"
              class="group relative mx-1.5 cursor-pointer rounded-kb-xl px-3 py-2.5 transition hover:bg-muted"
              :class="item.read ? '' : 'bg-brand-light/60'"
              @click="openNotificationDocument(item)"
            >
              <div class="flex items-start justify-between gap-2 pr-6">
                <span
                  class="min-w-0 flex-1 truncate text-[13px] font-medium"
                  :class="item.read ? 'text-ink-secondary' : 'text-ink'"
                >
                  {{ item.title }}
                </span>
                <span class="shrink-0 text-[11px] text-ink-quaternary">
                  {{ formatTimeAgo(item.createdAt) }}
                </span>
              </div>
              <p
                class="mt-1 line-clamp-2 whitespace-pre-line break-all text-xs leading-5 text-ink-tertiary"
              >
                {{ item.content }}
              </p>

              <button
                type="button"
                class="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-kb-sm text-ink-quaternary opacity-0 transition hover:bg-grey-200 hover:text-ink-secondary group-hover:opacity-100"
                title="删除该通知"
                @click.stop="removeItem(item)"
              >
                <Icon icon="ph:x" :width="13" :height="13" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Teleport>
  </div>
</template>

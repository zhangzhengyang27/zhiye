/** 封装Use文档分享对话框相关组合式状态与交互逻辑。 */

import { computed, ref, watch } from "vue"
import {
  createDocumentShare,
  deleteDocumentShare,
  getDocumentShares,
  type DocumentShare,
} from "@/services/document-share"
import { resolveWebBaseUrl } from "@/services/desktop-bridge"
import { formatDateTime } from "@/utils/date-format"

type ToastHandler = (message: string, type: "success" | "error") => void

/**
 * 管理文档分享弹窗的状态与提交流程。
 */
export function useDocumentShareDialog(options: {
  documentId: () => string
  documentTitle: () => string
  visible: () => boolean
  allowEditPermission: () => boolean | undefined
  showToastMessage: ToastHandler
}) {
  const shares = ref<DocumentShare[]>([])
  const loading = ref(false)
  const creating = ref(false)

  /** 待确认删除的分享 id：非空时由 ShareDialog 渲染确认弹层；deleting 为请求进行中 */
  const pendingDeleteShareId = ref<string | null>(null)
  const deleting = ref(false)

  const permission = ref<"view" | "edit">("view")
  const password = ref("")
  const usePassword = ref(false)
  const expiresIn = ref<"never" | "1day" | "7days" | "30days">("never")

  const expiryOptions = [
    { label: "永久有效", value: "never" as const },
    { label: "1 天", value: "1day" as const },
    { label: "7 天", value: "7days" as const },
    { label: "30 天", value: "30days" as const },
  ]

  const permissionOptions = computed(() =>
    options.allowEditPermission() === false
      ? [
          {
            label: "可查看",
            value: "view" as const,
            description: "适合稳定分发、收集阅读反馈和对外查看。",
          },
        ]
      : [
          {
            label: "可查看",
            value: "view" as const,
            description: "适合确认内容、只读流转和稳定分发。",
          },
          {
            label: "可编辑",
            value: "edit" as const,
            description: "适合协作补充，但会把编辑入口暴露给分享对象。",
          },
        ],
  )

  const sortedShares = computed(() =>
    [...shares.value].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  )

  const canCreateShare = computed(() => {
    if (creating.value) {
      return false
    }

    if (!usePassword.value) {
      return true
    }

    return password.value.trim().length >= 4
  })

  const selectedPermissionMeta = computed(
    () =>
      permissionOptions.value.find((item) => item.value === permission.value) ||
      permissionOptions.value[0],
  )

  const latestShare = computed(() => sortedShares.value[0] || null)

  const shareStats = computed(() => [
    {
      label: "分享链接",
      value: `${sortedShares.value.length}`,
      hint: sortedShares.value.length > 0 ? "当前可管理的分发地址" : "还没有创建分享",
    },
    {
      label: "带密码",
      value: `${sortedShares.value.filter((item) => Boolean(item.hasPassword)).length}`,
      hint: "适合需要更谨慎流转的场景",
    },
    {
      label: "可编辑",
      value: `${sortedShares.value.filter((item) => item.permission === "edit").length}`,
      hint: "外部协作会走编辑入口",
    },
  ])

  const creationSummary = computed(() => {
    const permissionLabel = selectedPermissionMeta.value?.label || "可查看"
    const passwordLabel = usePassword.value
      ? `密码 ${password.value.trim() ? "已设置" : "待填写"}`
      : "无密码"
    const expiryLabel =
      expiryOptions.find((item) => item.value === expiresIn.value)?.label || "永久有效"

    return `${permissionLabel} · ${passwordLabel} · ${expiryLabel}`
  })

  const latestShareSummary = computed(() =>
    latestShare.value
      ? `最近一条链接创建于 ${formatDate(latestShare.value.createdAt)}，可继续复用或新建分发。`
      : "创建后会立即出现在左侧列表，并可继续复制或删除。",
  )

  const shareTips = computed(() => [
    options.allowEditPermission() === false
      ? "当前文档只开放只读分享，避免未收敛的编辑行为外露。"
      : "若只是发给阅读者，优先使用只读分享，后续更容易控制版本边界。",
    usePassword.value
      ? "已开启访问密码，适合在群聊、跨团队分发时使用。"
      : "未设置密码时，拿到链接的人都可以直接访问。",
    expiresIn.value === "never"
      ? "当前链接永久有效，建议仅用于稳定对内流转。"
      : `当前链接会在 ${expiryOptions.find((item) => item.value === expiresIn.value)?.label || "指定时长"} 后失效。`,
  ])

  const getShareUrl = (shareKey: string) => `${resolveWebBaseUrl()}/share/${shareKey}`

  const getSharePermissionLabel = (currentPermission: DocumentShare["permission"]) =>
    currentPermission === "view" ? "可查看" : "可编辑"

  const getShareExpiryText = (expiresAt: string | null) => {
    if (!expiresAt) {
      return "永久有效"
    }

    return `到期 ${formatDate(expiresAt)}`
  }

  async function loadShares() {
    loading.value = true

    try {
      shares.value = await getDocumentShares(options.documentId())
    } catch {
      options.showToastMessage("加载分享列表失败", "error")
    } finally {
      loading.value = false
    }
  }

  async function handleCreateShare() {
    if (usePassword.value && password.value.trim().length < 4) {
      options.showToastMessage("访问密码至少需要 4 位。", "error")
      return
    }

    creating.value = true

    try {
      let expiresAt: string | undefined

      if (expiresIn.value !== "never") {
        const now = new Date()
        const days = expiresIn.value === "1day" ? 1 : expiresIn.value === "7days" ? 7 : 30
        now.setDate(now.getDate() + days)
        expiresAt = now.toISOString()
      }

      await createDocumentShare(options.documentId(), {
        permission: permission.value,
        password: usePassword.value ? password.value.trim() : undefined,
        expiresAt,
      })

      options.showToastMessage("分享链接已创建。", "success")
      await loadShares()
      password.value = ""
      usePassword.value = false
      expiresIn.value = "never"
    } catch {
      options.showToastMessage("创建分享失败。", "error")
    } finally {
      creating.value = false
    }
  }

  /** 请求删除：先弹确认（ShareDialog 内渲染 ConfirmDialog），确认后再调 confirmDeleteShare */
  function requestDeleteShare(shareId: string) {
    pendingDeleteShareId.value = shareId
  }

  function cancelDeleteShare() {
    if (deleting.value) {
      return
    }

    pendingDeleteShareId.value = null
  }

  async function confirmDeleteShare() {
    const shareId = pendingDeleteShareId.value

    if (!shareId || deleting.value) {
      return
    }

    deleting.value = true

    try {
      await deleteDocumentShare(shareId)
      options.showToastMessage("分享已删除。", "success")
      pendingDeleteShareId.value = null
      await loadShares()
    } catch {
      options.showToastMessage("删除分享失败。", "error")
    } finally {
      deleting.value = false
    }
  }

  function copyToClipboard(text: string, successMessage = "已复制到剪贴板。") {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      options.showToastMessage("当前环境不支持剪贴板复制。", "error")
      return
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        options.showToastMessage(successMessage, "success")
      })
      .catch(() => {
        options.showToastMessage("复制失败。", "error")
      })
  }

  function copyShareMarkdownLink(share: DocumentShare) {
    copyToClipboard(
      `[${options.documentTitle()}](${getShareUrl(share.shareKey)})`,
      "Markdown 链接已复制。",
    )
  }

  function formatDate(dateString: string) {
    return formatDateTime(dateString)
  }

  watch(
    () => options.allowEditPermission(),
    (allowEdit) => {
      if (allowEdit === false) {
        permission.value = "view"
      }
    },
    { immediate: true },
  )

  watch(
    () => options.visible(),
    (visible) => {
      if (visible) {
        void loadShares()
      }
    },
    { immediate: true },
  )

  return {
    shares,
    loading,
    creating,
    permission,
    password,
    usePassword,
    expiresIn,
    expiryOptions,
    permissionOptions,
    sortedShares,
    canCreateShare,
    shareStats,
    creationSummary,
    latestShareSummary,
    shareTips,
    getShareUrl,
    getSharePermissionLabel,
    getShareExpiryText,
    loadShares,
    handleCreateShare,
    requestDeleteShare,
    cancelDeleteShare,
    confirmDeleteShare,
    pendingDeleteShareId,
    deleting,
    copyToClipboard,
    copyShareMarkdownLink,
    formatDate,
  }
}

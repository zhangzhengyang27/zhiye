/** 约束提示块的视觉语义。 */
export type CalloutVariant = "info" | "success" | "warning" | "danger"
/** 约束状态块的语义色。 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger"
/** 约束嵌入块的展示类型。 */
export type EmbedKind = "link" | "video" | "iframe"

/** 描述提示块节点在文档中保存的属性。 */
export interface CalloutBlockAttrs {
  variant: CalloutVariant
  title: string | null
}

/** 描述折叠详情块的标题与展开状态。 */
export interface DetailsBlockAttrs {
  title: string
  open: boolean
}

/** 描述附件块需要保存的文件展示信息。 */
export interface AttachmentBlockAttrs {
  url: string | null
  name: string | null
  size: number | null
  mime: string | null
}

/** 描述嵌入块的来源地址与展示形态。 */
export interface EmbedBlockAttrs {
  url: string | null
  title: string | null
  kind: EmbedKind
}

/** 描述状态块的标签文本与语义色。 */
export interface StatusBlockAttrs {
  label: string
  tone: StatusTone
}

/** 列出提示块可选的视觉变体及其界面标签。 */
export const calloutVariants: Array<{ value: CalloutVariant; label: string; icon: string }> = [
  { value: "info", label: "信息", icon: "i-lucide-info" },
  { value: "success", label: "成功", icon: "i-lucide-badge-check" },
  { value: "warning", label: "注意", icon: "i-lucide-triangle-alert" },
  { value: "danger", label: "风险", icon: "i-lucide-octagon-alert" },
]

/** 列出状态块在 UI 中可选的语义色。 */
export const statusToneOptions: Array<{ value: StatusTone; label: string }> = [
  { value: "neutral", label: "默认" },
  { value: "info", label: "进行中" },
  { value: "success", label: "已完成" },
  { value: "warning", label: "待确认" },
  { value: "danger", label: "已阻塞" },
]

/** 列出嵌入块支持的展示类型。 */
export const embedKindOptions: Array<{ value: EmbedKind; label: string }> = [
  { value: "link", label: "链接卡片" },
  { value: "video", label: "视频链接" },
  { value: "iframe", label: "网页嵌入" },
]

/** 提供提示块的默认属性。 */
export const calloutBlockDefaults: CalloutBlockAttrs = {
  variant: "info",
  title: null,
}

/** 提供详情块的默认属性。 */
export const detailsBlockDefaults: DetailsBlockAttrs = {
  title: "折叠说明",
  open: true,
}

/** 提供附件块的默认属性。 */
export const attachmentBlockDefaults: AttachmentBlockAttrs = {
  url: null,
  name: null,
  size: null,
  mime: null,
}

/** 提供嵌入块的默认属性。 */
export const embedBlockDefaults: EmbedBlockAttrs = {
  url: null,
  title: null,
  kind: "link",
}

/** 提供状态块的默认属性。 */
export const statusBlockDefaults: StatusBlockAttrs = {
  label: "处理中",
  tone: "neutral",
}

/** 用于校验提示块变体的候选集合。 */
const CALLOUT_VARIANT_SET = new Set<CalloutVariant>(calloutVariants.map((item) => item.value))
/** 用于校验状态块色调的候选集合。 */
const STATUS_TONE_SET = new Set<StatusTone>(statusToneOptions.map((item) => item.value))
/** 用于校验嵌入类型的候选集合。 */
const EMBED_KIND_SET = new Set<EmbedKind>(embedKindOptions.map((item) => item.value))

const normalizeNullableString = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized ? normalized : null
}

const normalizeString = (value: unknown, fallback: string) => {
  const normalized = normalizeNullableString(value)
  return normalized || fallback
}

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    if (value === "true") return true
    if (value === "false") return false
  }

  return fallback
}

const normalizeNumber = (value: unknown, fallback: number | null = null) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

/** 转义 HTML 文本中的保留字符。 */
export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

/** 规范化提示块块属性。 */
export const normalizeCalloutBlockAttrs = (
  input?: Partial<CalloutBlockAttrs> | null,
): CalloutBlockAttrs => {
  const variant =
    input?.variant && CALLOUT_VARIANT_SET.has(input.variant)
      ? input.variant
      : calloutBlockDefaults.variant

  return {
    variant,
    title: normalizeNullableString(input?.title),
  }
}

/** 规范化详情块属性。 */
export const normalizeDetailsBlockAttrs = (
  input?: Partial<DetailsBlockAttrs> | null,
): DetailsBlockAttrs => {
  return {
    title: normalizeString(input?.title, detailsBlockDefaults.title),
    open: normalizeBoolean(input?.open, detailsBlockDefaults.open),
  }
}

/** 规范化Attachment块属性。 */
export const normalizeAttachmentBlockAttrs = (
  input?: Partial<AttachmentBlockAttrs> | null,
): AttachmentBlockAttrs => {
  return {
    url: normalizeNullableString(input?.url),
    name: normalizeNullableString(input?.name),
    size: normalizeNumber(input?.size),
    mime: normalizeNullableString(input?.mime),
  }
}

/** 根据链接地址推断嵌入块应采用的展示类型。 */
export const detectEmbedKind = (url: string | null | undefined): EmbedKind => {
  if (!url) {
    return embedBlockDefaults.kind
  }

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()

    if (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("vimeo.com") ||
      host.includes("bilibili.com") ||
      host.includes("youku.com")
    ) {
      return "video"
    }

    if (parsed.pathname.includes("/embed") || parsed.searchParams.get("embed") === "1") {
      return "iframe"
    }
  } catch {
    return embedBlockDefaults.kind
  }

  return "link"
}

/** 规范化嵌入块属性。 */
export const normalizeEmbedBlockAttrs = (
  input?: Partial<EmbedBlockAttrs> | null,
): EmbedBlockAttrs => {
  const url = normalizeNullableString(input?.url)
  const kind = input?.kind && EMBED_KIND_SET.has(input.kind) ? input.kind : detectEmbedKind(url)

  return {
    url,
    title: normalizeNullableString(input?.title),
    kind,
  }
}

/** 规范化状态块属性。 */
export const normalizeStatusBlockAttrs = (
  input?: Partial<StatusBlockAttrs> | null,
): StatusBlockAttrs => {
  const tone =
    input?.tone && STATUS_TONE_SET.has(input.tone) ? input.tone : statusBlockDefaults.tone

  return {
    label: normalizeString(input?.label, statusBlockDefaults.label),
    tone,
  }
}

/** 返回提示块变体在界面上的显示名称。 */
export const getCalloutVariantLabel = (variant: CalloutVariant) => {
  return (
    calloutVariants.find((item) => item.value === variant)?.label || calloutBlockDefaults.variant
  )
}

/** 获取状态色调标签。 */
export const getStatusToneLabel = (tone: StatusTone) => {
  return statusToneOptions.find((item) => item.value === tone)?.label || statusBlockDefaults.tone
}

/** 返回附件块优先展示的文件名。 */
export const getAttachmentDisplayName = (attrs: Partial<AttachmentBlockAttrs>) => {
  return normalizeNullableString(attrs.name) || "未命名附件"
}

/** 将字节大小格式化为适合界面展示的文本。 */
export const formatFileSize = (size: number | null | undefined) => {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return "未知大小"
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size >= 10 * 1024 ? 0 : 1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

/** 根据 MIME 类型返回附件的展示分类。 */
export const getAttachmentTypeLabel = (mime: string | null | undefined) => {
  if (!mime) {
    return "附件"
  }

  if (mime.startsWith("image/")) {
    return "图片附件"
  }

  if (mime.startsWith("video/")) {
    return "视频附件"
  }

  if (mime.includes("pdf")) {
    return "PDF"
  }

  if (mime.includes("sheet") || mime.includes("excel")) {
    return "表格文件"
  }

  if (mime.includes("word") || mime.includes("document")) {
    return "文档文件"
  }

  return "附件"
}

/** 获取嵌入主机标签。 */
export const getEmbedHostLabel = (url: string | null | undefined) => {
  if (!url) {
    return "未设置地址"
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "链接地址"
  }
}

/** 返回嵌入块在卡片中展示的标题文案。 */
export const getEmbedDisplayTitle = (attrs: Partial<EmbedBlockAttrs>) => {
  const normalized = normalizeEmbedBlockAttrs(attrs)

  if (normalized.title) {
    return normalized.title
  }

  if (!normalized.url) {
    return "输入一个链接，生成嵌入卡片"
  }

  switch (normalized.kind) {
    case "video":
      return "视频链接"
    case "iframe":
      return "网页嵌入"
    default:
      return "链接卡片"
  }
}

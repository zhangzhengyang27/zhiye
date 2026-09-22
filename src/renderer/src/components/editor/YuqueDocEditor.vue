<script setup lang="ts">
/**
 * Lake 编辑器（yuque-editor-core）的宿主组件：
 * - 向内核转发内容、格式、工具栏配置与四类媒体上传通道（业务层统一消费 File）；
 * - editorReady 抛出 YuqueEditorRef 命令面（格式化、插入、字数等），
 *   surfaceReady 抛出表面根节点（评论系统、划词浮动条以它为容器锚）；
 * - 可选在 Lake 工具栏末尾注入「代码块」插入按钮（内核工具栏白名单无此 key）。
 * 模板插槽 surface-header 与 surface-footer 渲染在表面顶端与底端（编辑页用它们
 * 挂标题宿主的 Teleport、保存状态条与字数统计）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { YuqueRichText } from "yuque-editor-core/vue"
import type { EditorUploadHandler, YuqueDocScheme, YuqueEditorRef } from "yuque-editor-core/editor"

const props = withDefaults(
  defineProps<{
    /** 编辑内容（v-model），scheme 由 contentType 决定 */
    modelValue: string
    /** 内容格式：markdown 或 html（映射 Lake 的 scheme） */
    contentType?: "markdown" | "html"
    /** 是否可编辑：false 时内核走 readOnly */
    editable?: boolean
    /** 是否显示 Lake 工具栏 */
    showToolbar?: boolean
    /** 是否在工具栏末尾注入「代码块」插入按钮 */
    showCodeBlockButton?: boolean
    /** 阅读态自适应高度：不约束表面高度，滚动交给外层容器 */
    autoHeight?: boolean
    /** 工具栏白名单（不传用内核默认项） */
    toolbarItems?: string[]
    /** 构造期默认字号（px），运行期不可改 */
    defaultFontSize?: number
    /** 段间距宽松档（构造期配置，运行期不可改） */
    paragraphSpacing?: boolean
    /** 图片上传：业务层消费 File，返回可访问 URL */
    onImageUpload?: (file: File) => Promise<string>
    /** 视频上传：业务层消费 File，返回可访问 URL */
    onVideoUpload?: (file: File) => Promise<string>
    /** 附件上传：业务层消费 File，返回可访问 URL */
    onFileUpload?: (file: File) => Promise<string>
    /** 音频上传：业务层消费 File，返回可访问 URL */
    onAudioUpload?: (file: File) => Promise<string>
  }>(),
  {
    contentType: "markdown",
    editable: true,
    showToolbar: true,
    showCodeBlockButton: false,
    autoHeight: false,
    paragraphSpacing: false,
  }
)

const emit = defineEmits<{
  "update:modelValue": [value: string]
  /** Lake 实例就绪（含重建），携带 YuqueEditorRef 命令面 */
  editorReady: [api: YuqueEditorRef]
  /** 表面根节点就绪，评论系统、划词浮动条以它为容器锚 */
  surfaceReady: [surface: HTMLElement]
}>()

/** 表面根节点：Lake 的 DOM（.ne-editor 等）挂载其内，经 surfaceReady 抛给宿主 */
const surfaceRef = ref<HTMLElement | null>(null)
/** Lake 内核组件实例，expose 即 YuqueEditorRef 命令面（见 handleLoad 的收敛转换） */
const editorComponentRef = ref<unknown>(null)
const editorApi = ref<YuqueEditorRef | null>(null)
/** 宿主注入工具栏的「代码块」按钮（命令式 DOM，编辑器重建时随旧 DOM 一并丢弃） */
let codeBlockButton: HTMLButtonElement | null = null

const scheme = computed<YuqueDocScheme>(() => (props.contentType === "html" ? "text/html" : "text/markdown"))

const handleContentChange = (value: string) => {
  emit("update:modelValue", value)
}

/** 注入按钮的图标：随 currentColor 着色，与 Lake 工具栏项同观感 */
const CODE_BLOCK_BUTTON_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>'

/**
 * 点击插入代码块：与内核 insertCardByUI 的 codeblock 处理器同链路
 * （execCommand("insertCard", …) + 自构基础 cardValue——缺 cardValue 的空卡片
 * 会被 markdown 序列化丢弃）。主题枚举内核未暴露，新建固定 Github Light。
 */
const insertCodeBlock = () => {
  editorApi.value?.execCommand("insertCard", "codeblock", { code: "", mode: "plain", theme: "Github Light" }, true)
}

const removeCodeBlockButton = () => {
  codeBlockButton?.remove()
  codeBlockButton = null
}

const mountCodeBlockButton = () => {
  // 编辑器重建后旧按钮随旧 DOM 被丢弃：仍连接则跳过，脱离文档则清引用重挂
  if (codeBlockButton?.isConnected) {
    return
  }
  removeCodeBlockButton()

  const toolbar = surfaceRef.value?.querySelector(".ne-ui")
  if (!toolbar) {
    return
  }

  const button = document.createElement("button")
  button.type = "button"
  button.className = "lake-toolbar-codeblock-btn"
  button.title = "代码块"
  button.setAttribute("aria-label", "插入代码块")
  button.innerHTML = CODE_BLOCK_BUTTON_ICON
  button.addEventListener("click", insertCodeBlock)
  toolbar.appendChild(button)
  codeBlockButton = button
}

onMounted(() => {
  if (surfaceRef.value) {
    emit("surfaceReady", surfaceRef.value)
  }
})

onBeforeUnmount(removeCodeBlockButton)

/**
 * 字号/段间距是 Lake 的构造期配置，运行期不可改：内核组件监听这两个 props
 * 的变化并整实例重建（见 yuque-editor-core vue 层实现），此处无需额外的
 * instanceKey 逃生舱——重建会清空撤销历史，调用方应在提交时机上做收敛。
 */

const handleLoad = () => {
  const api = editorComponentRef.value as YuqueEditorRef | null

  if (api) {
    editorApi.value = api
    emit("editorReady", api)
  }

  if (props.showCodeBlockButton && props.editable && props.showToolbar) {
    void nextTick(mountCodeBlockButton)
  }
}

/**
 * 将 Lake 的上传钩子桥接到业务上传函数。
 * Lake 在粘贴/插入图片时回调 type=file（本地文件）或 base64（内联图），
 * 业务层统一消费 File；未配置上传函数时降级为内联 base64 保证编辑不中断。
 * 读取业务函数走 getter：函数引用变化不触发内核重建（构造期配置语义），
 * 桥接层始终转发最新的业务函数。
 */
const dataUrlToFile = (data: string): File => {
  const match = /^data:([^;,]*)[^,]*,([\s\S]*)$/.exec(data)
  const mime = match?.[1] || "image/png"
  const payload = match?.[2] ?? data
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], `inline-${Date.now()}.png`, { type: mime })
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("内联图片读取失败"))
    reader.readAsDataURL(file)
  })
}

type BusinessUploadHandler = (file: File) => Promise<string>

const bridgeUpload = (getUpload: () => BusinessUploadHandler | undefined): EditorUploadHandler => {
  return async ({ type, data }) => {
    // 外链地址（如视频 URL）：没有 File 可交业务层，直接透传
    if (type === "url") {
      return { url: String(data), size: 0 }
    }

    // 统一为 File：type=file 原样；type=base64（内联图的 dataURL）解码构造
    const file = typeof data === "string" ? dataUrlToFile(data) : data

    const upload = getUpload()
    if (!upload) {
      // 降级为内联 base64：不落上传链路，编辑不中断
      const url = typeof data === "string" ? data : await fileToDataUrl(data)
      return { url, size: file.size }
    }

    const url = await upload(file)
    return { url, size: file.size }
  }
}

const uploadImage = bridgeUpload(() => props.onImageUpload)
const uploadVideo = bridgeUpload(() => props.onVideoUpload)
const uploadFile = bridgeUpload(() => props.onFileUpload)
const uploadAudio = bridgeUpload(() => props.onAudioUpload)
</script>

<template>
  <div
    class="yuque-doc-editor relative flex w-full flex-col"
    :class="autoHeight ? '' : 'h-full min-h-0'"
  >
    <div
      ref="surfaceRef"
      class="yuque-doc-editor__surface relative flex w-full flex-col"
      :class="autoHeight ? '' : 'min-h-0 flex-1'"
    >
      <slot name="surface-header" />
      <YuqueRichText
        ref="editorComponentRef"
        class="yuque-doc-editor__body min-h-0 flex-1"
        :value="modelValue"
        :scheme="scheme"
        :read-only="!editable"
        :show-toolbar="showToolbar"
        :toolbar-items="toolbarItems"
        :default-font-size="defaultFontSize"
        :paragraph-spacing="paragraphSpacing"
        :upload-image="uploadImage"
        :upload-video="uploadVideo"
        :upload-file="uploadFile"
        :upload-audio="uploadAudio"
        @change="handleContentChange"
        @load="handleLoad"
      />
      <slot name="surface-footer" />
    </div>
  </div>
</template>

<style scoped>
/* Lake 工具栏无选区时按钮呈 disabled 灰态，与语雀常态工具栏不符，这里恢复常态观感 */
.yuque-doc-editor :deep(.ne-ui button:disabled) {
  opacity: 1;
  color: inherit;
}

/* 宿主注入的「代码块」按钮：对齐 Lake 工具栏项的尺寸与交互态 */
.yuque-doc-editor :deep(.lake-toolbar-codeblock-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.yuque-doc-editor :deep(.lake-toolbar-codeblock-btn:hover) {
  background: color-mix(in srgb, currentColor 8%, transparent);
}

.yuque-doc-editor :deep(.lake-toolbar-codeblock-btn svg) {
  width: 16px;
  height: 16px;
}
</style>

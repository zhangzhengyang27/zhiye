<script setup lang="ts">
/**
 * 分享链接二维码弹窗（对齐语雀分享弹层的扫码访问）。
 * 二维码按需生成（qrcode 动态导入，避免进入首屏 chunk），
 * 支持复制链接与下载 PNG。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / IME Esc 守卫）走 composable；chrome 类由 bindings 携带，语雀对话框
 * 观感在全局校准层 el-dialog 段；头部（角标 + 标题 + 关闭钮）走 KbDialogHeader。
 */
import { ref, watch } from "vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

const props = defineProps<{
  open: boolean
  url: string
  /** 弹窗描述里的文档名，仅用于展示 */
  documentTitle: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { showToastMessage } = useTransientToast()

const qrDataUrl = ref("")
const generating = ref(false)

// 请求序号守卫：快速切换 url / 关-开弹窗时，慢的旧结果不得覆盖新二维码
let qrSeq = 0

watch(
  () => [props.open, props.url] as const,
  async ([open, url]) => {
    const seq = ++qrSeq
    if (!open || !url) {
      qrDataUrl.value = ""
      generating.value = false
      return
    }

    generating.value = true
    try {
      const { default: QRCode } = await import("qrcode")
      const dataUrl = await QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        // 固定黑白不随主题：二维码要靠这两色的对比度被相机识别，换成暗色档会扫不出
        color: { dark: "#0f172a", light: "#ffffff" },
      })
      if (seq !== qrSeq) return
      qrDataUrl.value = dataUrl
    } catch {
      if (seq !== qrSeq) return
      qrDataUrl.value = ""
      showToastMessage("二维码生成失败，请稍后重试。", "error")
    } finally {
      if (seq === qrSeq) {
        generating.value = false
      }
    }
  },
  { immediate: true },
)

const downloadQr = () => {
  if (!qrDataUrl.value) return

  const anchor = document.createElement("a")
  anchor.href = qrDataUrl.value
  anchor.download = `share-qr-${Date.now()}.png`
  anchor.click()
}

const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <!-- el-dialog 的关闭契约：Esc/遮罩/× 都走 update:model-value(false)，这里转成对外的 close 事件 -->
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-sm"
    :model-value="open"
    title="扫码访问"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && emit('close')"
  >
    <template #header>
      <KbDialogHeader title="扫码访问" eyebrow="分享设置" @close="emit('close')" />
    </template>

    <div class="flex flex-col items-center gap-4">
      <div
        class="flex h-[240px] w-[240px] items-center justify-center overflow-hidden rounded-kb-2xl border border-line bg-white"
      >
        <AppIcon
          v-if="generating"
          name="i-lucide-loader-circle"
          class="h-6 w-6 animate-spin text-ink-quaternary"
        />
        <img
          v-else-if="qrDataUrl"
          :src="qrDataUrl"
          alt="分享链接二维码"
          class="h-full w-full object-contain"
        />
        <span v-else class="px-6 text-center text-[12px] text-ink-tertiary">二维码暂不可用</span>
      </div>

      <p class="max-w-full break-all text-center text-[12px] leading-5 text-ink-tertiary">
        {{ url }}
      </p>
      <p class="text-[12px] text-ink-quaternary">
        「{{ documentTitle }}」的分享链接，扫码或长按识别访问。
      </p>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-3">
        <el-button plain size="small" class="rounded-kb-xl" @click="downloadQr"
          ><span class="truncate">下载 PNG</span>
        </el-button>
        <el-button type="primary" size="small" class="rounded-kb-xl" @click="emit('close')"
          ><span class="truncate">完成</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

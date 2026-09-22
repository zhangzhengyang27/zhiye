<script setup lang="ts">
/**
 * 对话框组件，负责AvatarCrop的确认、输入与提交流程。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / IME Esc 守卫）走 composable；chrome 类由 bindings 携带，语雀对话框
 * 观感在全局校准层 el-dialog 段；头部（标题 + 描述 + 关闭钮）走 KbDialogHeader。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { ElMessage } from "element-plus"
import { logger } from "@/utils/logger"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

const props = defineProps<{
  open: boolean
  sourceUrl: string
  filename?: string
}>()

const emit = defineEmits<{
  (e: "update:open", value: boolean): void
  (e: "confirm", file: File): void
}>()

const VIEWPORT_SIZE = 320
const OUTPUT_SIZE = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3

const imageRef = ref<HTMLImageElement | null>(null)
const imageReady = ref(false)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const baseScale = ref(1)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const exporting = ref(false)

const dragState = {
  active: false,
  startClientX: 0,
  startClientY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
}

const displayedWidth = computed(() => naturalWidth.value * baseScale.value * zoom.value)
const displayedHeight = computed(() => naturalHeight.value * baseScale.value * zoom.value)

const clampOffset = (nextOffsetX: number, nextOffsetY: number) => {
  const width = displayedWidth.value
  const height = displayedHeight.value

  const minOffsetX = Math.min(0, VIEWPORT_SIZE - width)
  const minOffsetY = Math.min(0, VIEWPORT_SIZE - height)

  const resolvedOffsetX =
    width <= VIEWPORT_SIZE
      ? (VIEWPORT_SIZE - width) / 2
      : Math.max(minOffsetX, Math.min(0, nextOffsetX))

  const resolvedOffsetY =
    height <= VIEWPORT_SIZE
      ? (VIEWPORT_SIZE - height) / 2
      : Math.max(minOffsetY, Math.min(0, nextOffsetY))

  return {
    x: resolvedOffsetX,
    y: resolvedOffsetY,
  }
}

const centerImage = () => {
  const centered = clampOffset(
    (VIEWPORT_SIZE - displayedWidth.value) / 2,
    (VIEWPORT_SIZE - displayedHeight.value) / 2,
  )

  offsetX.value = centered.x
  offsetY.value = centered.y
}

const resetPreview = () => {
  imageReady.value = false
  naturalWidth.value = 0
  naturalHeight.value = 0
  baseScale.value = 1
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

const imageStyle = computed(() => ({
  width: `${displayedWidth.value}px`,
  height: `${displayedHeight.value}px`,
  transform: `translate(${offsetX.value}px, ${offsetY.value}px)`,
}))

const stopDragging = () => {
  if (!dragState.active) {
    return
  }

  dragState.active = false
  window.removeEventListener("pointermove", handleWindowPointerMove)
  window.removeEventListener("pointerup", handleWindowPointerUp)
  window.removeEventListener("pointercancel", handleWindowPointerCancel)
}

const handleWindowPointerMove = (event: PointerEvent) => {
  if (!dragState.active) {
    return
  }

  const nextOffsetX = dragState.startOffsetX + event.clientX - dragState.startClientX
  const nextOffsetY = dragState.startOffsetY + event.clientY - dragState.startClientY
  const clamped = clampOffset(nextOffsetX, nextOffsetY)

  offsetX.value = clamped.x
  offsetY.value = clamped.y
}

const handleWindowPointerUp = () => {
  stopDragging()
}

/** 触屏拖拽被系统手势打断（来电/通知中心等）时不派发 pointerup，靠 cancel 收尾防拖拽态卡死 */
const handleWindowPointerCancel = () => {
  stopDragging()
}

const handlePointerDown = (event: PointerEvent) => {
  if (!imageReady.value) {
    return
  }

  dragState.active = true
  dragState.startClientX = event.clientX
  dragState.startClientY = event.clientY
  dragState.startOffsetX = offsetX.value
  dragState.startOffsetY = offsetY.value

  window.addEventListener("pointermove", handleWindowPointerMove)
  window.addEventListener("pointerup", handleWindowPointerUp)
  window.addEventListener("pointercancel", handleWindowPointerCancel)
}

const handleZoomInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const nextZoom = Number(target.value)

  if (Number.isNaN(nextZoom)) {
    return
  }

  zoom.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
}

const handleImageLoad = async () => {
  await nextTick()

  const imageElement = imageRef.value

  if (!imageElement) {
    resetPreview()
    return
  }

  naturalWidth.value = imageElement.naturalWidth
  naturalHeight.value = imageElement.naturalHeight

  if (!naturalWidth.value || !naturalHeight.value) {
    resetPreview()
    return
  }

  baseScale.value = Math.max(
    VIEWPORT_SIZE / naturalWidth.value,
    VIEWPORT_SIZE / naturalHeight.value,
  )
  zoom.value = 1
  imageReady.value = true
  centerImage()
}

const handleClose = () => {
  stopDragging()
  exporting.value = false
  emit("update:open", false)
}

const handleConfirm = async () => {
  if (!imageReady.value || !imageRef.value || exporting.value) {
    return
  }

  exporting.value = true

  try {
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE

    const context = canvas.getContext("2d")

    if (!context) {
      throw new Error("浏览器不支持头像裁剪")
    }

    const sourceX = (-offsetX.value * naturalWidth.value) / displayedWidth.value
    const sourceY = (-offsetY.value * naturalHeight.value) / displayedHeight.value
    const sourceWidth = (VIEWPORT_SIZE * naturalWidth.value) / displayedWidth.value
    const sourceHeight = (VIEWPORT_SIZE * naturalHeight.value) / displayedHeight.value

    context.drawImage(
      imageRef.value,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    )

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png")
    })

    if (!blob) {
      throw new Error("头像裁剪导出失败")
    }

    const baseName = props.filename?.replace(/\.[^.]+$/, "") || "avatar"
    const file = new File([blob], `${baseName}-cropped.png`, { type: "image/png" })

    emit("confirm", file)
    emit("update:open", false)
  } catch (error) {
    // 画布污染/导出失败时弹窗保持打开并给出反馈，而不是静默未处理拒绝
    logger.error("AvatarCropDialog", "裁剪导出失败:", error)
    ElMessage.error("头像裁剪失败，请换一张图片重试。")
  } finally {
    exporting.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      stopDragging()
      resetPreview()
    }
  },
)

watch(
  () => props.sourceUrl,
  () => {
    if (!props.open) {
      return
    }

    resetPreview()
  },
)

watch(zoom, () => {
  if (!imageReady.value) {
    return
  }

  const clamped = clampOffset(offsetX.value, offsetY.value)
  offsetX.value = clamped.x
  offsetY.value = clamped.y
})

onBeforeUnmount(() => {
  stopDragging()
})

const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-2xl"
    :model-value="open"
    title="裁剪头像"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && emit('update:open', false)"
  >
    <template #header>
      <KbDialogHeader
        title="裁剪头像"
        description="拖动图片调整取景，确认后会导出 512 x 512 的方形头像。"
        @close="handleClose"
      />
    </template>

    <div class="space-y-4">
      <div class="rounded-kb-3xl border border-line bg-muted p-4">
        <div
          class="relative mx-auto overflow-hidden rounded-kb-3xl border border-line bg-[linear-gradient(135deg,var(--color-grey-300),var(--color-grey-100))] shadow-inner select-none"
          :style="{ width: `${VIEWPORT_SIZE}px`, height: `${VIEWPORT_SIZE}px` }"
          @pointerdown.prevent="handlePointerDown"
        >
          <img
            v-if="sourceUrl"
            ref="imageRef"
            :src="sourceUrl"
            alt="头像裁剪预览"
            class="absolute left-0 top-0 max-w-none touch-none select-none"
            :style="imageStyle"
            draggable="false"
            @load="handleImageLoad"
          />

          <div
            class="pointer-events-none absolute inset-0 rounded-kb-3xl ring-1 ring-inset ring-white/70"
          />
          <div
            class="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_calc(100%-1px),rgba(255,255,255,0.22)_0),linear-gradient(90deg,transparent_calc(100%-1px),rgba(255,255,255,0.22)_0)] bg-[size:40px_40px] opacity-50"
          />
        </div>
      </div>

      <div class="space-y-3 rounded-kb-3xl border border-line bg-surface p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-ink">缩放与拖拽</p>
            <p class="text-xs text-ink-tertiary">
              拖动图片调整取景，确认后会导出 512 x 512 的方形头像。
            </p>
          </div>
          <button
            type="button"
            class="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
            @click="centerImage"
          >
            重新居中
          </button>
        </div>

        <div class="flex items-center gap-3">
          <input
            :value="zoom"
            type="range"
            min="1"
            max="3"
            step="0.01"
            aria-label="头像缩放"
            class="h-2 w-full cursor-pointer appearance-none rounded-full bg-fill-muted accent-brand"
            @input="handleZoomInput"
          />
          <span class="w-14 text-right text-sm font-medium text-ink-secondary">
            {{ Math.round(zoom * 100) }}%
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button text @click="handleClose"><span class="truncate">取消</span> </el-button>
        <el-button type="primary" :disabled="!imageReady || exporting" @click="handleConfirm"
          ><span class="truncate">{{ exporting ? "导出中…" : "确认裁剪" }}</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

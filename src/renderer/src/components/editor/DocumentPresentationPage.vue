<script setup lang="ts">
/**
 * 文档「开始演示」全屏放映页（2026-09-25 语雀真机取证对齐）。
 *
 * 语雀的展示板按钮 = 演示：点击「开始演示」后窗口切真全屏，按分页方案放映
 * 文档内容，底部深色工具条承载翻页/页码/退出（继续/分页/自动滚动/计时属
 * 语雀专注模式组件，本产品无对应实现，不造假渲染）。
 *
 * 翻页壳用 Swiper（Keyboard 键盘翻页 + fraction 页码 + A11y）；切分逻辑见
 * utils/presentation.ts。全屏机制与讨论页同款：进入时请求真全屏（失败静默
 * 降级为页内覆盖层），关闭/卸载对称退出。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
import { Swiper, SwiperSlide } from "swiper/vue"
import type { Swiper as SwiperInstance } from "swiper"
// Swiper 按模块化引入样式（vite 可直接消费其 css 导出）
import "swiper/css"
import { A11y } from "swiper/modules"
import Icon from "@/components/common/UiIcon.vue"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"
import {
  loadPaginationScheme,
  renderDocumentToBlocks,
  resolvePageStartIndexes,
  splitPages,
} from "@/utils/presentation"

const props = withDefaults(
  defineProps<{
    documentTitle: string
    content: string
    scheme?: "text/markdown" | "text/html"
    docId: string
    /** 初始页码（编辑分页后「预览放映」可从指定页进入） */
    initialPage?: number
  }>(),
  {
    scheme: "text/markdown",
    initialPage: 0,
  },
)

const emit = defineEmits<{
  close: []
  /** 打开「编辑演示分页」 */
  "edit-pagination": []
}>()

const swiperRef = shallowRef<SwiperInstance | null>(null)
const activeIndex = ref(0)

const blocks = computed(() => renderDocumentToBlocks(props.content, props.scheme))
const pages = computed(() =>
  splitPages(
    blocks.value,
    resolvePageStartIndexes(blocks.value, loadPaginationScheme(props.docId)),
  ),
)

const isImmersiveFullscreen = ref(false)
const requestImmersiveFullscreen = () => {
  if (typeof document === "undefined" || document.fullscreenElement) {
    return
  }
  document.documentElement
    .requestFullscreen()
    .then(() => {
      isImmersiveFullscreen.value = true
    })
    .catch(() => undefined)
}
const exitImmersiveFullscreen = () => {
  if (isImmersiveFullscreen.value && document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined)
  }
  isImmersiveFullscreen.value = false
}

const closePresentation = () => {
  exitImmersiveFullscreen()
  emit("close")
}

/** 键盘控制：Esc 退出；←/PageUp/Home 上一页，→/空格/PageDown/End 下一页。
 *  自行监听而非 Swiper Keyboard 模块：翻页语义与工具条按钮完全一致 */
const handleKeydown = (event: KeyboardEvent) => {
  if (isImeComposing(event) || hasOpenDialog()) {
    return
  }
  if (event.key === "Escape") {
    closePresentation()
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return
  }
  const target = event.target as HTMLElement | null
  if (target?.closest("input, textarea, select, [contenteditable=true]")) {
    return
  }
  const key = event.key
  if (key === "ArrowRight" || key === " " || key === "PageDown" || key === "Enter") {
    event.preventDefault()
    slideNext()
    return
  }
  if (key === "ArrowLeft" || key === "PageUp") {
    event.preventDefault()
    slidePrev()
    return
  }
  if (key === "Home") {
    event.preventDefault()
    swiperRef.value?.slideTo(0)
    return
  }
  if (key === "End") {
    event.preventDefault()
    swiperRef.value?.slideTo(pages.value.length - 1)
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown)
  requestImmersiveFullscreen()
  // 编辑分页保存后的「预览放映」可从指定页进入
  const target = props.initialPage
  if (target > 0 && target < pages.value.length) {
    swiperRef.value?.slideTo(target, 0)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
  exitImmersiveFullscreen()
})

const onSwiper = (swiper: SwiperInstance) => {
  swiperRef.value = swiper
  activeIndex.value = swiper.activeIndex
}

const onSlideChange = (swiper: SwiperInstance) => {
  activeIndex.value = swiper.activeIndex
}

const slidePrev = () => swiperRef.value?.slidePrev()
const slideNext = () => swiperRef.value?.slideNext()

/** 演示中转编辑分页：先退出全屏再交由父级打开对话框（多语句禁写内联 handler） */
const editPaginationFromPresentation = () => {
  exitImmersiveFullscreen()
  emit("edit-pagination")
}
</script>

<template>
  <div
    class="fixed inset-0 z-[var(--kb-z-overlay)] flex flex-col bg-surface"
    role="dialog"
    aria-label="演示"
  >
    <!-- 左上角文档名小字（对齐语雀演示态） -->
    <div
      class="pointer-events-none absolute left-5 top-4 z-10 max-w-[360px] truncate text-[12px] text-ink-quaternary"
    >
      {{ documentTitle || "无标题文档" }}
    </div>

    <!-- 放映主体：Swiper 翻页，每页为文档切片内容 -->
    <div class="min-h-0 flex-1">
      <Swiper
        class="h-full"
        :modules="[A11y]"
        :initial-slide="Math.min(initialPage, Math.max(pages.length - 1, 0))"
        :keyboard="{ enabled: true, onlyInViewport: false }"
        :speed="240"
        :auto-height="false"
        @swiper="onSwiper"
        @slide-change="onSlideChange"
      >
        <SwiperSlide v-for="(page, index) in pages" :key="page.startIndex" class="overflow-y-auto">
          <div
            class="mx-auto flex min-h-full w-full max-w-[1080px] flex-col justify-center px-16 py-20"
          >
            <div class="kb-presentation-slide" v-html="page.html" />
            <p
              v-if="pages.length > 1"
              class="pointer-events-none mt-auto pt-8 text-right text-[12px] text-ink-quaternary"
            >
              {{ index + 1 }} / {{ pages.length }}
            </p>
          </div>
        </SwiperSlide>
      </Swiper>
    </div>

    <!-- 底部深色工具条（对齐语雀演示底条；仅真实能力：翻页/页码/编辑分页/退出） -->
    <div class="fixed bottom-6 left-1/2 z-10 -translate-x-1/2">
      <div
        class="flex items-center gap-1 rounded-kb-xl bg-grey-900/95 px-2 py-1.5 shadow-[var(--kb-surface-shadow)]"
      >
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-kb-lg text-grey-100! transition hover:bg-grey-800! disabled:cursor-default disabled:opacity-40"
          title="上一页（←）"
          :disabled="activeIndex === 0"
          @click="slidePrev"
        >
          <Icon icon="i-lucide-chevron-left" class="h-4 w-4" />
        </button>
        <span
          class="min-w-[64px] text-center text-[12px] text-grey-100!"
          data-presentation-counter
        >
          {{ pages.length > 0 ? activeIndex + 1 : 0 }} / {{ pages.length }}
        </span>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-kb-lg text-grey-100! transition hover:bg-grey-800! disabled:cursor-default disabled:opacity-40"
          title="下一页（→ / 空格）"
          :disabled="pages.length === 0 || activeIndex >= pages.length - 1"
          @click="slideNext"
        >
          <Icon icon="i-lucide-chevron-right" class="h-4 w-4" />
        </button>
        <span class="mx-0.5 h-4 w-px bg-grey-700!" />
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-kb-lg px-2.5 text-[12px] text-grey-100! transition hover:bg-grey-800!"
          title="编辑演示分页"
          @click="editPaginationFromPresentation"
        >
          <Icon icon="i-lucide-layout-list" class="h-3.5 w-3.5" />
          编辑分页
        </button>
        <span class="mx-0.5 h-4 w-px bg-grey-700!" />
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-kb-lg px-2.5 text-[12px] text-grey-100! transition hover:bg-grey-800!"
          title="退出演示（Esc）"
          @click="closePresentation"
        >
          <Icon icon="i-lucide-minimize-2" class="h-3.5 w-3.5" />
          退出
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* 放映页文档排版：字号放大到演示观感。unlayered 压过 antd.css 对排版元素的
   劫持（坑 6/13）；HTML 出口已过 renderKnowledgeDocumentBody 的 DOMPurify 消毒 */
.kb-presentation-slide {
  color: var(--kb-text);
  font-size: 30px;
  line-height: 1.55;
}
.kb-presentation-slide h1 {
  font-size: 1.6em;
  font-weight: 700;
  margin: 0.5em 0 0.4em;
}
.kb-presentation-slide h2 {
  font-size: 1.35em;
  font-weight: 700;
  margin: 0.5em 0 0.35em;
}
.kb-presentation-slide h3,
.kb-presentation-slide h4 {
  font-size: 1.15em;
  font-weight: 600;
  margin: 0.45em 0 0.3em;
}
.kb-presentation-slide p {
  margin: 0.35em 0;
}
.kb-presentation-slide ul,
.kb-presentation-slide ol {
  padding-left: 1.4em;
  margin: 0.35em 0;
}
.kb-presentation-slide li {
  margin: 0.2em 0;
}
.kb-presentation-slide img {
  max-width: 100%;
  max-height: 52vh;
  object-fit: contain;
}
.kb-presentation-slide pre {
  font-size: 0.55em;
  line-height: 1.5;
  background: var(--kb-muted-bg);
  border-radius: 12px;
  padding: 1em 1.2em;
  overflow: auto;
  max-height: 56vh;
}
.kb-presentation-slide table {
  font-size: 0.62em;
  border-collapse: collapse;
  max-width: 100%;
}
.kb-presentation-slide table td,
.kb-presentation-slide table th {
  border: 1px solid var(--kb-border);
  padding: 0.4em 0.7em;
}
.kb-presentation-slide blockquote {
  border-left: 3px solid var(--kb-border);
  margin: 0.4em 0;
  padding: 0.1em 0 0.1em 1em;
  color: var(--kb-text-secondary);
}
.kb-presentation-slide hr {
  border: none;
  border-top: 1px solid var(--kb-border);
  margin: 0.6em 0;
}
/* Swiper 翻页关掉默认触摸选中干扰；键盘翻页由 Keyboard 模块承担 */
.kb-presentation-slide {
  user-select: text;
}
</style>

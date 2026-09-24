<script setup lang="ts">
/**
 * 顶栏动作浮层统一壳：锚定触发钮下方的自绘 popper（收藏 / 分享 / 协作者共用）。
 *
 * 收编此前三处浮层各自手写的定位、圆角阴影、开合动画、点外关闭与 Esc 关闭；
 * z 走 tokens 的 --kb-z-dropdown 档（高于页头 sticky、低于对话框家族），
 * 不再散落 z-40 字面量（坑 11：有层级要求的弹层一律显式钉 z）。
 *
 * 用法：anchor 插槽放触发钮（拿 slot 的 open/toggle 做激活态与自定义门禁），
 * 默认插槽放浮层内容；带 title 时渲染「标题 + 关闭」紧凑头部。
 */
import { onBeforeUnmount, ref, watch } from "vue"
import { onClickOutside } from "@vueuse/core"
import UiIcon from "@/components/common/UiIcon.vue"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 浮层宽度（px）；收藏 288 / 分享 400 / 协作者 420 */
    width?: number
    /** 可选标题；传入时渲染紧凑头部（标题 + 关闭钮） */
    title?: string
  }>(),
  {
    width: 320,
    title: "",
  },
)

const emit = defineEmits<{
  close: []
  toggle: []
}>()

const rootRef = ref<HTMLElement | null>(null)

/** 点外关闭的判定根包含触发钮：点触发钮走 toggle 语义，不会先关再弹 */
onClickOutside(rootRef, () => {
  if (props.open) {
    emit("close")
  }
})

/** Esc 关闭（对话框压顶时让位；输入法组词中的 Esc 是取消候选，不关浮层） */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !props.open || isImeComposing(event)) {
    return
  }
  if (hasOpenDialog()) {
    return
  }
  emit("close")
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener("keydown", handleKeydown)
    } else {
      window.removeEventListener("keydown", handleKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
  <div ref="rootRef" class="relative shrink-0">
    <slot name="anchor" :open="open" :toggle="() => emit('toggle')" />

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="absolute right-0 top-[calc(100%+6px)] z-[var(--kb-z-dropdown)] origin-top-right overflow-hidden rounded-kb-xl border border-line bg-surface shadow-[var(--kb-surface-shadow)]"
        :style="{ width: `${width}px` }"
        role="dialog"
        :aria-label="title || undefined"
      >
        <div
          v-if="title"
          class="flex items-center justify-between border-b border-line pl-4 pr-1.5"
        >
          <h3 class="py-2.5 text-[14px] font-semibold text-ink">{{ title }}</h3>
          <button
            type="button"
            class="rounded-kb-md p-1.5 text-ink-tertiary transition hover:bg-muted hover:text-ink-secondary"
            title="关闭"
            @click="emit('close')"
          >
            <UiIcon icon="i-lucide-x" class="h-4 w-4" />
          </button>
        </div>
        <div class="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain">
          <slot />
        </div>
      </div>
    </Transition>
  </div>
</template>

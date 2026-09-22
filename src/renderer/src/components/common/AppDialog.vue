<script lang="ts">
/**
 * 模块级共享状态：
 * - 滚动锁按实例计数，多个对话框叠加时先关闭的那个不会提前解锁 body 滚动；
 * - Esc / Tab 焦点陷阱按「打开顺序栈」只在栈顶对话框生效，否则按 Esc 会把
 *   叠放的所有对话框一次全部关掉、Tab 也会在两层对话框间互相抢焦点。
 * 打开顺序栈本体在 @/composables/dialog-stack（面板类组件也会读取）。
 */
import { isDialogTopMost, pushDialogId, removeDialogId } from "@/composables/dialog-stack"

let scrollLockCount = 0

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

const getFocusableNodes = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => node.offsetWidth > 0 || node.offsetHeight > 0,
  )

const lockBodyScroll = () => {
  if (typeof document === "undefined") {
    return
  }

  scrollLockCount += 1

  if (scrollLockCount === 1) {
    document.body.style.overflow = "hidden"
  }
}

const unlockBodyScroll = () => {
  if (typeof document === "undefined" || scrollLockCount === 0) {
    return
  }

  scrollLockCount -= 1

  if (scrollLockCount === 0) {
    document.body.style.overflow = ""
  }
}
</script>

<script setup lang="ts">
/**
 * 对话框组件（内部换底 element-plus el-dialog 承载层，对外 API 契约与纯自建版一致）。
 *
 * 机制取舍（Task 3.1，实读 EP 2.14.5 编译产物后拍板）——「行为语义归我们，渲染
 * 生命周期归 EP」的边界如下：
 *
 * 【交给 EP】：Teleport（append-to-body）、遮罩渲染（.el-overlay + modal-class 挂
 * 布局类）、开合生命周期与 dialog-fade 动画（overlay 淡入淡出 + 面板 -20px 上滑，
 * 180ms，取自 bridge 的 --el-transition-duration）、关闭转场期 pointer-events。
 *
 * 【保留自建（EP 对应机制全部关掉/绕开）】：
 * - Esc 栈顶语义：close-on-press-escape=false（EP 的 release-requested 链路变空
 *   操作），Esc 继续走本文档级 keydown 处理器（栈顶判定 + closeOnOverlay 门控 +
 *   IME 守卫，原逻辑未动）；
 * - 滚动锁计数：lock-scroll=false（EP 的 useLockscreen 是 class + 滚动条宽度补偿
 *   机制，与基线的 overflow 计数语义不同），模块级 lockBodyScroll/unlockBodyScroll
 *   原样保留；
 * - 焦点还原：EP stopTrap 会 tryFocus(trap 前焦点元素)，与我们 watch 里的
 *   restoreFocus 指向同一元素（两者先后执行、幂等），自建逻辑保留；
 * - data-autofocus 优先聚焦：EP focus-trap 以 focus-start-el="container" 开捕时会
 *   把焦点放到 .el-dialog 容器（tabindex=-1）上，且 focusAfterTrapped 事件在
 *   dialog.vue 内部被丢弃、无法经 @open-auto-focus 阻止——因此自建聚焦改在
 *   nextTick + setTimeout(0)（宏任务）落地，保证晚于 EP 的容器聚焦（微任务），
 *   最终焦点命中 data-autofocus 元素（T5 解散 AppInput 后的过渡期契约：调用方
 *   给 el-input 直接传 data-autofocus 属性，EP inheritAttrs:false 把它透传到
 *   原生 input 上，.focus() 直接生效；T9 换 use-dialog-behavior 前保持可用）；
 * - IME Esc 守卫、closeOnOverlay 语义（→ close-on-click-modal）原样保留。
 *
 * 【焦点陷阱叠加分析（EP el-focus-trap 与自建 document 级 Tab 陷阱共存）】：
 * EP 的 trap 容器是 .el-dialog 根 div（元素级 keydown 冒泡先于 document 级），
 * loop 边缘循环；自建 trapTabFocus 保留为兜底——EP 在边缘包装焦点后，自建逻辑
 * 读到的 activeElement 已是包装后的元素、边缘条件不再命中，两套机制不会双重
 * 跳焦。叠放时 EP focusableStack 会 pause 下层 trap（其 Tab/Esc/focusout 全部
 * 失活），与 dialog-stack 的「仅栈顶响应」同向，验收标准（Tab 只在栈顶循环、
 * Esc 只关栈顶、无焦点抢夺）由两层机制共同保证。
 *
 * 与迁移前基线的如实差异：
 * - 开/关有 180ms dialog-fade 过渡（基线为 v-if 瞬时开合）；关闭转场期间面板
 *   pointer-events 被压掉（.is-closing）；
 * - 关闭后 .el-overlay 空壳（display:none）留存于 body（基线 v-if 整棵移除），
 *   面板内容经 destroy-on-close 在转场结束后卸载（对齐基线 v-if 的状态重置语义）；
 * - 打开时 EP 先聚焦 .el-dialog 容器、随后 data-autofocus/首焦点接管（同帧内
 *   完成，无可见闪烁）；
 * - DOM 结构变化：role="dialog"/aria-modal 落在 .el-overlay-dialog（EP）而非
 *   自建容器，aria-label 由 title prop 提供（基线无 label）。
 *
 * 样式决策（与计划文档参考 CSS 的偏离记录）：panel 视觉类（rounded-[30px]、
 * border-line、bg-surface、大阴影）原样保留在内部面板标记上，.el-dialog.kb-el-dialog
 * 做透明化归零而非接管 chrome——避免双层 border/shadow 叠加，panel 标记零改动。
 * 圆角移交问题②（出厂 4px）在此以 30px 覆盖而非 bridge 映射：EP 把
 * --el-dialog-border-radius 声明在 .el-dialog 元素自身，元素级声明压过 html:root
 * 的继承值，bridge 映射无效。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { Z_DIALOG } from "@/constants/z-index"
import { isImeComposing } from "@/utils/keyboard"
import AppButton from "./AppButton.vue"

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    eyebrow?: string
    widthClass?: string
    closeOnOverlay?: boolean
    showCloseButton?: boolean
  }>(),
  {
    description: "",
    // 语雀的对话框没有顶部角标，默认不渲染；需要面板式角标的场景显式传入
    eyebrow: "",
    widthClass: "max-w-lg",
    closeOnOverlay: true,
    showCloseButton: true,
  },
)

const emit = defineEmits<{
  "update:open": [value: boolean]
}>()

const panelRef = ref<HTMLElement | null>(null)
/** 打开前的焦点元素，关闭后还原，避免键盘用户丢失位置 */
let previouslyFocused: HTMLElement | null = null
/** 本实例在打开顺序栈中的 id，Esc / Tab 只有栈顶对话框响应 */
const dialogId = Symbol("app-dialog-instance")
/** 本实例是否正在持有滚动锁：open=false 挂载的实例（immediate watch）不持有锁，
    也不能解锁——否则会抵消其他已打开实例的锁（如异步挂载的 ShareDialog 内部的
    ShareQrDialog/ConfirmDialog 以 open=false 挂载时会误清父级滚动锁） */
let holdsScrollLock = false

const isTopMostDialog = () => isDialogTopMost(dialogId)

const panelClass = computed(
  () =>
    `mx-auto w-full overflow-hidden rounded-[30px] border border-line bg-surface shadow-[var(--kb-modal-shadow)] ${props.widthClass}`,
)

const closeDialog = () => {
  emit("update:open", false)
}

/** Tab 在面板内循环，防止焦点跑到被遮罩的背景内容上（EP trap 边缘循环的兜底） */
const trapTabFocus = (event: KeyboardEvent) => {
  if (!isTopMostDialog()) {
    return
  }

  const panel = panelRef.value

  if (!panel) {
    return
  }

  const nodes = getFocusableNodes(panel)

  if (nodes.length === 0) {
    event.preventDefault()
    panel.focus()
    return
  }

  const first = nodes[0]
  const last = nodes[nodes.length - 1]

  if (!first || !last) {
    return
  }

  const active = document.activeElement

  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  // 输入法组词中的 Esc 是取消候选，不应连带关闭对话框
  if (isImeComposing(event)) {
    return
  }

  if (event.key === "Escape" && props.closeOnOverlay) {
    if (!isTopMostDialog()) {
      return
    }

    closeDialog()
    return
  }

  if (event.key === "Tab") {
    trapTabFocus(event)
  }
}

const restoreFocus = () => {
  if (previouslyFocused && typeof previouslyFocused.focus === "function") {
    previouslyFocused.focus()
  }

  previouslyFocused = null
}

// 打开期间锁定 body 滚动并接管键盘；关闭时解锁并还原焦点。
// immediate：组件以 open=true 挂载时同样要加锁/监听/聚焦。
// 聚焦放在 nextTick + setTimeout(0)：EP focus-trap 在同一次 flush 之后的微任务里
// 才把焦点放到 .el-dialog 容器上，宏任务保证 data-autofocus 聚焦晚于它落地。
watch(
  () => props.open,
  (open) => {
    if (typeof document === "undefined") {
      return
    }

    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      lockBodyScroll()
      holdsScrollLock = true
      pushDialogId(dialogId)
      document.addEventListener("keydown", handleKeydown)

      void nextTick(() => {
        window.setTimeout(() => {
          // 亚帧竞态守卫：open→close 在聚焦回调落地前翻转时，面板已进入退场
          // 转场（destroy-on-close 卸载后 panelRef 为 null），此时不得再抢焦点，
          // 否则把焦点打进退场面板、restoreFocus 失效（焦点落 body）
          if (!props.open) {
            return
          }

          const panel = panelRef.value

          if (!panel) {
            return
          }

          const marked = panel.querySelector<HTMLElement>("[data-autofocus]")
          const [firstFocusable] = getFocusableNodes(panel)
          ;(marked && (marked.offsetWidth > 0 || marked.offsetHeight > 0)
            ? marked
            : (firstFocusable ?? panel)
          ).focus()
        }, 0)
      })

      return
    }

    if (holdsScrollLock) {
      unlockBodyScroll()
      holdsScrollLock = false
    }
    removeDialogId(dialogId)

    document.removeEventListener("keydown", handleKeydown)
    restoreFocus()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (holdsScrollLock) {
    unlockBodyScroll()
    holdsScrollLock = false
    removeDialogId(dialogId)

    document.removeEventListener("keydown", handleKeydown)
  }
})
</script>

<template>
  <el-dialog
    class="kb-el-dialog"
    :model-value="open"
    :title="title"
    :append-to-body="true"
    :destroy-on-close="true"
    :lock-scroll="false"
    :show-close="false"
    :close-on-press-escape="false"
    :close-on-click-modal="closeOnOverlay"
    :z-index="Z_DIALOG"
    modal-class="kb-el-dialog-overlay"
    @update:model-value="(value) => !value && closeDialog()"
  >
    <div ref="panelRef" :class="panelClass" class="relative" tabindex="-1">
      <div class="border-b border-line-soft bg-surface-soft px-6 py-5 sm:px-7">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div
              v-if="eyebrow"
              class="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary"
            >
              {{ eyebrow }}
            </div>
            <h3 class="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-ink">{{ title }}</h3>
            <p v-if="description" class="mt-2 max-w-[42rem] text-sm leading-6 text-ink-tertiary">
              {{ description }}
            </p>
          </div>

          <AppButton
            v-if="showCloseButton"
            type="button"
            color="neutral"
            variant="outline"
            icon="i-lucide-x"
            class="h-10 w-10 shrink-0 rounded-[14px] border-line bg-surface text-ink-tertiary hover:border-brand-lighter hover:text-brand"
            square
            @click="closeDialog"
          />
        </div>
      </div>

      <div class="px-6 py-5 sm:px-7 sm:py-6">
        <slot />
      </div>

      <div v-if="$slots.footer" class="border-t border-line-soft bg-surface-soft px-6 py-4 sm:px-7">
        <slot name="footer" />
      </div>
    </div>
  </el-dialog>
</template>

<style>
/*
 * 非 scoped：el-dialog 内容 teleport 到 body，scoped 选择器够不到（R7）。
 * 前提同 AppButton 头注：EP 样式经 resolver 作为组件模块副作用 import，先于本块执行。
 *
 * .el-dialog.kb-el-dialog 透明化归零（chrome 仍在内部 panel 上，见文件头偏离记录）：
 * EP 出厂 width:50% / margin:15vh auto 50px / padding:16px / bg / 大阴影全部清掉。
 * 盒宽策略：.el-dialog 撑满滚动容器（width:100%，受 p-4 约束即视口-32px）、panel 用
 * mx-auto + w-full + widthClass 居中限宽——不能让 .el-dialog 走 flex item 收缩适配
 * （首版实测收缩到内容 290px，w-full 子元素的百分比宽度不参与父级 max-content 贡献，
 * 撑不到 widthClass 档位，基线面板恒为 max-w-* 满档宽）。.el-dialog 撑满后其盒面
 * 会挡住 EP 遮罩点击判定（useSameTarget 按 mousedown/up 目标是否为容器判闭），故
 * .el-dialog pointer-events:none、.el-dialog__body 恢复 auto：点面板外=点遮罩容器
 * （可关），点面板=面板自身（不关），与迁移前遮罩/面板两层结构逐点对齐。
 */
.el-dialog.kb-el-dialog {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 30px;
  pointer-events: none;
}

/* EP 的 header 恒渲染（空标题 span 兜底），面板自带头带，整段隐藏 */
.el-dialog.kb-el-dialog .el-dialog__header {
  display: none;
}

/* EP body 自带 color/font-size 强设值，交还给继承链（与迁移前一致）；
   pointer-events 恢复 auto（.el-dialog 撑满后置 none 以让位遮罩点击判定，见上） */
.el-dialog.kb-el-dialog .el-dialog__body {
  padding: 0;
  color: inherit;
  font-size: inherit;
  pointer-events: auto;
}

/*
 * 遮罩层（modal-class 落在 .el-overlay 上）：
 * - backdrop-blur 对齐迁移前自建遮罩的 backdrop-blur-[10px]（底色由 bridge 的
 *   --el-overlay-color-lighter 承担，见 element-plus-bridge.css）；
 * - 布局复刻迁移前容器：fixed 滚动容器上叠 flex 居中（水平恒居中、垂直 640px 起
 *   居中，p-4 内边距）。.el-overlay-dialog 是 EP 的固定定位滚动容器。
 */
.el-overlay.kb-el-dialog-overlay {
  backdrop-filter: blur(10px);
}

.el-overlay.kb-el-dialog-overlay .el-overlay-dialog {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
}

@media (min-width: 640px) {
  .el-overlay.kb-el-dialog-overlay .el-overlay-dialog {
    align-items: center;
  }
}
</style>

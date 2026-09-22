/**
 * 管理短暂提示消息的显示状态、类型与自动清理逻辑。
 *
 * Task 3.4（Element Plus 迁移）：展示层从「各视图手摆 StatusToast 组件」收敛为
 * 全局命令式 ElNotification，视觉按 StatusToast 基线重刻（右上 fixed、语雀风格
 * 圆角卡片、类型配色走 --kb-* token 随暗色自动换档、底部 scaleX 倒计时进度条）。
 * 对外 API 与旧版完全一致：调用方仍 `useTransientToast(duration)` + `showToastMessage`。
 *
 * 实现要点（EP 2.14.5 notification 源码核实）：
 * - 堆叠：notify() 按位置分组维护实例列表，新实例 offset = 已有高度和 + 16px，
 *   关闭时自动回挪后续实例（带 top .4s 过渡）——多实例堆叠开箱即用；
 * - 首个实例 top = offset + 16(GAP)，传 offset 8 使首条落在 top 24px（基线 top-6）；
 * - z-index 走 props.zIndex 内联样式（绕开 el-config-provider :z-index=380 计数器），
 *   钉 500 对齐 --kb-z-toast（高于对话框 Z_DIALOG 400），多实例同 z 由 DOM 序决胜（同基线）；
 *   值取自 constants/z-index.ts（弹层 z 契约唯一事实源）；
 * - pauseOnHover: false（基线定时器不受悬停影响）；
 * - 进度条：EP 原生 progress 档是绝对定位贴底且由 ElProgress 步进驱动，与基线
 *   「内容流内 scaleX 收缩条」不符，改由 message VNode 自绘（复用 style.css 的
 *   kb-toast-countdown 关键帧）；
 * - 计时收编（回归基线键盘免疫语义）：EP 内建计时对任意 document keydown 会
 *   clearTimer+startTimer 续命（notification.vue keydown default 分支），导致连续
 *   打字期间 toast 存活超过 duration、自绘进度条与实际关闭脱钩。故传 duration: 0
 *   禁用 EP 内建计时（其 startTimer 对 duration<=0 早退，键盘链路整体退化为
 *   no-op），由本文件对每条实例裸 setTimeout(duration) 后调句柄 close()——多实例
 *   各自独立计时；进度条 inline animation 与 setTimeout 同参同启，条到 0 即关。
 * - 基线无关闭按钮（showClose: false）、无点击关闭。
 *
 * 如实差异（相对 StatusToast 基线，仅存一条）：
 * - Esc 会关闭当前全部可见 toast：EP 每实例各自在 document 上监听 keydown，esc
 *   分支直接 close，无 props 可禁；抑制需 document 捕获级 stopPropagation（会波及
 *   use-dialog-behavior 的 IME 守卫在捕获阶段，此处 document 级抑制会一并波及）或污染共享 EVENT_CODE 常量，均属脆弱
 *   hack，不做。与弹窗 Esc 关闭各自独立不冲突（Esc 一次同时关弹窗与可见 toast）。
 */
import { h, ref, type Component } from "vue"
import { ElNotification } from "element-plus"
import "element-plus/es/components/notification/style/css"
import { CircleCheckBig, Info, TriangleAlert } from "lucide-vue-next"
import { Z_TOAST } from "@/constants/z-index"

type ToastType = "success" | "error" | "info"

interface ShowGlobalStatusToastOptions {
  message: string
  type: ToastType
  duration: number
}

const TOAST_META: Record<ToastType, { label: string; icon: Component }> = {
  success: { label: "成功", icon: CircleCheckBig },
  error: { label: "错误", icon: TriangleAlert },
  info: { label: "提示", icon: Info },
}

/** 与 StatusToast 基线一致的倒计时关键帧（style.css 定义：scaleX 1 → 0 线性） */
const COUNTDOWN_KEYFRAMES = "kb-toast-countdown"

/**
 * 全局命令式弹出一条状态提示（EP notification 右上堆叠）。
 * 计时由本文件裸 setTimeout 收编（EP 内建计时见文件头），返回统一关闭句柄
 * （close 会先清掉自身计时器再关实例），供 hideToast 与自动关闭共用。
 */
const showGlobalStatusToast = ({ message, type, duration }: ShowGlobalStatusToastOptions) => {
  const meta = TOAST_META[type]
  const body = h("div", { class: "kb-toast__body" }, [
    h("span", { class: "kb-toast__icon", "aria-hidden": "true" }, [h(meta.icon)]),
    h("div", { class: "kb-toast__text" }, [
      h("p", { class: "kb-toast__label" }, meta.label),
      h("div", { class: "kb-toast__message" }, message),
    ]),
  ])
  const bar = h("div", { class: "kb-toast__bar-track", "aria-hidden": "true" }, [
    h("div", {
      class: "kb-toast__bar",
      style: { animation: `${COUNTDOWN_KEYFRAMES} ${duration}ms linear forwards` },
    }),
  ])

  // closed + onClose：Esc/hideToast 可早于计时器关掉实例，onClose（EP 公共回调，
  // 经 Transition before-leave 在任一关闭路径触发）负责收回计时器并置位，
  // 保证计时器到点不会对已关闭/已销毁实例重复 close（幂等）。
  let closed = false
  let timer = 0
  const handle = ElNotification({
    // 不传 type：EP 自带图标/配色机制整体让位给 kb-toast 自绘视觉（见 bridge.css）
    customClass: `kb-toast kb-toast--${type}`,
    message: h("div", { class: "kb-toast__panel" }, [body, bar]),
    // 0 = 禁用 EP 内建计时器（其对 document keydown 续命，是键盘可感知差异的根源）；
    // 自动关闭由下方裸 setTimeout 承担，与进度条动画同参同启。
    duration: 0,
    position: "top-right",
    // notify() 会在 offset 基础上再加 16px GAP，8 + 16 = 24px = 基线 top-6
    offset: 8,
    // 钉 --kb-z-toast（Z_TOAST = 500）：高于对话框 Z_DIALOG 400，与 EP popper 弹层同层
    // （500/500 靠 DOM 序决胜，见 constants/z-index.ts），多实例同 z 同理
    zIndex: Z_TOAST,
    showClose: false,
    pauseOnHover: false,
    onClose: () => {
      closed = true
      window.clearTimeout(timer)
    },
  })

  const close = () => {
    if (closed) return
    closed = true
    window.clearTimeout(timer)
    handle.close()
  }
  timer = window.setTimeout(close, duration)
  return { close }
}

/**
 * 提供短暂状态提示的显示与自动关闭能力。
 */
export const useTransientToast = (duration = 1800) => {
  // 响应式状态保留以维持对外 API（历史调用方仍解构 showToast 等），仅作同步镜像，
  // 不再驱动渲染；展示由 showGlobalStatusToast 直连全局通知。
  const showToast = ref(false)
  const toastMessage = ref("")
  const toastType = ref<ToastType>("success")
  let lastToastHandle: { close: () => void } | null = null

  const showToastMessage = (message: string, type: ToastType = "success") => {
    toastMessage.value = message
    toastType.value = type
    showToast.value = true
    lastToastHandle = showGlobalStatusToast({ message, type, duration })
  }

  const hideToast = () => {
    showToast.value = false
    lastToastHandle?.close()
    lastToastHandle = null
  }

  return {
    showToast,
    toastMessage,
    toastType,
    showToastMessage,
    hideToast,
  }
}

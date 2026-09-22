import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import { Z_DIALOG } from "@/constants/z-index"
import { hasOpenDialog, openDialogCount, pushDialogId, removeDialogId } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"

/**
 * 对话框行为收编（T8 建立，T9 起全量对话框唯一接入路径；对齐计划文档第六节
 * T1 实测收编清单）。
 *
 * 背景：AppDialog 壳（T9 已解散）在 EP el-dialog 之上自建了四类行为语义。T1 实测
 * 结论裁决：Esc 栈顶与焦点开合还原 EP 原生即基线（接受默认，不收编）；滚动锁、
 * data-autofocus 优先聚焦、IME 组词 Esc 守卫 EP 有用户可感知缺口（收编进本
 * composable）。接入方式：`const dialog = useDialogBehavior({ open: () => props.open })`，
 * 模板 `<el-dialog v-bind="dialog.elDialogBindings" class="max-w-*" ...>` 一行铺开
 * EP 侧需要关闭/钉住的 props、实例标记与 chrome 类（kb-dialog / kb-dialog-overlay
 * 也由 bindings 携带，调用方只需追加宽度档位类——消除逐一记写复合类的漏挂失败
 * 模式，T8 评审待办①）。
 *
 * 收编明细：
 *
 * 1) 滚动锁（家族实例计数，语义对齐原 AppDialog：最后一个关闭才解锁）。
 *    EP lock-scroll 的 useLockscreen 每实例以「自己上锁时 body 是否已有 hidden 类」
 *    的快照决定清理，乱序关闭会把类提前移除（T1 实测缺口）——故对话框一律
 *    `lock-scroll=false` 关掉 EP 机制，由本 composable 维护 body overflow:hidden。
 *    解锁 = 计数归零 **且** dialog-stack 空。T9 前 stack 由 AppDialog 与本家族并行
 *    push（跨家族协同，verify-t8 C11-C14 断言）；T9 起 AppDialog 已解散、全部对话
 *    框经本 composable，栈空判定成为防御性冗余（保留：兜底未来不经本 composable
 *    的对话框实现，防提前解锁）。
 *
 * 2) data-autofocus 优先聚焦：EP focus-trap 以 focus-start-el="container" 开捕时把
 *    焦点放到 .el-dialog 容器（tabindex=-1），且 focusAfterTrapped 在 dialog 内部被
 *    丢弃、无法经 @open-auto-focus 阻止（T1 实测 EP 不识别 data-autofocus）——沿用
 *    AppDialog 方案：nextTick + setTimeout(0)（宏任务）后聚焦 `[data-autofocus]`
 *    （无标记回落首个可聚焦元素，再回落 .el-dialog 容器），保证晚于 EP 的容器聚焦。
 *    带 data-autofocus 的 el-input（T5 起的过渡期契约：attrs 透传到原生 input）
 *    由 .focus() 直接命中。
 *
 * 3) IME 组词 Esc 守卫：EP 全链路（focus-trap release-requested → use-dialog
 *    onCloseRequested）无 isComposing 判断，组词中的 Esc 会直接关对话框（T1 实测
 *    缺口）。对话框打开期间在 document 捕获阶段守卫：仅当 Escape 且 isImeComposing
 *    时 stopPropagation（不 preventDefault——输入法「取消组词」的默认行为必须保留，
 *    只是不让 EP 的关闭链路看到该事件）。随开关注册/注销，卸载兜底清理。
 *
 * 另维护 dialog-stack（面板类组件 DocumentVersionsPanel / DocumentInfoPanel 只读
 * hasOpenDialog() 让位 Esc，故 push/remove 必须保留；isDialogTopMost 的最后消费者
 * AppDialog 已随 T9 解散，该导出删除、栈本体保留——见计划文档 T9 节记档）。
 */

export interface UseDialogBehaviorOptions {
  /** 打开状态（响应式 getter，通常 `() => props.open`） */
  open: () => boolean
}

export interface UseDialogBehavior {
  /**
   * el-dialog 的统一绑定（v-bind 一行展开）：关闭 EP 滚动锁（自建计数接管）、
   * 关闭原生关闭钮（chrome 自绘关闭钮，见校准层 el-dialog 段）、钉 z（Z_DIALOG
   * 基准 + 叠放按打开时栈深 +1 递增，getter 每渲染取当前值，见实现处注释）、
   * append-to-body / destroy-on-close（基线语义）、
   * 实例标记 data-kb-dialog-id（attrs 透传到 .el-dialog 根，宏任务聚焦用它
   * 在 document 上定位本实例的面板根——el-dialog 的 DOM 根由 EP 渲染，拿不到
   * 常规 template ref），以及语雀对话框 chrome 复合类 class="kb-dialog" 与
   * modal-class="kb-dialog-overlay"（全局校准层 el-dialog 段的样式目标；class/
   * style 与调用方同名属性合并是 Vue 的特殊处理，调用方只需再传 max-w-* 宽度
   * 档位类，两者拼接生效）。
   */
  elDialogBindings: {
    appendToBody: true
    destroyOnClose: true
    lockScroll: false
    showClose: false
    zIndex: number
    "data-kb-dialog-id": string
    class: string
    modalClass: string
  }
}

/** 对话框 chrome 复合类（校准层 el-dialog 段目标，经 bindings 下发，调用方不手写） */
export const KB_DIALOG_CLASS = "kb-dialog"
/** 对话框遮罩 chrome 类（modal-class 落在 .el-overlay 上，校准层遮罩段目标） */
export const KB_DIALOG_OVERLAY_CLASS = "kb-dialog-overlay"

/**
 * 对话框家族的实例计数锁（T9 起 AppDialog 已解散，全量对话框唯一计数器；与
 * dialog-stack 同步 push/remove）。release 侧的栈空判定保留为防御性冗余（见
 * 文件头收编明细 1）。
 */
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
    node => node.offsetWidth > 0 || node.offsetHeight > 0
  )

/** 实例标记序号（data-kb-dialog-id 需要字符串，Symbol 不能落 attr） */
let dialogInstanceSeq = 0

export const useDialogBehavior = (options: UseDialogBehaviorOptions): UseDialogBehavior => {
  const instanceId = `kb-dialog-${(dialogInstanceSeq += 1)}`
  const stackId = Symbol("kb-dialog-behavior-instance")
  /**
   * 本实例当前打开轮次的叠放 z（遗留风险 #13 修复）：打开时按「打开前栈深」取
   * Z_DIALOG + depth——首个 400、叠放 401/402…，与 EP「后开者在上」的原生语义一致。
   * 此前全家族恒 400，遮罩叠放退化为 DOM 挂载次序（先挂载的实例后打开时被压：
   * ConfirmDialog 页面加载即挂遮罩，v-if 首开的 VersionCompareDialog 遮罩 DOM 更后，
   * 恒压确认弹窗致其鼠标不可达）。EP 侧 watch(() => props.zIndex) 响应 prop 变化
   * （element-plus use-dialog.mjs），打开中的实例更新 prop 即时落到 overlay 内联 z；
   * 显式 zIndex prop 同时关闭 EP 的 bringToFront（penetrable 才启用，本家族不涉及）。
   */
  const zIndex = ref(Z_DIALOG)
  /** 本实例是否持有滚动锁：open=false 挂载的实例（immediate watch）不持有锁，也不能解锁 */
  let holdsScrollLock = false
  /** IME Esc 守卫是否已挂到 document（随开合注册/注销） */
  let imeGuardActive = false

  // 输入法组词中的 Esc 是「取消候选」，只拦 EP 关闭链路、不干扰输入法本身
  const guardImeEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !isImeComposing(event)) {
      return
    }

    event.stopPropagation()
  }

  const acquireScrollLock = () => {
    if (typeof document === "undefined") {
      return
    }

    scrollLockCount += 1

    // body 已有 hidden（其他持有者在位）时不重复写，锁的最终清理由「计数归零 +
    // 栈空」共同判定（release 侧）
    if (document.body.style.overflow !== "hidden") {
      document.body.style.overflow = "hidden"
    }
  }

  const releaseScrollLock = () => {
    if (typeof document === "undefined" || scrollLockCount === 0) {
      return
    }

    scrollLockCount -= 1

    // 叠放的对话框还开着就先不解锁：看计数、再看栈空（防御性冗余——T9 起栈只由
    // 本 composable push，计数归零即栈空；保留是为兜底未来不经本 composable 的
    // 对话框实现）
    if (scrollLockCount === 0 && !hasOpenDialog()) {
      document.body.style.overflow = ""
    }
  }

  const releaseDialog = () => {
    removeDialogId(stackId)

    if (holdsScrollLock) {
      holdsScrollLock = false
      releaseScrollLock()
    }

    if (imeGuardActive && typeof document !== "undefined") {
      document.removeEventListener("keydown", guardImeEscape, true)
      imeGuardActive = false
    }
  }

  /** 开窗宏任务聚焦（AppDialog 同款时序：晚于 EP 容器聚焦的微任务） */
  const scheduleAutofocus = () => {
    void nextTick(() => {
      window.setTimeout(() => {
        // 亚帧竞态守卫：open→close 在聚焦回调落地前翻转时，面板已进入退场转场
        // （destroy-on-close 卸载后 DOM 已移除），此时不得再抢焦点
        if (!options.open() || typeof document === "undefined") {
          return
        }

        const panel = document.querySelector<HTMLElement>(`[data-kb-dialog-id="${instanceId}"]`)

        if (!panel) {
          return
        }

        const marked = panel.querySelector<HTMLElement>("[data-autofocus]")
        const [firstFocusable] = getFocusableNodes(panel)
        ;(marked && (marked.offsetWidth > 0 || marked.offsetHeight > 0) ? marked : (firstFocusable ?? panel)).focus()
      }, 0)
    })
  }

  // immediate：组件以 open=true 挂载时同样要上锁/监听/聚焦/取叠放 z
  watch(
    options.open,
    open => {
      if (typeof document === "undefined") {
        return
      }

      if (open) {
        // 叠放 z 必须先于 push 计算（取「打开前深度」）；v-if 首开实例在 setup 期
        // 由此赋值，首帧渲染即带正确 z，无先 400 后跳档的闪烁
        zIndex.value = Z_DIALOG + openDialogCount()
        holdsScrollLock = true
        pushDialogId(stackId)
        acquireScrollLock()
        document.addEventListener("keydown", guardImeEscape, true)
        imeGuardActive = true
        scheduleAutofocus()
        return
      }

      releaseDialog()
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    if (holdsScrollLock || imeGuardActive) {
      releaseDialog()
    }
  })

  return {
    /**
     * getter 而非静态对象：zIndex 随打开轮次变化，须让调用方 render 追踪到
     * zIndex ref——getter 在每次渲染时读取 zIndex.value（依赖收集进调用方渲染
     * 效果），变更后新对象经 v-bind 下发，EP 的 props.zIndex watch 即时接管
     * overlay 内联 z。16 个调用点 `v-bind="xxx.elDialogBindings"` 用法不变。
     */
    get elDialogBindings(): UseDialogBehavior["elDialogBindings"] {
      return {
        appendToBody: true,
        destroyOnClose: true,
        lockScroll: false,
        showClose: false,
        zIndex: zIndex.value,
        "data-kb-dialog-id": instanceId,
        class: KB_DIALOG_CLASS,
        modalClass: KB_DIALOG_OVERLAY_CLASS,
      }
    },
  }
}

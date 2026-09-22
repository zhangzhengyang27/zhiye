/* global document, HTMLElement */
/**
 * el-select 根 padding 盲区的点击开合 + Space/Esc 键盘契约（T6 解散 AppSelect 的行为收编）。
 *
 * 背景：AppSelect 壳（已解散）的盒面架构是「根即盒子 + EP wrapper 幽灵化」，根上的
 * 水平 padding 区（默认 pl-3 pr-2.5）在 wrapper 盒外，而 EP 的 el-select 根无任何点击
 * 处理（只有 wrapper 响应开合）——基线里整盒都是按钮，壳用根上 click 监听转发
 * wrapper.click()。键盘侧 EP 只认 Enter 与方向键：基线触发器支持 Space 开合（壳捕获
 * Space 转发）；Esc 是三态契约——弹层展开时 EP 自关弹层并 stopPropagation（不干预），
 * 弹层关闭时 EP 的 handleKeydown 对 Esc 无条件 preventDefault+stopPropagation，外层
 * 对话框的 EP 关闭链路收不到该次按键（基线是冒泡关闭对话框），壳在捕获阶段先行向
 * document 转派同参 keydown。壳解散后三件事以单一 document 级委托收编（与 T5 的
 * utils/el-input-focus.ts 同思路、同属「壳遗产的唯一新家」）：
 * - click（bubble）：点击落在 .el-select 根内且不在 wrapper 内时，程序化 wrapper.click()；
 * - keydown（capture）：Esc 三态转派；Space 开合（preventDefault 防滚屏 + 转发开合）。
 *
 * 安全性：
 * - disabled select：EP wrapper 的 click 对禁用态无效果（toggleMenu 有 selectDisabled
 *   守卫），转发是无操作；根 cursor not-allowed 由校准层呈现；
 * - Space 转发带 input.readOnly 守卫：filterable（内部 input 可输入）时输入空格必须
 *   落字不得开合（壳以注释警示的坑，此处以守卫固化；当前调用面 0 处 filterable）；
 * - Esc 转派事件以 document 为 target，本委托自身的 capture 监听不会再命中
 *   （target 非 Element），不会递归；原事件随后照常进 EP（expanded 已为 false，
 *   handleEsc 无副作用，不会双重关闭）；
 * - 不影响 EP 内部点击链路（弹层条目在 body 下的 teleport 容器内，不在 .el-select
 *   根内）与 el-input-focus 委托（el-select 的内部 input 类名是 .el-select__input，
 *   不在 .el-input 根内）。
 */
export function setupElSelectRootBehavior(): void {
  if (typeof document === "undefined") {
    return
  }

  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const root = target.closest<HTMLElement>(".el-select")
    if (!root) {
      return
    }

    const wrapper = root.querySelector<HTMLElement>(".el-select__wrapper")
    if (wrapper && !wrapper.contains(target)) {
      wrapper.click()
    }
  })

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" && event.key !== " ") {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const root = target.closest<HTMLElement>(".el-select")
      if (!root) {
        return
      }

      const input = root.querySelector<HTMLInputElement>(".el-select__input")

      if (event.key === "Escape") {
        // 弹层展开：EP 自会只关弹层并 stopPropagation，不干预；关闭：EP 会吞掉 Esc，
        // 先行向 document 转派让外层对话框按基线冒泡关闭
        if (input?.getAttribute("aria-expanded") !== "true") {
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: event.key,
              code: event.code,
              bubbles: true,
              cancelable: true,
            }),
          )
        }
        return
      }

      // Space：readonly 触发器上转发开合（filterable 的可输入 input 放行落字）
      if (input?.readOnly) {
        event.preventDefault()
        event.stopPropagation()
        root.querySelector<HTMLElement>(".el-select__wrapper")?.click()
      }
    },
    true,
  )
}

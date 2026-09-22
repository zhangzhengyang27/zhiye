/**
 * el-input / el-textarea 根 padding 盲区的点击聚焦（T5 解散 AppInput 的行为收编）。
 *
 * 背景：AppInput 壳（已解散）的盒面架构是「根 div 即盒子 + EP wrapper 幽灵化」，
 * 根上的水平 padding 区（默认 px-3、搜索框 pl-8/pl-9 图标带）在 wrapper 盒外，而
 * EP 的 el-input 根与 wrapper 均无点击聚焦逻辑（EP 原生只有 wrapper 内的 input 本体
 * 可点，wrapper 自带的 11px padding 也是盲区）。壳用 onMounted 给根补 click 监听转发
 * focus()（原文件注释：「对齐迁移前行为」——迁移前自建 input 是满盒可点）。壳解散后
 * 该行为以单一 document 级委托收编（与全局校准层同属「壳遗产的唯一新家」思路）：
 * 点击落在 .el-input / .el-textarea 根内且焦点不在其原生输入元素上时，程序化 focus。
 * el-textarea 分支（T3 解散）的根 padding 盲区同构，一并覆盖（行为补齐，非回归）。
 *
 * 安全性：
 * - 对已聚焦的输入框 focus() 是无操作（不重置光标/选区）；
 * - disabled 输入框原生不可聚焦，focus() 为无操作；readonly 正常聚焦（与壳一致）；
 * - 委托在 bubble 阶段、不 preventDefault/stopPropagation，不影响 EP 内部点击链路
 *   （清除/密码图标、el-select 开合）与 label 包裹（对话框场景）的原生激活行为；
 * - el-select 的内部 input 类名是 .el-select__input，不在 .el-input 根内，不受影响。
 */
export function setupElInputRootFocus(): void {
  if (typeof document === "undefined") {
    return
  }

  document.addEventListener("click", event => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const root = target.closest<HTMLElement>(".el-input, .el-textarea")
    if (!root) {
      return
    }

    const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
    if (input && document.activeElement !== input) {
      input.focus()
    }
  })
}

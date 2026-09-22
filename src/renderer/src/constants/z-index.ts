/**
 * 弹层 z 契约唯一事实源（TS 侧）；CSS 侧对应 tokens.css 的 --kb-z-* 结构层 token，
 * 两边是同一套值——改任何一档必须同步另一侧（tokens.css）与本文件。
 *
 * 层级语义（低 → 高）：
 * - 380（Z_EP_PROVIDER_BASE）：el-config-provider 计数起点，EP 内部弹层（message 等
 *   未显式钉 z 的）从这里起随打开次数上浮——所以一切有确定层级要求的 EP 弹层类组件
 *   必须显式钉 z（对话框钉 400、popper/toast 钉 500），不钉会被后打开的弹层压过。
 * - 400（Z_DIALOG）：对话框（--kb-z-modal 档）基准——经 use-dialog-behavior 的
 *   elDialogBindings.zIndex 显式传入每个 el-dialog（T9 起 AppDialog 解散后的接续）；
 *   叠放按「打开时栈深」+1 递增（首个 400、叠层 401/402…，遗留风险 #13 修复——
 *   此前全家族恒 400，遮罩叠放退化为 DOM 挂载次序，先挂载的实例后打开时被压），
 *   基准 400 不变，与 EP config-provider「后开者在上」计数哲学一致。
 * - 500（Z_POPPER / Z_TOAST）：EP popper 与全局 toast。popper 的钉自 T6（AppSelect）
 *   与 T7（AppDropdownMenu）解散起住在校准层 z 钉段（`z-index: var(--kb-z-popper)
 *   !important`，压过 EP 写入的内联计数值）；
 *   全局 toast（EP notification 走 props.zIndex 内联样式，绕开 config-provider 计数器）。
 *   自绘的瞬时浮条（工作区首页收藏/复制链接提示）与 StatusToast 同语义，一并钉此档——
 *   此前它落在 80，对话框（400）打开时会被整体压住而看不见。
 *   500/500 同层不构成确定偏序：两者都 teleport 到 body，z-index 相同时按 DOM 序
 *   决胜（后插入者在视觉上层）——与迁移前自绘弹层 z-500 的基线语义一致，属刻意
 *   设计而非漏钉；若未来需要 popper 恒在 toast 之上，再拆档并同步 tokens.css。
 * - 100 / 90（Z_DROPDOWN / Z_DROPDOWN_BACKDROP）：自绘弹层（非 EP 触发）的面板与其
 *   点击遮罩配对档。收件人：@ 提及选择器、命令面板、文档树右键菜单、通知面板。
 *   刻意低于对话框（400）——弹层打开时若拉起对话框，对话框盖住弹层；
 *   也刻意低于 EP popper（500）——弹层内的 el-select 等下拉仍可正常浮在面板上。
 */
/**
 * - 50/40（Z_SIDE_PANEL / Z_SIDE_PANEL_OVERLAY）：编辑器右侧信息/版本侧面板及其遮罩。
 *   刻意低于划词浮条（300）：侧面板固定在视口右缘、与正文划词浮条空间不重叠，
 *   维持迁移前 Tailwind z-50/z-40 的渲染基线，仅收编事实源。
 */
export const Z_SIDE_PANEL = 50
export const Z_SIDE_PANEL_OVERLAY = 40
export const Z_DROPDOWN_BACKDROP = 90
export const Z_DROPDOWN = 100
export const Z_EP_PROVIDER_BASE = 380
export const Z_DIALOG = 400
export const Z_POPPER = 500
export const Z_TOAST = 500

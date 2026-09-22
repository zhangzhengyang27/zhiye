4. **toast 多实例叠层**：z 均 500 由 DOM 序决胜（同基线）；EP 堆叠 offset 由内部 position 分组管理，逆序关闭/重开等序列依赖 EP 内部行为，未专项验证。
5. **AppDropdownMenu 基线既有缺陷保留**：父项带 children 未展开时渲染两遍（迁移前后行为一致，修复需单独拍板）；submenu 右缘 el-scrollbar thumb「溢出+悬停」显示的原生差异；「菜单开在 AppDialog 之上只关菜单」暂无断言（当前 4 调用点无一在弹窗内）。
6. **~~smoke:account 断链~~（迁移外遗留，2026-09-13 已修复）**：见上「迁移外遗留」行的修复记录；账户页回归现可直跑 `pnpm smoke:account`。
7. **既有性能超标**：cold loadEnd 对 2,000ms 预算超标为迁移前既存，优化方向是 board-excalidraw 动态加载策略，与 EP 迁移无关。

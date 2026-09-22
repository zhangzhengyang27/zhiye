/**
 * 窗口形态开关：主进程隐藏原生标题栏（macOS）后，把这件事落成 <html> 上的一个类。
 *
 * 判定唯一事实源在 `src/main/index.ts` 的 HIDDEN_TITLE_BAR，经 preload 的
 * `hiddenTitleBar` 透进来；这里不再重复判平台。消费方：
 * - tokens.css 的 `--kb-window-chrome-band` / `--kb-column-header-top`（顶部空带高度、
 *   侧栏与目录列首行下移让位红绿灯）
 * - style.css 的 `.kb-window-drag-band`（那条空带是唯一的拖窗区）
 */
export const setupWindowChrome = (): void => {
  document.documentElement.classList.toggle(
    "kb-window-hidden-titlebar",
    window.xiaoyeDesktop?.hiddenTitleBar === true,
  )
}

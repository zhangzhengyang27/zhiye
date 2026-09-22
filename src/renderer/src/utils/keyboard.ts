/**
 * 判断按键是否发生在输入法组词过程中（如拼音候选未上屏时）。
 *
 * 组词期间的 Enter（确认候选）、方向键/Esc（切候选/取消组词）都属于输入法
 * 操作，不应触发页面交互；keyCode 229 兼容 Chromium 组词期间的旧式上报。
 * 所有「输入框内按 Enter 提交」的入口都必须先过这个守卫，否则中文输入
 * 每次选词都会误触发提交/搜索。
 */
export const isImeComposing = (event: KeyboardEvent): boolean =>
  event.isComposing || event.keyCode === 229

/**
 * Tailwind 类名工具。
 *
 * 表单/按钮组件判断调用方是否自带尺寸与内边距类，决定是否叠加默认间距。
 * 必须按 class token 前缀逐个判断，不能用整串正则——`hover:h-10`、
 * `group-hover:px-3` 这类带变体前缀的类会被整串匹配误判成自定义尺寸，
 * 导致组件默认内边距被静默丢弃。
 */
const SPACING_PREFIXES = ["min-h-", "max-h-", "h-", "size-", "p-", "px-", "py-", "pt-", "pb-", "pl-", "pr-"]

export const hasExplicitSpacing = (classString: string | undefined | null): boolean =>
  (classString ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .some(token => SPACING_PREFIXES.some(prefix => token.startsWith(prefix)))

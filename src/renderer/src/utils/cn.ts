/**
 * Tailwind 类合并工具。
 *
 * 封装组件把「默认样式」与「调用方 class」拼接时，同特异性工具类（如
 * bg-surface 与调用方的 bg-muted、rounded-xl 与 rounded-kb-xl）谁生效取决于
 * CSS 生成顺序，结果不可控。经 tailwind-merge 去重后，冲突组只保留调用方
 * 的类，让「调用方覆盖组件默认值」成为确定性行为。
 */
import { twMerge } from "tailwind-merge"

export const cn = (...classes: Array<string | false | null | undefined>): string =>
  twMerge(classes.filter(Boolean).join(" "))

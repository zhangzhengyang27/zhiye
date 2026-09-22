/**
 * 颜色主题（语雀设置页「当前主题」的三态：暗黑模式 / 浅色模式 / 跟随系统）。
 *
 * 落在 useColorMode 上而非 useDark：useDark 的 getter 是 `mode === "dark"`，
 * 「跟随系统 + 系统当前为暗」时它会返回 false，而 <html> 上其实已经挂了 .dark
 * ——编辑器（YuqueDocEditor 的 dark-mode）会因此与页面配色脱节。这里用
 * emitAuto 拿到用户选择的原始三态，再用 useColorMode.state 解析出真实的明暗。
 *
 * 值存在 localStorage 的 vueuse-color-scheme（值域 light/dark/auto），
 * index.html 的首屏防闪烁脚本读的就是这一个 key、同一值域，两边不得各存一份。
 * 语雀的 `system` 在 vueuse 值域里叫 `auto`，只在边界转换一次。
 */
import { computed } from "vue"
import { useColorMode } from "@vueuse/core"
import type { ColorThemeOption } from "@/constants/desktop-settings"

const colorMode = useColorMode({
  selector: "html",
  attribute: "class",
  emitAuto: true,
  // 语雀 init/app.js 在值为空时回落浅色（不是跟随系统），出厂默认与之对齐
  initialValue: "light",
  // light 不带类名：全站暗色判定只有 html.dark 一条链路，加 .light 会多出一个状态
  modes: { dark: "dark", light: "" },
})

const toThemeOption = (value: string): ColorThemeOption =>
  value === "auto" ? "system" : value === "dark" ? "dark" : "light"

/** 用户选择的主题档位（设置页下拉绑定它）。 */
export const colorTheme = computed<ColorThemeOption>({
  get: () => toThemeOption(colorMode.value),
  set: value => {
    colorMode.value = value === "system" ? "auto" : value
  },
})

/** 解析后的真实明暗（跟随系统时随 prefers-color-scheme 变化）。 */
export const isDarkMode = computed(() => colorMode.state.value === "dark")

export function useThemeMode() {
  return { colorTheme, isDark: isDarkMode }
}

<script setup lang="ts">
/**
 * 按钮组件（内部换底 element-plus el-button，对外 API 契约与纯自建版一致）。
 *
 * 本文件与已解散的同族适配器（AppInput/AppTextarea/AppSelect/AppDropdownMenu，分别于
 * T5/T3/T6/T7 解散，校准升全局 element-plus-calibration.css 的 el-input 单行分支 /
 * .el-textarea 段 / el-select 段 / el-dropdown 段）共享 forwardedAttrs、根上 revert-layer
 * 规则与幽灵化 CSS 前言段的同构写法，改动共享段时同步维护；是否提取共享 composable
 * 留待 Phase 4 Task 4.1 评估。
 * 第二代适配器 AppCheckbox/AppSwitch/AppRadioGroup（Task 2.4-2.6）与第三代（本文件，
 * Task 2.7）参照
 * 本族模式落地，但校准段按组件结构独立推导、不共享前述段落。
 *
 * 与前两代的关键差异：AppInput/AppSelect/AppDropdownMenu（均已解散）的「根」是包在 EP 组件外的定位容器（EP 内部
 * 元素承担盒面/行为），而 el-button 的根**本身就是迁移前那个原生 button**——因此
 * 「根即盒子」在这里意味着 EP 根上的强设盒面属性全量 revert-layer 交还（见 style 块
 * 逐条对照），盒面完全由根上的工具类呈现（与迁移前同一套变体/尺寸/调用方 class，
 * tailwind-merge 覆盖契约不变）。
 *
 * EP 原生能力使用决策（用户拍板「全面统一 EP 底座」，Task 2.7）：
 * - native-type ← type prop（submit/reset 语义，登录表单在用）——EP 原生直传；
 * - loading → EP 原生 loading prop：is-loading 承担禁用属性 + 防点击（与迁移前
 *   isDisabled 含 loading 等价）；spinner 字形经 #loading 插槽用 AppIcon
 *   loader-circle + animate-spin 自绘保持与基线逐像素同源（EP 默认 Loading 字形与
 *   2s 转速都不同，且自带一层白色蒙版 ::before，基线没有——已在 style 块压掉）；
 * - size → EP 语义档（xs→small / sm·md→default / lg→large）传递，但其 height/padding/
 *   font-size/border-radius 强设值被 style 块 revert——迁移前尺寸语义是「无固定高度、
 *   padding + 行高驱动」（调用方 h-7 w-7 等覆盖是 116 处调用点的常态），EP 的固定
 *   32/40/24px 高度体系与之冲突，纯语义保留；
 * - color×variant **不**用 EP type/danger 也不走 --el-button-* CSS 变量校准（三选一
 *   选型记录，另两项被否原因）：a) EP type/danger 会给根挂 --primary/--danger 修饰类，
 *   bridge.css 的暗色防御规则 `.dark .el-button--primary … color: var(--kb-neutral-ink)
 *   !important`（0,6,0）会压过 style.css 暗色通配 `.dark button` 的白字——而迁移前
 *   AppButton 也是原生 button，基线暗色实心钮白字正来自该通配（Task 2.7 拍板：不对抗
 *   通配、像素以基线为准），挂修饰类即产生暗色像素回归；b) --el-button-* 变量校准
 *   （每 color×variant 组合给 8~10 个变量）无法保住「调用方 class 覆盖」契约——EP 的
 *   color/background-color/border-color 声明是 unlayered，会压过 utilities 层的调用方
 *   bg-*、text-*、hover:bg-* 覆盖（实测调用面大量存在），最终仍需对状态伪类做 revert，
 *   变量矩阵沦为死代码。结论：16 组合（4 色 × 4 变体，danger→error 已归一）的视觉
 *   全部沿用迁移前的 variantColorClass 工具类字符串（色值来自 --kb-* token，明暗自动
 *   换档），EP 只承担行为底座；
 * - square：EP 无 square 概念（circle 是全圆角），沿用 aspect-square + p-0 工具类
 *   （padding/height 被 revert 后由工具类驱动，与迁移前一致）；
 * - disabled → EP disabled prop（原生 disabled attribute），迁移前 disabled:opacity-55
 *   等工具类经 :disabled 伪类照常生效；EP is-disabled 的灰化配色（disabled vars）被
 *   style 块 revert——迁移前禁用态是「原变体色 + 55% 透明度」不是灰化。
 *
 * 与迁移前基线的如实差异（复制本模板时知悉）：
 * - el-button 根上会多 aria-disabled 属性（EP 内建，与 disabled attribute 冗余但无害）；
 * - loading 期间根上多 is-loading 类 + position:relative 被 revert 回 static（见 style 块），
 *   防点击语义与迁移前一致（原生 disabled attribute 不派发 click）；
 * - 焦点环仍是迁移前的 focus-visible ring（box-shadow），EP 的 2px outline 在 style 块
 *   revert 掉；暗色下 style.css `.dark button` 通配照旧命中 el-button 根（与迁移前同）。
 */
import { computed, useAttrs } from "vue"
import AppIcon from "./AppIcon.vue"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

type ButtonColor = "primary" | "neutral" | "danger" | "error" | "success"
type ButtonVariant = "solid" | "outline" | "ghost" | "soft"
type ButtonSize = "xs" | "sm" | "md" | "lg"

const props = withDefaults(
  defineProps<{
    type?: "button" | "submit" | "reset"
    color?: ButtonColor
    variant?: ButtonVariant
    size?: ButtonSize
    disabled?: boolean
    loading?: boolean
    block?: boolean
    icon?: string
    trailingIcon?: string
    square?: boolean
    /** 默认槽内容强制单行截断；放多行卡片内容（标题+描述）时置 true */
    multiline?: boolean
  }>(),
  {
    type: "button",
    color: "primary",
    variant: "solid",
    size: "md",
    disabled: false,
    loading: false,
    block: false,
    icon: undefined,
    trailingIcon: undefined,
    square: false,
    multiline: false,
  }
)

const attrs = useAttrs()

const attrsClassString = computed(() => String(attrs.class ?? ""))

const forwardedAttrs = computed(() => {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class"))
})

const isDisabled = computed(() => props.disabled || props.loading)
const resolvedColor = computed(() => (props.color === "danger" ? "error" : props.color))

/** EP size 语义档：视觉盒面已全量 revert，仅保留语义（表单上下文/未来 EP 联动） */
const epSize = computed<"small" | "default" | "large">(() => {
  if (props.size === "lg") return "large"
  if (props.size === "xs") return "small"
  return "default"
})

const variantColorClass = computed(() => {
  const { variant } = props
  const color = resolvedColor.value

  if (color === "primary") {
    if (variant === "solid") return "border-transparent bg-brand text-white hover:bg-brand-hover active:bg-brand-active"
    if (variant === "outline") return "border-brand bg-transparent text-brand hover:bg-brand-faint"
    if (variant === "soft") return "border-transparent bg-brand-light text-brand-active hover:bg-brand-lighter"
    return "border-transparent bg-transparent text-brand hover:bg-brand-faint"
  }

  if (color === "error") {
    if (variant === "solid") return "border-transparent bg-error text-white hover:bg-error-hover active:bg-error-active"
    if (variant === "outline") return "border-error bg-transparent text-error hover:bg-error-bg"
    if (variant === "soft") return "border-transparent bg-error-light text-error hover:bg-error-bg"
    return "border-transparent bg-transparent text-error hover:bg-error-bg"
  }

  if (color === "success") {
    if (variant === "solid")
      return "border-transparent bg-success text-white hover:bg-success-hover active:bg-success-active"
    if (variant === "outline") return "border-success bg-transparent text-success hover:bg-success-bg"
    if (variant === "soft") return "border-transparent bg-success-light text-success hover:bg-success-bg"
    return "border-transparent bg-transparent text-success hover:bg-success-bg"
  }

  // neutral：明暗两态的底色/文字由 --kb-neutral* 语义层换档（见 tokens.css）
  if (variant === "solid") return "border-transparent bg-neutral text-neutral-ink hover:bg-neutral-hover"
  if (variant === "outline") return "border-line bg-transparent text-ink-secondary hover:bg-muted"
  if (variant === "soft") return "border-transparent bg-muted text-ink-secondary hover:bg-grey-200"
  return "border-transparent bg-transparent text-ink-secondary hover:bg-muted"
})

const sizeClass = computed(() => {
  const { size, square } = props

  // 调用方自带宽/高类（图标按钮常用 h-7 w-7）时，固定尺寸内再叠内边距会把内容挤出按钮，
  // 按方向剔除对应的默认内边距；其余冲突（rounded/bg/text 等）交给 cn() 裁决。
  const tokens = attrsClassString.value.split(/\s+/).filter(Boolean)
  const hasHorizontalSize = tokens.some(token => token.startsWith("w-") || token.startsWith("size-"))
  const hasVerticalSize = tokens.some(token => token.startsWith("h-") || token.startsWith("size-"))

  if (size === "xs") {
    return square
      ? "aspect-square p-0 text-xs"
      : `text-xs gap-1 rounded-lg ${hasHorizontalSize ? "" : "px-2.5"} ${hasVerticalSize ? "" : "py-1"}`
  }

  if (size === "sm") {
    return square
      ? "aspect-square p-0 text-sm"
      : `text-sm gap-1.5 rounded-lg ${hasHorizontalSize ? "" : "px-3"} ${hasVerticalSize ? "" : "py-1.5"}`
  }

  if (size === "lg") {
    return square
      ? "aspect-square p-0 text-base"
      : `text-base gap-2 rounded-xl ${hasHorizontalSize ? "" : "px-5"} ${hasVerticalSize ? "" : "py-3"}`
  }

  return square
    ? "aspect-square p-0 text-sm"
    : `text-sm gap-2 rounded-xl ${hasHorizontalSize ? "" : "px-4"} ${hasVerticalSize ? "" : "py-2.5"}`
})

const buttonClass = computed(() =>
  cn(variantColorClass.value, sizeClass.value, props.block ? "w-full" : "", String(attrs.class ?? ""))
)
</script>

<template>
  <el-button
    v-bind="forwardedAttrs"
    class="kb-el-button inline-flex cursor-pointer items-center justify-center border font-semibold transition duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55"
    :class="buttonClass"
    :native-type="type"
    :size="epSize"
    :disabled="isDisabled"
    :loading="loading"
  >
    <!-- spinner 走 EP 的 #loading 插槽自绘（AppIcon lucide loader-circle），字形/转速与基线
         同源；EP 的 loading prop 仍承担 is-loading 类（禁用 + 防点击） -->
    <template #loading>
      <AppIcon name="i-lucide-loader-circle" class="shrink-0 animate-spin" />
    </template>

    <!-- 头部：与基线一致，loading 时让位给 spinner（slot 优先于 icon prop） -->
    <AppIcon v-if="!loading && icon" :name="icon" class="shrink-0" />
    <template v-else-if="!loading && $slots.leading">
      <slot name="leading" />
    </template>

    <span :class="multiline ? 'block w-full min-w-0' : 'truncate'"><slot /></span>

    <!-- 尾部：与基线一致，trailing 插槽在 loading 期间照常渲染，trailingIcon 则让位 -->
    <template v-if="$slots.trailing">
      <slot name="trailing" />
    </template>
    <AppIcon v-else-if="trailingIcon && !loading" :name="trailingIcon" class="shrink-0" />
  </el-button>
</template>

<style scoped>
/*
 * 幽灵化 CSS 前言段（同族约定，复制本模板时保持）：
 * - 色值不引用 --el-*：bridge.css 已把 --el-* 全量绑到 --kb-*，直接用 kb token 少一层
 *   间接（本组件的色值全部来自根上工具类，本块基本不需要色值声明）；
 * - 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 *   赢不了它们，因此凡「交还给工具类」的属性都必须在这里 revert-layer 接管）；
 * - 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为组件
 *   模块的副作用 import，先于本 SFC style 执行；复制本模板时保持这一前提。
 *
 * revert 清单对照 theme-chalk/el-button.css 逐条推导（EP 升级时需重新核对）：
 * 根基础规则 .el-button 强设 height:32px / padding:8px 15px / font-size:14px /
 * line-height:1 / font-weight:500 / border(+border-color) / border-radius:4px /
 * color / background-color / transition:all .1s / white-space:nowrap / user-select:none /
 * vertical-align:middle / text-align:center / display:inline-flex / align-items:center /
 * justify-content:center——全部 revert-layer：utilities 层的变体/尺寸/调用方工具类优先，
 * 无 utilities 时回落 @layer base 的 preflight（margin/padding/border 归零），与迁移前
 * 原生 button 的解析路径完全一致。刻意不设 @layer components 兜底默认值：变体/尺寸的
 * 默认值本就是根上工具类（与迁移前同源），加 components 层只会改变 revert 的落点而无增益。
 * display/align-items/justify-content 与工具类同值仍列入 revert：调用方
 * justify-start/items-start 等覆盖必须可生效（SearchIdleState multiline 卡片按钮实测在用）。
 */
.kb-el-button {
  height: revert-layer;
  padding: revert-layer;
  font-size: revert-layer;
  line-height: revert-layer;
  font-weight: revert-layer;
  border: revert-layer;
  border-radius: revert-layer;
  color: revert-layer;
  background-color: revert-layer;
  transition: revert-layer;
  white-space: revert-layer;
  user-select: revert-layer;
  vertical-align: revert-layer;
  text-align: revert-layer;
  display: revert-layer;
  align-items: revert-layer;
  justify-content: revert-layer;
}

/* EP 相邻按钮 12px 外边距（.el-button+.el-button，0,2,0）：基线无此规则，按需对等
   特异性清零；顺带覆盖未来跨组件 el-button 相邻的组合 */
.kb-el-button + .kb-el-button,
.kb-el-button + .el-button,
.el-button + .kb-el-button {
  margin-left: revert-layer;
}

/* EP hover/active 强设色值（unlayered 0,2,0，会压过调用方/变体的 hover:/active: 工具类）
   交还分层决定权；outline 同理（EP 的 none/2px outline 都让位给基线的 ring 方案） */
.kb-el-button:hover,
.kb-el-button:active {
  color: revert-layer;
  border-color: revert-layer;
  background-color: revert-layer;
  outline: revert-layer;
}

/* EP focus-visible 2px outline + transition 改写 → 基线是 focus-visible ring（box-shadow），
   outline 交还给工具类的 outline-none */
.kb-el-button:focus-visible {
  outline: revert-layer;
  transition: revert-layer;
}

/* EP is-disabled 灰化配色（disabled vars，含 :hover 0,3,0）→ 基线禁用态是原变体色 +
   disabled:opacity-55（经原生 disabled attribute 的 :disabled 伪类生效，EP 会置该属性）；
   cursor:not-allowed 两边同值不用接管 */
.kb-el-button.is-disabled,
.kb-el-button.is-disabled:hover {
  color: revert-layer;
  border-color: revert-layer;
  background-color: revert-layer;
  background-image: revert-layer;
}

/* EP loading 蒙版（is-loading::before 白色半透明罩）基线没有，压掉；is-loading 的
   position:relative 一并 revert 回 static（防点击由原生 disabled attribute 承担，
   与迁移前一致） */
.kb-el-button.is-loading::before {
  content: none;
}
.kb-el-button.is-loading {
  position: revert-layer;
}

/*
 * EP 默认插槽外层 span（.el-button>span，inline-flex）幽灵化为 display:contents：
 * 内容结构（leading/文字 span/trailing）打平到根 flex，根上的 gap-*、items-center、
 * justify-* 工具类直接作用于它们，与迁移前 button>span 的 DOM/布局逐层等价。
 * 只命中 EP 直接子级 span（:deep 收窄到 >），不波及插槽内的内容 span（truncate/
 * multiline 截断语义保持）。EP 的 [class*=el-icon]+span margin 规则因本组件不用
 * el-icon 而天然不命中，无需接管。
 */
.kb-el-button > :deep(span) {
  display: contents;
}

/*
 * 暗色契约说明：style.css 的 `.dark button`/`html.dark button` 两条 !important 通配
 * （约 1111/1296 行，对抗 Lake antd.css 的既有规则）同样命中 el-button 根——迁移前
 * AppButton 也是原生 button，基线暗色按钮文字色正是该通配的效果（实心钮白字亦然），
 * 刻意不对抗，像素以基线为准。bridge.css 的 `.dark .el-button--primary` 墨字防御规则
 * 因本组件不传 type（无 --primary 修饰类）而不会命中，见文件头选型记录。
 */
</style>

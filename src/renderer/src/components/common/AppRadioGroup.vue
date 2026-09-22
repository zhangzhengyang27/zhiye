<script setup lang="ts">
/**
 * 单选组组件（内部换底 element-plus：list 变体 = el-radio-group + el-radio，
 * segmented 变体 = el-segmented；对外 API 契约与纯自建版一致）。
 * - variant="list"（默认）：带圆点指示器的常规单选列表，支持 description；
 * - variant="segmented"：iOS 风格分段控件（BoardAiPanel / 分享有效期等用法）。
 * 本文件与 AppCheckbox.vue / AppSwitch.vue 为同族适配器（第二代，参照
 * AppInput/AppTextarea/AppSelect 的 canonical 模式：根即盒子 + EP 内部校准 +
 * 校准 CSS 前提注释四件套；同代三文件的形状/禁用/焦点校准写法互相同步维护）。
 *
 * EP 结构（node_modules/element-plus@2.14.5 编译产物核实）：
 * - el-radio-group：div.el-radio-group（role=radiogroup，aria-label 缺省
 *   "radio-group"）> label.el-radio（is-disabled/is-checked/is-focus）>
 *   span.el-radio__input > input.el-radio__original（隐藏原生 radio，同名分组内
 *   方向键导航/roving tabindex 由浏览器原生承担）+ span.el-radio__inner（视觉圆点）
 *   + span.el-radio__label（default slot）；
 * - el-segmented：div.el-segmented（role=radiogroup，aria-label 缺省 "segmented"）>
 *   div.el-segmented__group > div.el-segmented__item-selected（运行时内联注入
 *   width/height/transform/display 的移动高亮块，ResizeObserver + modelValue watch
 *   度量）+ label.el-segmented__item（is-selected/is-disabled，每项内含隐藏原生
 *   radio input：opacity:0 / 0x0 / pointer-events:none）> div.el-segmented__item-label
 *   （default slot，作用域 { item }）。
 *
 * 适配决策（两变体分别推导）：
 * - list 根 = el-radio-group：role/同名 radio 分组/原生方向键「移动即选中」白赚。
 *   EP 强设 inline-flex/align-items:center/font-size:0（unlayered 压过 utilities——
 *   AppSelect display 教训同款），布局基座用 scoped 接管，方向经 prop 驱动的
 *   modifier 类切换；间距 gap-3/gap-5 与基线一致走 utilities（EP 未设 gap）；
 * - segmented 根 = el-segmented：options 原样透传（items 的 {label,value,disabled}
 *   形状即 EP alias 默认字段；description 字段被忽略——与基线 segmented 忽略
 *   description 一致）。形状校准为基线药丸：根/高亮块/项全 9999px 圆角 + p-1 +
 *   组内 gap-1，高亮块底色 surface + 卡片阴影；选中项对勾经 default slot（作用域
 *   item）画 AppIcon，与基线同款（h-3.5 w-3.5 text-success，仅选中项渲染）；
 * - 键盘：方向键交给原生 radio（移动即选中，与基线一致）；基线对非本方向箭头键
 *   忽略（垂直列表忽略左右，水平列表与 segmented 忽略上下），而原生 radio 四方向
 *   都导航——根 keydown 对反向箭头 preventDefault 还原；Home/End 基线有而原生没有
 *   ——根 keydown 补齐（focus + click 首个/末个可用项，click 触发 change → EP emit，
 *   已选中项原生不重复派发 change，无多余 emit）；
 * - 文案：基线 label/description 结构原样放进 EP 的 label 插槽（两变体同款），
 *   文字色/字号/字重由插槽内 utility span 保证，不受 EP 根 color/line-height 干扰；
 * - 禁用：基线语义 = 常态样式整体 opacity 0.5 + 指针 not-allowed（list 按项，
 *   segmented 按项）。中和 EP 的灰底/灰点/占位字色。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - 语义根从 div(role=radiogroup)+button(role=radio) 变为 EP 的
 *   radiogroup + 隐藏原生 radio（list/segmented 同）；roving tabindex 由浏览器原生
 *   管理而非组件内 focusedKey 状态，Tab 落点与基线一致（当前选中项）；
 * - list 单项根从 button 变为包裹式 label：点击行为等价（label→input 原生关联），
 *   基线 button 的 rounded-lg（无可见边框，圆角不可见）不再渲染；
 * - segmented 选中高亮从「按钮自带 bg」变为「EP 移动高亮块」：切换瞬间 EP 会把
 *   高亮块滑到新项（transition 已压掉，等效基线瞬时切换，见 scoped 块）；items 为
 *   空数组时 el-segmented 渲染空注释节点（基线渲染空容器）——现有调用点均非空；
 * - aria-label：EP 给 radiogroup 根补了缺省 aria-label（list="radio-group"/
 *   segmented="segmented"），基线无——无障碍增益，保留；
 * - segmented 项盒高/字色统一为 doc 页渲染值，与基线的 antd.css 劫持态不同：
 *   基线 segmented 项是 <button>，doc 页被懒注入的 antd.css 劫持（line-height
 *   1.5715 → 项高 34、color rgba(0,0,0,0.85)），board 页无 Lake 则是 token 正常值
 *   （line-height 20px → 项高 32、color tertiary）——同一基线两页两个样。换底后
 *   元素不再是 button，统一按 token 呈现（line-height 22px、tertiary）：board 页
 *   内容下方整体 2px 纵移（实测 ~19k 像素）、doc 页 style 设置对话框未选中项字形
 *   灰度差（~206px），均为「修复基线意外」；share 对话框（同为 doc 页、劫持前
 *   截图时机不同）实测 0 差异；
 * - 键盘方向键契约：原生 radio 四方向都导航且移动即选中，基线只认本方向箭头——
 *   非本方向经根 keydown preventDefault 忽略，Home/End 由根 keydown 补齐（原生无），
 *   行为断言逐项覆盖。
 */
import { computed, ref, useAttrs } from "vue"
import type { RadioGroupInstance, SegmentedInstance } from "element-plus"
import AppIcon from "./AppIcon.vue"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

interface RadioItem {
  label: string
  value: string | number | boolean
  description?: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | boolean
    items: RadioItem[]
    variant?: "list" | "segmented"
    orientation?: "horizontal" | "vertical"
    disabled?: boolean
  }>(),
  {
    variant: "list",
    orientation: "vertical",
    disabled: false,
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: string | number | boolean]
}>()

const attrs = useAttrs()
const groupRef = ref<RadioGroupInstance | SegmentedInstance | null>(null)

const forwardedAttrs = computed(() => {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class"))
})

const keyOf = (value: string | number | boolean) => String(value)

const isSelected = (item: RadioItem) => item.value === props.modelValue

/** EP 的 update:modelValue 负载类型含 undefined（radio-group d.ts 口径），实际
 *  选中项必有 value；防御性忽略 undefined，不向调用方发空值 */
const handleUpdate = (value: string | number | boolean | undefined) => {
  if (value === undefined) {
    return
  }

  emit("update:modelValue", value)
}

/**
 * 键盘契约（见文件头）：反向箭头 preventDefault 拦掉原生全方向导航；Home/End 补齐
 * 「跳首个/末个可用项并选中」。可用项 = 未禁用（组禁用由 EP 落到 input disabled）。
 */
const handleKeydown = (event: KeyboardEvent) => {
  const isVertical = props.variant !== "segmented" && props.orientation === "vertical"

  const blockedKeys = isVertical ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]
  if (blockedKeys.includes(event.key)) {
    event.preventDefault()
    return
  }

  if (event.key !== "Home" && event.key !== "End") {
    return
  }

  const root = (groupRef.value?.$el as HTMLElement | undefined) ?? null
  if (!root) {
    return
  }

  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio]")).filter(
    (el) => !el.disabled,
  )
  if (inputs.length === 0) {
    return
  }

  event.preventDefault()
  const target = event.key === "Home" ? inputs[0] : inputs[inputs.length - 1]
  if (!target) {
    return
  }
  target.focus()
  target.click()
}

/** list 根：布局基座由 scoped 接管（EP 强设 inline-flex/center/font-size:0），
 *  间距与基线一致走 utilities（EP 未设 gap，工具类可生效） */
const radioGroupClass = computed(() =>
  cn(
    "kb-el-radio-group",
    props.orientation === "vertical"
      ? "kb-el-radio-group--vertical gap-3"
      : "kb-el-radio-group--horizontal gap-5",
    String(attrs.class ?? ""),
  ),
)

const segmentedClass = computed(() => cn("kb-el-segmented", String(attrs.class ?? "")))
</script>

<template>
  <el-radio-group
    v-if="variant !== 'segmented'"
    ref="groupRef"
    v-bind="forwardedAttrs"
    :model-value="modelValue"
    :disabled="disabled"
    :class="radioGroupClass"
    @update:model-value="handleUpdate"
    @keydown="handleKeydown"
  >
    <el-radio
      v-for="item in items"
      :key="keyOf(item.value)"
      :value="item.value"
      :disabled="item.disabled"
      class="kb-el-radio"
    >
      <span class="block text-sm font-medium text-ink">{{ item.label }}</span>
      <span v-if="item.description" class="mt-0.5 block text-xs text-ink-tertiary">{{
        item.description
      }}</span>
    </el-radio>
  </el-radio-group>

  <el-segmented
    v-else
    ref="groupRef"
    v-bind="forwardedAttrs"
    :model-value="modelValue"
    :options="items"
    :disabled="disabled"
    :class="segmentedClass"
    @update:model-value="handleUpdate"
    @keydown="handleKeydown"
  >
    <template #default="{ item }">
      <AppIcon
        v-if="isSelected(item as RadioItem)"
        name="i-lucide-check"
        class="h-3.5 w-3.5 text-success"
      />
      {{ (item as RadioItem).label }}
    </template>
  </el-segmented>
</template>

<style scoped>
/*
 * 色值直接引用 --kb-* token 而不是绕道 --el-*：bridge.css 已把 --el-* 全量绑到
 * --kb-*，直接用 kb token 少一层间接、不依赖 bridge 映射的存在性（同 AppInput）。
 * 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 * 赢不了它们，因此禁止用工具类覆盖 EP 内部样式）。
 * 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为
 * 组件模块的副作用 import，先于本 SFC style 执行；复制本模板时保持这一前提。
 * 本组件未用到 revert-layer（EP 根上强设的是 display/align/font-size，无 width 类
 * 冲撞；调用方传入的 w-full 走 utilities 直接生效）。
 */

/* ---------- list 变体（el-radio-group + el-radio） ---------- */

/* EP 强设 inline-flex + align-items:center + font-size:0 + flex-wrap:wrap（unlayered）：
   基线根是块级 flex 容器（垂直 items-stretch / 水平 items-center）、不换行；
   字号由插槽 utility span 显式给出，EP 的 font-size:0 无可见影响，不动 */
.kb-el-radio-group {
  display: flex;
  flex-wrap: nowrap;
}

.kb-el-radio-group--vertical {
  flex-direction: column;
  align-items: stretch;
}

.kb-el-radio-group--horizontal {
  flex-direction: row;
  align-items: center;
}

/* 单项根：EP 强设 height:32px / margin-right:30px / font-weight:500 /
   white-space:nowrap / align-items:center（unlayered）——还原基线 button 语义：
   高度内容撑、无右距（gap 在组根）、字重 400（label 的 font-medium 在插槽 span 上）、
   description 可换行、圆点与两行文案顶部对齐（基线 items-start） */
.kb-el-radio-group .el-radio {
  height: auto;
  margin-right: 0;
  font-weight: 400;
  white-space: normal;
  align-items: flex-start;
  gap: 10px; /* 基线 gap-2.5 */
}

/* 圆点校准：基线 h-4.5 w-4.5 rounded-full border border-line-input bg-surface；
   margin-top 2px = 基线 mt-0.5（18px 圆点与 20px 行高文字顶部对齐） */
.kb-el-radio-group :deep(.el-radio__inner) {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: 1px solid var(--kb-border-input);
  background-color: var(--kb-surface-bg);
  transition:
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

/* EP hover/is-focus 会把圆点描边变成 brand（基线 hover/点击聚焦无描边变化） */
.kb-el-radio-group :deep(.el-radio__inner:hover),
.kb-el-radio-group :deep(.el-radio__input.is-focus:not(.is-checked) .el-radio__inner) {
  border-color: var(--kb-border-input);
}

/* 选中：brand 描边 + brand 内点、底保持透明（基线 isSelected 仅换 border-brand）；
   EP 默认是「brand 实心圆 + 白点」，与基线相反，全部接管 */
.kb-el-radio-group :deep(.el-radio__input.is-checked .el-radio__inner) {
  border-color: var(--kb-brand);
  background-color: transparent;
}

/* 内点：基线 h-2 w-2 bg-brand（EP 默认 4px 白点） */
.kb-el-radio-group :deep(.el-radio__input.is-checked .el-radio__inner::after) {
  width: 8px;
  height: 8px;
  background-color: var(--kb-brand);
}

/* 键盘焦点环：EP 画在圆点上（2px/offset 1px）——基线 ring 在整项按钮上，压掉 EP 的
   并改画到 .el-radio 根（:has；降级语义同 AppSwitch 的 :has 说明） */
.kb-el-radio-group :deep(.el-radio__original:focus-visible + .el-radio__inner) {
  outline: none;
}

.kb-el-radio-group :deep(.el-radio:has(.el-radio__original:focus-visible)) {
  outline: 2px solid var(--kb-brand);
  outline-offset: 1px;
}

/* 文案容器：EP 的 8px 左内边距让位给项根 gap；min-width:0 对齐基线截断前提 */
.kb-el-radio-group :deep(.el-radio__label) {
  padding-left: 0;
  min-width: 0;
}

/* 禁用（基线 disabled:opacity-50 + disabled:cursor-not-allowed 按项生效；组禁用经
   EP 落到每项 input disabled 后同样走到这里）。中和 EP 的禁用灰底/灰点/灰字，
   勾选态沿用选中配色（基线禁用勾选 = 选中样式整体变淡）。 */
.kb-el-radio-group :deep(.el-radio.is-disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

.kb-el-radio-group :deep(.el-radio__input.is-disabled .el-radio__inner) {
  background-color: var(--kb-surface-bg);
  border-color: var(--kb-border-input);
  cursor: not-allowed;
}

.kb-el-radio-group :deep(.el-radio__input.is-disabled.is-checked .el-radio__inner) {
  background-color: transparent;
  border-color: var(--kb-brand);
}

.kb-el-radio-group :deep(.el-radio__input.is-disabled.is-checked .el-radio__inner::after) {
  background-color: var(--kb-brand);
}

/* ---------- segmented 变体（el-segmented） ---------- */

/* 根校准：基线 inline-flex items-center gap-1 rounded-full bg-muted p-1。
   EP 强设 min-height:32px / padding:2px / 圆角 4px / fill 底——逐一接管；
   align-items:stretch 与 font-size:14px 与基线等效，保留 EP 默认 */
.kb-el-segmented {
  background-color: var(--kb-muted-bg);
  border-radius: 9999px;
  padding: 4px;
  min-height: 0;
}

/* 组内项间距：基线 gap-1（EP 默认项贴项，靠 padding 撑间距） */
.kb-el-segmented :deep(.el-segmented__group) {
  gap: 4px;
}

/* 项：基线 rounded-full px-3.5 py-1.5 text-sm font-medium；EP 强设 flex:1 等分宽、
   padding 0 11px、圆角 base-2——flex 与间距让位给内容自适应（基线行为） */
.kb-el-segmented :deep(.el-segmented__item) {
  flex: 0 0 auto;
  padding: 6px 14px;
  border-radius: 9999px;
  font-weight: 500;
  cursor: pointer;
  color: var(--kb-text-tertiary); /* 基线未选中 text-ink-tertiary（EP 默认 regular） */
}

/* hover：基线仅文字 tertiary→secondary，无底色；EP 会加 fill 底 + active 深底，压掉 */
.kb-el-segmented :deep(.el-segmented__item:not(.is-disabled):not(.is-selected):hover) {
  color: var(--kb-text-secondary);
  background-color: transparent;
}

.kb-el-segmented :deep(.el-segmented__item:not(.is-disabled):not(.is-selected):active) {
  background-color: transparent;
}

/* 选中文字：基线 text-ink（EP 默认白字配 primary 底，底色已换成 surface） */
.kb-el-segmented :deep(.el-segmented__item.is-selected) {
  color: var(--kb-text);
}

/* 项内文案容器：flex 居中 + 6px 间隙（基线 justify-center gap-1.5）；
   line-height 22px 对齐基线 text-sm 的行盒（项目 Tailwind text-sm 行高 = 14 ×
   calc(1.25/.875) ≈ 22.001px，LayoutUnit 取整后等同 22px；EP 默认 normal 会少 2px
   让整块高 32 而非 34，居中的对话框面板随之整体偏移 1px） */
.kb-el-segmented :deep(.el-segmented__item-label) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  line-height: 22px;
  transition: none;
}

/* 移动高亮块：基线选中项 bg-surface + shadow-[var(--kb-card-shadow)] 药丸；
   transition:none 压掉 EP 的 0.3s 滑动（基线为瞬时切换，见文件头如实差异） */
.kb-el-segmented :deep(.el-segmented__item-selected) {
  background-color: var(--kb-surface-bg);
  border-radius: 9999px;
  box-shadow: var(--kb-card-shadow);
  transition: none;
}

/* 禁用（基线 disabled:opacity-50 disabled:cursor-not-allowed；颜色不变淡）。
   中和 EP 的占位灰字与禁用选中底（primary-light-5）；选中的 disabled 项字色
   由上面 .is-selected 的 color 规则（同特异性靠加载顺序取胜）保持 text-ink */
.kb-el-segmented :deep(.el-segmented__item.is-disabled) {
  color: inherit;
  opacity: 0.5;
  cursor: not-allowed;
}

.kb-el-segmented :deep(.el-segmented__item-selected.is-disabled) {
  background-color: var(--kb-surface-bg);
}

/* 键盘焦点环：EP 画在高亮块 ::before（is-focus-visible 由 input :focus-visible 驱动）。
   基线 ring-2 ring-brand 无 offset，重着色并去掉 1px 偏移 */
.kb-el-segmented :deep(.el-segmented__item-selected.is-focus-visible::before) {
  outline: 2px solid var(--kb-brand);
  outline-offset: 0;
}

/*
 * 暗色契约说明：隐藏原生 radio（el-radio__original / el-segmented__item-input）被
 * style.css 的 .dark input / html.dark input（!important）命中——不可见且不承载
 * 内容，无需对抗；文字色全部在插槽 utility span 与上面的接管规则里
 * （html.dark label { color: inherit } 特异性低于本块带前缀的规则，不干扰）。
 */
</style>

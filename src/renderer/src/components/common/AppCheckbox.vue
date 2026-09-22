<script setup lang="ts">
/**
 * 复选框组件（内部换底 element-plus el-checkbox，对外 API 契约与纯自建版一致）。
 * 对外 API：modelValue + update:modelValue；label/ariaLabel 可选；disabled。
 * 本文件与 AppSwitch.vue / AppRadioGroup.vue 为同族适配器（第二代，参照
 * AppInput/AppTextarea/AppSelect 的 canonical 模式：根即盒子 + EP 内部校准 +
 * 幽灵化 CSS 前提注释四件套；同代三文件的形状/禁用/焦点校准写法互相同步维护）。
 *
 * EP 结构（node_modules/element-plus@2.14.5 编译产物核实）：
 *   label.el-checkbox 根（for 关联内部 input + onClickRoot，整块可点）
 *     > span.el-checkbox__input
 *         > input.el-checkbox__original（隐藏原生 checkbox：opacity:0 / 0x0 / z-index:-1，
 *           唯一可聚焦元素，Tab/Space 原生语义）
 *         + span.el-checkbox__inner（视觉方块）
 *     > [仅当有 label 文本或 default slot 时] span.el-checkbox__label
 *
 * 适配决策：
 * - 根即盒子：调用方 class 经 attr fallthrough 落在 el-checkbox 根 label 上（EP 单根
 *   自动透传，本组件不接 attrs），与迁移前落在根 label 语义一致（mt-1/shrink-0 等）；
 *   可视方块由 EP 的 .el-checkbox__inner 承担，scoped 校准尺寸/圆角/描边/底色——与
 *   AppInput「根即盒子 + 幽灵化」不同：checkbox 的可视面就是 EP 内部元素，幽灵化后
 *   无物呈现盒面，属「校准」型适配；
 * - 文案插槽条件传入：仅当 label 文本或调用方插槽存在时才传 default slot（template
 *   v-if），否则 EP hasOwnLabel=false 不渲染 .el-checkbox__label——裸 checkbox（版本行/
 *   回收站行）不会多出 EP label span 的 8px 内边距与 gap 空隙；label 文字的
 *   text-sm/text-ink-secondary 放插槽内 utility span，不受 EP 根 color/line-height 干扰；
 * - 对勾：EP 用 1px 旋转边框画 ::after（笔画观感与基线 lucide 描边不同），替换为
 *   AppSelect 弹层同款 lucide-check mask 画法（12px 白色，居中），与基线 i-lucide-check
 *   h-3 w-3 同字形同尺寸；显隐用 opacity 过渡（EP 用 transform scaleY，一并压掉）；
 * - 键盘焦点环：EP 自带 input:focus-visible + .el-checkbox__inner outline（2px /
 *   offset 1px，与基线 peer-focus-visible:ring-2 ring-brand ring-offset-1 同几何），
 *   仅重着色为 kb token；EP 同规则会把方块圆角压回 2px，须一并回写 5px；
 * - 禁用：基线语义 = 常态样式整体 opacity 0.55（且 disabled:cursor-not-allowed 写在
 *   label 上永不命中、光标保持 pointer）。中和 EP 的灰底/灰字/禁用描边，改在根上打
 *   opacity + pointer 光标。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - label 文本的选中行为：EP 根带 user-select:none，基线 label 内文字可被选中——
 *   已中和回 user-select:text，行为与基线一致（列此条防后人误删该行）；
 * - aria-label 挂载点从内部原生 input 上移到根 label（EP 的 ariaLabel prop 渲染在
 *   根上）；包裹式 label 的可访问名经 Chromium 实测（CDP accessibility tree）仍由
 *   aria-label 提供，无可见差异；
 * - 勾选字形 AA：基线为内联 lucide svg，本组件用 CSS mask（AppSelect 弹层同款），
 *   Chromium 对 mask 路径的光栅化与内联 svg 有亚像素差——login 页实测 82 个
 *   >tolerance 像素（单只勾选框），1x 下不可分辨，已接受；
 * - 禁用态光标刻意保持 pointer：基线的 disabled:cursor-not-allowed 写在 label 上
 *   永不命中（:disabled 不匹配 label），光标一直是 pointer，此处忠实还原。
 */
import { computed, useSlots } from "vue"

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    label?: string
    ariaLabel?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    label: "",
    ariaLabel: "",
  }
)

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()

const slots = useSlots()

/** EP hasOwnLabel = label 文本 || default slot：都不存在时不传插槽，避免空 label span */
const hasOwnLabel = computed(() => props.label !== "" || !!slots.default)
</script>

<template>
  <el-checkbox
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel || undefined"
    class="kb-el-checkbox inline-flex cursor-pointer items-center gap-2"
    @update:model-value="(value: unknown) => emit('update:modelValue', Boolean(value))"
  >
    <template v-if="hasOwnLabel" #default>
      <span v-if="label" class="text-sm text-ink-secondary">{{ label }}</span>
      <slot />
    </template>
  </el-checkbox>
</template>

<style scoped>
/*
 * 色值直接引用 --kb-* token 而不是绕道 --el-*：bridge.css 已把 --el-* 全量绑到
 * --kb-*，直接用 kb token 少一层间接、不依赖 bridge 映射的存在性（同 AppInput）。
 * 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 * 赢不了它们，因此禁止用工具类覆盖 EP 内部样式）。
 * 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为
 * 组件模块的副作用 import，先于本 SFC style 执行；复制本模板时保持这一前提。
 * 本组件未用到 revert-layer（EP 根上没有强设会被调用方宽度/字号类冲撞的属性）。
 */

/* EP 强设 height:32px / margin-right:30px / font-weight:500（unlayered）：
   基线 label 高度由内容撑出、无右距（间距交给外层布局）、label 文本字重 400 */
.kb-el-checkbox {
  height: auto;
  margin-right: 0;
  font-weight: 400;
  /* EP 根 user-select:none → 基线 label 文本可选中，中和之（见文件头如实差异） */
  user-select: text;
  -webkit-user-select: text;
}

/* EP label span 自带 padding-left:8px（EP 无 gap 的间距方案）——本组件用根上
   gap-2 承担方块与文字的 8px 间距，必须清零，否则文字右移 8px */
.kb-el-checkbox :deep(.el-checkbox__label) {
  padding-left: 0;
}

/* 方块校准：基线 h-4.5 w-4.5 rounded-[5px] border border-line-input bg-surface */
.kb-el-checkbox :deep(.el-checkbox__inner) {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid var(--kb-border-input);
  background-color: var(--kb-surface-bg);
  /* EP 自带 .25s 回弹 bezier → 对齐基线 transition-colors（150ms 标准 ease） */
  transition:
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

/* EP hover 会把方块描边变成 brand（基线 hover 无描边变化） */
.kb-el-checkbox :deep(.el-checkbox__inner:hover) {
  border-color: var(--kb-border-input);
}

/* 选中：brand 底 + brand 描边（基线 border-brand bg-brand） */
.kb-el-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: var(--kb-brand);
  border-color: var(--kb-brand);
}

/*
 * 对勾：基线 i-lucide-check h-3 w-3 白色（AppSelect 弹层对勾同款 mask 画法），
 * 替换 EP 的 1px 旋转边框画法；显隐 opacity 0→1（基线 v-if 切换无过渡，
 * 150ms 渐显为可接受近似；EP 的 transform 过渡一并压掉）。
 * --el-color-white 未被 bridge 映射（EP 默认 #fff 常量），明暗两态恒白 = 基线 text-white。
 */
.kb-el-checkbox :deep(.el-checkbox__inner::after) {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  border: none;
  transform: translate(-50%, -50%);
  transition: opacity 0.15s;
  background-color: var(--el-color-white);
  opacity: 0;
  /* svg 声明 width/height=12（= 元素尺寸）让 mask 按 1:1 光栅化：不带尺寸时 Chromium
     先按 24px 栅格再线性降采样，对勾笔画比基线内联 svg 细且生硬 */
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    0 0/100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    0 0/100% 100% no-repeat;
}

.kb-el-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  opacity: 1;
}

/* 键盘焦点环：EP input:focus-visible + inner outline（2px/offset 1px = 基线 ring 几何）
   重着色为 brand；EP 同规则还会把圆角压回 2px，一并回写 5px */
.kb-el-checkbox :deep(.el-checkbox__original:focus-visible + .el-checkbox__inner) {
  outline-color: var(--kb-brand);
  border-radius: 5px;
}

/*
 * 禁用（基线语义 = 常态样式整体 opacity 0.55；disabled:cursor-not-allowed 写在
 * label 上永不命中 → 光标保持 pointer）。中和 EP 的禁用灰底/灰对勾/禁用描边，
 * 勾选态沿用选中配色（基线禁用勾选 = brand 底整体变淡）。
 */
.kb-el-checkbox.is-disabled {
  cursor: pointer;
  opacity: 0.55;
}

.kb-el-checkbox :deep(.el-checkbox__input.is-disabled .el-checkbox__inner) {
  background-color: var(--kb-surface-bg);
  border-color: var(--kb-border-input);
  cursor: pointer;
}

.kb-el-checkbox :deep(.el-checkbox__input.is-disabled.is-checked .el-checkbox__inner) {
  background-color: var(--kb-brand);
  border-color: var(--kb-brand);
}

/*
 * 暗色契约说明：style.css 的 .dark input / html.dark input（!important，约 1111/1297
 * 两处）会命中隐藏的 .el-checkbox__original——元素 opacity:0 / 0x0 / z-index:-1，
 * 不承载任何可见内容，无需 AppInput/textarea 那套 color 对抗；可见文字都在插槽
 * utility span 上（html.dark .text-ink-* !important 与基线同链路生效）。
 */
</style>

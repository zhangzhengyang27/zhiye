<script setup lang="ts">
/**
 * 多行文本框组件（内部换底 element-plus el-input type=textarea，对外 API 契约与纯自建版一致）。
 * 本文件与 AppInput.vue / AppSelect.vue 为同族适配器（共享 forwardedAttrs、根上
 * revert-layer 规则与幽灵化 CSS 前言段的同构写法；normalizedValue/expose 仅
 * AppInput/AppTextarea 共有），改动共享段时三处同步维护；是否提取共享 composable
 * 留待 Phase 4 Task 4.1 评估。第二代适配器 AppCheckbox/AppSwitch/AppRadioGroup
 * （Task 2.4-2.6）参照本族模式落地，但其校准段按组件结构独立推导、不共享本段。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - caret-color: var(--kb-brand) 是相对基线的视觉增量（基线为默认墨色光标）；
 * - IME 组合期间不再逐键 emit：EP 组合期间不发 update:modelValue，compositionend 补发，
 *   与 Vue v-model 惯例一致；
 * - placeholder/disabled 的视觉不再吃调用方的 placeholder:/disabled: 工具类（这两个变体
 *   在根 div 上永不命中，改为本文件 scoped 规则呈现默认值；当前无调用方传入非默认值，
 *   复制模板时注意此权衡）；
 * - 全局 :focus-visible 指示器（style.css：outline 2px brand + offset 2px + border-radius
 *   4px）迁移前会落在原生 textarea 上（聚焦时盒角临时变 4px、盒外一圈描边）；换底后焦点
 *   在 inner，EP 的 :focus{outline:none} 与本文件幽灵化的 outline:none 都会压掉它，根上
 *   刻意不镜像该 quirk——聚焦指示与 AppInput canonical 对齐：根 focus-within brand 边 +
 *   调用方（经改写的）focus-within 工具类；
 * - 暗色字色契约靠 inner 的 color:inherit!important 维系（html.dark .text-ink-* 的
 *   !important 字色类迁移前落在元素上、换底后落在根上，见 style 块注释）。
 *
 * 适配架构（canonical = AppInput 的「根即盒子 + EP 内部幽灵化」，以下仅记录 textarea 的
 * 结构差异决策）：
 * - el-input type=textarea 渲染 .el-textarea 根 + .el-textarea__inner，且 inner 本身就是
 *   输入面（自带 resize 手柄、1.5 行高、内边距、inset shadow、圆角）——没有单行分支的
 *   wrapper 壳。盒面属性（border/bg/rounded/padding/字号行高）仍全部放根：调用方 class
 *   经 cn() 落根、tailwind-merge 保证可覆盖一切盒面属性；inner 幽灵化为纯文本面
 *   （透明、无描边阴影、无内边距、圆角清零），杜绝 EP 的 inset shadow 与我们抢盒面；
 * - resize 手柄从 inner 迁到根：基线的 resize-y 作用在「整个盒子」上（手柄在盒角、拖拽
 *   盒子变高）。若保留 EP 在 inner 上的 resize，拖拽只改变 inner 自身（根盒子不动、手柄
 *   悬浮在根内边距区里），与基线不符。根 div 要出现 UA 手柄需要 overflow != visible
 *   （resize 规范前提），故默认类补 overflow-hidden——inner 恰好填满根内容区，剪裁无
 *   副作用；同时 inner 置 resize:none 防双手柄。⚠️ 调用方勿传 overflow-visible 覆盖
 *   （twMerge 会去重掉 hidden），否则根失去 overflow != visible 前提，resize 手柄静默
 *   消失；
 * - rows 经 el-input 的同名 prop 落到原生 textarea：根高度仍由内容撑出（rows × 行高 +
 *   根内边距 + 边框），盒面度量与基线一致；调用方传显式高度类（h-40 等）时 inner 的
 *   height:100% 填满根内容区。注意 EP 无 autosize 时会在运行时经 resizeTextarea 给
 *   inner 注入 inline min-height（≈1 行高，EP input 源码 `else textareaCalcStyle.value =
 *   { minHeight: ... }`），静态 CSS 看不到；rows≥1 时与 rows 高度/height:100% 无冲突。
 *   不引入 autosize（基线无此 API）；
 * - 调用方 focus: 工具类在根 div 上永不命中（真实焦点在 inner，div 没有 :focus），聚焦
 *   样式请使用 focus-within: 变体——根内唯一可聚焦元素是 inner，根上的 :focus-within 与
 *   基线原生 textarea 的 :focus 同时发生，语义等价。默认聚焦描边同样写成
 *   focus-within:border-brand 放进 utilities 层，tailwind-merge 可被调用方同名变体覆盖
 *   （顺带修掉 AppInput 记录的「调用方 focus:border-* 被 scoped 规则挡住」权衡）。
 *   注意不能用「运行时把 focus: 改写成 focus-within:」的方案：Tailwind 按源码静态扫描
 *   生成工具类，运行时拼出的 focus-within:ring-* 类没有任何源码出现，不会生成对应
 *   CSS（画板 AI 面板的 focus:ring-4 已在调用方改为 focus-within: 变体）；
 * - attrs（maxlength/name/data-* 等）经 el-input 透传到内部原生 textarea（EP
 *   inheritAttrs:false，class/style 落根、其余落原生元素）；根内边距区（基线中就是
 *   textarea 自身的一部分）点击手动补聚焦；
 * - 暴露 focus()/blur()/select()（与迁移前 expose 一致）。
 */
import { computed, onBeforeUnmount, onMounted, ref, useAttrs } from "vue"
import type { InputInstance } from "element-plus"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    modelValue?: string
    rows?: number
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    modelValue: "",
    rows: 4,
    placeholder: "",
    disabled: false,
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const attrs = useAttrs()
const inputRef = ref<InputInstance | null>(null)

const normalizedValue = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined) {
    return ""
  }

  return String(props.modelValue)
})

const forwardedAttrs = computed(() => {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class"))
})

/** 根 div 的 padding 区不在 inner 内，点击时手动补聚焦，对齐迁移前行为 */
let rootEl: HTMLElement | null = null

const handleRootClick = () => {
  inputRef.value?.focus()
}

onMounted(() => {
  const nativeTextarea = inputRef.value?.textarea
  rootEl = nativeTextarea?.closest<HTMLElement>(".kb-el-textarea") ?? null
  rootEl?.addEventListener("click", handleRootClick)
})

onBeforeUnmount(() => {
  rootEl?.removeEventListener("click", handleRootClick)
  rootEl = null
})

defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  select: () => inputRef.value?.select(),
})

const textareaClass = computed(() =>
  cn(
    // 与 AppInput 同一套语雀紧凑风格（浅灰底、10px 圆角、13px 字号）。
    // 聚焦描边写 focus-within:（div 上 focus: 永不命中）；禁用态与 placeholder 色由 scoped
    // 规则接管（对应迁移前 disabled:*/placeholder:* 工具类）；overflow-hidden 是根上
    // resize 手柄的启用条件（resize 要求 overflow != visible），inner 填满内容区故无副作用；
    // cursor-text 对齐原生 textarea 的整盒文本光标（基线中 padding 区也是 textarea 自身）。
    "kb-el-textarea w-full resize-y overflow-hidden cursor-text rounded-[10px] border border-line bg-muted px-3 py-2 text-[13px] leading-5 text-ink outline-none transition",
    "focus-within:border-brand",
    String(attrs.class ?? ""),
  ),
)
</script>

<template>
  <el-input
    ref="inputRef"
    v-bind="forwardedAttrs"
    :model-value="normalizedValue"
    type="textarea"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="textareaClass"
    @update:model-value="(v: string) => emit('update:modelValue', v ?? '')"
  />
</template>

<style scoped>
/*
 * 色值直接引用 --kb-* token 而不是绕道 --el-*：bridge.css 已把 --el-* 全量绑到
 * --kb-*，直接用 kb token 少一层间接、不依赖 bridge 映射的存在性（同 AppInput）。
 * 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 * 赢不了它们，因此禁止用工具类覆盖 EP 内部样式）。
 * 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为脚本
 * 副作用 import，先于 SFC style 模块执行；复制本模板时保持这一前提。
 */

/* EP 在根上强设 width:100%/font-size:var(--el-font-size-base)，unlayered 会压过调用方的
   宽度/字号工具类；revert-layer 把决定权交回下层（utilities 优先、components 兜底）。
   降级：旧浏览器（Firefox<97/Safari<16.4）不支持时该声明被丢弃，EP 默认
   width:100%/font-size:14px 获胜，调用方宽度/字号工具类静默失效——
   桌面端 Electron(Chromium) 无虞，Web 端可接受。 */
.kb-el-textarea {
  width: revert-layer;
  font-size: revert-layer;
}

@layer components {
  .kb-el-textarea {
    width: 100%;
    font-size: 13px;
  }
}

/* EP 在根上强设 vertical-align:bottom（el-textarea inline-block 的行内对齐），基线里
   原生 textarea（overflow != visible → 基线 = 底外缘）按 UA initial 的 baseline 对齐，
   二者在行盒内相差一个 strut 下伸部（实测 3.2px，会把整个盒子顶下去）。根 overflow:
   hidden 的 baseline 同样是底外缘，改回 baseline 即与基线盒子位置逐像素一致。 */
.kb-el-textarea {
  vertical-align: baseline;
}

/*
 * 幽灵化 EP inner：盒面全部让位给根 div，inner 只承担文本输入行为。
 * font: inherit 让根上的字号/行高/字重（调用方可覆盖）贯通到输入面——EP 默认在 inner
 * 上强设 line-height:1.5，会把调用方 leading-* 顶掉；height:100% 在根高度为 auto
 * （rows 撑出）时按规范回落为 auto、不影响 rows 度量，在调用方给显式高度时填满。
 */
.kb-el-textarea :deep(.el-textarea__inner) {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  transition: none;
  /* resize 手柄在根上（见文件头），inner 的 EP 默认手柄必须关掉防双手柄 */
  resize: none;
  outline: none;
  /* inherit 加 !important 是 textarea 特有的暗色契约：style.css 的
     html.dark .text-ink-*（!important）迁移前直接落在原生 textarea 上（随调用方
     text-ink/secondary 类给出 0.88/0.75 白），换底后这条规则落在根 div 上，而
     .dark textarea（!important，约 1113/1298 两处）会以 0.88 白劫持 inner、盖掉
     继承——inner 必须强制跟随根的最终生效色才能保真调用方的字色类。 */
  font: inherit;
  color: inherit !important;
  caret-color: var(--kb-brand);
}

/* hover/focus 态 EP 会给 inner 补 inset shadow（单行分支画在 wrapper 上，textarea 分支
   直接画在 inner 上），与幽灵化冲突，一并压掉 */
.kb-el-textarea :deep(.el-textarea__inner:hover),
.kb-el-textarea :deep(.el-textarea__inner:focus) {
  box-shadow: none;
}

.kb-el-textarea :deep(.el-textarea__inner::placeholder) {
  color: var(--kb-text-quaternary);
}

/*
 * 禁用态（迁移前 disabled:* 工具类在 div 上不命中，改由 EP 根上的 .is-disabled 呈现；
 * EP 同时会给 disabled inner 补灰底与 inset shadow，一并压掉）。
 */
.kb-el-textarea.is-disabled {
  background-color: var(--kb-grey-200);
  cursor: not-allowed;
}

.kb-el-textarea.is-disabled :deep(.el-textarea__inner) {
  background: transparent;
  box-shadow: none;
  /* !important 压过上面的 color:inherit!important（同为 important，靠更高特异性取胜），
     对齐基线亮色禁用字（迁移前 disabled:text-ink-quaternary 落在元素上）。暗色下基线
     实际被 html.dark .text-ink-*（!important）抬成 0.75/0.88 白，这里会是 quaternary
     灰——禁用态暗色字色与基线存在偏差（当前无调用方渲染 disabled textarea，已知取舍）。 */
  color: var(--kb-text-quaternary) !important;
  cursor: not-allowed;
}

.kb-el-textarea.is-disabled :deep(.el-textarea__inner::placeholder) {
  color: var(--kb-text-quaternary);
}
</style>

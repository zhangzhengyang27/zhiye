<script setup lang="ts">
/**
 * 输入框组件（内部换底 element-plus el-input，对外 API 契约与纯自建版一致）。
 * 本文件与 AppTextarea.vue / AppSelect.vue 为同族适配器（共享 forwardedAttrs、根上
 * revert-layer 规则与幽灵化 CSS 前言段的同构写法；normalizedValue/expose 仅
 * AppInput/AppTextarea 共有），改动共享段时同步维护；是否提取共享 composable
 * 留待 Phase 4 Task 4.1 评估。第二代适配器 AppCheckbox/AppSwitch/AppRadioGroup
 * （Task 2.4-2.6）与第三代 AppButton（Task 2.7，EP 根即原生 button 本体、盒面属性
 * 全量 revert 交还根上工具类）参照本族模式落地，但其校准段按组件结构独立推导、
 * 不共享本段。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - caret-color: var(--kb-brand) 是相对基线的视觉增量（基线为默认墨色光标）；
 * - IME 组合期间不再逐键 emit：EP 组合期间不发 update:modelValue，compositionend 补发，
 *   与 Vue v-model 惯例一致；
 * - Chrome autofill 的填充底会被根 padding 内缩出灰边（基线为满盒着色），已知边缘差异；
 * - 调用方传 focus:border-* 工具类会被本文件 scoped 的 :focus-within 规则挡住
 *   （基线语义是调用方赢；当前无调用方使用 focus: 变体，复制模板时注意此权衡）。
 *
 * 适配架构（canonical，后续表单组件照此模式）：
 * - 调用方 class 经 cn() 合并后落在 el-input 根 div 上，根 div 就是「盒子」本身——
 *   border/bg/rounded/padding/高度/宽度类的语义与迁移前落在原生 input 上完全一致
 *   （tailwind-merge 去重保证调用方覆盖默认值）；
 * - EP 的 .el-input__wrapper / .el-input__inner 被scoped 校准「幽灵化」（透明、无描边、
 *   无内边距、height:100% 贯通），只承担文本输入行为；边框/底色/聚焦描边由根上的
 *   工具类 + :focus-within 呈现，杜绝 EP 的 inset box-shadow 与我们抢盒面；
 * - EP 在根上强设的 width:100%/font-size:14px（unlayered）会压过 Tailwind 工具类，
 *   用 revert-layer 交还决定权，默认值走 @layer components；
 * - attrs（maxlength/name/min/max/step/autocomplete/data-autofocus/keydown 监听等）
 *   经 el-input 透传全部落在内部原生 input 上（EP inheritAttrs:false 把非 class/style
 *   attrs 直接绑定到原生元素），AppDialog 的 data-autofocus 查询直接命中可聚焦的
 *   原生 input，焦点链比迁移前更直接；
 * - 暴露 focus()/blur()/select() 供调用方程序化操作。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs } from "vue"
import type { InputInstance } from "element-plus"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

type InputValue = string | number | null | undefined

const props = withDefaults(
  defineProps<{
    modelValue?: InputValue
    /** 仅透传原生 input 类型；textarea 结构走 el-input type=textarea + 全局校准层，传 textarea 会绕过幽灵化样式导致视觉破碎 */
    type?: string
    placeholder?: string
    disabled?: boolean
    autofocus?: boolean
  }>(),
  {
    modelValue: "",
    type: "text",
    placeholder: "",
    disabled: false,
    autofocus: false,
  },
)

// textarea 是另一套 DOM 结构（el-input type=textarea + 校准层 .el-textarea 段负责），不经过本组件幽灵化样式
if (import.meta.env.DEV && props.type === "textarea") {
  console.warn("[AppInput] type=textarea 请直接使用 el-input type=textarea")
}

const emit = defineEmits<{
  "update:modelValue": [value: string]
  change: [value: string]
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

const focusInput = async () => {
  if (!props.autofocus) {
    return
  }

  await nextTick()
  inputRef.value?.focus()
}

/** 根 div 的 padding 区（如 pl-9 图标带）不在 EP wrapper 内，点击时手动补聚焦，对齐迁移前行为 */
let rootEl: HTMLElement | null = null

const handleRootClick = () => {
  inputRef.value?.focus()
}

onMounted(() => {
  const nativeInput = inputRef.value?.input
  rootEl = nativeInput?.closest<HTMLElement>(".kb-el-input") ?? null
  rootEl?.addEventListener("click", handleRootClick)
  void focusInput()
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

const inputClass = computed(() =>
  cn(
    // 对齐语雀紧凑输入框：浅灰底、10px 圆角、13px 字号，聚焦只描 brand 边不加光晕。
    // 聚焦描边与禁用态由 scoped :focus-within/.is-disabled 接管（div 上 :focus/:disabled 伪类永不命中）。
    "kb-el-input w-full rounded-[10px] border border-line bg-muted text-[13px] text-ink transition",
    "h-9 px-3",
    String(attrs.class ?? ""),
  ),
)
</script>

<template>
  <el-input
    ref="inputRef"
    v-bind="forwardedAttrs"
    :model-value="normalizedValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :data-autofocus="autofocus ? '' : undefined"
    :class="inputClass"
    @update:model-value="(v: string) => emit('update:modelValue', v ?? '')"
    @change="(v: string) => emit('change', v ?? '')"
  />
</template>

<style scoped>
/*
 * 色值直接引用 --kb-* token 而不是绕道 --el-*：bridge.css 已把 --el-* 全量绑到
 * --kb-*，直接用 kb token 少一层间接、不依赖 bridge 映射的存在性。
 * 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 * 赢不了它们，因此禁止用工具类覆盖 EP 内部样式）。
 * 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为脚本
 * 副作用 import，先于 SFC style 模块执行；复制本模板时保持这一前提。
 */

/* EP 在根上强设 width:100%/font-size:14px，unlayered 会压过调用方的宽度/字号工具类；
   revert-layer 把决定权交回下层（utilities 优先、components 兜底）。
   降级：旧浏览器（Firefox<97/Safari<16.4）不支持时该声明被丢弃，EP 默认
   width:100%/font-size:14px 获胜，调用方宽度/字号工具类静默失效——
   桌面端 Electron(Chromium) 无虞，Web 端可接受。 */
.kb-el-input {
  width: revert-layer;
  font-size: revert-layer;
}

@layer components {
  .kb-el-input {
    width: 100%;
    font-size: 13px;
  }
}

/* 聚焦只描 brand 边不加光晕（迁移前 focus:border-brand 在 div 上不命中，改用 :focus-within） */
.kb-el-input:focus-within {
  border-color: var(--kb-brand);
}

/* 禁用灰底（迁移前 disabled:bg-grey-200 在 div 上不命中） */
.kb-el-input.is-disabled {
  background-color: var(--kb-grey-200);
}

/* 幽灵化 EP 内部结构：盒面全部让位给根 div */
.kb-el-input :deep(.el-input__wrapper) {
  height: 100%;
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  transition: none;
}

.kb-el-input :deep(.el-input__wrapper:hover),
.kb-el-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: none;
}

.kb-el-input :deep(.el-input__inner) {
  height: 100%;
  /* EP 内部 line-height == height 的垂直居中契约被幽灵化（height 改为 100%）破坏，
     Chromium 实测无影响（UA 对单行 input 文本垂直居中），此为跨 Firefox/Safari 保险 */
  line-height: normal;
  color: inherit;
  caret-color: var(--kb-brand);
}

.kb-el-input :deep(.el-input__inner::placeholder) {
  color: var(--kb-text-quaternary);
}

.kb-el-input.is-disabled :deep(.el-input__inner) {
  color: var(--kb-text-quaternary);
  /* style.css 里 .dark input { color: rgba(255,255,255,0.88) !important }（对抗 Lake
     antd.css 的既有通配，约 1111/1296 两处）会赢过上面的 color——其值 ≈ #e0e0e0，与
     kb 暗色正文 #e2e2e2 几乎一致，属可接受共存；这里用 currentcolor 让
     -webkit-text-fill-color 跟随最终生效色，明暗两态的禁用文字都与迁移前一致 */
  -webkit-text-fill-color: currentcolor;
}
</style>

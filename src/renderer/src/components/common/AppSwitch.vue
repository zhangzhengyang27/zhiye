<script setup lang="ts">
/**
 * 开关组件（内部换底 element-plus el-switch，对外 API 契约与纯自建版一致）。
 * 对外 API：modelValue + update:modelValue；label/description/checkedIcon/uncheckedIcon；
 * disabled。支持 label/description 行布局与 checked/unchecked 图标；开关轨色用品牌 token。
 * 本文件与 AppCheckbox.vue / AppRadioGroup.vue 为同族适配器（第二代，参照
 * AppInput/AppTextarea/AppSelect 的 canonical 模式：根即盒子 + EP 内部幽灵化 +
 * 幽灵化 CSS 前提注释四件套；同代三文件的形状/禁用/焦点校准写法互相同步维护）。
 *
 * EP 结构（node_modules/element-plus@2.14.5 编译产物核实）：
 *   div.el-switch 根（onClick=switchValue with .prevent，整块点击即切换）
 *     > input.el-switch__input（隐藏原生 checkbox：opacity:0 / 0x0 / absolute，唯一
 *       可聚焦元素；role="switch" + aria-checked/aria-disabled；Enter=EP withKeys
 *       转发 switchValue；Space 的原生激活本可生效（input[type=checkbox][role=switch]
 *       在 Chromium 中空格可切换），由本组件根捕获阶段统一 preventDefault 后转发）
 *     > span.el-switch__core（视觉轨道；内联 style 仅当传 width prop 注入——本组件
 *       API 无 width，运行时不会注入任何内联样式）
 *         > div.el-switch__action（圆形滑块）
 *
 * 适配决策：
 * - 「外层行 + 轨道 wrapper + EP 幽灵化」：基线根是整行可点的 button（轨道 + 文案），
 *   而 el-switch 没有 default slot 放文案——外层 div 承担基线根的布局类（flex/w-full/
 *   gap-3 等，cn() 合并调用方 class，tailwind-merge 保证覆盖默认值）；轨道 wrapper
 *   span 与基线轨道同尺寸同形状（h-6 w-11 p-0.5 rounded-full + 底色切换，utilities 层），
 *   el-switch 幽灵化填充其中，只承担「点击切换 + 隐藏 input 承接键盘」的行为；
 * - 点击转发：外层的文案/padding 区不在 el-switch 根内，点击不会进 switchValue（基线
 *   整行可点）——onMounted 给外层补 click 监听，目标不在 el-switch 根内时转发
 *   controlRoot.click()（AppSelect 死区转发同款；EP 根的 .prevent 对转发无副作用）；
 * - 轨道底色在 wrapper（bg-brand/bg-line-input 切换，迁移前 trackClass 原样平移），
 *   EP core 幽灵化为透明填满，action 校准为 20px 白滑块 + 基线阴影，位移
 *   left:0 → checked left:calc(100% - 20px)（= 基线 translate-x-5 落点），时长 0.2s
 *   对齐基线 duration-200；
 * - checked/unchecked 图标：基线就渲染在轨道内（absolute left-1/right-1，flex
 *   items-center 的静态位置垂直居中），继续以 AppIcon 绝对定位在 wrapper 上
 *   （el-switch 无可达轨道的插槽），类名与基线逐字一致；
 * - 键盘/焦点：Tab 落 EP 隐藏 input；Enter 走 EP withKeys(enter)，Space 由根捕获
 *   阶段 preventDefault 后转发 controlRoot.click()（原生空格激活本可生效，统一
 *   走点击路径可避免「原生切换 + 转发点击」双重触发；基线根是 button，Space=click=
 *   切换），与基线 button 的 Space/Enter 等价。基线 focus-visible:ring 在根上——用 :has(.el-switch__input:
 *   focus-visible) 在外层还原（EP 自带的 core outline 压掉防双环）；降级：Firefox<121/
 *   Safari<15.4 不支持 :has 时键盘焦点环消失（桌面端 Electron(Chromium) 无虞，
 *   Web 端可接受，同 revert-layer 降级思路）；
 * - 禁用：基线语义 = 整行 opacity 0.55 + not-allowed。EP 根自带 opacity .6——中和为 1，
 *   改由 prop 驱动的外层 .kb-app-switch--disabled 呈现（同 AppSelect 的
 *   kb-select--disabled 模式），避免两层透明度叠乘。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - 语义根从 button(role=switch) 变为外层 div + 内部隐藏 input(role=switch)：可访问
 *   名称/状态仍由 input 的 aria-checked 提供，行为断言覆盖；外层 div 上不再有
 *   role/aria-checked（基线在 button 上）；
 * - 滑块位移从 transform translate 改为 EP 的 left 定位过渡（视觉轨迹同为水平滑动，
 *   时长已对齐 0.2s）。
 */
import { computed, onBeforeUnmount, onMounted, ref, useAttrs } from "vue"
import type { SwitchInstance } from "element-plus"
import AppIcon from "./AppIcon.vue"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    label?: string
    description?: string
    checkedIcon?: string
    uncheckedIcon?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    label: "",
    description: "",
    checkedIcon: undefined,
    uncheckedIcon: undefined,
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()

const attrs = useAttrs()
const switchRef = ref<SwitchInstance | null>(null)
const outerRef = ref<HTMLElement | null>(null)

const forwardedAttrs = computed(() => {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class"))
})

const trackClass = computed(() => (props.modelValue ? "bg-brand" : "bg-line-input"))

/** 默认 w-full 让整行（含文案）都可点；调用方传 w-auto 等宽度类时以调用方为准 */
const switchClass = computed(() =>
  cn(
    "kb-app-switch flex w-full cursor-pointer items-center gap-3 rounded-kb-md text-left outline-none transition",
    String(attrs.class ?? ""),
  ),
)

/** 外层文案/padding 区点击转发 el-switch 根（EP switchValue 有 disabled 守卫） */
let controlRoot: HTMLElement | null = null

const handleOuterClick = (event: MouseEvent) => {
  const target = event.target as Node | null
  if (!target || !controlRoot || controlRoot.contains(target)) {
    return
  }

  controlRoot.click()
}

/**
 * 根捕获阶段 Space 契约（AppSelect 同款）：EP 的隐藏 input 带 role="switch"，
 * Chromium 对非 checkbox/radio 角色的 input 不触发原生空格激活（实测 Space
 * 无效），而基线根是 button（Space=click=切换）——捕获阶段 preventDefault 掉
 * 原生行为并转发 controlRoot.click()，由 EP switchValue 切换（自带 disabled
 * 守卫）；Enter 由 EP 的 input withKeys(enter) 原生承担，不在此处理。
 */
const handleRootKeydown = (event: KeyboardEvent) => {
  if (event.key !== " ") {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  controlRoot?.click()
}

onMounted(() => {
  controlRoot = (switchRef.value?.$el as HTMLElement | undefined) ?? null
  outerRef.value?.addEventListener("click", handleOuterClick)
  outerRef.value?.addEventListener("keydown", handleRootKeydown, true)
})

onBeforeUnmount(() => {
  outerRef.value?.removeEventListener("click", handleOuterClick)
  outerRef.value?.removeEventListener("keydown", handleRootKeydown, true)
  outerRef.value = null
  controlRoot = null
})
</script>

<template>
  <div
    ref="outerRef"
    v-bind="forwardedAttrs"
    :class="[switchClass, { 'kb-app-switch--disabled': disabled }]"
  >
    <span
      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200"
      :class="trackClass"
    >
      <el-switch
        ref="switchRef"
        :model-value="modelValue"
        :disabled="disabled"
        class="kb-el-switch"
        @update:model-value="(value: unknown) => emit('update:modelValue', Boolean(value))"
      />
      <AppIcon
        v-if="checkedIcon"
        :name="checkedIcon"
        class="absolute left-1 h-3.5 w-3.5 text-white"
        :class="modelValue ? 'opacity-100' : 'opacity-0'"
      />
      <AppIcon
        v-if="uncheckedIcon"
        :name="uncheckedIcon"
        class="absolute right-1 h-3.5 w-3.5 text-white"
        :class="modelValue ? 'opacity-0' : 'opacity-100'"
      />
    </span>

    <span v-if="label || description || $slots.default" class="min-w-0 flex-1">
      <span v-if="label" class="block text-sm font-medium text-ink">{{ label }}</span>
      <span v-if="description" class="mt-0.5 block text-xs text-ink-tertiary">{{
        description
      }}</span>
      <slot />
    </span>
  </div>
</template>

<style scoped>
/*
 * 色值直接引用 --kb-* token 而不是绕道 --el-*：bridge.css 已把 --el-* 全量绑到
 * --kb-*，直接用 kb token 少一层间接、不依赖 bridge 映射的存在性（同 AppInput）。
 * 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 * 赢不了它们，因此禁止用工具类覆盖 EP 内部样式）。
 * 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为
 * 组件模块的副作用 import，先于本 SFC style 执行；复制本模板时保持这一前提。
 * 本组件未用到 revert-layer（EP 样式全部作用在轨道 wrapper 内部，外层 div 是纯自建
 * 元素，工具类不被 EP 干扰）。
 */

/*
 * 幽灵化 el-switch：根填满轨道 wrapper（p-0.5 内容区 40x20），core 透明贯通，
 * 盒面（底色/圆角/内边距）全部由 wrapper 的 utilities 呈现。
 */
.kb-app-switch .el-switch {
  width: 100%;
  height: 100%;
  /* EP 强设 height:32px / line-height:20px（inline-flex 的行内基线），压到 0 防止
     wrapper 内出现额外行盒 */
  line-height: 0;
}

.kb-app-switch :deep(.el-switch__core) {
  width: 100%;
  height: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  border-radius: 9999px;
  transition: none;
}

/* EP 在 input:focus-visible 时给 core 画 outline（on 色）——焦点环改由外层 :has 呈现 */
.kb-app-switch :deep(.el-switch__input:focus-visible ~ .el-switch__core) {
  outline: none;
}

/*
 * 滑块校准：基线 h-5 w-5 rounded-full bg-white + Tailwind shadow；静止 left:0
 * （core 与 wrapper 内容区对齐，等效基线 p-0.5 后的贴左），选中 left:calc(100% - 20px)
 * 等效基线 translate-x-5；时长 0.2s 对齐基线 duration-200。
 * --el-color-white 未被 bridge 映射（EP 默认 #fff 常量），明暗两态恒白 = 基线 bg-white。
 */
.kb-app-switch :deep(.el-switch__core .el-switch__action) {
  width: 20px;
  height: 20px;
  left: 0;
  background-color: var(--el-color-white);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.1),
    0 1px 2px rgba(0, 0, 0, 0.06);
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.kb-app-switch :deep(.el-switch.is-checked .el-switch__core .el-switch__action) {
  left: calc(100% - 20px);
}

/* 键盘焦点环：还原基线根上 focus-visible:ring-2 ring-brand ring-offset-1
   （真实焦点在内部隐藏 input，外层 div 的 :focus 永不命中）。
   降级：不支持 :has 的旧浏览器丢弃该声明，键盘焦点环消失（见文件头）。 */
.kb-app-switch:has(.el-switch__input:focus-visible) {
  outline: 2px solid var(--kb-brand);
  outline-offset: 1px;
}

/*
 * 禁用（基线 disabled:opacity-55 + disabled:cursor-not-allowed 在 button 根上生效；
 * 换底后根是 div，:disabled 伪类永不命中，改由 prop 驱动的 modifier 呈现）。
 * EP 根自带 opacity .6 必须中和为 1，否则与外层 0.55 叠乘成双重变淡。
 */
.kb-app-switch.kb-app-switch--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.kb-app-switch :deep(.el-switch.is-disabled) {
  opacity: 1;
}

/*
 * 暗色契约说明：style.css 的 .dark input / html.dark input（!important，约 1111/1297
 * 两处）会命中隐藏的 .el-switch__input——元素 opacity:0 / 0x0 且不承载可见内容，
 * 无需对抗；轨道底色与图标色走 utilities（bg-brand/bg-line-input/text-white），
 * 明暗切换与基线同链路。
 */
</style>

<script setup lang="ts">
/**
 * 下拉选择组件（内部换底 element-plus el-select，对外 API 契约与纯自建版一致）。
 * 本文件与 AppButton.vue 为同族适配器（共享 forwardedAttrs、根上 revert-layer 规则
 * 与「幽灵化 EP 内部 + 幽灵化 CSS 前言段」的同构写法，AppSelect 另有哨兵值翻译与
 * 根键盘契约两个自有段），改动共享段时同步维护；是否提取共享 composable 留待
 * Phase 4 Task 4.1 评估。同族的 AppInput/AppTextarea 已分别于 T5/T3 解散，校准升
 * 全局 element-plus-calibration.css（el-input 单行分支 / .el-textarea 段）。
 * 第二代适配器 AppCheckbox/AppSwitch/AppRadioGroup（Task 2.4-2.6）参照本族模式落地，
 * 但其校准段
 * 按组件结构独立推导、不共享本段。
 * 盒面架构同 AppInput/AppTextarea canonical：「根即盒子 + EP 内部幽灵化」，差异决策独立推导：
 * - 触发器壳：el-select 的 .el-select__wrapper 被 scoped 校准「幽灵化」（透明、无 inset
 *   描边、无内边距/圆角、height:100% 贯通），只承担「点击开合 + 隐藏 input 承接焦点/键盘」
 *   的行为；边框/底色/圆角/内边距/高度/宽度/字号由根上的工具类呈现（tailwind-merge 保证
 *   调用方可覆盖）。注意 wrapper 幽灵化后仍保留 align-items:center 与 selection 的
 *   flex:1——垂直居中与标签截断继续由 EP 内部结构承担，不在根上重造；
 * - 根 padding 死区：水平内边距（pl-3/pr-2.5）在根上，wrapper 盒比根小一圈，点击 padding
 *   区不会进 wrapper 的开合处理（基线里整盒都是按钮）。onMounted 给根补 click 监听，点击
 *   落在 wrapper 外时程序化转发 wrapper.click()，开合与聚焦行为与基线一致；
 * - 弹层 teleport 到 body，scoped :deep 够不到——经 popper-class="kb-el-select-popper" +
 *   本文件非 scoped style 块校准（类名同时落在 popper 根与内部 .el-select-dropdown 上，
 *   根级规则一律带 .el-popper 前缀避免误中内部 div）。z-index 钉 --kb-z-toast（500）
 *   !important：el-config-provider 把 EP 计数起点调成 380、实际值随创建顺序漂移，压不过
 *   AppDialog 的 z-400；!important 样式表声明可胜过 EP 写入的内联 z-index（与迁移前自绘
 *   z-500 对齐；弹层 z 契约唯一事实源见 constants/z-index.ts）；
 * - options 数据形状：现 API 的 items 就是 EP options prop 的 {label,value,disabled} 形状
 *   （EP 经 select-v2 useProps 读同名字段），原样透传零映射；emit 仍是原始类型值。
 *   唯一的翻译：value 为 "" 的选项（新建弹层「根目录」）在基线里可被 modelValue=""
 *   命中，而 EP 默认把 "" 当空值走占位分支——内部以哨兵值替换（进 EP 前映射、emit
 *   时还原），对不含 "" 选项的调用点零影响；
 * - 键盘/IME/空态：EP 白赚（Enter/↑↓/Home/End/PageUp/PageDown、组合期保护、zh-cn
 *   「暂无数据」），焦点在只读 input 上。Esc 与 Space 由根捕获阶段键盘契约补齐（见
 *   handleRootKeydown）：Esc 三态（弹层展开→只关弹层；弹层关闭→转派 document 让外层
 *   AppDialog 关闭；无弹窗→无副作用），Space 开合下拉；
 * - 箭头图标：经 `:suffix-icon="ChevronDown"`（lucide-vue-next）替换 EP 默认 ArrowDown，
 *   字形与基线 i-lucide-chevron-down 同源；尺寸/颜色走 EP 既有链路（el-icon 1em=14px、
 *   --el-select-input-color→占位灰），展开旋转由 EP 的 is-reverse 自动恢复；
 *   show-arrow=false 关掉弹层小箭头；
 * - 暴露：与迁移前一致不 expose 任何方法（el-select 实例的 focus/blur 未对外承诺）。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - 值相等判定从「严格相等 + String() 宽松兜底」收紧为 EP 的严格相等（primitive
 *   SameValueZero）：现有调用点的 modelValue 与 items[].value 均同类型，无行为变化；
 *   传入类型不一致的值以前能命中，现在显示为 EP 的原始值回显（视为调用方 bug）；
 * - update:modelValue/change 只在值真正变化时触发（EP 语义）；基线重复点选同一项也会
 *   再 emit 一轮。TrashToolbar 的 kbFilterChange 因此在「重选同一项」时不再触发刷新
 *   （无状态变化，语义更正确，如需旧行为调用方自行处理）；
 * - 聚焦描边从触发器按钮的 :focus-visible（仅键盘）放宽为根上 focus-within:border-brand
 *   （点击开合也描边）——焦点现在落在内部只读 input 上，与 AppInput/AppTextarea 家族的
 *   focus-within 语义对齐；
 * - 选项键盘导航指示从 focus-visible ring（基线把焦点移进选项）合并为 EP 的 is-hovering
 *   高亮（hover 与键盘高亮同源），基线的 ring-2 ring-brand 不再出现；
 * - 弹层开合动画从无动画（v-if 即时）变为 EP 的 el-zoom-in-top 淡入；
 * - 空列表时弹层显示 zh-cn「暂无数据」占位（基线渲染空面板）；
 * - 下拉弹层 minWidth = 触发器宽度（EP 内建，基线 floating-ui 手动设 minWidth 等价），
 *   并在非 scoped 块给滚动 wrap 补 144px 下限还原基线 min-w-36 面板地板
 *   （SearchToolbar 的触发器实际收缩到 ~80px，无地板时弹层比基线窄）。
 */
import { computed, onBeforeUnmount, onMounted, ref, useAttrs } from "vue"
import type { SelectInstance } from "element-plus"
import { ChevronDown } from "lucide-vue-next"
import { cn } from "@/utils/cn"

defineOptions({
  inheritAttrs: false,
})

type SelectValue = string | number | boolean | null | undefined

interface SelectItem {
  label: string
  value: SelectValue
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue?: SelectValue
    items: SelectItem[]
    placeholder?: string
    disabled?: boolean
    multiple?: boolean
    filterable?: boolean
    clearable?: boolean
  }>(),
  {
    modelValue: undefined,
    placeholder: "",
    disabled: false,
    multiple: false,
    filterable: false,
    clearable: false,
  },
)

// 未适配分支守卫（同 AppInput type=textarea 先例）：基线无这些 API，传入即行为不保真
if (import.meta.env.DEV) {
  if (props.multiple) console.warn("[AppSelect] multiple 未适配：基线为单选，标签/折叠行为不保真")
  if (props.filterable)
    console.warn(
      "[AppSelect] filterable 未适配：回显/键盘/Space 转发均按只读触发器实现，开启前先撤 Space 转发",
    )
  if (props.clearable) console.warn("[AppSelect] clearable 未适配：基线无清空按钮")
}

const emit = defineEmits<{
  "update:modelValue": [value: SelectValue]
  change: [value: SelectValue]
}>()

const attrs = useAttrs()
const selectRef = ref<SelectInstance | null>(null)

/**
 * value 为 "" 的选项（如新建弹层的「根目录」）在基线里是合法可选中项，但 EP 默认把
 * "" 视为空值（hasModelValue=false → 回显走占位分支、触发器留白）。为保真基线语义，
 * 内部用哨兵值替换 ""：modelValue/items 进 EP 前映射，emit 时映射回 ""。
 * 对不含 "" 选项的调用点（回收站/搜索等，"" 表示未选择）零影响。
 */
const EMPTY_VALUE_SENTINEL = "__kb_select_empty_value__"

const hasEmptyValueItem = computed(() => props.items.some((item) => item.value === ""))

const normalizedItems = computed(() =>
  hasEmptyValueItem.value
    ? props.items.map((item) =>
        item.value === "" ? { ...item, value: EMPTY_VALUE_SENTINEL } : item,
      )
    : props.items,
)

const normalizedModelValue = computed(() =>
  hasEmptyValueItem.value && props.modelValue === "" ? EMPTY_VALUE_SENTINEL : props.modelValue,
)

const forwardedAttrs = computed(() => {
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class"))
})

/**
 * 是否有可回显的选中项（决定触发器文字色：墨色 vs 占位灰）。
 * 与 EP 的展示判定同口径：在归一化后的 items/modelValue 上做严格相等匹配。
 */
const hasSelected = computed(() =>
  normalizedItems.value.some((item) => item.value === normalizedModelValue.value),
)

const selectClass = computed(() =>
  cn(
    // 与 AppInput 同一套语雀紧凑风格（浅灰底、10px 圆角、13px 字号）。
    // 盒面（border/bg/rounded/padding/字号）全部落在根 div 上，聚焦描边走 focus-within
    // （真实焦点在内部只读 input，div 上 focus:/disabled: 伪类永不命中，禁用态由
    // scoped .kb-select--disabled 规则接管）；display:block 与基线定位容器 div 一致
    // （EP 根默认 inline-block + vertical-align:middle，块级父容器里会多出行盒缝）。
    // 注意宽度刻意不设默认值：基线容器是普通 div——块级上下文撑满父宽、flex 上下文
    // 收缩到内容（min-w-* 兜底）；EP 默认 width:100% 由 scoped revert-layer 交还，
    // 调用方需要定宽时显式传 w-*/min-w-*（与迁移前传法一致）。
    // display:block 不能写成工具类：Tailwind 的 block 在 @layer utilities 里，
    // 压不过 EP unlayered 的 .el-select{display:inline-block}（会收缩成内容宽并与
    // label 文字同行），必须在 scoped 块里以 unlayered 规则覆盖，见 style 块。
    "kb-el-select h-9 cursor-pointer rounded-[10px] border border-line bg-muted pl-3 pr-2.5 text-[13px] text-ink transition",
    "focus-within:border-brand",
    String(attrs.class ?? ""),
  ),
)

/** EP 事件负载未收窄到 SelectValue，出参透传原始值（与基线「emit 原始类型值」一致）；
 *  哨兵值映射回 "" 后再 emit，调用方拿到的仍是基线契约的原始值 */
const denormalize = (value: unknown): SelectValue =>
  hasEmptyValueItem.value && value === EMPTY_VALUE_SENTINEL ? "" : (value as SelectValue)

const handleUpdate = (value: unknown) => {
  emit("update:modelValue", denormalize(value))
}

const handleChange = (value: unknown) => {
  emit("change", denormalize(value))
}

/** 根 padding 死区补开合 + Escape/Space 键盘契约（见 handleRootKeydown 注释） */
let rootEl: HTMLElement | null = null
let wrapperEl: HTMLElement | null = null
let inputEl: HTMLElement | null = null

const handleRootClick = (event: MouseEvent) => {
  const target = event.target as Node | null
  if (!target || !rootEl || (wrapperEl && wrapperEl.contains(target))) {
    return
  }

  wrapperEl?.click()
}

/**
 * 根捕获阶段键盘契约：
 * - Esc 三态：dropdown 展开（input aria-expanded=true）时不干预，EP 自会只关弹层并
 *   stopPropagation；dropdown 关闭时 EP 的 handleKeydown 对 Esc 无条件
 *   preventDefault+stopPropagation，外层 AppDialog 的 document 冒泡监听收不到（基线
 *   是冒泡关闭对话框）——在捕获阶段先行向 document 转派同参 keydown，让对话框按基线
 *   行为关闭；原事件随后照常进 EP（expanded 已 false，handleEsc 无副作用，不会双重关闭）。
 * - Space：基线触发器支持 Space 开合下拉，EP 键盘契约只认 Enter/ArrowUp/ArrowDown——
 *   捕获 Space 转发 wrapper.click() 开合。⚠️ 未来若开启 filterable（内部 input 可输入），
 *   此转发必须撤掉，否则输入空格会误触开合。
 */
const handleRootKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    if (inputEl?.getAttribute("aria-expanded") !== "true") {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: event.key,
          code: event.code,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    return
  }

  if (event.key === " ") {
    event.preventDefault()
    event.stopPropagation()
    wrapperEl?.click()
  }
}

onMounted(() => {
  rootEl = (selectRef.value?.$el as HTMLElement | undefined) ?? null
  wrapperEl = rootEl?.querySelector<HTMLElement>(".el-select__wrapper") ?? null
  inputEl = rootEl?.querySelector<HTMLElement>(".el-select__input") ?? null
  rootEl?.addEventListener("click", handleRootClick)
  rootEl?.addEventListener("keydown", handleRootKeydown, true)
})

onBeforeUnmount(() => {
  rootEl?.removeEventListener("click", handleRootClick)
  rootEl?.removeEventListener("keydown", handleRootKeydown, true)
  rootEl = null
  wrapperEl = null
  inputEl = null
})
</script>

<template>
  <el-select
    ref="selectRef"
    v-bind="forwardedAttrs"
    :model-value="normalizedModelValue"
    :options="normalizedItems"
    :placeholder="placeholder"
    :disabled="disabled"
    :teleported="true"
    :show-arrow="false"
    :offset="6"
    :suffix-icon="ChevronDown"
    popper-class="kb-el-select-popper"
    :class="[selectClass, { 'kb-select-empty': !hasSelected, 'kb-select--disabled': disabled }]"
    @update:model-value="handleUpdate"
    @change="handleChange"
  />
</template>

<style scoped>
/*
 * 色值直接引用 --kb-* token 而不是绕道 --el-*：bridge.css 已把 --el-* 全量绑到
 * --kb-*，直接用 kb token 少一层间接、不依赖 bridge 映射的存在性（同 AppInput）。
 * 本块保持 unlayered 以压过 EP 的 unlayered 静态 CSS（Tailwind 工具类在 layer 里
 * 赢不了它们，因此禁止用工具类覆盖 EP 内部样式）。
 * 前提：本块能压过 EP 同特异性规则依赖 CSS 加载顺序——EP 样式经 resolver 作为
 * 组件模块的副作用 import，先于本 SFC style 执行；复制本模板时保持这一前提。
 */

/* EP 在根上强设 display:inline-block + vertical-align:middle + width:100%（unlayered，
   会压过 @layer 里的工具类）：块级父容器里 inline-block 会收缩成内容宽并与 label 文字
   同行、撑出行盒——基线容器是普通 div（块级撑满/flex 收缩），这里改回 block 对齐基线；
   width 用 revert-layer 回落为 UA 默认 width:auto——块级上下文撑满父宽、flex 上下文
   收缩到内容（min-w-* 兜底），与基线定位容器 div 的宽度语义逐场景一致。
   降级：不支持 revert-layer 的旧浏览器上 EP 默认 width:100% 获胜，调用方宽度语义
   静默改变——桌面端 Electron(Chromium) 无虞，Web 端可接受（同 AppInput）。 */
.kb-el-select {
  display: block;
  width: revert-layer;
}

/*
 * 幽灵化 EP wrapper：盒面全部让位给根 div，wrapper 只承担开合与焦点行为。
 * font-size/line-height: inherit 让根上的字号与继承链行高（body 1.6 → 13px 字号下
 * 20.8px，与基线触发按钮内 span 一致）贯通到回显文字——EP 默认在 wrapper 强设
 * 14px/24px，会让回显文字墨迹错位约 1px；gap 对齐基线 label 与箭头的 8px（EP 默认 6px）。
 */
.kb-el-select :deep(.el-select__wrapper) {
  height: 100%;
  min-height: 0;
  padding: 0;
  gap: 8px;
  font-size: inherit;
  line-height: inherit;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  transition: none;
}

/* hover/focus 态 EP 会给 wrapper 补 inset shadow，与幽灵化冲突，一并压掉 */
.kb-el-select :deep(.el-select__wrapper:hover),
.kb-el-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: none;
}

/*
 * 回显文字/占位色：EP 的 .el-select__placeholder 默认色走 --el-input-text-color（未桥，
 * 回落 text-regular），展开时还会被 .is-transparent 压成占位灰——全部接管：
 * 有选中项恒为墨色（含展开时），无选中项（.kb-select-empty）为占位灰。
 * 特异性 (0,2,0)/(0,3,0) ≥ EP 同名规则，靠加载顺序与特异性双保险取胜。
 * 定位校准：EP 把 placeholder 设为 absolute + top:50% + translateY(-50%) 挂在 0 高的
 * selection 上做垂直居中，半像素取整随触发器在页面上的分数坐标漂移 ±1px（实测
 * add-member 文字比基线低 1px、画板配置反而对齐）；改回 static 让它参与 selection 的
 * 正常 flex 布局（wrapper align-items:center 居中），与基线按钮内 span 的居中机制
 * 完全一致，取整行为逐像素对齐。width:100% 保留（占满 selection 供截断）。
 */
.kb-el-select :deep(.el-select__placeholder) {
  position: static;
  transform: none;
  color: var(--kb-text);
}

.kb-el-select.kb-select-empty :deep(.el-select__placeholder) {
  color: var(--kb-text-quaternary);
}

/*
 * 禁用态（基线 disabled:bg-grey-200 / disabled:text-ink-quaternary / not-allowed；
 * 根上的 :disabled 伪类永不命中，改由 prop 驱动的 .kb-select--disabled 呈现）。
 * EP 会给 disabled wrapper 补灰底与灰字，幽灵化后底色在根上补、文字色在 placeholder 上压。
 */
.kb-el-select.kb-select--disabled {
  background-color: var(--kb-grey-200);
  cursor: not-allowed;
}

.kb-el-select.kb-select--disabled :deep(.el-select__placeholder) {
  color: var(--kb-text-quaternary);
}

.kb-el-select.kb-select--disabled :deep(.el-select__wrapper) {
  cursor: not-allowed;
}

/*
 * 暗色契约说明：EP 触发器内部有一个始终渲染的只读 input（.el-select__input，非 filterable
 * 时 opacity:0 隐藏、不参与布局），style.css 的 .dark input !important 通配（约 1111/1297
 * 两处）会命中它——但元素不可见且不承载文字，无需 AppInput/textarea 那套 color:inherit
 * 对抗；若未来开启 filterable（可搜索）再评估。
 */
</style>

<style>
/*
 * 弹层校准（非 scoped）：popper teleport 到 body，scoped :deep 够不到，经
 * popper-class="kb-el-select-popper" 命中。类名同时落在 popper 根（.el-popper）与内部
 * .el-select-dropdown div 上——根级规则一律带 .el-popper 前缀避免误中内部 div。
 * 加载顺序前提同 scoped 块。校准目标 = 迁移前自绘弹层：
 * z-500、rounded-[10px]、border-line、bg-surface、elevated shadow、p-1 列表内边距、
 * max-h-[320px]、选项 rounded-[8px] px-2.5 py-1.5 text-[13px]、hover bg-muted、
 * 选中 bg-brand-faint + text-brand-active + font-medium + 右侧对勾（h-3.5）。
 */

/* z-index：el-config-provider 把 EP 计数起点调成 380，实际值随创建顺序漂移，会落在
   AppDialog（z-400）之下；固定 500（--kb-z-toast，弹层 z 契约见 constants/z-index.ts）
   并用 !important 压过 EP 写入的内联 z-index（样式表 important 声明可胜过普通内联
   样式）。阴影/圆角按基线覆盖 EP 默认。 */
.el-popper.kb-el-select-popper {
  z-index: var(--kb-z-toast) !important;
  min-width: 144px;
  border-radius: 10px;
  background: var(--kb-surface-bg);
  box-shadow: var(--kb-elevated-shadow);
}

/* min-width 144px 是基线 min-w-36 的面板地板（打在 popper 根：内层 dropdown 以块级
   填满 popper，宽触发器时 EP 内联在 .el-select-dropdown 上的「触发器宽 - 2px」
   min-width 继续主导，窄触发器（SearchToolbar ~80px）由本地板撑到 144px） */

/* 列表与选项度量（基线见文件头）；EP 选项是 height:34px + line-height:34px 的紧凑行，
   改为基线的 6px/10px 内边距 + 20px 行高 */
.kb-el-select-popper .el-select-dropdown__wrap {
  max-height: 320px;
}

.kb-el-select-popper .el-select-dropdown__list {
  padding: 4px;
}

.kb-el-select-popper .el-select-dropdown__item {
  height: auto;
  padding: 6px 10px;
  line-height: 20px;
  font-size: 13px;
  border-radius: 8px;
  color: var(--kb-text-secondary);
  transition:
    background-color 0.15s,
    color 0.15s;
}

.kb-el-select-popper .el-select-dropdown__item.is-hovering {
  background-color: var(--kb-muted-bg);
}

/* 选中项：基线为 bg-brand-faint + 墨绿字 + font-medium；右侧预留对勾带（10px 边距 +
   14px 对勾 + 8px 间隙 = 32px，与基线 flex 佈局逐像素对齐） */
.kb-el-select-popper .el-select-dropdown__item.is-selected {
  padding-right: 32px;
  background-color: var(--kb-brand-ultra-light);
  color: var(--kb-brand-active);
  font-weight: 500;
}

/* 对勾（基线 i-lucide-check h-3.5）：单选本无对勾，用 lucide check 线稿的 mask 补画，
   落在右内边距带内，颜色跟随选中字色 */
.kb-el-select-popper .el-select-dropdown__item.is-selected::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 10px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  background-color: var(--kb-brand-active);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    0 0/100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
    0 0/100% 100% no-repeat;
}

.kb-el-select-popper .el-select-dropdown__item.is-disabled {
  color: var(--kb-text-quaternary);
}

/* 空态文案（zh-cn「暂无数据」，白赚项）：字号对齐 13px 契约 */
.kb-el-select-popper .el-select-dropdown__empty {
  font-size: 13px;
}
</style>

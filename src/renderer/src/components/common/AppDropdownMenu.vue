<script setup lang="ts">
/**
 * 下拉菜单组件（内部换底 element-plus el-dropdown，对外 API 契约与纯自建版一致）。
 *
 * 机制取舍（Task 3.3，实读 EP 2.14.5 编译产物后拍板）——「定位/teleport/开合归 EP，
 * 菜单内容按基线结构重刻」：
 *
 * 【交给 EP】：触发器事件（click 开合 + triggerKeys 键盘开合）、popper 定位与
 * teleport（append-to-body）、开合生命周期与 el-zoom-in-top 动画、焦点陷阱
 * （el-focus-trap：开层聚焦、关层还原触发器焦点）、roving-focus-group 键盘导航
 * （ArrowUp/Down/Home/End 循环移动、禁用项与标题跳过）、el-scrollbar 长菜单滚动、
 * 点击外部关闭（clickoutside）。
 *
 * 【自绘（EP 对应能力缺失/不保真）】：
 * - 菜单内容自绘：EP 无原生 submenu，el-dropdown-menu/el-dropdown-item 只是样式很薄
 *   的 ul/li。分组/分组标题/分隔线/图标/危险项按基线结构重刻在 #dropdown 插槽里；
 *   el-menu 经评估不适用（侧边导航组件，nav 语义 + collapse/router 能力，非 context
 *   menu 内容容器），EP 惯用做法正是在 #dropdown 插槽自绘；
 * - 基线按钮保真：每个 el-dropdown-item（li，承担 roving focus/tabindex/EP 键盘与
 *   click 链路）内部放一个**与迁移前逐类相同的 button**（flex/rounded-lg/px/py/
 *   text-sm/hover/focus-visible ring/危险项配色全部原样）。这是像素对齐的关键——
 *   编辑器页 antd.css 的 `button{font-size/line-height/color:inherit}`（unlayered）
 *   会压过 Tailwind 工具类（已知坑 6），菜单项的行高/字号/文字色在编辑器页与开始页
 *   本来就不同（22.001px vs 20px；AppIcon 默认 h-[1.2em] 压过 h-4 同理）；li 不设
 *   任何排版值、内层 button 原样继承这些页面差异，两页同时与基线一致，无需逐页写
 *   规则。内层 button tabindex=-1，焦点/激活由 li 承担，禁用项靠 button :disabled
 *   吞掉 click（与基线一致：点禁用项菜单不关、回调不触发）；
 * - 子菜单保持基线形态：点击父项在面板内展开缩进二级项（非浮层二级菜单），展开态
 *   存本组件 expandedParents，重新打开时重置（visible-change(true) 时清空）。父项
 *   不触发 onSelect，与基线 handleParentClick 一致；
 * - Esc 捕获转派（基线语义保留）：菜单打开期间在 document 捕获阶段截停 Esc
 *   （preventDefault + stopPropagation）→ 只关菜单并归还触发器焦点。不截停时 EP 的
 *   关闭链路走 document 级 useEscapeKeydown 且不阻断传播，若菜单位于 AppDialog 之上，
 *   Esc 会连带关闭对话框（基线用捕获阶段 stopPropagation 阻止了这一点）。菜单关闭态
 *   不拦截，Esc 照常冒泡（AppDialog 的关闭链路依赖它）；
 * - 关闭时机对齐基线：点选菜单项（hide-on-click=false 关掉 EP 自动关闭，由本组件在
 *   command 回调里按基线顺序「关菜单 → 归还焦点 → onSelect → click」显式收口）/ Esc /
 *   点击外部（EP clickoutside）/ Tab（EP dropdown-menu 自带 Tab→handleClose）。
 *
 * 与自建基线的如实差异（评审确认的边缘项，复制本模板时知悉）：
 * - 弹层开合有 el-zoom-in-top 淡入淡出（基线 v-if 瞬时开合）；
 * - 弹层定位从 floating-ui（strategy fixed + autoUpdate）换 EP popper（默认 absolute +
 *   eventListeners/ResizeObserver）：静态位置经 popperOptions（strategy: "fixed" +
 *   自定义 gap-align modifier 把 EP tooltip 默认 12px 间距压回基线 6px）对齐，滚动
 *   跟随与「展开子菜单撑高面板」的重定位由 EP 的 eventListeners + content
 *   ResizeObserver 承担（等价 autoUpdate）；flip 仅在 bottom/top 间回退（EP
 *   fallback-placements 写死 ["bottom","top"]，基线 floating-ui flip 全方向）；
 * - z-index 从基线 z-[100] 钉为 --kb-z-toast（500）（AppSelect 先例，自 T6 起迁校准层 z 钉段，样式表 !important
 *   压过 EP 内联计数）：页面级菜单无副作用，且修复基线「菜单被 AppDialog z-400 遮罩压住」的
 *   潜在层级缺陷（基线自绘弹层在对话框上层打开会没入遮罩之下）；
 * - 长菜单滚动条从原生 overflow-y-auto 换 el-scrollbar 自定义滚动条（悬停浮现），
 *   面板 max-h-[min(520px,80vh)] 语义换算为 wrap maxHeight（EP 的 4px 内边距 + 1px
 *   边框在滚动区之外，maxHeight 需扣 10px 保持面板总高一致）。editor 场景像素残差
 *   如实两条：① 字形 AA 相位差（滚动内容层栅格化相位 vs 原生 overflow，占 major
 *   主体，人眼无感）；② submenu 右缘 el-scrollbar thumb 在「面板溢出 + 悬停面板」
 *   时显示、原生 overlay 同态不显示的真实小差异（light ~1610 major≈35%、dark
 *   ~1820≈15%，x=177-182 竖条，见 pixdiff 明细）；
 * - 触发器插槽必须渲染为单一元素（EP OnlyChild 克隆约束）；aria-haspopup/aria-expanded
 *   从基线壳 div 移到真实触发元素上（EP popper 自动挂，可达性更好）；
 * - 触发器壳从自建 div.inline-flex 换 .el-dropdown 根（同为 inline-flex，行内布局
 *   语义一致）；EP 在根上强设的 color/font-size/line-height 经 scoped 规则还原
 *   inherit，触发器继承链与基线一致；
 * - 键盘细节两处放宽：① ArrowUp 打开菜单时聚焦首项（EP roving entry-focus 只认首项，
 *   基线聚焦末项——可继续按 ArrowUp 环绕到末项）；② Left/Right/PageUp/PageDown 也会
 *   移动焦点（EP roving 白赚，基线忽略）；③ 鼠标打开后焦点移入菜单容器 ul（基线
 *   留在触发器），两版方向键导航均可用；Tab 关闭后焦点回触发器（基线 Tab 自然移动）；
 * - 焦点环从按钮 :focus-visible 移到 li :focus-visible（roving focus 聚焦 li，
 *   视觉同样 ring-2 环；li 与按钮同宽，环几何一致）。
 */
import { onBeforeUnmount, ref } from "vue"
import type { DropdownInstance, Options as DropdownPopperOptions } from "element-plus"
import AppIcon from "./AppIcon.vue"

interface DropdownMenuItem {
  type?: "label"
  label: string
  icon?: string
  disabled?: boolean
  color?: "primary" | "neutral" | "error"
  onSelect?: () => void
  click?: () => void
  children?: DropdownMenuItem[]
}

withDefaults(
  defineProps<{
    items: DropdownMenuItem[][]
    contentClass?: string
    disabled?: boolean
  }>(),
  {
    contentClass: "",
    disabled: false,
  }
)

const dropdownRef = ref<DropdownInstance | null>(null)
/** 展开的父项键集合（`${groupIndex}-${itemIndex}`），重新打开时重置 */
const expandedParents = ref<Set<string>>(new Set())

/**
 * 命令负载：el-dropdown 的 command 事件只回传单个值，用对象区分「父项展开切换」与
 * 「普通项选择」，并携带原 item 引用保证 onSelect/click 回调契约不变。
 */
type ItemCommand = { kind: "item"; item: DropdownMenuItem } | { kind: "parent"; item: DropdownMenuItem; key: string }

/** 基线触发器键盘契约：Enter/Space 原生按钮 + ArrowDown/ArrowUp 开合（EP triggerKeys） */
const MENU_TRIGGER_KEYS = ["Enter", "NumpadEnter", "Space", "ArrowDown", "ArrowUp"]

/** 基线 floating-ui offset(6)：EP 未透出 offset prop（tooltip 默认 12px）。EP 的 offset
    modifier 会把间距加进 modifiersData.popperOffsets、computeStyles 只消费
    popperOffsets（modifiersData.offset 仅被 preventOverflow 读取做裁剪预算），因此
    校正必须落在 popperOffsets 上：本 modifier 追加在 main 相位末尾（晚于 EP 的
    offset，此时 popperOffsets 已含 12px），bottom 下移 6px 折算 y-6、top 反向，
    净间距=6px；flip 仅在 bottom/top 间回退（EP fallback-placements）。 */
const MENU_OFFSET_PX = 6

const popperOptions: DropdownPopperOptions = {
  // placement 由组件的 placement prop（bottom-end）在 EP 内部拼装，这里只补基线的
  // fixed 定位策略与间距校正 modifier
  placement: "bottom-end",
  strategy: "fixed",
  modifiers: [
    {
      name: "kb-dropdown-gap-align",
      enabled: true,
      phase: "main",
      fn({ state }) {
        const base = state.modifiersData.popperOffsets
        if (!base) {
          return
        }

        if (state.placement.startsWith("bottom")) {
          base.y -= MENU_OFFSET_PX
        } else if (state.placement.startsWith("top")) {
          base.y += MENU_OFFSET_PX
        }
      },
    },
    // 基线 floating-ui 保留小数定位，popper v2 的 computeStyles 默认 roundOffsets 会把
    // 弹层坐标取整到整数 px（全面板文字产生 ~0.5px 亚像素偏移）；EP 侧 mergeByName
    // 按 name 合并 modifiers 且后者覆盖，同名追加即可关闭取整（gpuAcceleration 选项
    // 与 dropdown 模板的 gpu-acceleration=false 合并后保留）
    {
      name: "computeStyles",
      options: { roundOffsets: false },
    },
  ],
}

/** 基线 itemColorClass 原样保留（落在内层 button 上，与迁移前逐类相同） */
const itemColorClass = (item: DropdownMenuItem, indented = false) => {
  if (item.disabled) return "text-ink-quaternary"
  if (item.color === "error") return "text-error hover:bg-error-bg"
  if (item.color === "primary") return "text-brand hover:bg-brand-faint"
  if (indented) return "text-ink-tertiary hover:bg-muted hover:text-ink-secondary"
  return "text-ink-secondary hover:bg-muted"
}

/** 基线菜单项按钮类原样保留（内层 button 用；行高/字号/颜色的页面差异由这些类 +
    antd.css 的既有交互还原，见文件头「基线按钮保真」） */
const ITEM_BTN_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
const CHILD_BTN_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2.5 pl-8 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"

/** 触发器内的可聚焦元素：焦点归还以它为准（.el-dropdown 根的首子元素即 OnlyChild
    克隆出的插槽内容，与基线 resolveTrigger 语义一致） */
const resolveTrigger = (): HTMLElement | null => {
  const root = dropdownRef.value?.$el as HTMLElement | null | undefined
  const first = root?.firstElementChild as HTMLElement | null
  return first ?? root ?? null
}

/** 显式收口关闭（hide-on-click=false 由本组件控制关闭时机，见文件头） */
const closeMenu = () => {
  dropdownRef.value?.handleClose()
}

const handleCommand = (command: ItemCommand) => {
  if (command.kind === "parent") {
    const next = new Set(expandedParents.value)

    if (next.has(command.key)) {
      next.delete(command.key)
    } else {
      next.add(command.key)
    }

    expandedParents.value = next
    return
  }

  const item = command.item
  closeMenu()
  resolveTrigger()?.focus()
  item.onSelect?.()
  item.click?.()
}

/**
 * 菜单打开期间的 document 捕获阶段键盘处理（基线 handleKeydown 语义）：
 * - Esc：截停（preventDefault + stopPropagation）只关菜单并归还触发器焦点。不截停时
 *   EP 的关闭链路走 document 级 useEscapeKeydown 且不阻断传播，若菜单位于 AppDialog
 *   之上，Esc 会连带关闭对话框（基线用捕获阶段 stopPropagation 阻止了这一点）；
 * - Tab：只关菜单，不阻断传播（基线行为——焦点自然移动到下一个元素）。焦点在菜单内
 *   时 EP 的 dropdown-menu 自带 Tab→handleClose，两处同触发幂等；焦点在触发器上
 *   （鼠标开合场景，EP 不挪焦点）时由本捕获处理补齐基线的「Tab 移出即关」。
 * 注册/注销随 visible-change 生命周期走，卸载时兜底清理。
 */
const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
    resolveTrigger()?.focus()
    return
  }

  if (event.key === "Tab") {
    closeMenu()
  }
}

const handleVisibleChange = (visible: boolean) => {
  if (visible) {
    expandedParents.value = new Set()
    document.addEventListener("keydown", handleDocumentKeydown, true)
  } else {
    document.removeEventListener("keydown", handleDocumentKeydown, true)
  }
}

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleDocumentKeydown, true)
})
</script>

<template>
  <el-dropdown
    ref="dropdownRef"
    class="kb-el-dropdown"
    trigger="click"
    :trigger-keys="MENU_TRIGGER_KEYS"
    placement="bottom-end"
    :popper-options="popperOptions"
    :hide-on-click="false"
    :show-arrow="false"
    :disabled="disabled"
    :max-height="'min(510px, calc(80vh - 10px))'"
    :popper-class="['kb-el-dropdown-popper', contentClass]"
    @command="handleCommand"
    @visible-change="handleVisibleChange"
  >
    <slot />

    <template #dropdown>
      <el-dropdown-menu>
        <template v-for="(group, groupIndex) in items" :key="groupIndex">
          <li v-if="groupIndex > 0" role="separator" class="my-1 h-px bg-line-soft" />

          <template v-for="(item, itemIndex) in group" :key="`${groupIndex}-${itemIndex}`">
            <!-- 分组标题：普通 li，不进 roving focus 收集，方向键自动跳过（同基线） -->
            <li
              v-if="item.type === 'label'"
              role="presentation"
              class="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-ink-quaternary"
            >
              {{ item.label }}
            </li>

            <!-- 可展开的父项（带子菜单）：点击切换展开态，不触发 onSelect -->
            <el-dropdown-item
              v-else-if="item.children && item.children.length > 0"
              class="kb-el-dropdown-item"
              :aria-expanded="expandedParents.has(`${groupIndex}-${itemIndex}`)"
              :disabled="item.disabled"
              :command="{ kind: 'parent', item, key: `${groupIndex}-${itemIndex}` }"
            >
              <button type="button" tabindex="-1" :class="ITEM_BTN_CLASS" :disabled="item.disabled">
                <AppIcon v-if="item.icon" :name="item.icon" class="h-4 w-4 shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                <AppIcon
                  :name="
                    expandedParents.has(`${groupIndex}-${itemIndex}`)
                      ? 'i-lucide-chevron-down'
                      : 'i-lucide-chevron-right'
                  "
                  class="h-3.5 w-3.5 shrink-0 opacity-60"
                />
              </button>
            </el-dropdown-item>

            <!-- 展开的子项：缩进二级菜单 -->
            <template
              v-if="item.children && item.children.length > 0 && expandedParents.has(`${groupIndex}-${itemIndex}`)"
            >
              <el-dropdown-item
                v-for="(child, childIndex) in item.children"
                :key="`${groupIndex}-${itemIndex}-${childIndex}`"
                class="kb-el-dropdown-item"
                :disabled="child.disabled"
                :command="{ kind: 'item', item: child }"
              >
                <button
                  type="button"
                  tabindex="-1"
                  :class="[CHILD_BTN_CLASS, itemColorClass(child, true)]"
                  :disabled="child.disabled"
                >
                  <AppIcon v-if="child.icon" :name="child.icon" class="h-3.5 w-3.5 shrink-0" />
                  <span class="min-w-0 truncate">{{ child.label }}</span>
                </button>
              </el-dropdown-item>
            </template>

            <!-- 普通菜单项 -->
            <el-dropdown-item
              v-else-if="!item.type"
              class="kb-el-dropdown-item"
              :disabled="item.disabled"
              :command="{ kind: 'item', item }"
            >
              <button
                type="button"
                tabindex="-1"
                :class="[ITEM_BTN_CLASS, itemColorClass(item)]"
                :disabled="item.disabled"
              >
                <AppIcon v-if="item.icon" :name="item.icon" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ item.label }}</span>
              </button>
            </el-dropdown-item>
          </template>
        </template>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
/*
 * 触发器壳校准（EP 在 .el-dropdown 根上强设 color/font-size/line-height，会污染
 * 插槽内容的继承链——基线壳 div 无任何样式预设）。scoped unlayered 同特异性规则
 * 靠加载顺序取胜：EP 样式经 resolver 作为组件模块的副作用 import，先于本 SFC style
 * 执行（同 AppSelect 时代前提，复制本模板时保持；AppSelect 已于 T6 解散）。display:inline-flex 与基线壳一致，
 * 保留 EP 默认。
 */
.kb-el-dropdown {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
</style>

<style>
/*
 * 弹层校准（非 scoped）：popper teleport 到 body，scoped :deep 够不到，经
 * popper-class="kb-el-dropdown-popper" 命中。校准目标 = 迁移前自绘面板：
 * min-w-36、rounded-xl(12px)、border-line、bg-surface、p-1(4px) 内边距、elevated
 * shadow、z=500（见下）。菜单项排版零接管——内层 button 与基线逐类相同（含
 * antd.css 在编辑器页的 font/line-height/color 覆盖与 AppIcon 1.2em 图标），li 只做
 * 结构透传。
 */

/* z-index：el-config-provider 把 EP 计数起点调成 380，实际值随创建顺序漂移，会落在
   AppDialog（z-400）之下；固定 500（--kb-z-toast，弹层 z 契约见 constants/z-index.ts）
   并用 !important 压过 EP 写入的内联 z-index（样式表 important 声明可胜过普通内联
   样式，AppSelect 同款已迁校准层）。
   font-size/line-height：EP popper 强设 12px/20px（tooltip 尺寸），会让内层 button
   在编辑器页经 antd.css font-size:inherit 继承到 12px（基线菜单 div 直接继承 body
   的 14px/1.5715）——还原 inherit 对齐基线继承链（body → 菜单 div → button）。 */
.el-popper.kb-el-dropdown-popper {
  z-index: var(--kb-z-toast) !important;
  min-width: 144px;
  padding: 4px;
  border-radius: 12px;
  border-color: var(--kb-border);
  background: var(--kb-surface-bg);
  box-shadow: var(--kb-elevated-shadow);
  font-size: inherit;
  line-height: inherit;
}

/* EP 把面板背景/圆角也写在 ul 上（bg-overlay + radius-base），统一归零让 popper 根
   承担盒面（避免双层圆角/底色叠加），列表内边距经 popper 根的 4px 提供 */
.el-popper.kb-el-dropdown-popper .el-dropdown-menu {
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  border: none;
}

/*
 * li 透传规则：el-dropdown-menu__item（li）只承担 roving focus/键盘/EP click 链路，
 * 排版全部让位给内层 button——EP 在 li 上强设的 flex/padding/line-height(22px)/
 * font-size/color/nowrap 逐项还原，button 的 text-sm 等工具类与 antd.css 的
 * button{...:inherit} 按页面既有交互生效（同基线按钮）。
 */
.el-popper.kb-el-dropdown-popper .el-dropdown-menu__item {
  display: block;
  width: 100%;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: normal;
  transition: none;
}

/* EP 的 li hover/focus 底色与主色字全部关掉：悬停/配色语义在内层 button 上
   （基线行为），li 的 focus 走下方的 ring 规则 */
.el-popper.kb-el-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover,
.el-popper.kb-el-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):focus {
  background: transparent;
  color: inherit;
}

/* EP 的 li 图标间距规则不影响本组件（图标是 svg 且由 button gap 排布），仅防御 */
.el-popper.kb-el-dropdown-popper .el-dropdown-menu__item i {
  margin-right: 0;
}

/* 键盘聚焦环：roving focus 聚焦 li（tabindex），等价基线按钮上的 focus-visible
   ring-2 ring-brand（li 与内层 button 同宽，环的几何一致） */
.el-popper.kb-el-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--kb-brand);
}

/* EP 的禁用字色规则关掉（li 层）：禁用语义由内层 button 的 :disabled +
   itemColorClass 的 text-ink-quaternary 呈现（基线行为，含 antd.css 页面差异） */
.el-popper.kb-el-dropdown-popper .el-dropdown-menu__item.is-disabled {
  color: inherit;
}

/*
 * 暗色契约说明：菜单项是 li/button，与基线同为原生元素——style.css 的 .dark
 * button 通配（两处 !important）在基线怎么命中，这里同样命中，无需额外规则；
 * 图标走 currentColor 跟随文字色，token 暗色换档由 tokens.css 的 .dark 块承担。
 */
</style>

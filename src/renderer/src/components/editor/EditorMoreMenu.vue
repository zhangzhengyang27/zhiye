<script setup lang="ts">
/**
 * 编辑器「更多操作」（⋯）菜单——编辑器业务件（非 UI 库适配器）。
 *
 * 来源：T7 解散 AppDropdownMenu（docs/EP直用改造与适配层解散实施计划-2026-09-14.md
 * 第五/六节）。T1 实测判定：嵌套 el-dropdown 浮动子菜单与基线「面板内展开缩进二级」
 * 形态冲突且外层不保活（clickoutside 关外层），不采用——故按计划把壳的
 * expandedParents 面板内展开形态重刻成本业务件：el-dropdown 承担开合/定位/roving
 * 键盘（同壳取舍），菜单内容与子菜单展开渲染按基线结构逐类复刻；行为收编
 * （Esc 截停 / 打开后聚焦首项 / expandedParents 状态机 / 命令收口）全部来自
 * composables/use-dropdown-menu.ts（收编清单 a/b/c），本文件只持结构与菜单项渲染。
 *
 * 基线保真要点（复制自壳，动前先读）：
 * - 基线按钮保真：每个 el-dropdown-item（li，承担 roving focus/tabindex/EP 键盘与
 *   click 链路）内部放一个与迁移前逐类相同的 button（flex/rounded-kb-md/px/py/text-sm/
 *   hover/focus-visible ring/危险项配色全部原样）。这是像素对齐的关键——编辑器页
 *   antd.css 的 button 规则（unlayered，font-size/line-height/color:inherit）会把
 *   菜单项的行高/字号/文字色改写为页面继承链（22.001px vs 起始页 20px；AppIcon 默认
 *   h-[1.2em] 压过 h-4 同理），内层 button 原样继承这些页面差异，菜单与基线一致；
 *   li 不设任何排版值（透传规则见文件尾 style 块）、内层 button tabindex=-1，
 *   禁用项靠 button :disabled 吞掉 click（菜单不关、回调不触发）；
 * - 分组标题/分隔线：普通 li（role=presentation/separator），不进 roving focus
 *   收集，方向键自动跳过、点击无效果（同基线自绘 label/separator）；
 * - 危险项（color:"error"）配色走调用方类（button 上的 text-error hover:bg-error-bg），
 *   与基线 itemColorClass 逐类相同；
 * - hide-on-click=false：由 composable 的 handleCommand 按基线顺序显式收口
 *   （父项只切换展开；普通项关菜单 → 归还触发器焦点 → onSelect → click）；
 * - popper z 钉 500 / 面板几何（min-width 144、rounded 12、p 4px、surface 底、
 *   elevated 阴影）由全局 element-plus-calibration.css 的 el-dropdown 段承担，
 *   本组件不再传内容类校准样式。
 *
 * fix/ep-leftovers（2026-09-14，有意行为变更）：修正壳时代模板的 v-if/v-else-if 配对
 * 断裂——「展开的子项」<template v-if> 插在父项与普通项之间，使普通项的
 * v-else-if="!item.type" 配到 template 上，收起态父项（type 为 undefined）各多渲染一条
 * 可聚焦、点击静默关菜单的幻影 li（T7 遗留风险 #2，逐像素记档；基线壳同缺陷）。现把
 * 子项 template 移到 if/else-if 链之后独立条件渲染：收起态只渲染真实条目，展开态
 * （父项 + 缩进二级）行为不变。
 */
import AppIcon from "@/components/common/AppIcon.vue"
import {
  DROPDOWN_POPPER_OPTIONS,
  DROPDOWN_TRIGGER_KEYS,
  useDropdownMenu,
  type DropdownMenuItem,
} from "@/composables/use-dropdown-menu"
import { ref } from "vue"
import type { DropdownInstance } from "element-plus"

defineProps<{
  items: DropdownMenuItem[][]
}>()

// 模板 ref 用 string 形式（ref="dropdownRef"）绑定；ref 所有权交给 composable 前先
// 在本组件创建（script 内被 useDropdownMenu 读取，避免顶层绑定仅剩模板字符串引用）
const dropdownRef = ref<DropdownInstance | null>(null)
const { expandedParents, handleCommand, handleVisibleChange } = useDropdownMenu({
  dropdownRef,
  focusFirstItemOnOpen: true,
})

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
  "flex w-full cursor-pointer items-center gap-2 rounded-kb-md px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
const CHILD_BTN_CLASS =
  "flex w-full cursor-pointer items-center gap-2 rounded-kb-md py-1.5 pr-2.5 pl-8 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
</script>

<template>
  <el-dropdown
    ref="dropdownRef"
    trigger="click"
    :trigger-keys="DROPDOWN_TRIGGER_KEYS"
    placement="bottom-end"
    :popper-options="DROPDOWN_POPPER_OPTIONS"
    :hide-on-click="false"
    :show-arrow="false"
    :max-height="'min(510px, calc(80vh - 10px))'"
    popper-class="kb-editor-more-menu-popper"
    @command="handleCommand"
    @visible-change="handleVisibleChange"
  >
    <slot />

    <template #dropdown>
      <el-dropdown-menu>
        <template v-for="(group, groupIndex) in items" :key="groupIndex">
          <li v-if="groupIndex > 0" role="separator" class="my-1 h-px bg-line-soft" />

          <template v-for="(item, itemIndex) in group" :key="`${groupIndex}-${itemIndex}`">
            <!-- 分组标题：普通 li，不进 roving focus 收集，方向键自动跳过、点击无效果（同基线） -->
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

            <!-- 普通菜单项（fix/ep-leftovers：v-else-if 现配到父项 el-dropdown-item 上，
                 收起态不再渲染幻影 li） -->
            <el-dropdown-item
              v-else-if="!item.type"
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

            <!-- 展开的子项：缩进二级（fix/ep-leftovers：独立条件渲染，置于 if/else-if
                 链之后——避免插在父项与普通项之间使后者的 v-else-if 配到本 template 上） -->
            <template
              v-if="
                item.children &&
                item.children.length > 0 &&
                expandedParents.has(`${groupIndex}-${itemIndex}`)
              "
            >
              <el-dropdown-item
                v-for="(child, childIndex) in item.children"
                :key="`${groupIndex}-${itemIndex}-${childIndex}`"
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
          </template>
        </template>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style>
/*
 * 业务件透传块（非 scoped，作用域 = popper-class "kb-editor-more-menu-popper"）：
 * 菜单项是 li/button，popper teleport 到 body，scoped :deep 够不到。面板几何与 z 钉
 * （min-width 144、p 4px、rounded 12、surface 底、elevated 阴影、z=500）已由全局
 * element-plus-calibration.css 的 el-dropdown 段承担，这里只接管「li 不设任何排版值」
 * 的透传形态——校准段默认观感是起始页纯文本条目（8px 10px 内边距/20px 行盒/secondary
 * 字），本业务件的排版语义全部在内层 button 上（见文件头「基线按钮保真」），li 只做
 * 结构透传。unlayered 规则恒压 @layer 段（含校准 components 段与暗色段），
 * .el-popper 类前缀再压过 EP 出厂的 (0,2,0)/(0,1,0) 特异性。
 */

/* EP 强设 display flex / padding 5px 16px / 22px 行高 / base 字号 / regular 字色 /
   nowrap——逐项还原为继承链，button 的 text-sm 等工具类与编辑器页 antd.css 的
   button{...:inherit} 按页面既有交互生效（同基线按钮） */
.el-popper.kb-editor-more-menu-popper .el-dropdown-menu__item {
  display: block;
  width: 100%;
  padding: 0;
  border-radius: 0;
  background-color: transparent;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: normal;
  transition: none;
}

/* EP 的 li hover/focus 底色与主色字全部关掉：悬停/配色语义在内层 button 上
   （基线行为），li 的 focus 走校准段的 focus-visible 环规则 */
.el-popper.kb-editor-more-menu-popper .el-dropdown-menu__item:not(.is-disabled):hover,
.el-popper.kb-editor-more-menu-popper .el-dropdown-menu__item:not(.is-disabled):focus {
  background-color: transparent;
  color: inherit;
}

/* EP 的禁用字色规则关掉（li 层）：禁用语义由内层 button 的 :disabled +
   itemColorClass 的 text-ink-quaternary 呈现（含 antd.css 页面差异） */
.el-popper.kb-editor-more-menu-popper .el-dropdown-menu__item.is-disabled {
  color: inherit;
}

/* EP 的 li 内 i 图标右距（icon-font 时代的 5px）不影响本组件：图标是 svg 且由
   button 的 gap 排布，防御性归零 */
.el-popper.kb-editor-more-menu-popper .el-dropdown-menu__item i {
  margin-right: 0;
}
</style>

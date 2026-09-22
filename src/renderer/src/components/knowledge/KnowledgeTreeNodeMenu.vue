<script setup lang="ts">
/**
 * 知识库文档树节点右键菜单。
 *
 * 渲染与交互状态机（定位、子菜单悬停、焦点、键盘导航）都来自 tree-node-menu 的
 * controller；菜单分组由父级（KnowledgeWorkspaceLayout）构造后传入，
 * 因为分组的 disabled 与 onClick 依赖布局内的权限和业务 handler。
 */
import { ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import {
  getTreeNodeMenuItemKey,
  useTreeNodeMenuController,
  type TreeNodeMenuGroup,
  type TreeNodeMenuState,
} from "./tree-node-menu"

const menu = defineModel<TreeNodeMenuState | null>("menu", { default: null })

const props = defineProps<{
  groups: TreeNodeMenuGroup[]
}>()

const menuRef = ref<HTMLElement | null>(null)

const {
  submenuSide,
  menuStyle,
  menuWidthClass,
  submenuParentKey,
  open,
  close,
  handleItemClick,
  handleSubmenuItemClick,
  handleItemMouseEnter,
  handleSubmenuMouseEnter,
  scheduleSubmenuClose,
  handleFocusIn,
  handleNavigation,
} = useTreeNodeMenuController({
  menu,
  menuRef,
  groups: () => props.groups,
})

// 菜单行样式与原布局保持一致（普通项 / 危险项 / 图标容器）。
const treeNodeMenuItemClass =
  "group flex w-full items-center gap-2.5 rounded-kb-sm bg-transparent px-2.5 py-[7px] text-left text-[13px] font-normal outline-none transition hover:bg-grey-200 focus-visible:bg-grey-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
const treeNodeMenuDangerItemClass =
  "group flex w-full items-center gap-2.5 rounded-kb-sm bg-transparent px-2.5 py-[7px] text-left text-[13px] font-normal outline-none transition hover:bg-error-bg focus-visible:bg-error-bg disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
const treeNodeMenuIconClass =
  "flex h-4 w-4 shrink-0 items-center justify-center text-ink-tertiary transition group-hover:text-ink-secondary group-focus:text-ink-secondary"
const treeNodeMenuDangerIconClass =
  "flex h-4 w-4 shrink-0 items-center justify-center text-error transition"

defineExpose({
  open,
  close,
  handleNavigation,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu"
      class="fixed inset-0 z-[var(--kb-z-dropdown-backdrop)]"
      @click="close()"
      @contextmenu.prevent="close()"
    >
      <div
        ref="menuRef"
        class="absolute"
        :class="menuWidthClass"
        role="menu"
        aria-label="文档树操作菜单"
        aria-orientation="vertical"
        :style="menuStyle"
        @click.stop
        @contextmenu.prevent
        @focusin="handleFocusIn"
      >
        <div
          class="rounded-kb-lg border border-line-input bg-surface py-1 shadow-[var(--kb-float-shadow)]"
        >
          <section
            v-for="(group, groupIndex) in props.groups"
            :key="group.id"
            :class="groupIndex > 0 ? 'mt-1.5 border-t border-line pt-1.5' : ''"
          >
            <div class="space-y-0.5 px-1">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="relative"
                @mouseenter="handleItemMouseEnter(group.id, item)"
                @mouseleave="scheduleSubmenuClose(getTreeNodeMenuItemKey(group.id, item.id))"
              >
                <button
                  type="button"
                  role="menuitem"
                  :aria-keyshortcuts="item.ariaKeyshortcuts"
                  :disabled="item.disabled"
                  :title="item.title || ''"
                  :data-tree-node-menu-key="getTreeNodeMenuItemKey(group.id, item.id)"
                  data-tree-node-menu-item
                  :class="
                    item.tone === 'danger' ? treeNodeMenuDangerItemClass : treeNodeMenuItemClass
                  "
                  @click="handleItemClick(group.id, item)"
                >
                  <span
                    :class="
                      item.tone === 'danger' ? treeNodeMenuDangerIconClass : treeNodeMenuIconClass
                    "
                  >
                    <Icon :icon="item.icon" :width="14" :height="14" />
                  </span>
                  <span
                    class="min-w-0 flex-1 truncate"
                    :class="item.tone === 'danger' ? 'text-error' : 'text-ink-secondary'"
                  >
                    {{ item.label }}
                  </span>
                  <span
                    v-if="item.children?.length"
                    class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-ink-quaternary"
                  >
                    <Icon icon="ph:caret-right" :width="11" :height="11" />
                  </span>
                </button>

                <div
                  v-if="
                    submenuParentKey === getTreeNodeMenuItemKey(group.id, item.id) &&
                    item.children?.length
                  "
                  class="absolute top-0 z-2 w-[180px] rounded-kb-lg border border-line-input bg-surface py-1 shadow-[var(--kb-float-shadow)]"
                  :class="
                    submenuSide === 'right' ? 'left-[calc(100%+8px)]' : 'right-[calc(100%+8px)]'
                  "
                  @mouseenter="handleSubmenuMouseEnter(getTreeNodeMenuItemKey(group.id, item.id))"
                  @mouseleave="scheduleSubmenuClose(getTreeNodeMenuItemKey(group.id, item.id))"
                >
                  <div class="space-y-0.5 px-1">
                    <button
                      v-for="child in item.children"
                      :key="child.id"
                      type="button"
                      role="menuitem"
                      :aria-keyshortcuts="child.ariaKeyshortcuts"
                      :disabled="child.disabled"
                      :title="child.title || ''"
                      :data-tree-node-menu-parent-key="getTreeNodeMenuItemKey(group.id, item.id)"
                      data-tree-node-menu-child-item
                      :class="
                        child.tone === 'danger'
                          ? treeNodeMenuDangerItemClass
                          : treeNodeMenuItemClass
                      "
                      @click="
                        handleSubmenuItemClick(getTreeNodeMenuItemKey(group.id, item.id), child)
                      "
                    >
                      <span
                        :class="
                          child.tone === 'danger'
                            ? treeNodeMenuDangerIconClass
                            : treeNodeMenuIconClass
                        "
                      >
                        <Icon :icon="child.icon" :width="14" :height="14" />
                      </span>
                      <span
                        class="min-w-0 flex-1 truncate"
                        :class="child.tone === 'danger' ? 'text-error' : 'text-ink-secondary'"
                      >
                        {{ child.label }}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* 菜单项自带 focus-visible 灰底/红底高亮，不再叠加全局绿色 focus 描边；
   style.css 的 unlayered :focus-visible 规则特异性更高会赢过 Tailwind
   outline-none，这里用「属性选择器 + 伪类」的更高特异性压过它 */
[data-tree-node-menu-item]:focus-visible,
[data-tree-node-menu-child-item]:focus-visible {
  outline: none;
}
</style>

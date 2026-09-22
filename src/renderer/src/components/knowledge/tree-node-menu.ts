/**
 * 知识库文档树节点右键菜单：类型、定位工具与状态机。
 *
 * 从 KnowledgeWorkspaceLayout 抽出。布局负责构造菜单分组（依赖各业务 handler），
 * 渲染与键盘/悬停/子菜单状态机由 KnowledgeTreeNodeMenu 组件配合本 controller 承担。
 */
import { computed, nextTick, onScopeDispose, ref, type Ref } from "vue"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"

export type TreeNodeMenuMode = "actions" | "create"

export type TreeNodeMenuItem = {
  id: string
  label: string
  description?: string
  shortcut?: string
  ariaKeyshortcuts?: string
  icon: string
  children?: TreeNodeMenuItem[]
  tone?: "default" | "danger"
  disabled?: boolean
  title?: string
  onClick: () => void | Promise<void>
}

export type TreeNodeMenuGroup = {
  id: string
  label?: string
  items: TreeNodeMenuItem[]
}

export type TreeNodeMenuPayload = {
  node: KnowledgeDocumentTreeNode
  x: number
  y: number
  mode: TreeNodeMenuMode
}

export type TreeNodeMenuState = TreeNodeMenuPayload

export const getTreeNodeMenuItemKey = (groupId: string, itemId: string) => `${groupId}:${itemId}`

export const getTreeNodeMenuEstimatedSize = (mode: TreeNodeMenuMode) => {
  if (mode === "create") {
    return {
      width: 176,
      height: 152,
    }
  }

  return {
    width: 184,
    height: 360,
  }
}

export const clampTreeNodeMenuPosition = (x: number, y: number, mode: TreeNodeMenuMode) => {
  if (typeof window === "undefined") {
    return { x, y }
  }

  const margin = 12
  const { width: menuWidth, height: menuHeight } = getTreeNodeMenuEstimatedSize(mode)
  const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin)
  const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin)

  return {
    x: Math.min(Math.max(x, margin), maxLeft),
    y: Math.min(Math.max(y, margin), maxTop),
  }
}

export const useTreeNodeMenuController = (options: {
  menu: Ref<TreeNodeMenuState | null>
  menuRef: Ref<HTMLElement | null>
  groups: () => TreeNodeMenuGroup[]
}) => {
  const { menu, menuRef } = options

  const treeNodeMenuFocusedIndex = ref(-1)
  const treeNodeMenuSubmenuParentKey = ref<string | null>(null)
  const treeNodeMenuSubmenuFocusedIndex = ref(-1)
  const treeNodeMenuSubmenuOpenTimer = ref<number | null>(null)
  const treeNodeMenuSubmenuCloseTimer = ref<number | null>(null)

  const findMenuItemByKey = (itemKey: string) => {
    for (const group of options.groups()) {
      for (const item of group.items) {
        const currentKey = getTreeNodeMenuItemKey(group.id, item.id)

        if (currentKey === itemKey) {
          return {
            group,
            item,
            key: currentKey,
          }
        }
      }
    }

    return null
  }

  const submenuSide = computed(() => {
    if (!menu.value || typeof window === "undefined") {
      return "right" as const
    }

    const menuWidth = menu.value.mode === "create" ? 176 : 184
    const submenuWidth = 180
    const availableRightSpace = window.innerWidth - (menu.value.x + menuWidth + submenuWidth + 20)

    return availableRightSpace >= 0 ? ("right" as const) : ("left" as const)
  })

  const menuStyle = computed(() => {
    if (!menu.value) {
      return {
        left: "0px",
        top: "0px",
      }
    }

    return {
      left: `${menu.value.x}px`,
      top: `${menu.value.y}px`,
    }
  })

  const menuWidthClass = computed(() => (menu.value?.mode === "create" ? "w-[176px]" : "w-[184px]"))

  const adjustPosition = () => {
    if (!menu.value || !menuRef.value || typeof window === "undefined") {
      return
    }

    const margin = 12
    const rect = menuRef.value.getBoundingClientRect()
    let nextX = menu.value.x
    let nextY = menu.value.y

    if (rect.right > window.innerWidth - margin) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin)
    }

    if (rect.bottom > window.innerHeight - margin) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin)
    }

    if (rect.left < margin) {
      nextX = margin
    }

    if (rect.top < margin) {
      nextY = margin
    }

    if (nextX === menu.value.x && nextY === menu.value.y) {
      return
    }

    menu.value = {
      ...menu.value,
      x: nextX,
      y: nextY,
    }
  }

  const getMenuItems = () => {
    if (!menuRef.value) {
      return [] as HTMLButtonElement[]
    }

    return Array.from(menuRef.value.querySelectorAll<HTMLButtonElement>("[data-tree-node-menu-item]:not(:disabled)"))
  }

  const getMenuSubmenuItems = (parentKey: string | null) => {
    if (!menuRef.value || !parentKey) {
      return [] as HTMLButtonElement[]
    }

    return Array.from(
      menuRef.value.querySelectorAll<HTMLButtonElement>(
        `[data-tree-node-menu-child-item][data-tree-node-menu-parent-key="${parentKey}"]:not(:disabled)`
      )
    )
  }

  const focusMenuItemByIndex = (index: number) => {
    const menuItems = getMenuItems()

    if (menuItems.length === 0) {
      treeNodeMenuFocusedIndex.value = -1
      return
    }

    const normalizedIndex = ((index % menuItems.length) + menuItems.length) % menuItems.length
    treeNodeMenuFocusedIndex.value = normalizedIndex
    menuItems[normalizedIndex]?.focus()
  }

  const focusMenuItemByKey = (itemKey: string) => {
    const menuItems = getMenuItems()
    const targetIndex = menuItems.findIndex(item => item.getAttribute("data-tree-node-menu-key") === itemKey)

    if (targetIndex >= 0) {
      focusMenuItemByIndex(targetIndex)
    }
  }

  const focusMenuSubmenuItemByIndex = (parentKey: string, index: number) => {
    const menuItems = getMenuSubmenuItems(parentKey)

    if (menuItems.length === 0) {
      treeNodeMenuSubmenuFocusedIndex.value = -1
      return
    }

    const normalizedIndex = ((index % menuItems.length) + menuItems.length) % menuItems.length
    treeNodeMenuSubmenuFocusedIndex.value = normalizedIndex
    menuItems[normalizedIndex]?.focus()
  }

  const closeSubmenu = (options?: { focusParent?: boolean }) => {
    const currentParentKey = treeNodeMenuSubmenuParentKey.value

    treeNodeMenuSubmenuParentKey.value = null
    treeNodeMenuSubmenuFocusedIndex.value = -1

    if (options?.focusParent && currentParentKey) {
      void nextTick(() => {
        focusMenuItemByKey(currentParentKey)
      })
    }
  }

  const activateSubmenu = (itemKey: string | null, openOptions?: { focusFirstChild?: boolean }) => {
    if (!itemKey) {
      closeSubmenu()
      return
    }

    const resolved = findMenuItemByKey(itemKey)

    if (!resolved?.item.children?.length) {
      closeSubmenu()
      return
    }

    treeNodeMenuSubmenuParentKey.value = itemKey
    treeNodeMenuSubmenuFocusedIndex.value = -1

    if (openOptions?.focusFirstChild) {
      void nextTick(() => {
        focusMenuSubmenuItemByIndex(itemKey, 0)
      })
    }
  }

  const clearSubmenuTimers = () => {
    if (treeNodeMenuSubmenuOpenTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuOpenTimer.value)
      treeNodeMenuSubmenuOpenTimer.value = null
    }

    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value)
      treeNodeMenuSubmenuCloseTimer.value = null
    }
  }

  const scheduleSubmenuOpen = (itemKey: string) => {
    if (treeNodeMenuSubmenuParentKey.value === itemKey) {
      if (treeNodeMenuSubmenuCloseTimer.value !== null) {
        window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value)
        treeNodeMenuSubmenuCloseTimer.value = null
      }
      return
    }

    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value)
      treeNodeMenuSubmenuCloseTimer.value = null
    }

    if (treeNodeMenuSubmenuOpenTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuOpenTimer.value)
    }

    treeNodeMenuSubmenuOpenTimer.value = window.setTimeout(() => {
      treeNodeMenuSubmenuOpenTimer.value = null
      activateSubmenu(itemKey)
    }, 90)
  }

  const scheduleSubmenuClose = (itemKey?: string | null) => {
    if (treeNodeMenuSubmenuOpenTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuOpenTimer.value)
      treeNodeMenuSubmenuOpenTimer.value = null
    }

    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value)
    }

    treeNodeMenuSubmenuCloseTimer.value = window.setTimeout(() => {
      treeNodeMenuSubmenuCloseTimer.value = null

      if (itemKey && treeNodeMenuSubmenuParentKey.value !== itemKey) {
        return
      }

      closeSubmenu()
    }, 120)
  }

  const handleItemMouseEnter = (groupId: string, item: TreeNodeMenuItem) => {
    const itemKey = getTreeNodeMenuItemKey(groupId, item.id)

    if (!item.children?.length) {
      scheduleSubmenuClose()
      return
    }

    scheduleSubmenuOpen(itemKey)
  }

  const handleSubmenuMouseEnter = (itemKey: string) => {
    if (treeNodeMenuSubmenuCloseTimer.value !== null) {
      window.clearTimeout(treeNodeMenuSubmenuCloseTimer.value)
      treeNodeMenuSubmenuCloseTimer.value = null
    }

    activateSubmenu(itemKey)
  }

  const close = () => {
    menu.value = null
    treeNodeMenuFocusedIndex.value = -1
    clearSubmenuTimers()
    closeSubmenu()
  }

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target instanceof HTMLButtonElement ? event.target : null

    if (!target) {
      return
    }

    if (target.hasAttribute("data-tree-node-menu-child-item")) {
      const parentKey = target.getAttribute("data-tree-node-menu-parent-key")
      const menuItems = getMenuSubmenuItems(parentKey)
      const nextIndex = menuItems.findIndex(item => item === target)

      treeNodeMenuSubmenuParentKey.value = parentKey

      if (nextIndex >= 0) {
        treeNodeMenuSubmenuFocusedIndex.value = nextIndex
      }

      return
    }

    if (!target.hasAttribute("data-tree-node-menu-item")) {
      return
    }

    const menuItems = getMenuItems()
    const nextIndex = menuItems.findIndex(item => item === target)
    const itemKey = target.getAttribute("data-tree-node-menu-key")

    if (nextIndex >= 0) {
      treeNodeMenuFocusedIndex.value = nextIndex
    }

    activateSubmenu(itemKey)
  }

  const open = (payload: TreeNodeMenuPayload) => {
    const position = clampTreeNodeMenuPosition(payload.x, payload.y, payload.mode)

    clearSubmenuTimers()
    closeSubmenu()

    menu.value = {
      node: payload.node,
      x: position.x,
      y: position.y,
      mode: payload.mode,
    }

    void nextTick(() => {
      adjustPosition()
      focusMenuItemByIndex(0)
    })
  }

  const handleItemClick = (groupId: string, item: TreeNodeMenuItem) => {
    const itemKey = getTreeNodeMenuItemKey(groupId, item.id)

    if (item.children?.length) {
      activateSubmenu(itemKey, { focusFirstChild: true })
      return
    }

    void item.onClick()
  }

  const handleSubmenuItemClick = (parentKey: string, item: TreeNodeMenuItem) => {
    treeNodeMenuSubmenuParentKey.value = parentKey
    void item.onClick()
  }

  const resolveActiveIndex = (menuItems: HTMLButtonElement[]) => {
    if (menuItems.length === 0) {
      return -1
    }

    if (treeNodeMenuFocusedIndex.value >= 0 && treeNodeMenuFocusedIndex.value < menuItems.length) {
      return treeNodeMenuFocusedIndex.value
    }

    const activeElement = document.activeElement

    if (activeElement instanceof HTMLButtonElement) {
      const activeIndex = menuItems.findIndex(item => item === activeElement)

      if (activeIndex >= 0) {
        return activeIndex
      }
    }

    return -1
  }

  const resolveSubmenuActiveIndex = (parentKey: string, menuItems: HTMLButtonElement[]) => {
    if (menuItems.length === 0) {
      return -1
    }

    if (treeNodeMenuSubmenuFocusedIndex.value >= 0 && treeNodeMenuSubmenuFocusedIndex.value < menuItems.length) {
      return treeNodeMenuSubmenuFocusedIndex.value
    }

    const activeElement = document.activeElement

    if (activeElement instanceof HTMLButtonElement) {
      const activeIndex = menuItems.findIndex(item => item === activeElement)

      if (activeIndex >= 0) {
        treeNodeMenuSubmenuParentKey.value = parentKey
        return activeIndex
      }
    }

    return -1
  }

  const handleNavigation = (event: KeyboardEvent) => {
    if (!menu.value) {
      return false
    }

    const activeElement = document.activeElement
    const activeSubmenuParentKey =
      activeElement instanceof HTMLButtonElement && activeElement.hasAttribute("data-tree-node-menu-child-item")
        ? activeElement.getAttribute("data-tree-node-menu-parent-key")
        : null

    if (activeSubmenuParentKey) {
      const submenuItems = getMenuSubmenuItems(activeSubmenuParentKey)

      if (submenuItems.length === 0) {
        return false
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        focusMenuSubmenuItemByIndex(
          activeSubmenuParentKey,
          resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems) + 1
        )
        return true
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        focusMenuSubmenuItemByIndex(
          activeSubmenuParentKey,
          resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems) - 1
        )
        return true
      }

      if (event.key === "Tab") {
        event.preventDefault()
        const activeIndex = resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems)

        if (activeIndex < 0) {
          focusMenuSubmenuItemByIndex(activeSubmenuParentKey, event.shiftKey ? submenuItems.length - 1 : 0)
          return true
        }

        focusMenuSubmenuItemByIndex(activeSubmenuParentKey, activeIndex + (event.shiftKey ? -1 : 1))
        return true
      }

      if (event.key === "Home") {
        event.preventDefault()
        focusMenuSubmenuItemByIndex(activeSubmenuParentKey, 0)
        return true
      }

      if (event.key === "End") {
        event.preventDefault()
        focusMenuSubmenuItemByIndex(activeSubmenuParentKey, submenuItems.length - 1)
        return true
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        closeSubmenu({ focusParent: true })
        return true
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        const activeIndex = resolveSubmenuActiveIndex(activeSubmenuParentKey, submenuItems)
        const activeMenuItem = activeIndex >= 0 ? submenuItems[activeIndex] : submenuItems[0]

        activeMenuItem?.click()
        return true
      }

      return false
    }

    const menuItems = getMenuItems()

    if (menuItems.length === 0) {
      return false
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusMenuItemByIndex(resolveActiveIndex(menuItems) + 1)
      return true
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      focusMenuItemByIndex(resolveActiveIndex(menuItems) - 1)
      return true
    }

    if (event.key === "Tab") {
      event.preventDefault()
      const activeIndex = resolveActiveIndex(menuItems)

      if (activeIndex < 0) {
        focusMenuItemByIndex(event.shiftKey ? menuItems.length - 1 : 0)
        return true
      }

      focusMenuItemByIndex(activeIndex + (event.shiftKey ? -1 : 1))
      return true
    }

    if (event.key === "Home") {
      event.preventDefault()
      focusMenuItemByIndex(0)
      return true
    }

    if (event.key === "End") {
      event.preventDefault()
      focusMenuItemByIndex(menuItems.length - 1)
      return true
    }

    if (event.key === "ArrowRight") {
      event.preventDefault()

      const activeIndex = resolveActiveIndex(menuItems)
      const activeMenuItem = activeIndex >= 0 ? menuItems[activeIndex] : menuItems[0]
      const activeItemKey = activeMenuItem?.getAttribute("data-tree-node-menu-key")

      if (activeItemKey) {
        activateSubmenu(activeItemKey, { focusFirstChild: true })
      }

      return true
    }

    if (event.key === "ArrowLeft" && treeNodeMenuSubmenuParentKey.value) {
      event.preventDefault()
      closeSubmenu()
      return true
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()

      const activeIndex = resolveActiveIndex(menuItems)
      const activeMenuItem = activeIndex >= 0 ? menuItems[activeIndex] : menuItems[0]

      activeMenuItem?.click()
      return true
    }

    return false
  }

  onScopeDispose(() => {
    clearSubmenuTimers()
  })

  return {
    submenuSide,
    menuStyle,
    menuWidthClass,
    submenuParentKey: treeNodeMenuSubmenuParentKey,
    open,
    close,
    handleItemClick,
    handleSubmenuItemClick,
    handleItemMouseEnter,
    handleSubmenuMouseEnter,
    scheduleSubmenuClose,
    handleFocusIn,
    handleNavigation,
  }
}

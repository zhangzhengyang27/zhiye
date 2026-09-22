import { onBeforeUnmount, ref, type Ref } from "vue"
import type { DropdownInstance, Options as DropdownPopperOptions } from "element-plus"

/**
 * el-dropdown 菜单行为收编（T7 解散 AppDropdownMenu 的壳遗产，对齐 T1 实测收编清单）。
 *
 * 背景：AppDropdownMenu 壳（已解散）在 EP el-dropdown 之上补了三类 EP 没有的行为，
 * 解散后按计划文档第六节 T1 实测结论收编进本 composable（供 el-dropdown 直用调用点
 * 按需取用，起始页筛选只接 Esc 段、键盘导航接受 EP 默认，差异记档见 T7 节）：
 *
 * a) Esc 截停（EP 2.14.5 dropdown 全链无 Esc 处理）：菜单打开期间在 document 捕获
 *    阶段截停 Esc（preventDefault + stopPropagation）→ 只关菜单并归还触发器焦点；
 *    菜单关闭态不拦截（对话框的 Esc 关闭依赖事件冒泡到达 EP 的元素级 keydown——
 *    菜单在对话框内打开时 Esc 先关菜单且对话框收不到该次 Esc）。随 visible-change
 *    注册/注销，卸载时兜底清理；
 * b) 鼠标打开后聚焦首项（可选，编辑器菜单需要）：EP 在 isUsingKeyboard=false 链路下
 *    ArrowDown 焦点不动（T1 实测），基线自建菜单鼠标打开后方向键可用——开启本项后
 *    打开时把焦点移到首个可聚焦项，roving 导航即刻可用；起始页筛选不开（接受 EP
 *    默认，记档差异）；
 * c) 子菜单面板内展开状态机（expandedParents 语义）：点击父项在面板内展开缩进二级
 *    （非浮层），Set 语义可多组同时展开、无互斥，重新打开时重置；父项不触发
 *    onSelect、不关菜单。方向键在二级的走向由 EP roving 线性序天然承担（父项
 *    ArrowDown 进首个二级项、二级末项 ArrowDown 出到下一项），无需额外代码。
 *
 * 另附两件调用点共享常量（原壳组件级 prop，解散后逐调用点透传）：
 * - DROPDOWN_POPPER_OPTIONS：基线 floating-ui offset(6) 的 fixed 定位与间距校正
 *   （EP 未透出 offset prop，tooltip 默认 12px；modifier 细节见下方注释，与壳逐字
 *   同源）+ 关闭 popper v2 computeStyles 的整数取整（基线保留小数定位，取整会让
 *   全面板文字产生约 0.5px 亚像素偏移）；
 * - DROPDOWN_TRIGGER_KEYS：基线触发器键盘契约（EP 默认无 ArrowUp，壳补齐；
 *   起始页筛选不传则接受 EP 默认）。
 */

/** 菜单项结构（原壳 AppDropdownMenu 的 DropdownMenuItem，对外形状不变） */
export interface DropdownMenuItem {
  type?: "label"
  label: string
  icon?: string
  disabled?: boolean
  color?: "primary" | "neutral" | "error"
  onSelect?: () => void
  click?: () => void
  children?: DropdownMenuItem[]
}

/**
 * 命令负载：el-dropdown 的 command 事件只回传单个值，用对象区分「父项展开切换」与
 * 「普通项选择」，并携带原 item 引用保证 onSelect/click 回调契约不变。
 */
export type DropdownMenuCommand =
  { kind: "item"; item: DropdownMenuItem } | { kind: "parent"; item: DropdownMenuItem; key: string }

/** 基线触发器键盘契约：Enter/Space 原生按钮 + ArrowDown/ArrowUp 开合（EP 默认无 ArrowUp） */
export const DROPDOWN_TRIGGER_KEYS: string[] = [
  "Enter",
  "NumpadEnter",
  "Space",
  "ArrowDown",
  "ArrowUp",
]

/** 基线 floating-ui offset(6)：EP 未透出 offset prop（tooltip 默认 12px）。EP 的 offset
    modifier 会把间距加进 modifiersData.popperOffsets、computeStyles 只消费
    popperOffsets（modifiersData.offset 仅被 preventOverflow 读取做裁剪预算），因此
    校正必须落在 popperOffsets 上：本 modifier 追加在 main 相位末尾（晚于 EP 的
    offset，此时 popperOffsets 已含 12px），bottom 下移 6px 折算 y-6、top 反向，
    净间距=6px；flip 仅在 bottom/top 间回退（EP fallback-placements）。 */
const MENU_OFFSET_PX = 6

export const DROPDOWN_POPPER_OPTIONS: DropdownPopperOptions = {
  // placement 由 el-dropdown 的 placement prop（bottom-end）在 EP 内部拼装，这里只补
  // 基线的 fixed 定位策略与间距校正 modifier
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

export interface UseDropdownMenuOptions {
  /** 调用方持有的模板 ref（string ref 绑定 `ref="dropdownRef"` 的落点；不传则内部自建） */
  dropdownRef?: Ref<DropdownInstance | null>
  /** 打开后聚焦首个可聚焦项（收编清单 b；编辑器菜单 true，起始页筛选接受 EP 默认不传） */
  focusFirstItemOnOpen?: boolean
}

export function useDropdownMenu(options: UseDropdownMenuOptions = {}) {
  const dropdownRef = options.dropdownRef ?? ref<DropdownInstance | null>(null)
  /** 展开的父项键集合（`${groupIndex}-${itemIndex}`），重新打开时重置 */
  const expandedParents = ref<Set<string>>(new Set())

  /** 触发器内可聚焦元素：焦点归还以它为准（.el-dropdown 根的首子元素即 OnlyChild
      克隆出的插槽内容，与壳 resolveTrigger 语义一致） */
  const resolveTrigger = (): HTMLElement | null => {
    const root = dropdownRef.value?.$el as HTMLElement | null | undefined
    const first = root?.firstElementChild as HTMLElement | null
    return first ?? root ?? null
  }

  /** 显式收口关闭（配合 hide-on-click=false 由调用方控制关闭时机的形态） */
  const closeMenu = () => {
    dropdownRef.value?.handleClose()
  }

  /** 父项展开切换（收编清单 c）：Set 语义可多组同时展开，无互斥 */
  const toggleParent = (key: string) => {
    const next = new Set(expandedParents.value)

    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }

    expandedParents.value = next
  }

  /**
   * 菜单打开期间的 document 捕获阶段键盘处理（基线 handleKeydown 语义，收编清单 a）：
   * - Esc：截停（preventDefault + stopPropagation）只关菜单并归还触发器焦点。EP 的
   *   dropdown 全链无 Esc 处理，不截停时 Esc 会冒泡给外层对话框的 EP 关闭链路
   *   （菜单在对话框之上时 Esc 会连带关掉对话框——基线用捕获阶段 stopPropagation
   *   阻止了这一点）；菜单关闭态本监听未注册，Esc 照常冒泡；
   * - Tab：只关菜单，不阻断传播（基线行为——焦点自然移动到下一个元素）。焦点在
   *   菜单内时 EP 的 dropdown-menu 自带 Tab→handleClose，两处同触发幂等。
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

  /** 收编 b 的焦点纠正侦听（与菜单开合同步，同 Esc 监听模式）：EP 在 show 相位之后
      仍会把焦点塞回 contentRef（ul，实测晚于打开后约 200ms）——focusin 目标为
      .el-dropdown-menu 时改投首项并 preventScroll。visible-change(true) 注册 /
      false 注销（卸载兜底）；菜单关闭后若 EP 再有塞焦点动作则不纠正（退化 EP 默认，
      失败模式良性）。 */
  const handleFirstItemFocusIn = (event: FocusEvent) => {
    const target = event.target
    if (!(target instanceof Element) || !target.classList.contains("el-dropdown-menu")) {
      return
    }
    const first = target.querySelector<HTMLElement>(".el-dropdown-menu__item:not(.is-disabled)")
    first?.focus({ preventScroll: true })
  }

  const stopFirstItemFocusIn = () => {
    document.removeEventListener("focusin", handleFirstItemFocusIn)
  }

  /** 打开初期的焦点落位（收编清单 b 前半）：visible-change(true)（before-show）时
      aria-hidden 尚未翻 false，rAF 帧 12 帧内持续把焦点投到首个可聚焦项（焦点已被
      用户移到其它菜单项时不再抢占）。迟到的 EP 塞焦点由上方 focusin 侦听接管。 */
  const scheduleFocusFirstItem = () => {
    let frames = 0
    const tick = () => {
      frames += 1
      const popper = document.querySelector<HTMLElement>(
        '.el-dropdown__popper[aria-hidden="false"]',
      )
      const items = popper?.querySelectorAll<HTMLElement>(
        ".el-dropdown-menu__item:not(.is-disabled)",
      )
      const active = document.activeElement
      const activeOnItem =
        active instanceof Element &&
        Boolean(items && Array.from(items).includes(active as HTMLElement))
      if (popper && items && items.length > 0 && !activeOnItem) {
        // preventScroll：纠正焦点不得滚动 el-scrollbar 的 wrap（长菜单滚到深处的
        // 展开/点击场景，无此参数会把面板视图拽回顶部——pixdiff 在「导出与打印」
        // 子菜单态实测暴露）
        items[0]?.focus({ preventScroll: true })
      }
      if (frames < 12) {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  }

  const handleVisibleChange = (visible: boolean) => {
    if (visible) {
      expandedParents.value = new Set()
      document.addEventListener("keydown", handleDocumentKeydown, true)
      if (options.focusFirstItemOnOpen) {
        document.addEventListener("focusin", handleFirstItemFocusIn)
        scheduleFocusFirstItem()
      }
    } else {
      document.removeEventListener("keydown", handleDocumentKeydown, true)
      stopFirstItemFocusIn()
    }
  }

  /** 命令收口（壳 handleCommand 语义）：父项只切换展开；普通项按基线顺序
      「关菜单 → 归还触发器焦点 → onSelect → click」显式收口。 */
  const handleCommand = (command: DropdownMenuCommand) => {
    if (command.kind === "parent") {
      toggleParent(command.key)
      return
    }

    const item = command.item
    closeMenu()
    resolveTrigger()?.focus()
    item.onSelect?.()
    item.click?.()
  }

  onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleDocumentKeydown, true)
    stopFirstItemFocusIn()
  })

  return {
    dropdownRef,
    expandedParents,
    resolveTrigger,
    closeMenu,
    toggleParent,
    handleCommand,
    handleVisibleChange,
  }
}

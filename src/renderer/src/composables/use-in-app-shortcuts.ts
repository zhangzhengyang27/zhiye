/**
 * 应用内快捷键（语雀的 mousetrap 族：新建文档、全局搜索）。
 *
 * 只负责「按设置的 accelerator 匹配 → 广播一条命令」，具体动作仍由侧栏
 * （命令面板、新建意图）自己实现——避免把知识库上下文搬进根组件。
 * globalShortcut 族（唤起主窗口、小记）在系统层就拦下了，不经此处。
 */
import { onBeforeUnmount, onMounted } from "vue"
import { SHORTCUT_ROWS, keyboardEventToAccelerator } from "@/constants/desktop-settings"
import { useDesktopSettings } from "@/composables/useDesktopSettings"
import { isImeComposing } from "@/utils/keyboard"

/** 广播事件名：detail 为命令标识（见 COMMAND_OF_SHORTCUT）。 */
export const IN_APP_COMMAND_EVENT = "xiaoye:in-app-command"

/** 快捷键标识 → 对外的命令名。 */
const COMMAND_OF_SHORTCUT: Record<string, string> = {
  createNewDoc: "create-doc",
  showGlobalSearchModal: "open-search",
}

export function useInAppShortcuts() {
  const { settings } = useDesktopSettings()

  const handleKeydown = (event: KeyboardEvent) => {
    // 冒泡阶段监听：设置页的快捷键输入框会先 preventDefault，此处据此让位
    if (event.defaultPrevented || isImeComposing(event)) {
      return
    }

    const accelerator = keyboardEventToAccelerator(event)
    if (!accelerator) {
      return
    }

    const row = SHORTCUT_ROWS.find(
      (item) => item.type === "mousetrap" && settings.shortcuts[item.key] === accelerator,
    )
    const command = row ? COMMAND_OF_SHORTCUT[row.key] : undefined
    if (!command) {
      return
    }

    event.preventDefault()
    window.dispatchEvent(new CustomEvent(IN_APP_COMMAND_EVENT, { detail: command }))
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeydown)
  })
}

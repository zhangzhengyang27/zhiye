/**
 * 面板宽度拖拽共享实现：侧栏与目录列两处「列宽 + 4px 拖拽条 + 剩余空间」的三列 grid 共用。
 *
 * 收敛前是两份平行代码，`pointercancel` 清理只补在目录列那份，侧栏那份漏掉后
 * 拖拽态会永久卡住（指示条常亮 + 鼠标移动继续改宽度）。宽度、指针、持久化都在这里，
 * 调用方只提供边界值与存储键。
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue"

/**
 * 拖拽条自己那一列的宽度：0。
 *
 * 曾经给 4px，但它是透明列，会透出壳层白底——两块 #fafafa 面板之间凭空多一道 4px 白条，
 * 加上面板 border-r 贴在白条左沿，看起来就是双线。语雀实测那条边界只有 1px #eff0f0。
 * 命中面改由调用方用负外边距撑出 12px（`-mx-1.5`），不占布局。
 */
const PANEL_RESIZE_GUTTER = 0

const readStoredWidth = (key: string) => {
  if (!key || typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw === null ? Number.NaN : Number(raw)

    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

const writeStoredWidth = (key: string, width: number) => {
  if (!key || typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(key, String(width))
  } catch {
    // 隐私模式等场景写不进去，不影响拖拽本身
  }
}

export const usePanelResize = (options: {
  /** 面板组的起点元素，其左缘即宽度 0 处 */
  containerRef: Ref<HTMLElement | null>
  /** 持久化键；空串表示不持久化 */
  storageKey: Ref<string>
  min: number
  max: number
  defaultWidth: number
}) => {
  const { containerRef, storageKey, min, max, defaultWidth } = options

  const width = ref(defaultWidth)
  const resizing = ref(false)

  const clamp = (value: number) => Math.min(Math.max(value, min), max)

  const syncWidthByClientX = (clientX: number) => {
    const container = containerRef.value

    if (!container) {
      return
    }

    width.value = clamp(clientX - container.getBoundingClientRect().left)
  }

  const handleMove = (event: PointerEvent) => {
    if (!resizing.value) {
      return
    }

    syncWidthByClientX(event.clientX)
  }

  const stop = () => {
    if (!resizing.value) {
      return
    }

    resizing.value = false
    writeStoredWidth(storageKey.value, width.value)
    window.removeEventListener("pointermove", handleMove)
    window.removeEventListener("pointerup", stop)
    // 触摸被打断、手势被系统接管时只有 pointercancel 没有 pointerup，
    // 缺了这条清理拖拽态会永久卡住
    window.removeEventListener("pointercancel", stop)
  }

  const start = (event: PointerEvent) => {
    if (event.button !== 0) {
      return
    }

    resizing.value = true
    syncWidthByClientX(event.clientX)

    // 捕获指针后 move/up/cancel 都会稳定回到本元素，指针移出窗口也不丢收尾事件
    try {
      if (event.target instanceof Element) {
        event.target.setPointerCapture(event.pointerId)
      }
    } catch {
      // 指针已释放时捕获会抛，此时按普通拖拽继续即可
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
  }

  const gridStyle = computed(() => ({
    gridTemplateColumns: `${width.value}px ${PANEL_RESIZE_GUTTER}px minmax(0, 1fr)`,
  }))

  watch(
    storageKey,
    key => {
      const stored = readStoredWidth(key)
      width.value = stored === null ? defaultWidth : clamp(stored)
    },
    { immediate: true }
  )

  watch(
    width,
    value => {
      if (!resizing.value) {
        writeStoredWidth(storageKey.value, value)
      }
    },
    { flush: "post" }
  )

  onBeforeUnmount(stop)

  return { width, resizing, gridStyle, start }
}

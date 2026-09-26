<script setup lang="ts">
/** 分区组件，负责知识库侧栏知识Bases内容组织与展示（对齐语雀：蓝色文件夹 + 行式列表 + 拖拽排序）。
 *  拖拽用 pointer 事件自绘（对齐语雀形态：幽灵卡片跟指针 + 落点行高亮），不用 HTML5 DnD——
 *  原生 DnD 幽灵样式不可控、触屏不可用、自动化验证也无法派发。 */
import { computed, onBeforeUnmount, ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"

const props = defineProps<{
  expanded: boolean
  knowledgeBases: KnowledgeBaseItem[]
  loading: boolean
  loadError: string
  activeKbId: string
}>()

const emit = defineEmits<{
  toggle: []
  retry: []
  reorder: [items: { id: string; sortOrder: number }[]]
}>()

/** 拖拽激活的位移阈值（与文档树一致） */
const DRAG_ACTIVATION_DISTANCE_PX = 6

interface DragSession {
  pointerId: number
  fromIndex: number
  startX: number
  startY: number
  active: boolean
  pointerType: string
}

const dragSession = ref<DragSession | null>(null)
/** 优化后的列表快照（拖拽中源行从列表消失，列表实时收拢——对齐语雀） */
const displayItems = computed(() => {
  const session = dragSession.value
  if (!session?.active) return props.knowledgeBases
  return props.knowledgeBases.filter((_, index) => index !== session.fromIndex)
})
/** 插入线位置：0..n（插到第 n 个显示行之前），跟随指针实时更新 */
const dragOverIndex = ref<number | null>(null)
/** 拖拽中指针 y（插入线定位用） */
const dragPointerY = ref(0)

const getKnowledgeItemClass = (active: boolean) => {
  const base =
    "group relative flex h-8 items-center gap-2.5 rounded-kb-md px-3 text-[14px] transition-colors duration-150 cursor-grab active:cursor-grabbing"
  if (active) {
    return `${base} bg-grey-400 font-medium text-ink dark:bg-grey-500`
  }
  return `${base} text-ink-secondary hover:bg-grey-300 hover:text-ink dark:hover:bg-grey-400`
}

const isKnowledgeBaseActive = (kbId: string) => props.activeKbId === kbId

const handlePointerDown = (index: number, event: PointerEvent) => {
  if (event.button !== 0) return
  // 已有会话进行中（多点触控防重入）：后按的手指不开启新会话
  if (dragSession.value) return

  dragSession.value = {
    pointerId: event.pointerId,
    fromIndex: index,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    pointerType: event.pointerType,
  }

  window.addEventListener("pointermove", handleWindowPointerMove)
  window.addEventListener("pointerup", handleWindowPointerUp)
  window.addEventListener("pointercancel", cancelDrag)
}

const handleWindowPointerMove = (event: PointerEvent) => {
  const session = dragSession.value
  if (!session || event.pointerId !== session.pointerId) return

  if (!session.active) {
    const dx = event.clientX - session.startX
    const dy = event.clientY - session.startY
    if (Math.hypot(dx, dy) < DRAG_ACTIVATION_DISTANCE_PX) return
    session.active = true
  }

  dragPointerY.value = event.clientY

  // 插入线模型（对齐语雀）：指针在某显示行的上半 → 线在该行上方；下半 → 线在下方。
  // dragOverIndex 即「源行移除后」的显示序列插入点（0..n），落盘直接按它 splice，
  // 不做任何原列表索引换算——此前的 display→original +1 再 -1 双重补偿是
  // 向下拖动落点提前一格的根因。
  const rows = Array.from(document.querySelectorAll("div[data-kb-drag-row]"))
  let lineIndex: number | null = null
  for (const row of rows) {
    const r = row.getBoundingClientRect()
    if (event.clientY >= r.top && event.clientY <= r.bottom) {
      const displayIndex = Number(row.getAttribute("data-kb-drag-display-index"))
      const inLowerHalf = event.clientY > r.top + r.height / 2
      lineIndex = displayIndex + (inLowerHalf ? 1 : 0)
      break
    }
  }
  dragOverIndex.value = lineIndex
}

/** 激活拖拽后的首次 click 一律拦截：pointerup 落在行内链接上会派发 click 造成误导航 */
const suppressClickOnce = (event: Event) => {
  event.stopPropagation()
  event.preventDefault()
}

const handleWindowPointerUp = () => {
  const session = dragSession.value
  if (!session) return

  const wasActive = session.active
  const fromIndex = session.fromIndex
  const insertLine = dragOverIndex.value

  detachWindowListeners()
  dragSession.value = null
  dragOverIndex.value = null

  if (!wasActive) return

  // 拖拽激活后松手：吞掉紧随的 click（若 pointerup 恰好落在行内链接上会触发导航）
  window.addEventListener("click", suppressClickOnce, { capture: true, once: true })

  if (insertLine === null || insertLine === fromIndex) {
    // 线停在源行原位（或未命中行）＝无变化
    return
  }

  const items = [...props.knowledgeBases]
  const [moved] = items.splice(fromIndex, 1)
  if (!moved) return
  // 移除源行后的数组即显示序列，插入线索引直接可用
  items.splice(Math.max(0, Math.min(insertLine, items.length)), 0, moved)

  emit(
    "reorder",
    items.map((item, idx) => ({ id: item.id, sortOrder: idx })),
  )
}

const cancelDrag = () => {
  detachWindowListeners()
  dragSession.value = null
  dragOverIndex.value = null
}

const detachWindowListeners = () => {
  window.removeEventListener("pointermove", handleWindowPointerMove)
  window.removeEventListener("pointerup", handleWindowPointerUp)
  window.removeEventListener("pointercancel", cancelDrag)
}

onBeforeUnmount(() => {
  detachWindowListeners()
})

defineExpose({
  openByIndex: (index: number) => {
    const item = props.knowledgeBases[index]
    if (item) window.location.hash = ""
  },
})
</script>

<template>
  <div class="mt-6 flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between px-3 pb-1 pt-2">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-kb-md py-1 text-left text-[13px] font-medium text-ink-tertiary transition-colors duration-150 hover:text-ink-secondary"
        @click="emit('toggle')"
      >
        <Icon
          icon="ph:caret-down"
          :width="12"
          :height="12"
          class="shrink-0 transition-transform duration-200"
          :class="props.expanded ? 'rotate-0' : '-rotate-90'"
        />
        <span class="truncate">知识库</span>
      </button>
      <button
        type="button"
        class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-kb-sm text-ink-quaternary transition-colors hover:bg-grey-200 hover:text-ink-secondary"
        title="全部知识库"
        @click="$router.push('/knowledge')"
      >
        <Icon icon="ph:caret-right" :width="12" :height="12" />
      </button>
    </div>

    <div v-show="props.expanded" class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <div v-if="props.loading" class="space-y-1 px-1 pt-1">
        <div
          v-for="index in 8"
          :key="`kb-skeleton-${index}`"
          class="h-8 animate-pulse rounded-kb-md bg-grey-200"
        />
      </div>

      <div v-else-if="props.loadError" class="space-y-2 px-3 py-3">
        <p class="text-xs text-error">{{ props.loadError }}</p>
        <el-button type="danger" size="small" class="kb-btn-soft" @click="emit('retry')"
          ><span class="truncate">重试</span>
        </el-button>
      </div>

      <div
        v-else-if="props.knowledgeBases.length === 0"
        class="rounded-kb-md border border-line bg-surface px-4 py-6 text-center text-xs text-ink-tertiary"
      >
        暂无知识库
      </div>

      <div v-else class="space-y-0.5">
        <div
          v-for="(item, displayIndex) in displayItems"
          :key="`menu-${item.id}`"
          data-kb-drag-row
          :data-kb-drag-display-index="displayIndex"
          :class="getKnowledgeItemClass(isKnowledgeBaseActive(item.id))"
          @pointerdown.prevent="handlePointerDown(displayIndex, $event)"
        >
          <!-- 插入线：落在当前行上缘时显示 -->
          <span
            v-if="dragSession?.active && dragOverIndex === displayIndex"
            class="pointer-events-none absolute inset-x-1 top-0 z-10 h-[2px] rounded-full bg-brand"
          />
          <!-- draggable=false：a 元素原生链接拖拽会触发 pointercancel，
               导致 KB 列表的 pointer 自绘拖拽被取消而根本无法拖动 -->
          <RouterLink
            :to="{ name: 'knowledge-workspace-home', params: { kbId: item.id } }"
            :draggable="false"
            class="flex min-w-0 flex-1 items-center gap-2.5"
            @click.stop
          >
            <span class="relative shrink-0">
              <!-- KB 蓝色强调走 --kb-accent-blue（亮 blue-500/暗 blue-600，tokens.css 换档）。
                   带 ! 后缀：style.css 的 html.dark svg{color:inherit} 是 unlayered，会压过
                   layered 工具类（坑 13 同链路）；本图标还在 RouterLink 里，暗色更会被
                   html.dark a 的蓝色 !important 劫持（原 dark:text-[var(--kb-blue-400)] 就
                   因此从未生效），!important 声明才能在 svg 自身上赢回 -->
              <Icon icon="ph:book-fill" :width="16" :height="16" class="text-accent-blue!" />
              <span
                class="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border border-surface bg-white dark:bg-grey-600"
                title="个人知识库"
              >
                <Icon
                  icon="ph:export"
                  :width="7"
                  :height="7"
                  class="text-ink-tertiary dark:text-ink-secondary"
                />
              </span>
            </span>
            <!-- span 上显式给字色：style.css 的 .dark a !important 会把中间 RouterLink
                 劫持成蓝色，子元素自身声明可以不受父级 !important 影响 -->
            <span
              class="min-w-0 flex-1 truncate"
              :class="
                isKnowledgeBaseActive(item.id)
                  ? 'text-ink'
                  : 'text-ink-secondary group-hover:text-ink'
              "
              :title="item.name"
              >{{ item.name }}</span
            >
          </RouterLink>
        </div>

        <!-- 插入线：落在列表末尾（最后一行下方）时显示 -->
        <div
          v-if="dragSession?.active && dragOverIndex === displayItems.length"
          class="pointer-events-none relative h-0"
        >
          <span class="absolute inset-x-1 top-[-1px] block h-[2px] rounded-full bg-brand" />
        </div>
      </div>
    </div>
  </div>
</template>

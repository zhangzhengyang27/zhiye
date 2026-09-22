<script setup lang="ts">
/** 分区组件，负责知识库侧栏知识Bases内容组织与展示（对齐语雀：蓝色文件夹 + 行式列表 + 拖拽排序）。 */
import { ref } from "vue"
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

const draggedKbId = ref<string | null>(null)
const dragOverIndex = ref<number | null>(null)

const getKnowledgeItemClass = (active: boolean, isDragging: boolean, isDragOver: boolean) => {
  const base =
    "group flex h-8 items-center gap-2.5 rounded-kb-md px-3 text-[14px] transition-colors duration-150 cursor-grab active:cursor-grabbing"
  if (active) {
    return `${base} bg-grey-400 font-medium text-ink dark:bg-grey-500`
  }
  if (isDragging) {
    return `${base} opacity-40`
  }
  if (isDragOver) {
    return `${base} bg-grey-300 text-ink dark:bg-grey-400`
  }
  return `${base} text-ink-secondary hover:bg-grey-300 hover:text-ink dark:hover:bg-grey-400`
}

const isKnowledgeBaseActive = (kbId: string) => props.activeKbId === kbId

const handleDragStart = (index: number, event: DragEvent) => {
  draggedKbId.value = props.knowledgeBases[index]?.id ?? null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(index))
  }
}

const handleDragOver = (index: number, event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move"
  }
  dragOverIndex.value = index
}

const handleDragLeave = (event: DragEvent) => {
  // dragleave 会冒泡自行内子元素（图标/文字）：只有真正离开本行容器才清高亮
  const container = event.currentTarget as HTMLElement | null

  if (container && event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) {
    return
  }

  dragOverIndex.value = null
}

const handleDrop = (targetIndex: number, event: DragEvent) => {
  event.preventDefault()
  const draggedId = draggedKbId.value
  draggedKbId.value = null
  dragOverIndex.value = null

  if (!draggedId) return

  // 拖拽期间列表可能已刷新：按 id 重查当前索引，过期快照直接放弃
  const fromIndex = props.knowledgeBases.findIndex(item => item.id === draggedId)
  if (fromIndex < 0 || fromIndex === targetIndex) return

  const items = [...props.knowledgeBases]
  const [moved] = items.splice(fromIndex, 1)
  if (!moved) return
  items.splice(targetIndex, 0, moved)

  const reorderItems = items.map((item, idx) => ({
    id: item.id,
    sortOrder: idx,
  }))
  emit("reorder", reorderItems)
}

const handleDragEnd = () => {
  draggedKbId.value = null
  dragOverIndex.value = null
}
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
        <div v-for="index in 8" :key="`kb-skeleton-${index}`" class="h-8 animate-pulse rounded-kb-md bg-grey-200" />
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
          v-for="(item, index) in props.knowledgeBases"
          :key="`menu-${item.id}`"
          :draggable="true"
          :class="
            getKnowledgeItemClass(isKnowledgeBaseActive(item.id), draggedKbId === item.id, dragOverIndex === index)
          "
          @dragstart="handleDragStart(index, $event)"
          @dragover="handleDragOver(index, $event)"
          @dragleave="handleDragLeave($event)"
          @drop="handleDrop(index, $event)"
          @dragend="handleDragEnd"
        >
          <RouterLink
            :to="{ name: 'knowledge-workspace-home', params: { kbId: item.id } }"
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
                <Icon icon="ph:export" :width="7" :height="7" class="text-ink-tertiary dark:text-ink-secondary" />
              </span>
            </span>
            <!-- span 上显式给字色：style.css 的 .dark a !important 会把中间 RouterLink
                 劫持成蓝色，子元素自身声明可以不受父级 !important 影响 -->
            <span
              class="min-w-0 flex-1 truncate"
              :class="isKnowledgeBaseActive(item.id) ? 'text-ink' : 'text-ink-secondary group-hover:text-ink'"
              :title="item.name"
              >{{ item.name }}</span
            >
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

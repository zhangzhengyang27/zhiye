<script setup lang="ts">
/** 组件，负责知识树节点相关界面展示与交互。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeInlineTitleInput from "@/components/knowledge/KnowledgeInlineTitleInput.vue"
import type { KnowledgeDocumentTreeNode, KnowledgeDocumentType } from "@/services/knowledge-documents"
import type { TreeDropPosition, TreeRowRegistryItem } from "./tree-dnd"

type KnowledgeNodeMenuMode = "actions" | "create"
type KnowledgeCreateChildType = KnowledgeDocumentType | "board"

type KnowledgeNodeMenuPayload = {
  node: KnowledgeDocumentTreeNode
  x: number
  y: number
  mode: KnowledgeNodeMenuMode
}

const props = defineProps<{
  node: KnowledgeDocumentTreeNode
  depth: number
  /** 在兄弟节点中的位次（由 KnowledgeTreeBranch 注入）：兄弟增删时触发注册表再同步 */
  index: number
  expandedIds: string[]
  activeDocId: string | null
  selectedNodeId?: string | null
  draggingNodeId?: string | null
  dropTargetId?: string | null
  dropPosition?: TreeDropPosition | null
  dragDisabled?: boolean
  canEdit?: boolean
  /** 正在行内改名的节点 id；命中本行时标题换成行内输入框 */
  renamingNodeId?: string | null
}>()

const emit = defineEmits<{
  (event: "toggle-folder", id: string): void
  (event: "open-doc", id: string): void
  (event: "focus-node", node: KnowledgeDocumentTreeNode): void
  (event: "create-child", payload: { parentId: string | null; type: KnowledgeCreateChildType }): void
  (event: "rename-finish", payload: { node: KnowledgeDocumentTreeNode; title: string; committed: boolean }): void
  (event: "move-node", node: KnowledgeDocumentTreeNode): void
  (event: "delete-node", node: KnowledgeDocumentTreeNode): void
  (event: "copy-link-node", node: KnowledgeDocumentTreeNode): void
  (event: "preview-doc", node: KnowledgeDocumentTreeNode): void
  (event: "show-node-menu", payload: KnowledgeNodeMenuPayload): void
  (event: "drag-start-node", payload: { node: KnowledgeDocumentTreeNode; event: PointerEvent }): void
  (event: "register-row", payload: { item: TreeRowRegistryItem }): void
  (event: "unregister-row", payload: { nodeId: string }): void
}>()

const rowRef = ref<HTMLElement | null>(null)

const isFolder = computed(() => props.node.type === "folder")
const isLink = computed(() => props.node.type === "link")
const isExpanded = computed(() => props.expandedIds.includes(props.node.id))
const isActiveDoc = computed(() => props.node.type === "doc" && props.activeDocId === props.node.id)
const isSelectedNode = computed(() => props.selectedNodeId === props.node.id)
const rowPaddingLeft = computed(() => `${12 + props.depth * 16}px`)
const isDraggingNode = computed(() => props.draggingNodeId === props.node.id)
const isDropTarget = computed(() => props.dropTargetId === props.node.id)
const actionDisabled = computed(() => !props.canEdit)

const isRenaming = computed(() => !!props.renamingNodeId && props.renamingNodeId === props.node.id)

/**
 * 行内改名时把「后代聚焦环」从 2px 收到 1px：实测方向键导航时行并不匹配 :focus-visible
 * （焦点是程序化 focus 移过去的，Chromium 不认），所以这圈环实际只在改名时亮——它是
 * 编辑态提示而非键盘可达性指示器，按提示定强度即可。Tab 走到行内 ⋯/👁/+ 按钮时仍是
 * 2px，键盘可达性不降级。
 */
const rowRingWidthClass = computed(() =>
  isRenaming.value ? "has-[:focus-visible]:ring-1" : "has-[:focus-visible]:ring-2"
)

const rowStateClass = computed(() => {
  // 对齐语雀桌面端：激活/选中均为浅灰圆角底，不用蓝底+左色条
  if (isActiveDoc.value) {
    return "border-transparent bg-grey-300 text-ink"
  }

  if (isSelectedNode.value) {
    return "border-transparent bg-grey-200 text-ink"
  }

  return "border-transparent text-ink-secondary hover:bg-grey-200 hover:text-ink"
})

const actionGroupClass = computed(() => {
  // 对齐语雀：操作图标只在 hover / 键盘 focus-visible 时浮现（选中行不再常显，
  // 程序化恢复焦点也不浮现）；has-[:focus-visible] 而非 focus-within，
  // 避免持久化焦点恢复（focusVisible:false 的 programmatic focus）触发浮现
  return "translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-has-[:focus-visible]:translate-x-0 group-has-[:focus-visible]:opacity-100"
})

const dropIndicatorClass = computed(() => {
  if (!isDropTarget.value || !props.dropPosition) {
    return ""
  }

  if (props.dropPosition === "before" || props.dropPosition === "after") {
    return "border-transparent bg-brand-faint/60"
  }

  return "border-brand-lighter bg-brand-faint ring-2 ring-inset ring-brand-lighter"
})

const dropPreviewOffsetStyle = computed(() => ({
  paddingLeft: rowPaddingLeft.value,
}))

const syncRowRegistry = () => {
  if (!rowRef.value) {
    return
  }

  emit("register-row", {
    item: {
      node: props.node,
      nodeId: props.node.id,
      element: rowRef.value,
      depth: props.depth,
      parentId: props.node.parentId ?? null,
      type: props.node.type,
      index: 0,
    },
  })
}

const showNodeMenuAt = (x: number, y: number, mode: KnowledgeNodeMenuMode = "actions") => {
  emit("show-node-menu", {
    node: props.node,
    x,
    y,
    mode,
  })
}

const handleRowContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  emit("focus-node", props.node)
  showNodeMenuAt(event.clientX, event.clientY, "actions")
}

const handleClickName = () => {
  namePressOrigin = null

  if (suppressNextNameClick) {
    suppressNextNameClick = false
    return
  }

  emit("focus-node", props.node)

  if (props.node.type === "folder") {
    emit("toggle-folder", props.node.id)
    return
  }

  if (props.node.type === "link") {
    if (props.node.url) {
      window.open(props.node.url, "_blank", "noopener")
    }
    return
  }

  emit("open-doc", props.node.id)
}

const handleMoreMenuClick = (event: MouseEvent) => {
  const trigger = event.currentTarget as HTMLElement | null

  if (!trigger) {
    return
  }

  emit("focus-node", props.node)
  const rect = trigger.getBoundingClientRect()
  showNodeMenuAt(rect.right + 6, rect.top + rect.height - 4, "actions")
}

const handlePlusClick = (event: MouseEvent) => {
  // 语雀的 + 对目录行是添加子内容（弹创建菜单），对文档行是直接新建同级文档
  if (!isFolder.value) {
    if (actionDisabled.value) {
      return
    }

    emit("focus-node", props.node)
    emit("create-child", { parentId: props.node.parentId ?? null, type: "doc" })
    return
  }

  handleCreateMenuClick(event)
}

const handleCreateMenuClick = (event: MouseEvent) => {
  if (actionDisabled.value) {
    return
  }

  const trigger = event.currentTarget as HTMLElement | null

  if (!trigger) {
    return
  }

  emit("focus-node", props.node)
  const rect = trigger.getBoundingClientRect()
  showNodeMenuAt(rect.right + 6, rect.top + rect.height - 4, "create")
}

/** 拖拽把手即名称按钮：按住移动过（视为拖拽）后，随后的 click 不应再打开/折叠 */
let namePressOrigin: { x: number; y: number } | null = null
let suppressNextNameClick = false

const handleDragHandlePointerDown = (event: PointerEvent) => {
  namePressOrigin = { x: event.clientX, y: event.clientY }
  suppressNextNameClick = false

  if (props.dragDisabled || event.button !== 0) {
    return
  }

  emit("drag-start-node", {
    node: props.node,
    event,
  })
}

const handleDragHandlePointerMove = (event: PointerEvent) => {
  if (!namePressOrigin || suppressNextNameClick) {
    return
  }

  if (Math.hypot(event.clientX - namePressOrigin.x, event.clientY - namePressOrigin.y) >= 6) {
    suppressNextNameClick = true
  }
}

onMounted(() => {
  void nextTick(syncRowRegistry)
})

// 刷新文档树会整体替换节点对象而组件实例被复用（:key 不变），
// 若只在 mount 时注册，注册表会残留旧 node/parentId/index，拖拽落点据此算错
watch(
  // index 变化 = 兄弟节点增删/移位：注册表索引需同步，否则拖拽落点计算用到旧值
  () => [props.node, props.depth, props.index] as const,
  () => {
    void nextTick(syncRowRegistry)
  }
)

onBeforeUnmount(() => {
  emit("unregister-row", { nodeId: props.node.id })
})
</script>

<template>
  <div class="relative">
    <div
      v-if="isDropTarget && dropPosition === 'before'"
      class="pointer-events-none absolute inset-x-2 top-0 z-10 -translate-y-1/2"
      :style="dropPreviewOffsetStyle"
    >
      <span class="block h-[2px] rounded-full bg-gradient-to-r from-brand-lighter/0 via-brand to-brand" />
    </div>

    <div
      :id="`knowledge-tree-node-${node.id}`"
      ref="rowRef"
      class="group relative z-1 flex min-h-8 items-center gap-1 rounded-kb-sm border px-2 py-1 text-[13px] transition duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-lighter has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-brand-lighter"
      role="treeitem"
      :aria-level="depth + 1"
      :aria-selected="isSelectedNode"
      :aria-current="isActiveDoc ? 'page' : undefined"
      :aria-expanded="isFolder ? isExpanded : undefined"
      :tabindex="isSelectedNode ? 0 : -1"
      :data-knowledge-node-id="node.id"
      data-knowledge-tree-row
      :class="[
        rowStateClass,
        rowRingWidthClass,
        isDraggingNode ? 'scale-[0.99] opacity-40 shadow-lg ring-1 ring-brand/30' : '',
        isDropTarget ? 'translate-x-[1px]' : '',
        dropIndicatorClass,
      ]"
      :style="{ paddingLeft: rowPaddingLeft }"
      @focusin="emit('focus-node', node)"
      @contextmenu="handleRowContextMenu"
    >
      <button
        v-if="isFolder"
        type="button"
        class="rounded-kb-xs p-0.5 text-ink-quaternary transition duration-150 hover:bg-grey-200 hover:text-ink-secondary"
        :aria-label="isExpanded ? '折叠目录' : '展开目录'"
        @click="emit('toggle-folder', node.id)"
      >
        <Icon v-if="isExpanded" icon="ph:caret-down" :width="12" :height="12" />
        <Icon v-else icon="ph:caret-right" :width="12" :height="12" />
      </button>
      <span v-else class="w-4 shrink-0" />

      <KnowledgeInlineTitleInput
        v-if="isRenaming"
        :value="node.title"
        aria-label="重命名"
        @finish="payload => emit('rename-finish', { node, ...payload })"
      />
      <button
        v-else
        type="button"
        class="flex min-w-0 flex-1 items-center rounded-kb-xs text-left outline-none"
        :data-knowledge-tree-drag-handle="dragDisabled ? undefined : ''"
        :title="dragDisabled ? undefined : '拖拽排序'"
        @pointerdown.stop.prevent="handleDragHandlePointerDown"
        @pointermove="handleDragHandlePointerMove"
        @click="handleClickName"
      >
        <span class="truncate text-[14px] font-medium leading-5" :title="node.title">{{ node.title }}</span>
      </button>

      <!-- 对齐语雀桌面端：行 hover 浮现 ⋯（更多）/ 👁（阅读）/ +（新建）；
           覆盖在行右缘而非在 flex 流内常驻占位——语雀标题可用宽约为列宽 80%，
           占位会把长标题提前截断到一半多。bg-inherit 跟随行的 hover/激活底色以遮住尾字。
           指针门禁用静态类而非 group-hover 变体：容器让出指针（不挡行尾标题点击），
           按钮自身恒 auto——要点到按钮指针必然在行内，此时图标已随 hover 浮现 -->
      <div
        v-if="!isRenaming && !isDropTarget"
        data-knowledge-tree-actions
        class="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-r-kb-sm bg-inherit py-0.5 pl-3 transition duration-150"
        :class="actionGroupClass"
      >
        <button
          type="button"
          class="pointer-events-auto rounded-kb-sm border border-transparent p-1 text-ink-quaternary transition duration-150 hover:bg-grey-300 hover:text-ink-secondary focus-visible:bg-grey-300 focus-visible:text-ink-secondary focus-visible:outline-none"
          title="更多操作"
          aria-label="更多操作"
          @click="handleMoreMenuClick"
        >
          <Icon icon="ph:dots-three-vertical" :width="12" :height="12" />
        </button>
        <button
          v-if="!isFolder && node.editorType !== 'board' && !isLink"
          type="button"
          class="pointer-events-auto rounded-kb-sm border border-transparent p-1 text-ink-quaternary transition duration-150 hover:bg-grey-300 hover:text-ink-secondary focus-visible:bg-grey-300 focus-visible:text-ink-secondary focus-visible:outline-none"
          title="阅读模式"
          aria-label="阅读模式"
          @click="emit('preview-doc', node)"
        >
          <Icon icon="ph:eye" :width="12" :height="12" />
        </button>
        <button
          type="button"
          class="pointer-events-auto rounded-kb-sm border border-transparent p-1 text-ink-quaternary transition duration-150 hover:bg-grey-300 hover:text-ink-secondary focus-visible:bg-grey-300 focus-visible:text-ink-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-quaternary"
          :disabled="actionDisabled"
          :title="isFolder ? '添加内容' : '新建同级文档'"
          :aria-label="isFolder ? '添加内容' : '新建同级文档'"
          @click="handlePlusClick"
        >
          <Icon icon="ph:plus" :width="12" :height="12" />
        </button>
      </div>
    </div>

    <div
      v-if="isDropTarget && dropPosition === 'inside'"
      class="pointer-events-none px-3 pt-1"
      :style="dropPreviewOffsetStyle"
    >
      <div class="h-6 rounded-kb-md border border-brand-lighter bg-brand-faint" />
    </div>

    <div
      v-if="isDropTarget && dropPosition === 'after'"
      class="pointer-events-none absolute inset-x-2 bottom-0 z-10 translate-y-1/2"
      :style="dropPreviewOffsetStyle"
    >
      <span class="block h-[2px] rounded-full bg-gradient-to-r from-brand-lighter/0 via-brand to-brand" />
    </div>
  </div>
</template>

<style>
/* 树行键盘焦点用行内的柔和 ring 呈现（focus-visible ring），压过 style.css
   的 unlayered 全局 :focus-visible 绿色描边（特异性更高的属性+伪类选择器） */
[data-knowledge-tree-row]:focus-visible,
[data-knowledge-tree-row]:has(:focus-visible) {
  outline: none;
}

/* 触屏无 hover：操作图标永不浮现，但按钮是恒 pointer-events-auto 的（桌面端要靠它
   在 hover 态可点）。标题现已铺满行宽、尾字正压在隐形按钮下，触屏点尾字会误开
   菜单/新建。无 hover 能力时把整组指针交还标题——触屏走长按 contextmenu，同源菜单。
   写在本块（unlayered）而非 Tailwind 变体：@layer utilities 会输给同层的其它声明，
   顺序敏感 */
@media (hover: none) {
  [data-knowledge-tree-actions] button {
    pointer-events: none;
  }
}
</style>

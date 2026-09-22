<script setup lang="ts">
/** 组件，负责知识树分支相关界面展示与交互。 */
import type {
  KnowledgeDocumentTreeNode,
  KnowledgeDocumentType,
} from "@/services/knowledge-documents"
import KnowledgeTreeNode from "@/components/knowledge/KnowledgeTreeNode.vue"
import type { TreeDropTarget, TreeRowRegistryItem } from "./tree-dnd"

defineOptions({
  name: "KnowledgeTreeBranch",
})

type KnowledgeNodeMenuMode = "actions" | "create"
type KnowledgeCreateChildType = KnowledgeDocumentType | "board"
type KnowledgeNodeMenuPayload = {
  node: KnowledgeDocumentTreeNode
  x: number
  y: number
  mode: KnowledgeNodeMenuMode
}

defineProps<{
  nodes: KnowledgeDocumentTreeNode[]
  depth: number
  parentId: string | null
  parentNode?: KnowledgeDocumentTreeNode | null
  expandedIds: string[]
  activeDocId: string | null
  selectedNodeId?: string | null
  draggingNodeId?: string | null
  dropTarget?: TreeDropTarget | null
  dragDisabled?: boolean
  canEdit?: boolean
  renamingNodeId?: string | null
}>()

const emit = defineEmits<{
  (event: "toggle-folder", id: string): void
  (event: "open-doc", id: string): void
  (event: "focus-node", node: KnowledgeDocumentTreeNode): void
  (
    event: "create-child",
    payload: { parentId: string | null; type: KnowledgeCreateChildType },
  ): void
  (
    event: "rename-finish",
    payload: { node: KnowledgeDocumentTreeNode; title: string; committed: boolean },
  ): void
  (event: "move-node", node: KnowledgeDocumentTreeNode): void
  (event: "delete-node", node: KnowledgeDocumentTreeNode): void
  (event: "copy-link-node", node: KnowledgeDocumentTreeNode): void
  (event: "preview-doc", node: KnowledgeDocumentTreeNode): void
  (event: "show-node-menu", payload: KnowledgeNodeMenuPayload): void
  (
    event: "drag-start-node",
    payload: { node: KnowledgeDocumentTreeNode; event: PointerEvent },
  ): void
  (
    event: "register-row",
    payload: { item: TreeRowRegistryItem; parentId: string | null; depth: number; index: number },
  ): void
  (event: "unregister-row", payload: { nodeId: string }): void
}>()

const registerRow = (payload: {
  item: TreeRowRegistryItem
  parentId: string | null
  depth: number
  index: number
}) => {
  emit("register-row", payload)
}

const unregisterRow = (payload: { nodeId: string }) => {
  emit("unregister-row", payload)
}
</script>

<template>
  <div
    class="space-y-1"
    data-knowledge-tree-branch
    :data-knowledge-tree-branch-parent-id="parentId ?? ''"
  >
    <div
      v-for="(node, index) in nodes"
      :key="node.id"
      class="space-y-0.5"
      data-knowledge-tree-item
      :data-knowledge-tree-item-node-id="node.id"
    >
      <KnowledgeTreeNode
        :node="node"
        :depth="depth"
        :index="index"
        :expanded-ids="expandedIds"
        :active-doc-id="activeDocId"
        :selected-node-id="selectedNodeId"
        :dragging-node-id="draggingNodeId"
        :drop-target-id="dropTarget?.nodeId ?? null"
        :drop-position="
          dropTarget?.position && dropTarget.nodeId === node.id ? dropTarget.position : null
        "
        :drag-disabled="dragDisabled"
        :can-edit="canEdit"
        :renaming-node-id="renamingNodeId"
        @toggle-folder="emit('toggle-folder', $event)"
        @open-doc="emit('open-doc', $event)"
        @focus-node="emit('focus-node', $event)"
        @create-child="emit('create-child', $event)"
        @rename-finish="emit('rename-finish', $event)"
        @move-node="emit('move-node', $event)"
        @delete-node="emit('delete-node', $event)"
        @copy-link-node="emit('copy-link-node', $event)"
        @preview-doc="emit('preview-doc', $event)"
        @show-node-menu="emit('show-node-menu', $event)"
        @drag-start-node="emit('drag-start-node', $event)"
        @register-row="registerRow({ ...$event, parentId, depth, index })"
        @unregister-row="unregisterRow($event)"
      />

      <div v-if="node.type === 'folder' && expandedIds.includes(node.id)" role="group">
        <KnowledgeTreeBranch
          :nodes="node.children"
          :depth="depth + 1"
          :parent-id="node.id"
          :parent-node="node"
          :expanded-ids="expandedIds"
          :active-doc-id="activeDocId"
          :selected-node-id="selectedNodeId"
          :dragging-node-id="draggingNodeId"
          :drop-target="dropTarget"
          :drag-disabled="dragDisabled"
          :can-edit="canEdit"
          :renaming-node-id="renamingNodeId"
          @toggle-folder="emit('toggle-folder', $event)"
          @open-doc="emit('open-doc', $event)"
          @focus-node="emit('focus-node', $event)"
          @create-child="emit('create-child', $event)"
          @rename-finish="emit('rename-finish', $event)"
          @move-node="emit('move-node', $event)"
          @delete-node="emit('delete-node', $event)"
          @copy-link-node="emit('copy-link-node', $event)"
          @preview-doc="emit('preview-doc', $event)"
          @show-node-menu="emit('show-node-menu', $event)"
          @drag-start-node="emit('drag-start-node', $event)"
          @register-row="emit('register-row', $event)"
          @unregister-row="emit('unregister-row', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 知识库文档树「移动节点」对话框（对齐语雀「移动至」形态）。
 *
 * 顶部搜索按目录名 / 路径过滤（命中目录及其祖先可见并自动展开），
 * 主体为可展开的目录树：根目录行 + 文件夹行（移动节点自身子树不出现），
 * 点击行即选中目标；布局经 expose 的 open(node) 打开，移动成功后调用
 * 注入的 refreshTree 刷新目录。
 *
 * T9 起内脏为裸 el-dialog + useDialogBehavior（AppDialog 已解散）：行为收编
 * （滚动锁 / data-autofocus 宏任务聚焦——顶部原生 input 带标记 / IME Esc 守卫）
 * 走 composable，Esc 栈顶与焦点还原接受 EP 原生；chrome 类由 bindings 携带，
 * 语雀对话框观感在全局校准层 el-dialog 段。
 */
import { computed, ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import { getApiErrorMessage } from "@/services/http-client"
import {
  updateKnowledgeDocument,
  type KnowledgeDocumentTreeNode,
} from "@/services/knowledge-documents"
import { useTransientToast } from "@/composables/use-transient-toast"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import { canDropTreeNode, findTreeNode } from "@/components/knowledge/tree-utils"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"

type FolderNodeInfo = {
  id: string
  type: string
  title: string
  path: string
  children: FolderNodeInfo[]
}

type FolderRow = {
  id: string
  type: string
  title: string
  depth: number
  hasChildren: boolean
  expanded: boolean
}

const props = defineProps<{
  treeNodes: KnowledgeDocumentTreeNode[]
  canEdit: boolean
  refreshTree: () => Promise<void>
}>()

const { showToastMessage } = useTransientToast()

const open = ref(false)
const movingNode = ref<KnowledgeDocumentTreeNode | null>(null)
const movingTargetId = ref("")
const movingSubmitting = ref(false)
const keyword = ref("")
const expandedIds = ref(new Set<string>())

const collectDescendantIds = (node: KnowledgeDocumentTreeNode): string[] => {
  const ids: string[] = []

  const walk = (target: KnowledgeDocumentTreeNode) => {
    ids.push(target.id)

    target.children.forEach((child) => {
      walk(child)
    })
  }

  walk(node)

  return ids
}

const excludedIds = computed(() => {
  const node = movingNode.value

  return node ? new Set(collectDescendantIds(node)) : new Set<string>()
})

/**
 * 排除移动节点自身子树后的可选目标树（path 用于搜索与展示）。
 * 目标口径与拖拽完全一致（canDropTreeNode 单一事实源）：分组任意层级；
 * 「文档挂文档」规则内允许把文档挂到文档下（最多两级），与拖拽能力对齐——
 * 此前只列分组，同一移动操作两个入口两种能力。
 */
const allowedFolderTree = computed<FolderNodeInfo[]>(() => {
  const excluded = excludedIds.value
  const source = movingNode.value

  const isAllowedTarget = (item: KnowledgeDocumentTreeNode): boolean => {
    if (excluded.has(item.id) || (item.type !== "folder" && item.type !== "doc")) {
      return false
    }
    // 二级文档（父级也是文档）不能再作父级——后端 parentRuleViolation 会 403，
    // canDropTreeNode 不查这一层，这里显式对齐
    if (item.type === "doc" && item.parentId) {
      const parent = findTreeNode(props.treeNodes, item.parentId)
      if (parent?.type === "doc") {
        return false
      }
    }
    if (!source) {
      return item.type === "folder"
    }
    return canDropTreeNode(props.treeNodes, source, {
      nodeId: item.id,
      parentId: item.parentId,
      position: "inside",
    })
  }

  const walk = (nodes: KnowledgeDocumentTreeNode[], prefix: string): FolderNodeInfo[] =>
    nodes.filter(isAllowedTarget).map((item) => {
      const path = prefix ? `${prefix} / ${item.title}` : item.title

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        path,
        children: walk(item.children, path),
      }
    })

  return walk(props.treeNodes, "")
})

const visibleRows = computed<FolderRow[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  const searching = kw.length > 0
  const rows: FolderRow[] = []

  const subtreeHasMatch = (node: FolderNodeInfo): boolean =>
    node.path.toLowerCase().includes(kw) || node.children.some((child) => subtreeHasMatch(child))

  const visit = (nodes: FolderNodeInfo[], depth: number) => {
    nodes.forEach((node) => {
      if (searching && !subtreeHasMatch(node)) {
        return
      }

      rows.push({
        id: node.id,
        type: node.type,
        title: node.title,
        depth,
        hasChildren: node.children.length > 0,
        expanded: searching ? true : expandedIds.value.has(node.id),
      })

      if (searching || expandedIds.value.has(node.id)) {
        visit(node.children, depth + 1)
      }
    })
  }

  visit(allowedFolderTree.value, 0)

  return rows
})

const toggleExpand = (id: string) => {
  const next = new Set(expandedIds.value)

  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }

  expandedIds.value = next
}

const rowClass = (selected: boolean) =>
  selected ? "bg-fill-muted text-ink" : "text-ink-secondary hover:bg-fill-subtle"

const closeMoveDialog = () => {
  open.value = false
  movingNode.value = null
  movingTargetId.value = ""
  keyword.value = ""
}

const submitMove = async () => {
  if (!props.canEdit) {
    showToastMessage("当前角色没有编辑权限。", "error")
    return
  }

  if (!movingNode.value) {
    return
  }

  // 目标与当前所在目录一致：无需请求，直接关闭
  if ((movingTargetId.value || "") === (movingNode.value.parentId ?? "")) {
    closeMoveDialog()
    return
  }

  movingSubmitting.value = true

  try {
    await updateKnowledgeDocument(movingNode.value.id, {
      parentId: movingTargetId.value || null,
    })
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "移动失败。"), "error")
    movingSubmitting.value = false
    return
  }

  // 移动已在服务端生效；仅刷新树失败时单独提示，不能误报「移动失败」
  showToastMessage("移动成功。", "success")
  try {
    await props.refreshTree()
  } catch {
    showToastMessage("移动成功，但目录刷新失败，请手动刷新。", "info")
  }
  closeMoveDialog()
  movingSubmitting.value = false
}

const openDialog = (node: KnowledgeDocumentTreeNode) => {
  if (!props.canEdit) {
    showToastMessage("当前角色没有编辑权限。", "error")
    return
  }

  movingNode.value = node
  movingTargetId.value = node.parentId ?? ""
  keyword.value = ""

  const all = new Set<string>()

  const walk = (nodes: KnowledgeDocumentTreeNode[]) => {
    nodes.forEach((item) => {
      if (item.type === "folder") {
        all.add(item.id)
        walk(item.children)
      }
    })
  }

  walk(props.treeNodes)
  expandedIds.value = all
  open.value = true
}

defineExpose({
  open: openDialog,
})

const dialog = useDialogBehavior({
  open: () => open.value,
})
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    v-model="open"
    class="max-w-md"
    title="移动至"
    close-on-click-modal
    close-on-press-escape
  >
    <template #header>
      <KbDialogHeader title="移动至" @close="closeMoveDialog" />
    </template>

    <div class="space-y-3">
      <div class="relative">
        <el-input
          v-model="keyword"
          type="text"
          data-autofocus
          placeholder="输入名称或路径搜索"
          class="py-2 pl-9"
        />
        <Icon
          icon="ph:magnifying-glass"
          :width="14"
          :height="14"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-quaternary"
        />
      </div>

      <div
        class="max-h-[320px] overflow-y-auto rounded-kb-2xl border border-line bg-surface-soft p-2"
      >
        <button
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-kb-md px-2 text-left text-[13px] transition"
          :class="rowClass(movingTargetId === '')"
          @click="movingTargetId = ''"
        >
          <span class="w-5 shrink-0" />
          <Icon
            icon="ph:book-open-text"
            :width="14"
            :height="14"
            class="shrink-0 text-ink-tertiary"
          />
          <span class="truncate">根目录</span>
        </button>

        <div
          v-for="row in visibleRows"
          :key="row.id"
          role="button"
          tabindex="0"
          class="flex h-8 w-full cursor-pointer items-center gap-1 rounded-kb-md pr-2 text-left text-[13px] transition"
          :class="rowClass(movingTargetId === row.id)"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          @click="movingTargetId = row.id"
          @keydown.enter.prevent="movingTargetId = row.id"
          @keydown.space.prevent="movingTargetId = row.id"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-quaternary transition hover:bg-grey-200 hover:text-ink"
            :title="row.expanded ? '收起' : '展开'"
            @click.stop="toggleExpand(row.id)"
          >
            <Icon
              icon="ph:caret-right"
              :width="11"
              :height="11"
              class="transition-transform"
              :class="row.expanded ? 'rotate-90' : ''"
            />
          </button>
          <span v-else class="w-5 shrink-0" />
          <Icon
            :icon="row.type === 'folder' ? 'ph:folder' : 'ph:file-text'"
            :width="14"
            :height="14"
            class="shrink-0 text-ink-tertiary"
          />
          <span class="truncate">{{ row.title }}</span>
        </div>

        <div
          v-if="visibleRows.length === 0"
          class="px-3 py-8 text-center text-[13px] text-ink-quaternary"
        >
          没有匹配的目标
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <el-button plain @click="closeMoveDialog"><span class="truncate">取消</span> </el-button>
        <el-button type="primary" :loading="movingSubmitting" @click="submitMove"
          ><template #loading
            ><Icon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">确定</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

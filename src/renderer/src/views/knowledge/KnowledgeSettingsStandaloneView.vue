<script setup lang="ts">
/**
 * 页面组件：知识库设置的独立窗口壳（主窗口「更多设置」以 /kb-settings/:kbId
 * 经桌面桥 openDocumentInNewWindow 打开的「只含设置功能」窗口）。
 * 与完整工作台壳共享 useWorkspaceLoader 的加载与权限链路，但加载触发在本壳；
 * 新建/模板/打开文档等能力不会被设置页触达，统一兜底为主窗工作台新窗口打开。
 */
import { computed, provide, ref, watch } from "vue"
import { useRoute } from "vue-router"
import KnowledgeSettingsView from "./KnowledgeSettingsView.vue"
import { useWorkspaceLoader } from "./use-workspace-loader"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import { knowledgeWorkspaceContextKey, type KnowledgeWorkspaceContext } from "./workspace-context"

const route = useRoute()

const kbId = computed(() => (typeof route.params.kbId === "string" ? route.params.kbId : ""))
const treeNodes = ref<KnowledgeDocumentTreeNode[]>([])
const expandedFolderIds = ref<string[]>([])
const focusedNodeId = ref<string | null>(null)
// 独立设置壳没有目录树 UI，也没有展开状态存档（false → 树加载完自动展开全部目录，本壳无感）
const hasStoredExpandedFolderIds = ref(false)

const {
  knowledgeBase,
  permissions,
  errorMessage,
  refreshTree,
  refreshPermissions,
  refreshWorkspace,
} = useWorkspaceLoader({
  kbId,
  treeNodes,
  expandedFolderIds,
  hasStoredExpandedFolderIds,
  focusedNodeId,
  // 独立设置壳没有目录树 UI，展开初始化走哪个分支都无感；直接回退全展开兜底
  getDefaultExpandLevel: () => knowledgeBase.value?.settings?.defaultExpandLevel,
  applyProgrammaticExpandedFolderIds: (folderIds) => {
    expandedFolderIds.value = folderIds
  },
  ensureNodeAncestorsExpanded: () => {},
  ensureFocusedNode: () => {},
  showToastMessage: () => {},
})

// 加载触发在本壳（完整工作台壳由 layout 的 watch 负责，复用 loader 不复用其触发）：
// 不触发则 permissions/knowledgeBase 恒为 null，设置页按「无权限」禁用全部控件
watch(
  kbId,
  (id) => {
    if (id) {
      void refreshWorkspace()
    }
  },
  { immediate: true },
)

const openInNewWindow = (path: string) => {
  if (window.xiaoyeDesktop?.openDocumentInNewWindow) {
    window.xiaoyeDesktop.openDocumentInNewWindow(path)
    return
  }
  window.open(path, "_blank")
}

// 独立窗口内新建/模板/打开文档等能力不会被设置页触达，兜底语义为主窗工作台
provide(knowledgeWorkspaceContextKey, {
  kbId,
  knowledgeBase,
  treeNodes,
  permissions,
  refreshWorkspace,
  refreshTree,
  refreshPermissions,
  createNode: () => openInNewWindow(`/knowledge/${kbId.value}`),
  openTemplateLibrary: () => openInNewWindow(`/knowledge/${kbId.value}/templates`),
  openDoc: (docId: string) => openInNewWindow(`/knowledge/${kbId.value}/doc/${docId}`),
} satisfies KnowledgeWorkspaceContext)
</script>

<template>
  <!-- 设置页本体自带「左子导航 + 右内容」全宽两列（与语雀设置窗同构），
       壳只铺满窗口不再限宽居中——否则宽窗里两侧各 ~300px 空白 -->
  <div class="h-full min-h-0">
    <KnowledgeSettingsView v-if="!errorMessage" />
    <!-- 加载失败（知识库不存在或无权限等）：独立窗口没有可回退的工作台上下文，直接呈现错误 -->
    <div v-else class="flex h-full items-center justify-center bg-surface p-6">
      <p class="text-sm text-ink-secondary">{{ errorMessage }}</p>
    </div>
  </div>
</template>

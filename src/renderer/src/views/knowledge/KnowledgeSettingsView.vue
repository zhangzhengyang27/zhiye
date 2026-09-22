<!-- 组件说明：KnowledgeSettingsView 组件，负责知识库管理页（概要/文档/成员/回收站/设置）。 -->
<script setup lang="ts">
/**
 * 页面组件：对齐语雀桌面端的知识库管理二级页——整页呈现，左侧
 * 「返回 + 知识库名 + 五个分区」子导航，右侧为分区内容。
 * 概要聚合统计卡 / 成员概览 / 知识库信息；文档、成员、设置复用原卡片；
 * 回收站直接跳转独立回收站页（全局回收站支持按知识库筛选）。
 */
import { computed, inject, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeSettingsAddMemberDialog from "@/components/knowledge/settings/KnowledgeSettingsAddMemberDialog.vue"
import KnowledgeSettingsDocsCard from "@/components/knowledge/settings/KnowledgeSettingsDocsCard.vue"
import KnowledgeSettingsInfoCard from "@/components/knowledge/settings/KnowledgeSettingsInfoCard.vue"
import KnowledgeSettingsMembersCard from "@/components/knowledge/settings/KnowledgeSettingsMembersCard.vue"
import KnowledgeSettingsVisibilityCard from "@/components/knowledge/settings/KnowledgeSettingsVisibilityCard.vue"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import {
  getTreeSnapshot,
  listTreeSnapshots,
  restoreTreeSnapshot,
  type TreeSnapshotDetail,
  type TreeSnapshotItem,
} from "@/services/knowledge-tree-snapshots"
import { useTransientToast } from "@/composables/use-transient-toast"
import { formatDateTime, formatNumber } from "@/utils/date-format"
import {
  addKnowledgeBaseMember,
  getKnowledgeBaseMembers,
  removeKnowledgeBaseMember,
  updateKnowledgeBaseMemberRole,
  updateKnowledgeBaseVisibility,
  type KnowledgeBaseMember,
} from "@/services/knowledge-permissions"
import type { KnowledgeDocumentTreeNode } from "@/services/knowledge-documents"
import { knowledgeWorkspaceContextKey } from "./workspace-context"

type EditableMemberRole = "admin" | "editor" | "reader"

const router = useRouter()
const workspaceContext = inject(knowledgeWorkspaceContextKey)

if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

/** 对齐语雀桌面端：管理页左侧子导航在五个分区之间切换 */
type SettingsSection = "summary" | "docs" | "members" | "history" | "settings"

const activeSection = ref<SettingsSection>("summary")

const sectionItems = [
  { key: "summary" as SettingsSection, label: "概要", icon: "ph:squares-four" },
  { key: "docs" as SettingsSection, label: "文档", icon: "ph:files" },
  { key: "members" as SettingsSection, label: "成员", icon: "ph:users-three" },
  { key: "history" as SettingsSection, label: "目录历史", icon: "ph:clock-counter-clockwise" },
  { key: "settings" as SettingsSection, label: "设置", icon: "ph:gear" },
]

const sectionTitle = computed(
  () => sectionItems.find((item) => item.key === activeSection.value)?.label ?? "概要",
)

const closeSettings = () => {
  router.replace({
    name: "knowledge-workspace-home",
    params: { kbId: workspaceContext.kbId.value },
  })
}

const goTrash = () => {
  void router.push({ name: "knowledge-trash" })
}

const { showToastMessage } = useTransientToast()

const loading = ref(false)
const members = ref<KnowledgeBaseMember[]>([])
const visibility = ref<"public" | "private">("private")
const showAddMemberDialog = ref(false)
const addMemberEmail = ref("")
const addMemberRole = ref<EditableMemberRole>("editor")
const addingMember = ref(false)
const updatingMemberId = ref<string | null>(null)
const removingMemberId = ref<string | null>(null)
const updatingVisibility = ref(false)

/** 待确认移除的成员：非空时弹出 ConfirmDialog，删除请求期间展示 loading */
const memberToRemove = ref<KnowledgeBaseMember | null>(null)
const removingMember = ref(false)

// ==================== 目录版本历史（B2c） ====================
const snapshots = ref<TreeSnapshotItem[]>([])
const snapshotsLoading = ref(false)
const selectedSnapshotId = ref<string | null>(null)
const selectedSnapshotDetail = ref<TreeSnapshotDetail | null>(null)
const detailLoading = ref(false)
const restoringSnapshot = ref(false)
/** 待确认恢复的快照：非空时弹 ConfirmDialog */
const snapshotToRestore = ref<TreeSnapshotItem | null>(null)

const loadSnapshots = async () => {
  snapshotsLoading.value = true
  try {
    snapshots.value = await listTreeSnapshots(workspaceContext.kbId.value)
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "目录历史加载失败。", "error")
  } finally {
    snapshotsLoading.value = false
  }
}

const selectSnapshot = async (snapshot: TreeSnapshotItem) => {
  selectedSnapshotId.value = snapshot.id
  selectedSnapshotDetail.value = null
  detailLoading.value = true
  try {
    const detail = await getTreeSnapshot(workspaceContext.kbId.value, snapshot.id)

    // 快点两条快照时，慢响应不能把另一条的树预览盖上去——用户会在错位的预览下确认恢复
    if (selectedSnapshotId.value !== snapshot.id) {
      return
    }
    selectedSnapshotDetail.value = detail
  } catch (error) {
    if (selectedSnapshotId.value !== snapshot.id) {
      return
    }
    showToastMessage(error instanceof Error ? error.message : "快照详情加载失败。", "error")
  } finally {
    if (selectedSnapshotId.value === snapshot.id) {
      detailLoading.value = false
    }
  }
}

const confirmRestoreSnapshot = async () => {
  const snapshot = snapshotToRestore.value
  if (!snapshot || restoringSnapshot.value) {
    return
  }

  restoringSnapshot.value = true
  try {
    const result = await restoreTreeSnapshot(workspaceContext.kbId.value, snapshot.id)
    showToastMessage(
      result.revived > 0
        ? `已恢复目录结构（${result.restored} 项，其中 ${result.revived} 个文档从回收站还原）。`
        : `已恢复目录结构（${result.restored} 项）。`,
      "success",
    )
    snapshotToRestore.value = null
    await workspaceContext.refreshTree()
    await loadSnapshots()
    if (selectedSnapshotId.value === snapshot.id) {
      await selectSnapshot(snapshot)
    }
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "恢复失败，请稍后重试。", "error")
  } finally {
    restoringSnapshot.value = false
  }
}

/** 快照节点 → 缩进树预览行 */
const snapshotTreeRows = computed(() => {
  const nodes = selectedSnapshotDetail.value?.data ?? []
  const childrenOf = new Map<
    string | null,
    TreeSnapshotItem["id"] extends never ? never : (typeof nodes)[number][]
  >()
  for (const node of nodes) {
    const key = node.parentId ?? "__root__"
    const list = childrenOf.get(key) ?? []
    list.push(node)
    childrenOf.set(key, list)
  }

  const rows: Array<{ node: (typeof nodes)[number]; depth: number }> = []
  const walk = (parentId: string | null, depth: number) => {
    for (const node of childrenOf.get(parentId ?? "__root__") ?? []) {
      rows.push({ node, depth })
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  // 孤儿（父节点在快照中缺失的非根节点）兜底展示
  for (const node of nodes) {
    if (
      node.parentId &&
      !nodes.some((candidate) => candidate.id === node.parentId) &&
      !rows.some((row) => row.node.id === node.id)
    ) {
      rows.push({ node, depth: 0 })
    }
  }
  return rows
})

watch(activeSection, (section) => {
  if (section === "history" && snapshots.value.length === 0) {
    void loadSnapshots()
  }
})

const memberRemoveOpen = computed({
  get: () => memberToRemove.value !== null,
  set: (open: boolean) => {
    if (!open) memberToRemove.value = null
  },
})

const roleOptions = [
  { value: "admin", label: "管理员", description: "可以管理成员并编辑文档" },
  { value: "editor", label: "编辑者", description: "可以编辑文档与目录结构" },
  { value: "reader", label: "阅读者", description: "只能查看知识库内容" },
] as const

const visibilityOptions = [
  { value: "private", label: "私有", icon: "ph:lock", description: "仅成员可见" },
  {
    value: "public",
    label: "公开",
    icon: "ph:globe",
    description: "所有人可见，编辑仍受成员角色控制",
  },
] as const

const currentUserRole = computed(() => workspaceContext.permissions.value?.role ?? null)
const canManage = computed(() => workspaceContext.permissions.value?.canManage ?? false)
const canEditContent = computed(() => workspaceContext.permissions.value?.canEdit ?? false)
const canChangeVisibility = computed(() => currentUserRole.value === "owner")

const syncVisibilityFromWorkspace = () => {
  visibility.value =
    workspaceContext.knowledgeBase.value?.visibility === "public" ? "public" : "private"
}

/** 概要统计：文档 / 字数来自详情接口的 stats，缺失时回退目录树计数 */
const summaryStats = computed(() => {
  const stats = workspaceContext.knowledgeBase.value?.stats

  const countTree = (predicate: (node: KnowledgeDocumentTreeNode) => boolean) => {
    let count = 0

    const walk = (nodes: KnowledgeDocumentTreeNode[]) => {
      nodes.forEach((node) => {
        if (predicate(node)) {
          count += 1
        }

        walk(node.children)
      })
    }

    walk(workspaceContext.treeNodes.value)
    return count
  }

  return [
    {
      key: "docs",
      label: "文档",
      value: formatNumber(stats?.docCount ?? countTree((node) => node.type === "doc")),
    },
    { key: "words", label: "字数", value: formatNumber(stats?.wordCount ?? 0) },
    { key: "members", label: "成员", value: formatNumber(members.value.length) },
  ]
})

const memberRoleLabel = (role: string) =>
  roleOptions.find((option) => option.value === role)?.label ?? (role === "owner" ? "所有者" : role)

const loadMembers = async () => {
  const requestedKbId = workspaceContext.kbId.value

  loading.value = true

  try {
    const result = await getKnowledgeBaseMembers(requestedKbId)

    if (requestedKbId !== workspaceContext.kbId.value) {
      return
    }
    members.value = result
  } catch (error) {
    if (requestedKbId !== workspaceContext.kbId.value) {
      return
    }
    showToastMessage(error instanceof Error ? error.message : "加载成员列表失败", "error")
  } finally {
    if (requestedKbId === workspaceContext.kbId.value) {
      loading.value = false
    }
  }
}

const handleAddMember = async () => {
  if (!canManage.value) {
    showToastMessage("当前角色没有成员管理权限", "error")
    return
  }

  if (!addMemberEmail.value.trim()) {
    showToastMessage("请输入邮箱地址", "error")
    return
  }

  addingMember.value = true

  try {
    await addKnowledgeBaseMember(workspaceContext.kbId.value, {
      email: addMemberEmail.value.trim(),
      role: addMemberRole.value,
    })

    await Promise.all([loadMembers(), workspaceContext.refreshPermissions()])
    showToastMessage("成员添加成功", "success")
    showAddMemberDialog.value = false
    addMemberEmail.value = ""
    addMemberRole.value = "editor"
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "添加成员失败", "error")
  } finally {
    addingMember.value = false
  }
}

const handleRoleChange = async (
  member: KnowledgeBaseMember,
  nextRole: string | number | boolean | null | undefined,
) => {
  if (!canManage.value) {
    showToastMessage("当前角色没有成员管理权限", "error")
    return
  }

  if (member.role === "owner") {
    return
  }

  if (nextRole !== "admin" && nextRole !== "editor" && nextRole !== "reader") {
    return
  }

  if (member.role === nextRole) {
    return
  }

  updatingMemberId.value = member.userId

  try {
    await updateKnowledgeBaseMemberRole(workspaceContext.kbId.value, member.userId, {
      role: nextRole,
    })

    await Promise.all([loadMembers(), workspaceContext.refreshPermissions()])
    showToastMessage("成员角色已更新", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "更新成员角色失败", "error")
  } finally {
    updatingMemberId.value = null
  }
}

const handleRemoveMember = (member: KnowledgeBaseMember) => {
  if (!canManage.value) {
    showToastMessage("当前角色没有成员管理权限", "error")
    return
  }

  memberToRemove.value = member
}

const confirmRemoveMember = async () => {
  const member = memberToRemove.value

  if (!member || removingMember.value) {
    return
  }

  removingMember.value = true
  removingMemberId.value = member.userId

  try {
    await removeKnowledgeBaseMember(workspaceContext.kbId.value, member.userId)
    await Promise.all([loadMembers(), workspaceContext.refreshPermissions()])
    showToastMessage("成员已移除", "success")
    memberToRemove.value = null
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "移除成员失败", "error")
  } finally {
    removingMember.value = false
    removingMemberId.value = null
  }
}

const handleUpdateVisibility = async (newVisibility: "public" | "private") => {
  if (!canChangeVisibility.value) {
    showToastMessage("只有所有者可以修改可见性", "error")
    return
  }

  if (visibility.value === newVisibility) {
    return
  }

  updatingVisibility.value = true

  try {
    await updateKnowledgeBaseVisibility(workspaceContext.kbId.value, {
      visibility: newVisibility,
    })

    visibility.value = newVisibility

    if (workspaceContext.knowledgeBase.value) {
      workspaceContext.knowledgeBase.value = {
        ...workspaceContext.knowledgeBase.value,
        visibility: newVisibility,
      }
    }

    showToastMessage("可见性更新成功", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "更新可见性失败", "error")
  } finally {
    updatingVisibility.value = false
  }
}

watch(
  () => workspaceContext.kbId.value,
  () => {
    syncVisibilityFromWorkspace()
    void loadMembers()
  },
  { immediate: true },
)

watch(
  () => workspaceContext.knowledgeBase.value?.visibility,
  () => {
    syncVisibilityFromWorkspace()
  },
)

watch(canManage, (allowed) => {
  if (!allowed) {
    showAddMemberDialog.value = false
  }
})

onMounted(() => {
  syncVisibilityFromWorkspace()
})
</script>

<template>
  <!-- 对齐语雀桌面端：知识库管理是整页二级页（左侧子导航 + 右侧内容） -->
  <div class="flex h-full min-h-0 bg-surface">
    <aside class="flex w-56 shrink-0 flex-col border-r border-line bg-muted">
      <button
        type="button"
        class="flex items-center gap-1.5 px-4 pt-4 text-[13px] text-ink-tertiary transition hover:text-ink"
        @click="closeSettings"
      >
        <Icon icon="ph:caret-left" :width="14" :height="14" />
        返回
      </button>

      <div class="mt-3 flex items-center gap-2 px-4 pb-2">
        <Icon
          icon="ph:book-open-text"
          :width="15"
          :height="15"
          class="shrink-0 text-ink-tertiary"
        />
        <span class="min-w-0 truncate text-[13px] font-semibold text-ink">
          {{ workspaceContext.knowledgeBase.value?.name || "知识库管理" }}
        </span>
      </div>

      <div class="px-3 pb-2 pt-3 text-[12px] text-ink-quaternary">知识库管理</div>

      <nav class="space-y-0.5 px-2">
        <button
          v-for="item in sectionItems"
          :key="item.key"
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] transition"
          :class="
            activeSection === item.key
              ? 'bg-grey-300 font-medium text-ink'
              : 'text-ink-secondary hover:bg-grey-200 hover:text-ink'
          "
          @click="activeSection = item.key"
        >
          <Icon :icon="item.icon" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
          <span class="truncate">{{ item.label }}</span>
        </button>

        <button
          type="button"
          class="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-ink-secondary transition hover:bg-grey-200 hover:text-ink"
          @click="goTrash"
        >
          <Icon icon="ph:trash" :width="15" :height="15" class="shrink-0 text-ink-tertiary" />
          <span class="truncate">回收站</span>
        </button>
      </nav>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto">
      <div class="p-6">
        <h2 class="text-[16px] font-semibold text-ink">{{ sectionTitle }}</h2>

        <!-- 概要：统计卡 + 成员概览 + 知识库信息（对齐语雀概要页结构） -->
        <div v-if="activeSection === 'summary'" class="mt-4">
          <div class="grid grid-cols-3 gap-3">
            <div
              v-for="stat in summaryStats"
              :key="stat.key"
              class="rounded-[12px] border border-line bg-surface-soft px-4 py-3.5"
            >
              <p class="text-[12px] text-ink-quaternary">{{ stat.label }}</p>
              <p
                class="mt-1 text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.02em] text-ink"
              >
                {{ stat.value }}
              </p>
            </div>
          </div>

          <div class="mt-5 rounded-[12px] border border-line bg-surface-soft p-4">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-[14px] font-semibold text-ink">成员</h3>
              <button
                type="button"
                class="text-[12px] text-brand transition hover:text-brand-hover"
                @click="activeSection = 'members'"
              >
                查看全部
              </button>
            </div>

            <div v-if="loading" class="mt-3 space-y-2">
              <div
                v-for="index in 3"
                :key="index"
                class="h-9 animate-pulse rounded-[8px] bg-grey-200"
              />
            </div>
            <ul v-else class="mt-2 divide-y divide-line">
              <li
                v-for="member in members"
                :key="member.userId"
                class="flex items-center gap-2.5 py-2"
              >
                <span
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-faint text-[11px] font-medium text-brand"
                >
                  {{ member.user.displayName.slice(0, 1).toUpperCase() }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {{ member.user.displayName }}
                  <span v-if="member.user.email" class="ml-1 text-[11px] text-ink-quaternary">
                    {{ member.user.email }}
                  </span>
                </span>
                <span
                  class="shrink-0 rounded-full bg-grey-200 px-2 py-0.5 text-[11px] text-ink-tertiary"
                >
                  {{ memberRoleLabel(member.role) }}
                </span>
              </li>
              <li
                v-if="members.length === 0"
                class="py-4 text-center text-[13px] text-ink-quaternary"
              >
                暂无成员
              </li>
            </ul>
          </div>

          <div class="mt-5 rounded-[12px] border border-line bg-surface-soft p-4">
            <h3 class="text-[14px] font-semibold text-ink">知识库信息</h3>
            <dl class="mt-3 space-y-2.5 text-[13px]">
              <div class="flex gap-3">
                <dt class="w-16 shrink-0 text-ink-quaternary">创建者</dt>
                <dd class="min-w-0 truncate text-ink-secondary">
                  {{ workspaceContext.knowledgeBase.value?.creator?.displayName || "—" }}
                </dd>
              </div>
              <div class="flex gap-3">
                <dt class="w-16 shrink-0 text-ink-quaternary">创建时间</dt>
                <dd class="min-w-0 truncate text-ink-secondary">
                  {{
                    workspaceContext.knowledgeBase.value?.createdAt
                      ? formatDateTime(workspaceContext.knowledgeBase.value.createdAt)
                      : "—"
                  }}
                </dd>
              </div>
              <div class="flex gap-3">
                <dt class="w-16 shrink-0 text-ink-quaternary">可见性</dt>
                <dd class="min-w-0 truncate text-ink-secondary">
                  {{ visibility === "public" ? "公开" : "私有" }}
                </dd>
              </div>
              <div class="flex gap-3">
                <dt class="w-16 shrink-0 text-ink-quaternary">描述</dt>
                <dd class="min-w-0 flex-1 text-ink-secondary">
                  {{ workspaceContext.knowledgeBase.value?.description || "暂无描述" }}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div v-else-if="activeSection === 'docs'" class="mt-4">
          <!-- 默认展开级别设置依赖 knowledgeBase（B4 #16），未加载完前不渲染卡片 -->
          <KnowledgeSettingsDocsCard
            v-if="workspaceContext.knowledgeBase.value"
            :nodes="workspaceContext.treeNodes.value"
            :can-trash="canEditContent"
            :knowledge-base="workspaceContext.knowledgeBase.value"
            @doc-trashed="() => workspaceContext.refreshTree()"
            @notify="(message, type) => showToastMessage(message, type ?? 'info')"
          />
        </div>

        <!-- 目录历史（B2c 对齐语雀目录管理 → 查看历史）：左快照列表 + 右树预览 + 恢复 -->
        <div v-else-if="activeSection === 'history'" class="mt-4">
          <div class="flex min-h-[360px] gap-4">
            <!-- 左：快照列表 -->
            <div class="w-64 shrink-0 space-y-1 overflow-y-auto">
              <p v-if="snapshotsLoading" class="px-2 py-6 text-[13px] text-ink-quaternary">
                加载中…
              </p>
              <p
                v-else-if="snapshots.length === 0"
                class="px-2 py-6 text-[13px] text-ink-quaternary"
              >
                还没有目录快照，目录结构发生变更后会自动记录。
              </p>
              <button
                v-for="snapshot in snapshots"
                :key="snapshot.id"
                type="button"
                class="w-full rounded-[10px] px-3 py-2.5 text-left transition"
                :class="selectedSnapshotId === snapshot.id ? 'bg-grey-300' : 'hover:bg-grey-200'"
                @click="selectSnapshot(snapshot)"
              >
                <p class="text-[13px] font-medium text-ink">
                  {{ formatDateTime(snapshot.createdAt) }}
                </p>
                <p class="mt-0.5 truncate text-[12px] text-ink-tertiary">
                  {{ snapshot.user.displayName }}
                </p>
              </button>
            </div>

            <!-- 右：快照树预览 + 恢复 -->
            <div class="min-w-0 flex-1 rounded-[12px] border border-line p-4">
              <p
                v-if="!selectedSnapshotId"
                class="py-10 text-center text-[13px] text-ink-quaternary"
              >
                从左侧选择一个快照查看当时的目录结构
              </p>
              <template v-else>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[13px] font-medium text-ink">
                    {{
                      selectedSnapshotDetail
                        ? formatDateTime(selectedSnapshotDetail.createdAt)
                        : "加载中…"
                    }}
                  </p>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center rounded-[8px] border border-line bg-surface px-3 text-[12px] font-medium text-ink-secondary transition hover:border-error-light hover:text-error disabled:cursor-not-allowed disabled:opacity-55"
                    :disabled="restoringSnapshot"
                    @click="
                      snapshotToRestore =
                        snapshots.find((item) => item.id === selectedSnapshotId) ?? null
                    "
                  >
                    <Icon icon="ph:arrow-counter-clockwise" :width="13" :height="13" class="mr-1" />
                    恢复到这个版本
                  </button>
                </div>

                <p v-if="detailLoading" class="py-10 text-center text-[13px] text-ink-quaternary">
                  加载中…
                </p>
                <div v-else class="mt-3 max-h-[380px] space-y-0.5 overflow-y-auto">
                  <p
                    v-for="row in snapshotTreeRows"
                    :key="row.node.id"
                    class="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] text-ink-secondary"
                    :style="{ paddingLeft: `${8 + row.depth * 18}px` }"
                  >
                    <Icon
                      :icon="row.node.type === 'folder' ? 'ph:folder' : 'ph:file-text'"
                      :width="14"
                      :height="14"
                      class="shrink-0 text-ink-quaternary"
                    />
                    <span class="truncate">{{ row.node.title || "无标题" }}</span>
                  </p>
                  <p
                    v-if="snapshotTreeRows.length === 0"
                    class="py-6 text-center text-[13px] text-ink-quaternary"
                  >
                    该快照没有目录节点
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div v-else-if="activeSection === 'members'" class="mt-4">
          <KnowledgeSettingsMembersCard
            :loading="loading"
            :members="members"
            :can-manage="canManage"
            :updating-member-id="updatingMemberId"
            :removing-member-id="removingMemberId"
            :role-options="roleOptions"
            @add-member="showAddMemberDialog = true"
            @role-change="(member, value) => handleRoleChange(member, value)"
            @remove-member="handleRemoveMember"
          />
        </div>

        <div v-else class="mt-4">
          <KnowledgeSettingsInfoCard
            v-if="canManage && workspaceContext.knowledgeBase.value"
            :knowledge-base="workspaceContext.knowledgeBase.value"
            :can-manage="canManage"
            @saved="() => workspaceContext.refreshWorkspace()"
            @notify="(message, type) => showToastMessage(message, type ?? 'info')"
          />
          <KnowledgeSettingsVisibilityCard
            class="mt-4"
            :visibility="visibility"
            :visibility-options="visibilityOptions"
            :can-change-visibility="canChangeVisibility"
            :updating-visibility="updatingVisibility"
            @update-visibility="handleUpdateVisibility"
          />
        </div>
      </div>
    </div>

    <KnowledgeSettingsAddMemberDialog
      v-if="canManage"
      :open="showAddMemberDialog"
      :email="addMemberEmail"
      :role="addMemberRole"
      :adding-member="addingMember"
      :role-options="roleOptions"
      @update:open="showAddMemberDialog = $event"
      @update:email="addMemberEmail = $event"
      @update:role="addMemberRole = $event"
      @submit="handleAddMember"
    />

    <ConfirmDialog
      :open="Boolean(snapshotToRestore)"
      danger
      :message="
        snapshotToRestore
          ? `恢复到 ${formatDateTime(snapshotToRestore.createdAt)} 的目录结构？现存目录结构将被覆盖，快照后被删除的文档将从回收站还原。`
          : ''
      "
      confirm-text="恢复"
      :loading="restoringSnapshot ? true : null"
      @update:open="
        (value) => {
          if (!value) snapshotToRestore = null
        }
      "
      @confirm="confirmRestoreSnapshot"
    />

    <ConfirmDialog
      v-model:open="memberRemoveOpen"
      title="移除成员"
      :message="
        memberToRemove
          ? `确定要移除成员 ${memberToRemove.user.displayName} 吗？移除后该成员将失去本知识库的访问权限。`
          : ''
      "
      danger
      confirm-text="移除"
      :loading="removingMember"
      @confirm="confirmRemoveMember"
    />
  </div>
</template>

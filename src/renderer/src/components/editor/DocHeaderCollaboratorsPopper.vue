<script setup lang="ts">
/**
 * 顶栏「协作」浮层内容(对齐语雀真机 2026-09-21 的「文档协作者」浮层):
 * 邀请表单(邮箱 + 角色 + 添加) → 协作者列表(头像/名/邮箱/角色切换/移除)
 * → 邀请链接行(只读框 + 复制) →「高级设置」折叠(知识库成员只读列表)。
 * 数据自洽:打开即拉文档协作者接口;壳(标题行/定位/动画)由 DocHeaderPopper 承担。
 */
import { computed, onMounted, ref } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import {
  addDocumentCollaborator,
  listDocumentCollaborators,
  removeDocumentCollaborator,
  updateDocumentCollaborator,
  type DocumentCollaboratorItem,
} from "@/services/document-collaborators"
import type { KnowledgeBaseMember } from "@/services/knowledge-permissions"
import { useAuthStore } from "@/stores/auth"
import { useTransientToast } from "@/composables/use-transient-toast"

const props = defineProps<{
  documentId: string
  /** 文档级管理权限(B2f):可邀请/改角色/移除 */
  canManage: boolean
  /** 当前文档可访问链接(只读框展示 + 复制) */
  documentUrl: string
  /** 知识库成员(高级设置折叠区只读展示,继承知识库权限) */
  workspaceMembers: KnowledgeBaseMember[]
}>()

const authStore = useAuthStore()
const { showToastMessage } = useTransientToast()

const collaboratorRoleLabel: Record<KnowledgeBaseMember["role"], string> = {
  owner: "创建者",
  admin: "管理员",
  editor: "可编辑",
  reader: "只读",
}

const docCollabRoleLabel: Record<"editor" | "reader", string> = {
  editor: "可编辑",
  reader: "只读",
}

const collaborators = ref<DocumentCollaboratorItem[]>([])
const loading = ref(false)
const loadError = ref(false)
const busy = ref(false)
const inviteEmail = ref("")
const inviteRole = ref<"editor" | "reader">("editor")
const advancedOpen = ref(false)

const canSubmitInvite = computed(() => inviteEmail.value.trim().length > 0 && !busy.value)

const loadCollaborators = async () => {
  loading.value = true
  loadError.value = false
  try {
    collaborators.value = await listDocumentCollaborators(props.documentId, authStore.accessToken)
  } catch {
    collaborators.value = []
    loadError.value = true
  } finally {
    loading.value = false
  }
}

const handleAddCollaborator = async () => {
  const email = inviteEmail.value.trim()
  if (!email || busy.value) {
    return
  }

  busy.value = true
  try {
    const created = await addDocumentCollaborator(
      props.documentId,
      { email, role: inviteRole.value },
      authStore.accessToken,
    )
    collaborators.value = [...collaborators.value, created]
    inviteEmail.value = ""
    showToastMessage("协作者已添加。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "添加协作者失败。", "error")
  } finally {
    busy.value = false
  }
}

const handleRoleChange = async (
  collaborator: DocumentCollaboratorItem,
  role: "editor" | "reader",
) => {
  if (role === collaborator.role || busy.value) {
    return
  }

  busy.value = true
  try {
    const updated = await updateDocumentCollaborator(
      props.documentId,
      collaborator.id,
      { role },
      authStore.accessToken,
    )
    collaborators.value = collaborators.value.map((item) =>
      item.id === updated.id ? updated : item,
    )
    showToastMessage(`已设为${docCollabRoleLabel[updated.role]}。`, "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "修改角色失败。", "error")
  } finally {
    busy.value = false
  }
}

const handleRemove = async (collaborator: DocumentCollaboratorItem) => {
  if (busy.value) {
    return
  }

  busy.value = true
  try {
    await removeDocumentCollaborator(props.documentId, collaborator.id, authStore.accessToken)
    collaborators.value = collaborators.value.filter((item) => item.id !== collaborator.id)
    showToastMessage("协作者已移除。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "移除协作者失败。", "error")
  } finally {
    busy.value = false
  }
}

const copyInviteLink = async () => {
  try {
    await navigator.clipboard.writeText(props.documentUrl)
    showToastMessage("当前文档链接已复制。", "success")
  } catch {
    showToastMessage("复制链接失败，请手动复制地址栏。", "error")
  }
}

const memberInitial = (member: KnowledgeBaseMember) =>
  (member.user.displayName || member.user.email || "协").slice(0, 1).toUpperCase()

onMounted(() => {
  void loadCollaborators()
})
</script>

<template>
  <div class="select-none px-4 pb-3 pt-3.5">
    <!-- 邀请表单(B2f):管理者可邀请/改角色/移除 -->
    <form v-if="canManage" class="flex items-center gap-2" @submit.prevent="handleAddCollaborator">
      <el-input
        v-model="inviteEmail"
        type="email"
        maxlength="120"
        placeholder="输入对方邮箱，如 name@example.com"
        class="h-8 min-w-0 flex-1"
      />
      <el-dropdown
        trigger="click"
        placement="bottom-end"
        :show-arrow="false"
        @command="(role: 'editor' | 'reader') => (inviteRole = role)"
      >
        <button
          type="button"
          class="inline-flex h-8 shrink-0 items-center gap-1 rounded-kb-md border border-line bg-surface px-2.5 text-[12px] text-ink-secondary transition hover:border-brand-lighter"
        >
          {{ docCollabRoleLabel[inviteRole] }}
          <UiIcon icon="ph:caret-down" :width="12" :height="12" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="editor">可编辑</el-dropdown-item>
            <el-dropdown-item command="reader">只读</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button
        type="submit"
        class="inline-flex h-8 shrink-0 items-center rounded-kb-md bg-brand px-3 text-[12px] font-medium text-on-brand! transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
        :disabled="!canSubmitInvite"
      >
        {{ busy ? "添加中…" : "添加" }}
      </button>
    </form>

    <div v-if="loading" class="mt-3 space-y-1">
      <div v-for="index in 3" :key="index" class="h-12 animate-pulse rounded-kb-xl bg-muted" />
    </div>

    <div v-else-if="loadError" class="mt-3 flex flex-col items-start gap-2">
      <p class="text-[12px] text-ink-tertiary">协作者列表加载失败。</p>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-kb-md border border-line px-2 py-1 text-[12px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
        @click="loadCollaborators"
      >
        <AppIcon name="i-lucide-refresh-cw" class="h-3 w-3" />
        重新加载
      </button>
    </div>

    <ul v-else-if="collaborators.length > 0" class="mt-2 space-y-0.5">
      <li
        v-for="collaborator in collaborators"
        :key="collaborator.id"
        class="flex items-center gap-3 rounded-kb-xl px-2 py-1.5 transition hover:bg-fill-subtle"
      >
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-fill-muted text-[11px] font-semibold text-ink-secondary dark:text-ink"
        >
          <img
            v-if="collaborator.user.avatar"
            :src="collaborator.user.avatar"
            :alt="collaborator.user.displayName || collaborator.user.email"
            class="h-full w-full object-cover"
          />
          <span v-else>{{
            (collaborator.user.displayName || collaborator.user.email).slice(0, 1)
          }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="truncate text-[13px] font-medium text-ink">
              {{ collaborator.user.displayName || collaborator.user.email }}
            </span>
            <span
              v-if="collaborator.user.id === authStore.user?.id"
              class="shrink-0 text-[11px] text-ink-quaternary"
              >（我）</span
            >
          </div>
          <div class="truncate text-[12px] text-ink-tertiary">
            {{ collaborator.user.email }}
          </div>
        </div>

        <el-dropdown
          v-if="canManage"
          trigger="click"
          placement="bottom-end"
          :show-arrow="false"
          :disabled="busy"
          @command="(role: 'editor' | 'reader') => handleRoleChange(collaborator, role)"
        >
          <button
            type="button"
            class="inline-flex h-7 shrink-0 items-center gap-1 rounded-kb-md border border-line bg-surface px-2.5 text-[12px] text-ink-secondary transition hover:border-brand-lighter"
          >
            {{ docCollabRoleLabel[collaborator.role] }}
            <UiIcon icon="ph:caret-down" :width="11" :height="11" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="editor" :disabled="collaborator.role === 'editor'"
                >可编辑</el-dropdown-item
              >
              <el-dropdown-item command="reader" :disabled="collaborator.role === 'reader'"
                >只读</el-dropdown-item
              >
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span
          v-else
          class="shrink-0 rounded-full bg-fill-subtle px-2 py-0.5 text-[11px] font-medium text-ink-tertiary dark:text-ink-secondary"
        >
          {{ docCollabRoleLabel[collaborator.role] }}
        </span>

        <button
          v-if="canManage"
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-md text-ink-quaternary transition hover:bg-grey-200 hover:text-error"
          title="移除协作者"
          :disabled="busy"
          @click="handleRemove(collaborator)"
        >
          <UiIcon icon="ph:x" :width="14" :height="14" />
        </button>
      </li>
    </ul>
    <p v-else class="mt-3 px-1 text-[12px] text-ink-quaternary">
      {{ canManage ? "还没有文档协作者，通过上方邮箱邀请。" : "暂无文档协作者。" }}
    </p>

    <!-- 邀请链接行(对齐语雀:只读框 + 复制链接钮) -->
    <div class="mt-3">
      <p class="text-[12px] font-medium text-ink-secondary">设置协作者权限链接</p>
      <div class="mt-1.5 flex items-center gap-2">
        <input
          type="text"
          readonly
          :value="documentUrl"
          class="h-8 min-w-0 flex-1 rounded-kb-md border border-line-input bg-muted px-2 text-[12px] text-ink-tertiary outline-none"
        />
        <button
          type="button"
          class="inline-flex h-8 shrink-0 items-center rounded-kb-md bg-brand px-3 text-[12px] font-medium text-on-brand! transition hover:bg-brand-hover"
          @click="copyInviteLink"
        >
          复制链接
        </button>
      </div>
    </div>

    <!-- 高级设置折叠:知识库成员只读列表 -->
    <div class="mt-3 border-t border-line pt-2">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[12px] text-ink-tertiary transition hover:text-brand"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        高级设置
        <UiIcon :icon="advancedOpen ? 'ph:caret-up' : 'ph:caret-down'" :width="12" :height="12" />
      </button>
      <template v-if="advancedOpen">
        <p class="mt-2 text-[12px] text-ink-tertiary">
          知识库成员（{{ workspaceMembers.length }} 人，继承知识库权限）
        </p>
        <ul class="mt-1 max-h-56 space-y-0.5 overflow-y-auto">
          <li
            v-for="member in workspaceMembers"
            :key="member.id"
            class="flex items-center gap-3 rounded-kb-xl px-2 py-1.5 transition hover:bg-fill-subtle"
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-fill-muted text-[11px] font-semibold text-ink-secondary dark:text-ink"
            >
              <img
                v-if="member.user.avatar"
                :src="member.user.avatar"
                :alt="member.user.displayName || member.user.email || '协作者'"
                class="h-full w-full object-cover"
              />
              <span v-else>{{ memberInitial(member) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <span class="truncate text-[13px] font-medium text-ink">
                {{ member.user.displayName || member.user.email }}
              </span>
              <span class="ml-1 truncate text-[12px] text-ink-tertiary">{{
                member.user.email
              }}</span>
            </div>
            <span
              class="shrink-0 rounded-full bg-fill-subtle px-2 py-0.5 text-[11px] font-medium text-ink-tertiary dark:text-ink-secondary"
            >
              {{ collaboratorRoleLabel[member.role] }}
            </span>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

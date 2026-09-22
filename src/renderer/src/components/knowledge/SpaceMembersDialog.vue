<script setup lang="ts">
/**
 * 空间成员管理弹窗（B7 #25 余量）：成员列表 + 邮箱邀请 + 移除。
 * 仅空间所有者可管理（入口在侧栏切换器，非 owner 不渲染）；后端仍做 owner 门禁。
 */
import { ref, watch } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import UiIcon from "@/components/common/UiIcon.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { requestKbDriveApi } from "@/services/kb-drive-http"
import { isImeComposing } from "@/utils/keyboard"

/**
 * 空间成员（后端 GET /api/knowledge/spaces/:id/members 返回形状，见
 * xiaoye-server/src/modules/spaces/spaces.service.ts listMembers）。
 */
interface KnowledgeSpaceMember {
  userId: string
  role: "owner" | "member"
  displayName: string
  email: string
  avatar?: string | null
}

/*
 * 恢复批注：空间成员的服务层封装未随删除事故恢复件找回（@/services/knowledge-base
 * 现无这些导出）。这里按 kb-drive-http 既有统一入口内联补齐，端点与
 * xiaoye-server/src/modules/spaces/spaces.controller.ts 逐一对应；鉴权走
 * requestKbDriveApi 缺省令牌解析（临期静默刷新）。
 */

/** 成员列表（含所有者）。 */
const listKnowledgeSpaceMembers = (spaceId: string): Promise<KnowledgeSpaceMember[]> =>
  requestKbDriveApi<KnowledgeSpaceMember[]>(`/knowledge/spaces/${spaceId}/members`)

/** 按邮箱邀请成员（后端 owner 门禁）。 */
const addKnowledgeSpaceMember = (spaceId: string, email: string): Promise<{ ok: true }> =>
  requestKbDriveApi<{ ok: true }>(`/knowledge/spaces/${spaceId}/members`, {
    method: "POST",
    body: JSON.stringify({ email }),
  })

/** 移除成员（不能移除所有者）。 */
const removeKnowledgeSpaceMember = (spaceId: string, targetUserId: string): Promise<{ ok: true }> =>
  requestKbDriveApi<{ ok: true }>(`/knowledge/spaces/${spaceId}/members/${targetUserId}`, {
    method: "DELETE",
  })

const props = defineProps<{
  visible: boolean
  spaceId: string
  spaceName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { showToastMessage } = useTransientToast()

const dialog = useDialogBehavior({
  open: () => props.visible,
})

const loading = ref(false)
const members = ref<KnowledgeSpaceMember[]>([])
const inviteEmail = ref("")
const inviting = ref(false)
const removingUserId = ref<string | null>(null)

const loadMembers = async () => {
  loading.value = true
  try {
    members.value = await listKnowledgeSpaceMembers(props.spaceId)
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "成员加载失败", "error")
  } finally {
    loading.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void loadMembers()
    }
  },
  { immediate: true },
)

const handleInvite = async () => {
  const email = inviteEmail.value.trim()
  if (!email || inviting.value) return

  inviting.value = true
  try {
    await addKnowledgeSpaceMember(props.spaceId, email)
    showToastMessage(`已邀请 ${email} 加入空间。`, "success")
    inviteEmail.value = ""
    await loadMembers()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "邀请失败", "error")
  } finally {
    inviting.value = false
  }
}

/** 邮箱框回车邀请：先过 IME 守卫，组词确认的 Enter 不发请求 */
const handleInviteKeydown = (event: KeyboardEvent | Event) => {
  if (!(event instanceof KeyboardEvent) || isImeComposing(event)) {
    return
  }

  void handleInvite()
}

const handleRemove = async (member: KnowledgeSpaceMember) => {
  if (removingUserId.value) return
  removingUserId.value = member.userId
  try {
    await removeKnowledgeSpaceMember(props.spaceId, member.userId)
    showToastMessage(`已移除 ${member.displayName || member.email || "成员"}。`, "success")
    await loadMembers()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "移除失败", "error")
  } finally {
    removingUserId.value = null
  }
}

const handleClose = () => {
  emit("close")
}
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-lg"
    :model-value="visible"
    title="空间成员"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && handleClose()"
  >
    <template #header>
      <KbDialogHeader
        title="空间成员"
        :description="`管理「${spaceName}」的成员。成员身份仅代表空间归属，知识库权限仍在各知识库内设置。`"
        @close="handleClose"
      />
    </template>

    <div class="space-y-5">
      <div class="flex items-center gap-2">
        <el-input
          v-model="inviteEmail"
          type="email"
          placeholder="输入成员邮箱邀请加入"
          class="flex-1"
          @keydown.enter.prevent="handleInviteKeydown"
        />
        <el-button
          type="primary"
          class="rounded-kb-md"
          :loading="inviting"
          :disabled="!inviteEmail.trim()"
          @click="handleInvite"
          ><template #loading
            ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">邀请</span>
        </el-button>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-2 py-8 text-ink-tertiary">
        <UiIcon icon="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
        <span class="text-[13px]">加载中…</span>
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="member in members"
          :key="member.userId"
          class="flex items-center justify-between gap-3 rounded-kb-xl border border-line bg-surface px-3 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted text-[13px] font-medium text-ink-secondary"
            >
              <img
                v-if="member.avatar"
                :src="member.avatar"
                :alt="member.displayName"
                class="h-full w-full object-cover"
              />
              <span v-else>{{
                (member.displayName || member.email || "?").slice(0, 1).toUpperCase()
              }}</span>
            </span>
            <div class="min-w-0">
              <p class="truncate text-[13px] font-medium text-ink">
                {{ member.displayName || "未命名成员" }}
              </p>
              <p class="truncate text-[11px] text-ink-quaternary">{{ member.email ?? "" }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <el-tag
              disable-transitions
              :type="member.role === 'owner' ? 'success' : undefined"
              effect="plain"
            >
              {{ member.role === "owner" ? "所有者" : "成员" }}
            </el-tag>
            <el-button
              v-if="member.role !== 'owner'"
              text
              size="small"
              class="text-ink-tertiary hover:text-error"
              :loading="removingUserId === member.userId"
              @click="handleRemove(member)"
            >
              <span class="truncate">移除</span>
            </el-button>
          </div>
        </li>
        <li v-if="members.length === 0" class="py-8 text-center text-[13px] text-ink-tertiary">
          暂无成员。
        </li>
      </ul>
    </div>

    <div class="mt-5 flex items-center gap-1.5 text-[11px] text-ink-quaternary">
      <AppIcon name="i-lucide-info" class="h-3.5 w-3.5 shrink-0" />
      被移除的成员仍保留其个人空间知识库；本空间内知识库的访问权限在对应知识库内管理。
    </div>
  </el-dialog>
</template>

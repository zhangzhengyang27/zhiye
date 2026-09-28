<script setup lang="ts">
/** 卡片组件，负责知识设置Members信息展示与局部操作。 */
import Icon from "@/components/common/UiIcon.vue"
import { ChevronDown } from "lucide-vue-next"
import type { KnowledgeBaseMember } from "@/services/knowledge-permissions"

type RoleOption = {
  value: "admin" | "editor" | "reader"
  label: string
  description: string
}

const props = defineProps<{
  loading: boolean
  members: KnowledgeBaseMember[]
  canManage: boolean
  updatingMemberId: string | null
  removingMemberId: string | null
  roleOptions: readonly RoleOption[]
}>()

const emit = defineEmits<{
  addMember: []
  roleChange: [member: KnowledgeBaseMember, value: string]
  removeMember: [member: KnowledgeBaseMember]
}>()

const getRoleBadgeClass = (role: string) => {
  const classes: Record<string, string> = {
    owner: "bg-grey-200 text-ink-secondary",
    admin: "bg-brand-faint text-brand-hover",
    editor: "bg-brand-faint text-brand",
    reader: "bg-warning-bg text-warning-hover",
  }
  return classes[role] || classes.reader
}

const getRoleLabel = (role: string) => {
  const labels: Record<string, string> = {
    owner: "所有者",
    admin: "管理员",
    editor: "编辑者",
    reader: "阅读者",
  }
  return labels[role] || role
}
</script>

<template>
  <div class="kb-section-card p-6">
    <!-- 标题与描述由设置页页头承担，卡内只留主操作 -->
    <div class="flex items-center justify-end">
      <el-button
        v-if="props.canManage"
        type="primary"
        class="rounded-[14px] bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover font-semibold"
        @click="emit('addMember')"
        ><Icon icon="ph:user-plus" :width="16" :height="16" />
        <span class="truncate">添加成员</span>
      </el-button>
    </div>

    <div v-if="props.loading" class="mt-6 space-y-3">
      <div v-for="index in 4" :key="index" class="h-24 animate-pulse rounded-[24px] bg-grey-200" />
    </div>

    <div v-else class="mt-6 space-y-3">
      <article
        v-for="member in props.members"
        :key="member.id"
        class="kb-list-row flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="flex min-w-0 items-center gap-4">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-[18px] bg-brand-faint font-semibold text-brand"
          >
            {{ member.user.displayName.charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-ink" :title="member.user.displayName">
              {{ member.user.displayName }}
            </div>
            <div
              v-if="member.user.email"
              class="truncate text-sm text-ink-tertiary"
              :title="member.user.email"
            >
              {{ member.user.email }}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <span
            class="rounded-full px-3 py-1 text-xs font-medium"
            :class="getRoleBadgeClass(member.role)"
          >
            {{ getRoleLabel(member.role) }}
          </span>
          <div v-if="member.role !== 'owner'" class="min-w-40">
            <el-select
              :model-value="member.role"
              :options="props.roleOptions.map((item) => ({ label: item.label, value: item.value }))"
              :offset="6"
              :show-arrow="false"
              :suffix-icon="ChevronDown"
              :disabled="!props.canManage || props.updatingMemberId === member.userId"
              @update:model-value="(value) => emit('roleChange', member, String(value))"
            />
          </div>
          <el-button
            v-if="member.role !== 'owner'"
            type="danger"
            text
            aria-label="移除成员"
            class="rounded-[14px] text-error hover:bg-error-bg gap-1.5 px-3 py-1.5 font-semibold"
            :disabled="!props.canManage || props.removingMemberId === member.userId"
            @click="emit('removeMember', member)"
            ><span class="truncate"><Icon icon="ph:trash" :width="16" :height="16" /></span>
          </el-button>
        </div>
      </article>

      <div
        v-if="props.members.length === 0"
        class="kb-empty-state flex min-h-[220px] items-center justify-center px-6 py-10 text-center text-sm text-ink-quaternary"
      >
        暂无成员数据
      </div>
    </div>
  </div>
</template>

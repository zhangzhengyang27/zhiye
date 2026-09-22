<script setup lang="ts">
/**
 * @提及成员选择器：在文档编辑中插入 @提及 时弹出的成员列表浮层。
 * 父组件负责定位容器与开关；本组件只负责过滤、选择与关闭交互。
 */
import { computed, nextTick, ref, watch } from "vue"
import type { KnowledgeBaseMember } from "../../services/knowledge-permissions"
import { isImeComposing } from "@/utils/keyboard"

const props = defineProps<{
  members: KnowledgeBaseMember[]
  open: boolean
  position: { left: number; top: number }
}>()

const emit = defineEmits<{
  select: [member: KnowledgeBaseMember]
  close: []
}>()

const keyword = ref("")
const activeIndex = ref(0)
const searchInputRef = ref<{ focus: () => void } | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      keyword.value = ""
      activeIndex.value = 0
      // 自动聚焦搜索框：否则方向键/Enter/Esc 处理器收不到事件，键盘完全不可用
      void nextTick(() => searchInputRef.value?.focus())
    }
  },
)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.members
  return props.members.filter(
    (m) => m.user.displayName.toLowerCase().includes(kw) || m.user.email.toLowerCase().includes(kw),
  )
})

// 过滤结果变化后原高亮可能越界，回到第一项
watch(filtered, () => {
  activeIndex.value = 0
})

const handleSelect = (member: KnowledgeBaseMember) => {
  emit("select", member)
}

/** 成员角色中文标签（接口返回 owner/admin/editor/reader） */
const MEMBER_ROLE_LABELS: Record<KnowledgeBaseMember["role"], string> = {
  owner: "所有者",
  admin: "管理者",
  editor: "编辑者",
  reader: "阅读者",
}

const resolveRoleLabel = (role: KnowledgeBaseMember["role"]) => MEMBER_ROLE_LABELS[role] ?? role

const onKeydown = (e: KeyboardEvent) => {
  // 输入法组词期间（确认候选/切候选/取消组词）的按键不参与列表导航与选择
  if (isImeComposing(e)) {
    return
  }

  if (e.key === "ArrowDown") {
    e.preventDefault()
    if (filtered.value.length === 0) return
    activeIndex.value = Math.min(activeIndex.value + 1, filtered.value.length - 1)
  } else if (e.key === "ArrowUp") {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === "Enter") {
    e.preventDefault()
    const member = filtered.value[activeIndex.value]
    if (member) handleSelect(member)
  } else if (e.key === "Escape") {
    e.preventDefault()
    emit("close")
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[var(--kb-z-dropdown-backdrop)]"
      @click="emit('close')"
    />
    <div
      v-if="open"
      class="fixed z-[var(--kb-z-dropdown)] w-[280px] overflow-hidden rounded-kb-md border border-line bg-surface shadow-lg"
      role="listbox"
      aria-label="选择要提及的成员"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @click.stop
      @keydown="onKeydown"
    >
      <div class="border-b border-line px-3 py-2">
        <el-input
          ref="searchInputRef"
          v-model="keyword"
          type="text"
          size="small"
          placeholder="搜索成员…"
          @click.stop
        />
      </div>
      <div class="max-h-[264px] overflow-y-auto py-1">
        <p v-if="filtered.length === 0" class="px-3 py-3 text-center text-[12px] text-ink-tertiary">
          没有匹配的成员
        </p>
        <button
          v-for="(member, index) in filtered"
          :key="member.userId"
          type="button"
          role="option"
          :aria-selected="index === activeIndex"
          class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition"
          :class="index === activeIndex ? 'bg-brand-faint' : 'hover:bg-fill-subtle'"
          @click="handleSelect(member)"
          @mouseenter="activeIndex = index"
        >
          <span
            class="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-muted text-[10px] font-semibold text-ink-secondary"
          >
            <img
              v-if="member.user.avatar"
              :src="member.user.avatar"
              :alt="member.user.displayName"
              class="h-full w-full object-cover"
            />
            <span v-else>{{ member.user.displayName.slice(0, 1).toUpperCase() }}</span>
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] text-ink">{{
            member.user.displayName
          }}</span>
          <span class="shrink-0 text-[11px] text-ink-tertiary">{{
            resolveRoleLabel(member.role)
          }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

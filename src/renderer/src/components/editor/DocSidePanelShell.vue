<script setup lang="ts">
/**
 * 文档页右侧面板统一容器：讨论 / AI 写作 / 操作与信息 / 历史记录共用。
 *
 * 此前四种面板三种形态（讨论/AI = in-flow aside、信息/历史 = fixed 抽屉 + 全屏
 * 遮罩——语雀真机是同区右侧面板、无遮罩），头部与 Esc 各自实现；统一为 in-flow
 * 侧栏 + 紧凑头部（标题 + 可选计数 + 动作区 + 关闭）+ 宽度过渡 + Esc 收口
 * （对话框压顶让位、输入法组词让位）。宽度按面板微调：AI 对齐语雀独立窗 375px。
 *
 * 面板间切换由父级换内容（本壳保持挂载，无动画）；整组开合走宽度收展。
 */
import { onBeforeUnmount, watch } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import { hasOpenDialog } from "@/composables/dialog-stack"
import { isImeComposing } from "@/utils/keyboard"

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    /** 标题旁计数徽标（如评论数）；缺省不显示 */
    count?: number
    width?: number
  }>(),
  {
    count: undefined,
    width: 360,
  },
)

const emit = defineEmits<{
  close: []
}>()

/** Esc 关闭（对话框压顶让位；输入法组词中的 Esc 是取消候选，不关面板） */
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || !props.open || isImeComposing(event)) {
    return
  }
  if (hasOpenDialog()) {
    return
  }
  emit("close")
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener("keydown", handleKeydown)
    } else {
      window.removeEventListener("keydown", handleKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
  <Transition
    enter-active-class="kb-side-panel-anim"
    enter-from-class="kb-side-panel-collapsed"
    enter-to-class="kb-side-panel-expanded"
    leave-active-class="kb-side-panel-anim"
    leave-from-class="kb-side-panel-expanded"
    leave-to-class="kb-side-panel-collapsed"
  >
    <aside
      v-if="open"
      class="flex h-full shrink-0 flex-col overflow-hidden border-l border-line bg-surface"
      :style="{ width: `${width}px` }"
    >
      <header class="flex shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
        <!-- title 插槽：信息面板用下划线双 tab 占据头部（真机形态），其余面板走默认标题 -->
        <slot name="title">
          <h2 class="min-w-0 truncate py-3 text-[15px] font-semibold text-ink">{{ title }}</h2>
          <span
            v-if="count !== undefined"
            class="shrink-0 rounded-full bg-fill-muted px-2 py-0.5 text-[11px] font-medium text-ink-tertiary"
            >{{ count }}</span
          >
        </slot>
        <div class="ml-auto flex shrink-0 items-center gap-1.5">
          <slot name="actions" />
          <button
            type="button"
            class="rounded-kb-md p-1.5 text-ink-tertiary transition hover:bg-muted hover:text-ink-secondary"
            title="关闭"
            @click="emit('close')"
          >
            <AppIcon name="i-lucide-x" class="h-4 w-4" />
          </button>
        </div>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <slot />
      </div>
    </aside>
  </Transition>
</template>

<style>
/* 面板宽度收展：enter-from 压到 0 再过渡到内联宽度，编辑区被平滑让位。
   unlayered + !important 压过内联宽度与 Tailwind utilities（坑 6/13 同源） */
.kb-side-panel-anim {
  transition:
    width 0.2s ease,
    opacity 0.15s ease;
}
.kb-side-panel-collapsed {
  width: 0 !important;
  opacity: 0;
}
.kb-side-panel-expanded {
  opacity: 1;
}
</style>

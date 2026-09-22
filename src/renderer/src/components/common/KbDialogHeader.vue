<script setup lang="ts">
/**
 * 对话框头部共享片段（T9 抽取）：eyebrow 角标 + 标题 + 描述 + 关闭钮。
 *
 * AppDialog 解散后，其头部 markup（原 306-332 行）在全部 16 个对话框上同构复现
 * ——抽成本组件单一事实源，各组件在 el-dialog 的 #header 插槽里一行接入：
 * `<template #header><KbDialogHeader :title="..." :eyebrow="..." :description="..." @close="..." /></template>`。
 * 抽取判定记档（计划文档 T9 节）：eyebrow 仅 5 个组件使用、description 6 个，
 * 但「标题 + 关闭钮」为 16 处全量结构——按最大公约数整体抽取，而非 eyebrow
 * 单独内联；头部带的布局（flex 行 / 内边距 / 分隔线 / 底色）在全局校准层
 * element-plus-calibration.css 的 .el-dialog__header 段，插槽内容只提供两个
 * 直接子元素（文字列 + 关闭钮）。
 *
 * 关闭钮为直写 el-button（基线几何：h-10 w-10 rounded-kb-xl + lucide-x 字形；
 * native headerbtn 的 EP close 字形与 lucide-x 不同会引入像素回归，不采用——
 * T10 已随全局按钮校准一并切换，几何不变）。
 */
import UiIcon from "./UiIcon.vue"

withDefaults(
  defineProps<{
    title: string
    /** 面板式角标（语雀对话框默认无角标，需要时显式传入） */
    eyebrow?: string
    /** 标题下的补充描述（max-w-[42rem] 收窄，与基线一致） */
    description?: string
  }>(),
  {
    eyebrow: "",
    description: "",
  },
)

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <div class="min-w-0 flex-1">
    <div
      v-if="eyebrow"
      class="inline-flex items-center gap-2 rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary"
    >
      {{ eyebrow }}
    </div>
    <h3 class="mt-3 text-[22px] font-semibold tracking-[-0.03em] text-ink">{{ title }}</h3>
    <p v-if="description" class="mt-2 max-w-[42rem] text-sm leading-6 text-ink-tertiary">
      {{ description }}
    </p>
  </div>

  <el-button
    plain
    aria-label="关闭"
    class="h-10 w-10 shrink-0 border-line bg-surface text-ink-tertiary hover:border-brand-lighter hover:text-brand aspect-square p-0"
    @click="emit('close')"
  >
    <UiIcon icon="i-lucide-x" class="h-[1.2em] w-[1.2em] shrink-0" />
  </el-button>
</template>

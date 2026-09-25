<script setup lang="ts">
/**
 * 「编辑演示分页」对话框：可视化调整放映切分。
 *
 * 模型见 utils/presentation.ts——顶层块序列 + 「页首块」标记决定切页。
 * 本对话框：勾选哪些块作为页首（默认 = H1-H3 标题）、「恢复默认」、
 * 「保存方案」（块文本指纹持久化到 localStorage，按文档隔离）。
 * 上方实时预览当前方案切出的页列表（第 N 页 + 页首块文本）。
 */
import { computed, ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import { useTransientToast } from "@/composables/use-transient-toast"
import {
  renderDocumentToBlocks,
  savePaginationScheme,
  splitPages,
  type PresentationBlock,
} from "@/utils/presentation"

const emit = defineEmits<{
  close: []
}>()

const props = defineProps<{
  docId: string
  documentTitle: string
  content: string
  scheme?: "text/markdown" | "text/html"
}>()

const { showToastMessage } = useTransientToast()

/** 组件自持开合（对齐 KnowledgeMoveNodeDialog 模式）：父级经 expose 的 open() 唤起 */
const visible = ref(false)
const dialog = useDialogBehavior({ open: () => visible.value })

const blocks = ref<PresentationBlock[]>([])
/** 页首块指纹集合（本对话框内的草稿，保存才落盘） */
const draftStartFingerprints = ref<Set<string>>(new Set())

const openDialog = () => {
  blocks.value = renderDocumentToBlocks(props.content, props.scheme ?? "text/markdown")
  draftStartFingerprints.value = new Set(
    blocks.value.filter((block) => block.isHeading).map((block) => block.fingerprint),
  )
  const firstBlock = blocks.value[0]
  if (firstBlock) {
    // 首块恒为页首（首段前导内容归第一页），不在勾选范围
    draftStartFingerprints.value.add(firstBlock.fingerprint)
  }
  visible.value = true
}

const fingerprintToIndex = computed(() => {
  const map = new Map<string, number>()
  for (const block of blocks.value) {
    if (block.fingerprint) {
      map.set(block.fingerprint, block.index)
    }
  }
  return map
})

const draftStartIndexes = computed(() =>
  [...draftStartFingerprints.value]
    .map((fingerprint) => fingerprintToIndex.value.get(fingerprint))
    .filter((index): index is number => index !== undefined),
)

const previewPages = computed(() =>
  blocks.value.length === 0 ? [] : splitPages(blocks.value, draftStartIndexes.value),
)

const isStart = (block: PresentationBlock) => draftStartFingerprints.value.has(block.fingerprint)

const toggleStart = (block: PresentationBlock) => {
  if (block.index === 0) {
    // 首块是第一页的页首，不可取消
    showToastMessage("第一页从文档开头开始，首个块不能取消页首。", "info")
    return
  }
  const next = new Set(draftStartFingerprints.value)
  if (next.has(block.fingerprint)) {
    next.delete(block.fingerprint)
  } else {
    next.add(block.fingerprint)
  }
  draftStartFingerprints.value = next
}

/** 恢复默认：回到按 H1-H3 标题分页 */
const resetToDefault = () => {
  draftStartFingerprints.value = new Set(
    blocks.value
      .filter((block) => block.isHeading || block.index === 0)
      .map((block) => block.fingerprint),
  )
  showToastMessage("已恢复默认分页（未保存）。", "info")
}

/** 保存方案（指纹落盘；放映时按指纹还原，内容变更失配项自动忽略） */
const saveScheme = () => {
  savePaginationScheme(
    props.docId,
    [...draftStartFingerprints.value].filter((fingerprint) =>
      fingerprintToIndex.value.has(fingerprint),
    ),
  )
  showToastMessage("演示分页方案已保存。", "success")
  visible.value = false
  emit("close")
}

const handleClose = () => {
  visible.value = false
  // el-dialog 关闭动画期间父级同步卸载（v-if 兜底：EP 实例对 modelValue
  // 复位不响应时，卸载必生效）
  emit("close")
}

defineExpose({ open: openDialog, close: () => (visible.value = false) })
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    v-model="visible"
    class="max-w-[680px]"
    @update:model-value="(value) => !value && handleClose()"
  >
    <template #header>
      <KbDialogHeader
        eyebrow="演示"
        title="编辑演示分页"
        description="勾选作为「页首」的块，放映时每页从页首块开始到下一个页首之前。方案按当前内容保存。"
        @close="handleClose"
      />
    </template>

    <!-- 切分预览 -->
    <p class="text-[12px] font-medium text-ink-secondary">
      当前切分预览（{{ previewPages.length }} 页）
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="(page, index) in previewPages"
        :key="`${page.startIndex}-${index}`"
        class="inline-flex max-w-full items-center gap-1 rounded-kb-md border border-line bg-muted px-2 py-1 text-[11px] text-ink-secondary"
      >
        <span class="shrink-0 text-ink-quaternary">P{{ index + 1 }}</span>
        <span class="truncate">{{ page.title }}</span>
      </span>
      <span v-if="previewPages.length === 0" class="text-[12px] text-ink-quaternary">
        文档还没有可放映的内容。
      </span>
    </div>

    <!-- 块列表：勾选页首 -->
    <p class="mt-4 text-[12px] font-medium text-ink-secondary">
      块列表（勾选 = 设为页首；标题块默认页首）
    </p>
    <div
      class="mt-2 max-h-72 space-y-0.5 overflow-y-auto rounded-kb-xl border border-line bg-surface-soft p-1.5"
    >
      <button
        v-for="block in blocks"
        :key="block.index"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-kb-lg px-2.5 py-2 text-left transition"
        :class="isStart(block) ? 'bg-brand-faint/50' : 'hover:bg-fill-muted'"
        :title="block.index === 0 ? '首块固定为第一页页首' : '点击切换页首标记'"
        @click="toggleStart(block)"
      >
        <Icon
          :icon="isStart(block) ? 'i-lucide-square-check-big' : 'i-lucide-square'"
          class="h-4 w-4 shrink-0"
          :class="isStart(block) ? 'text-brand' : 'text-ink-quaternary'"
        />
        <span
          class="shrink-0 rounded-kb-sm bg-fill-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-tertiary"
        >
          {{ block.tag }}
        </span>
        <span
          class="min-w-0 flex-1 truncate text-[13px]"
          :class="isStart(block) ? 'text-ink' : 'text-ink-secondary'"
        >
          {{ block.text }}
        </span>
        <span
          v-if="isStart(block) && block.index !== 0"
          class="shrink-0 text-[11px] font-medium text-brand"
          >页首</span
        >
      </button>
      <p v-if="blocks.length === 0" class="px-3 py-8 text-center text-[13px] text-ink-quaternary">
        文档为空，没有可切分的内容。
      </p>
    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="text-[13px] text-ink-tertiary transition hover:text-brand"
          @click="resetToDefault"
        >
          恢复默认（按标题分页）
        </button>
        <div class="flex items-center gap-2">
          <el-button plain class="py-2" @click="handleClose"
            ><span class="truncate">取消</span></el-button
          >
          <el-button type="primary" class="py-2" :disabled="blocks.length === 0" @click="saveScheme"
            ><span class="truncate">保存方案</span></el-button
          >
        </div>
      </div>
    </template>
  </el-dialog>
</template>

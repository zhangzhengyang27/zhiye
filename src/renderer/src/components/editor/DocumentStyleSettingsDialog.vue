<script lang="ts">
/** 文档级编辑样式：字号（px）+ 段间距档位。视图层与对话框共用此形状。 */
export interface DocEditorStyle {
  fontSize: number
  paragraphSpacing: "default" | "relax"
}
</script>

<script setup lang="ts">
/**
 * 文档样式设置对话框（对齐语雀「样式设置」面板的已支持子集）：
 * - 正文字号：Lake 内核 defaultFontSize，提交后由内核整实例重建生效；
 * - 段间距：常规 / 宽松，映射内核 typography.paragraphSpacing。
 *
 * 字号滑杆维护本地草稿值：input 只改草稿（数字跟随拇指），change（松手）才
 * 上报——内核的字号是构造期配置，若每个刻度都上报会连续重建整个编辑器。
 *
 * 页面尺寸（标题/超宽模式）依赖 Lake 内部内容列宽，暂未开放；
 * 中英文自动空格为排版引擎行为，内核未暴露配置。
 */
import { ref, watch } from "vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

const props = defineProps<{
  open: boolean
  docStyle: DocEditorStyle
}>()

const emit = defineEmits<{
  close: []
  "update:docStyle": [style: DocEditorStyle]
}>()

const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 20
const FONT_SIZE_DEFAULT = 15

interface SpacingOption {
  label: string
  value: "default" | "relax"
  description: string
}

const spacingItems: SpacingOption[] = [
  { label: "常规", value: "default", description: "段落间保留标准间距" },
  { label: "宽松", value: "relax", description: "段落间距加大，适合长文阅读" },
]

/** 滑杆草稿值：拖动过程只更新本地展示，change（松手）才对外提交 */
const draftFontSize = ref(props.docStyle.fontSize)

watch(
  () => props.open,
  (open) => {
    if (open) {
      draftFontSize.value = props.docStyle.fontSize
    }
  },
)

const commitFontSize = () => {
  if (draftFontSize.value !== props.docStyle.fontSize) {
    emit("update:docStyle", { ...props.docStyle, fontSize: draftFontSize.value })
  }
}

const handleSpacingChange = (value: string | number | boolean) => {
  emit("update:docStyle", {
    ...props.docStyle,
    paragraphSpacing: value === "relax" ? "relax" : "default",
  })
}

const dialog = useDialogBehavior({
  open: () => props.open,
})

/** 恢复默认字号：草稿回到默认档后走同一提交口径（与滑杆松手一致，仅在变化时上报） */
const resetFontSize = () => {
  draftFontSize.value = FONT_SIZE_DEFAULT
  commitFontSize()
}
</script>

<template>
  <!-- el-dialog 的关闭契约：Esc/遮罩/× 都走 update:model-value(false)，这里转成对外的 close 事件 -->
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-[420px]"
    :model-value="open"
    title="样式设置"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && emit('close')"
  >
    <template #header>
      <KbDialogHeader title="样式设置" eyebrow="编辑器" @close="emit('close')" />
    </template>

    <div class="flex flex-col gap-6">
      <!-- 正文字号：拖动只更新草稿（数字跟随拇指），change（松手）才上报，避免逐刻度重建整个编辑器 -->
      <section>
        <div class="flex items-baseline justify-between">
          <label class="text-[13px] font-medium text-ink-secondary">正文字号</label>
          <span class="text-[13px] tabular-nums text-ink-tertiary">{{ draftFontSize }}px</span>
        </div>
        <el-slider
          v-model="draftFontSize"
          :min="FONT_SIZE_MIN"
          :max="FONT_SIZE_MAX"
          class="mt-2"
          @change="commitFontSize"
        />
        <div class="flex items-center justify-between text-[12px] text-ink-quaternary">
          <span>{{ FONT_SIZE_MIN }}px</span>
          <button
            type="button"
            class="rounded-kb-xs text-[12px] text-brand transition hover:underline disabled:cursor-not-allowed disabled:text-ink-quaternary disabled:no-underline"
            :disabled="draftFontSize === FONT_SIZE_DEFAULT"
            @click="resetFontSize"
          >
            恢复默认（{{ FONT_SIZE_DEFAULT }}px）
          </button>
          <span>{{ FONT_SIZE_MAX }}px</span>
        </div>
      </section>

      <!-- 段间距：常规 / 宽松，radio 列表形态（label + 描述）与分享配置的权限组同构 -->
      <section>
        <label class="mb-2 block text-[13px] font-medium text-ink-secondary">段间距</label>
        <el-radio-group
          :model-value="docStyle.paragraphSpacing"
          class="flex flex-col items-stretch gap-3"
          @change="handleSpacingChange($event as string | number | boolean)"
        >
          <el-radio v-for="item in spacingItems" :key="item.value" :value="item.value">
            <span class="block text-sm font-medium text-ink">{{ item.label }}</span>
            <span class="mt-0.5 block text-xs text-ink-tertiary">{{ item.description }}</span>
          </el-radio>
        </el-radio-group>
      </section>
    </div>
  </el-dialog>
</template>

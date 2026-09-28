<script setup lang="ts">
/**
 * 文档「操作与信息」面板内容（2026-09-25 语雀真机取证对齐）。
 *
 * 真机形态：tab 行在面板头部（视图层经 DocSidePanelShell 的 #title 插槽渲染，
 * 本组件只承载 tab 内容）+ 知识网络图标卡 + 文档信息卡（点击开统计详情）+
 * 单列操作列表卡（在浏览器打开/进入阅读模式/另存为模板/查看历史版本/导出…/
 * 复制…/移动…/删除红字），「导出…/复制…」为可展开子菜单。此前自创的
 * 19 宫格快捷操作、文档概况卡已按真机移除；内容大纲不做成卡——语雀阅读态
 * 右侧自动展开的是大纲栏（Lake TOC），大纲卡属重复建设。
 * 语雀的「文档设置」行本产品无对应文档级设置弹层，不造假渲染。
 */
import { computed, ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"

/** 文档级编辑样式：字号（px）+ 段间距档位。视图层与本面板共用此形状。 */
export interface DocEditorStyle {
  fontSize: number
  paragraphSpacing: "default" | "relax"
}

/** 面板双 tab：tab 行渲染在壳头部，状态经 prop/emit 与视图层同步 */
export type DocumentInfoTab = "info" | "style"

/** 导出子菜单项：与文档导出工具链对齐 */
type ExportAction =
  "print-doc" | "export-markdown" | "export-pdf" | "export-word" | "export-image" | "export-lake"

const props = withDefaults(
  defineProps<{
    /** 语雀「样式设置」tab：正文样式与页面尺寸 */
    docStyle?: DocEditorStyle
    docWidthMode?: "standard" | "wide"
    creatorLabel?: string
    updatedAtLabel?: string
    /** 当前文档是否为模板（「另存为模板」行随之切换为「取消模板」） */
    isTemplate?: boolean
    /** 当前是否处于阅读模式（动作行随之切换为「退出阅读模式」） */
    reading?: boolean
    /** 当前 tab（tab 行渲染在壳头部，状态提升在视图层） */
    activeTab?: DocumentInfoTab
  }>(),
  {
    docStyle: undefined,
    docWidthMode: undefined,
    creatorLabel: "",
    updatedAtLabel: "",
    isTemplate: false,
    reading: false,
    activeTab: "info",
  },
)

const emit = defineEmits<{
  "open-stats": []
  "open-knowledge-network": []
  "enter-reading": []
  "update:active-tab": [tab: DocumentInfoTab]
  "open-history": []
  "open-in-browser": []
  "copy-link": []
  "copy-markdown-link": []
  /** 复制全文为 Markdown（顶栏 ⧉ 同能力） */
  "copy-markdown": []
  /** 打开移动对话框（与目录树移动同一能力） */
  move: []
  "move-trash": []
  "save-as-template": []
  "export-action": [action: ExportAction]
  "update:doc-style": [style: DocEditorStyle]
  "update:doc-width-mode": [mode: "standard" | "wide"]
}>()

/** tab 行渲染在壳头部（视图层 #title 插槽），本组件按 activeTab prop 切换内容 */

/** 展开的子菜单（导出…/复制…；同刻只展开一个） */
const expandedMenu = ref<"export" | "copy" | null>(null)

const toggleMenu = (key: "export" | "copy") => {
  expandedMenu.value = expandedMenu.value === key ? null : key
}

const exportItems: Array<{ action: ExportAction; label: string; icon: string }> = [
  { action: "export-markdown", label: "导出为 Markdown", icon: "i-lucide-file-text" },
  { action: "export-pdf", label: "导出为 PDF", icon: "i-lucide-file-type" },
  { action: "export-word", label: "导出为 Word", icon: "i-lucide-file-type" },
  { action: "export-image", label: "导出为图片", icon: "i-lucide-file-image" },
  { action: "export-lake", label: "导出为语雀文档 (.lake)", icon: "i-lucide-file-box" },
  { action: "print-doc", label: "打印文档", icon: "i-lucide-printer" },
]

const copyItems: Array<{
  emit: "copy-link" | "copy-markdown-link" | "copy-markdown"
  label: string
  icon: string
}> = [
  { emit: "copy-link", label: "复制链接", icon: "i-lucide-link" },
  { emit: "copy-markdown-link", label: "复制标题链接", icon: "i-lucide-link-2" },
  { emit: "copy-markdown", label: "复制为 Markdown", icon: "i-lucide-file-code" },
]

const templateLabel = computed(() => (props.isTemplate ? "取消模板" : "另存为模板"))

type CopyItemEmit = (typeof copyItems)[number]["emit"]

/** 动态事件名在模板 emit 类型推导下不好表达，收敛为分发函数 */
const runCopyAction = (key: CopyItemEmit) => {
  if (key === "copy-link") {
    emit("copy-link")
  } else if (key === "copy-markdown-link") {
    emit("copy-markdown-link")
  } else {
    emit("copy-markdown")
  }
}
</script>

<template>
  <div class="min-h-full bg-surface-soft px-4 py-4">
    <!-- 样式设置 tab（对齐语雀：页面尺寸双卡 + 正文大小 + 段间距） -->
    <template v-if="activeTab === 'style'">
      <section class="mt-4 rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
        <p class="text-sm font-medium text-ink">文档样式</p>
        <p class="mt-1 text-xs leading-5 text-ink-quaternary">
          以下设置仅对当前文档生效；页面尺寸跟随知识库「更多设置」。
        </p>

        <p class="mt-4 text-[13px] font-medium text-ink">页面尺寸</p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <button
            v-for="mode in [
              { value: 'standard', label: '标宽模式' },
              { value: 'wide', label: '超宽模式' },
            ]"
            :key="mode.value"
            type="button"
            class="flex flex-col items-center gap-2 rounded-kb-xl border px-3 py-4 transition"
            :class="
              docWidthMode === mode.value
                ? 'border-brand bg-brand-faint/40 text-brand'
                : 'border-line bg-muted text-ink-secondary hover:border-brand-lighter'
            "
            @click="emit('update:doc-width-mode', mode.value as 'standard' | 'wide')"
          >
            <span
              class="flex h-8 w-12 flex-col justify-center gap-1 rounded-kb-md border border-current opacity-70"
            >
              <span class="mx-auto block h-1 w-8 rounded-full bg-current"></span>
              <span class="mx-auto block h-1 w-6 rounded-full bg-current"></span>
            </span>
            <span class="text-[12px] font-medium">{{ mode.label }}</span>
          </button>
        </div>

        <p class="mt-4 text-[13px] font-medium text-ink">正文大小</p>
        <div class="mt-1 flex items-center gap-3">
          <el-slider
            class="flex-1"
            :min="12"
            :max="20"
            :step="1"
            :model-value="docStyle?.fontSize ?? 15"
            @change="
              (value: number | number[]) =>
                emit('update:doc-style', {
                  fontSize: Number(value),
                  paragraphSpacing: docStyle?.paragraphSpacing ?? 'default',
                })
            "
          />
          <span class="w-10 shrink-0 text-right text-[12px] text-ink-tertiary"
            >{{ docStyle?.fontSize ?? 15 }}px</span
          >
        </div>

        <div class="mt-4 flex items-center justify-between">
          <p class="text-[13px] font-medium text-ink">段间距</p>
          <el-radio-group
            :model-value="docStyle?.paragraphSpacing ?? 'default'"
            @update:model-value="
              (value) =>
                emit('update:doc-style', {
                  fontSize: docStyle?.fontSize ?? 15,
                  paragraphSpacing: value === 'relax' ? 'relax' : 'default',
                })
            "
          >
            <el-radio value="default">常规</el-radio>
            <el-radio value="relax">宽松</el-radio>
          </el-radio-group>
        </div>
      </section>
    </template>

    <template v-else>
      <!-- 知识网络卡（对齐语雀：边框方块图标 + 下方左对齐文字） -->
      <button
        type="button"
        class="mt-4 -m-1 flex flex-col items-start gap-2.5 rounded-kb-xl p-1 text-left transition hover:bg-fill-subtle"
        @click="emit('open-knowledge-network')"
      >
        <span
          class="flex h-[68px] w-[68px] items-center justify-center rounded-kb-2xl border border-line bg-surface"
        >
          <Icon icon="i-lucide-waypoints" class="h-7 w-7 text-ink-secondary" />
        </span>
        <span class="text-[14px] text-ink">知识网络</span>
      </button>

      <!-- 文档信息卡（点击开「统计详情」） -->
      <button
        type="button"
        class="mt-4 flex w-full items-center gap-3 rounded-kb-xl bg-fill-subtle px-4 py-3.5 text-left transition hover:bg-fill-muted"
        @click="emit('open-stats')"
      >
        <Icon icon="ph:notebook" :width="22" :height="22" class="shrink-0 text-brand" />
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-medium text-ink">文档信息</span>
          <span class="mt-0.5 block truncate text-[12px] text-ink-tertiary">
            {{ creatorLabel }}<template v-if="updatedAtLabel"> 更新于{{ updatedAtLabel }}</template>
          </span>
        </span>
        <Icon icon="ph:caret-right" :width="14" :height="14" class="shrink-0 text-ink-quaternary" />
      </button>

      <!-- 操作列表卡（单列：图标 + 文字；导出…/复制… 可展开子菜单；删除红字） -->
      <div class="mt-3 rounded-kb-xl bg-fill-subtle px-2 py-2">
        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          @click="emit('open-in-browser')"
        >
          <Icon icon="i-lucide-app-window" class="h-[18px] w-[18px] shrink-0 text-ink-secondary" />
          <span class="text-[14px] text-ink">在浏览器打开</span>
        </button>
        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          @click="emit('enter-reading')"
        >
          <Icon icon="i-lucide-book-open" class="h-[18px] w-[18px] shrink-0 text-ink-secondary" />
          <span class="text-[14px] text-ink">{{
            props.reading ? "退出阅读模式" : "进入阅读模式"
          }}</span>
        </button>
        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          @click="emit('save-as-template')"
        >
          <Icon icon="i-lucide-stamp" class="h-[18px] w-[18px] shrink-0 text-ink-secondary" />
          <span class="text-[14px] text-ink">{{ templateLabel }}</span>
        </button>
        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          @click="emit('open-history')"
        >
          <Icon icon="i-lucide-history" class="h-[18px] w-[18px] shrink-0 text-ink-secondary" />
          <span class="text-[14px] text-ink">查看历史版本</span>
        </button>

        <!-- 导出… -->
        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          :aria-expanded="expandedMenu === 'export'"
          @click="toggleMenu('export')"
        >
          <Icon icon="i-lucide-file-output" class="h-[18px] w-[18px] shrink-0 text-ink-secondary" />
          <span class="min-w-0 flex-1 truncate text-[14px] text-ink">导出…</span>
          <Icon
            icon="ph:caret-down"
            :width="12"
            :height="12"
            class="shrink-0 text-ink-quaternary transition"
            :class="expandedMenu === 'export' ? 'rotate-180' : ''"
          />
        </button>
        <div v-if="expandedMenu === 'export'" class="mb-1 space-y-0.5">
          <button
            v-for="item in exportItems"
            :key="item.action"
            type="button"
            class="flex h-9 w-full items-center gap-3 rounded-kb-lg pl-10 pr-3 text-left transition hover:bg-fill-muted"
            @click.stop="emit('export-action', item.action)"
          >
            <Icon :icon="item.icon" class="h-4 w-4 shrink-0 text-ink-tertiary" />
            <span class="truncate text-[13px] text-ink-secondary">{{ item.label }}</span>
          </button>
        </div>

        <!-- 复制… -->
        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          :aria-expanded="expandedMenu === 'copy'"
          @click="toggleMenu('copy')"
        >
          <Icon icon="i-lucide-copy" class="h-[18px] w-[18px] shrink-0 text-ink-secondary" />
          <span class="min-w-0 flex-1 truncate text-[14px] text-ink">复制…</span>
          <Icon
            icon="ph:caret-down"
            :width="12"
            :height="12"
            class="shrink-0 text-ink-quaternary transition"
            :class="expandedMenu === 'copy' ? 'rotate-180' : ''"
          />
        </button>
        <div v-if="expandedMenu === 'copy'" class="mb-1 space-y-0.5">
          <button
            v-for="item in copyItems"
            :key="item.emit"
            type="button"
            class="flex h-9 w-full items-center gap-3 rounded-kb-lg pl-10 pr-3 text-left transition hover:bg-fill-muted"
            @click.stop="runCopyAction(item.emit)"
          >
            <Icon :icon="item.icon" class="h-4 w-4 shrink-0 text-ink-tertiary" />
            <span class="truncate text-[13px] text-ink-secondary">{{ item.label }}</span>
          </button>
        </div>

        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-fill-muted"
          @click="emit('move')"
        >
          <Icon
            icon="i-lucide-folder-input"
            class="h-[18px] w-[18px] shrink-0 text-ink-secondary"
          />
          <span class="text-[14px] text-ink">移动…</span>
        </button>

        <button
          type="button"
          class="flex h-11 w-full items-center gap-3 rounded-kb-lg px-3 text-left transition hover:bg-error-bg"
          @click="emit('move-trash')"
        >
          <Icon icon="i-lucide-trash-2" class="h-[18px] w-[18px] shrink-0 text-error" />
          <span class="text-[14px] text-error">删除</span>
        </button>
      </div>
    </template>
  </div>
</template>

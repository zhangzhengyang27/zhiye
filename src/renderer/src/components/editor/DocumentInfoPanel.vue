<script setup lang="ts">
/**
 * 文档「操作与信息」面板内容（对齐语雀真机 2026-09-21：两 tab——操作与信息 / 样式设置）。
 *
 * 外壳（标题/关闭/宽度动画/Esc）由 DocSidePanelShell 统一承担；tab 状态面板自持
 * （此前走视图 openSidePanel('style') 会把整组侧栏关掉，样式设置 tab 实际不可用）。
 * 收编顶栏原「更多菜单」的散落能力（导出/复制/模板/回收站等 19 项动作）。
 *
 * 注：语雀面板无「协作成员」「快捷键」卡——协作入口在顶栏「协作」浮层、快捷键入口
 * 在编辑器右下角悬浮钮（EditorShortcutPanel），此处不再用 workspaceMembers 冒充
 * 文档协作者，也不与快捷键面板重复。
 */
import { computed, ref } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import DocumentSidePanelTabs from "./DocumentSidePanelTabs.vue"
import DocumentInfoOverviewCard from "./info/DocumentInfoOverviewCard.vue"
import DocumentInfoQuickActionsCard from "./info/DocumentInfoQuickActionsCard.vue"
import type { DocumentInfoAction } from "./info/DocumentInfoQuickActionsCard.vue"

/** 文档级编辑样式：字号（px）+ 段间距档位。视图层与本面板共用此形状。 */
export interface DocEditorStyle {
  fontSize: number
  paragraphSpacing: "default" | "relax"
}

type DocumentSidePanelTab = "search" | "comments" | "versions" | "info" | "style" | "ai"

type OutlineItem = {
  id: string
  text: string
  depth: number
}

const props = withDefaults(
  defineProps<{
    outlineItems: OutlineItem[]
    stats: Array<{ label: string; value: string }>
    favorite: boolean
    visibleActions?: DocumentInfoAction[]
    actionsBadgeLabel?: string | null
    /** 创建者 / 创建时间 / 更新时间等元信息行（对齐语雀信息面板） */
    meta?: Array<{ label: string; value: string }>
    /** 语雀「样式设置」tab：正文样式与页面尺寸 */
    docStyle?: DocEditorStyle
    docWidthMode?: "standard" | "wide"
    creatorLabel?: string
    updatedAtLabel?: string
  }>(),
  {
    visibleActions: () => ["copy-link", "open-share", "open-history", "toggle-favorite"],
    actionsBadgeLabel: null,
    meta: () => [],
    docStyle: undefined,
    docWidthMode: undefined,
    creatorLabel: "",
    updatedAtLabel: "",
  },
)

const emit = defineEmits<{
  "jump-outline": [itemId: string]
  "copy-link": []
  "toggle-favorite": []
  "open-share": []
  "open-history": []
  "open-template-library": []
  "open-knowledge-network": []
  "insert-emoji": []
  "enter-reading": []
  "copy-markdown-link": []
  "open-in-browser": []
  "export-action": [
    action:
      | "print-doc"
      | "export-markdown"
      | "export-pdf"
      | "export-word"
      | "export-image"
      | "export-lake",
  ]
  "save-doc": []
  "reload-doc": []
  "make-template": []
  "move-trash": []
  "open-stats": []
  "update:doc-style": [style: DocEditorStyle]
  "update:doc-width-mode": [mode: "standard" | "wide"]
}>()

/** tab 面板自持：样式设置此前经视图中转会把侧栏整组关掉（实际不可用） */
const activeTab = ref<DocumentSidePanelTab>("info")

const quickActions = computed(() => {
  const actionMap: Array<{ id: DocumentInfoAction; label: string }> = [
    { id: "open-knowledge-network", label: "知识网络" },
    { id: "enter-reading", label: "进入阅读模式" },
    // Lake 原生 unicodeEmoji：光标处插入 emoji 卡（卡片自带分类/搜索面板）；编辑态可见
    { id: "insert-emoji", label: "插入表情" },
    { id: "copy-link", label: "复制链接" },
    { id: "open-share", label: "打开分享" },
    { id: "open-history", label: "查看历史版本" },
    { id: "open-template-library", label: "模板库" },
    { id: "toggle-favorite", label: props.favorite ? "取消收藏" : "收藏文档" },
    // 顶栏收编的原「更多菜单」能力(对齐语雀操作与信息列表的 导出…/复制…/移动…/删除)
    { id: "copy-markdown-link", label: "复制标题链接" },
    { id: "open-in-browser", label: "在浏览器打开" },
    { id: "print-doc", label: "打印文档" },
    { id: "export-markdown", label: "导出为 Markdown" },
    { id: "export-pdf", label: "导出为 PDF" },
    { id: "export-word", label: "导出为 Word" },
    { id: "export-image", label: "导出为图片" },
    { id: "export-lake", label: "导出为语雀文档 (.lake)" },
    { id: "save-doc", label: "保存文档" },
    { id: "reload-doc", label: "重新加载文档" },
    { id: "make-template", label: "设为模板" },
    { id: "move-trash", label: "移入回收站" },
  ]

  return actionMap.filter((action) => props.visibleActions.includes(action.id))
})

/**
 * 徽章配色（T4 评审 I-2 基线保真）：壳时代 AppBadge 的 toneClass bg-muted
 * （dark=grey-100→rgb(20,20,20)）压过本处调用点的 bg-grey-200（dark=#1f1f1f），
 * muted 为基线渲染真值；解散后冲突消失、grey-200 胜出导致暗底 +11/通道
 * （info-dark pixdiff 775 major）——故移除 bg-grey-200，底色交由校准段
 * .el-tag 基准（muted）承担。备选（暗色更可见）属产品决策，留待用户拍板。
 */
const quickActionsBadge = computed(() => {
  if (props.actionsBadgeLabel) {
    return {
      label: props.actionsBadgeLabel,
      className: "text-ink-tertiary",
    }
  }

  if (props.visibleActions.includes("toggle-favorite")) {
    return props.favorite
      ? {
          label: "已收藏",
          className: "bg-warning-bg text-warning-hover",
        }
      : {
          label: "未收藏",
          className: "text-ink-tertiary",
        }
  }

  return {
    label: "快捷操作",
    className: "text-ink-tertiary",
  }
})

const handleQuickAction = (action: DocumentInfoAction) => {
  if (action === "open-knowledge-network") {
    emit("open-knowledge-network")
    return
  }

  if (action === "enter-reading") {
    emit("enter-reading")
    return
  }

  if (action === "copy-link") {
    emit("copy-link")
    return
  }

  if (action === "open-share") {
    emit("open-share")
    return
  }

  if (action === "open-history") {
    emit("open-history")
    return
  }

  if (action === "open-template-library") {
    emit("open-template-library")
    return
  }

  if (action === "copy-markdown-link") {
    emit("copy-markdown-link")
    return
  }

  if (action === "open-in-browser") {
    emit("open-in-browser")
    return
  }

  if (action === "insert-emoji") {
    emit("insert-emoji")
    return
  }

  if (
    action === "print-doc" ||
    action === "export-markdown" ||
    action === "export-pdf" ||
    action === "export-word" ||
    action === "export-image" ||
    action === "export-lake"
  ) {
    emit("export-action", action)
    return
  }

  if (action === "save-doc") {
    emit("save-doc")
    return
  }

  if (action === "reload-doc") {
    emit("reload-doc")
    return
  }

  if (action === "make-template") {
    emit("make-template")
    return
  }

  if (action === "move-trash") {
    emit("move-trash")
    return
  }

  emit("toggle-favorite")
}
</script>

<template>
  <div class="min-h-full bg-surface-soft px-4 py-4">
    <div class="mb-3">
      <DocumentSidePanelTabs
        :active-tab="activeTab"
        :tabs="['info', 'style']"
        @switch-tab="activeTab = $event"
      />
    </div>

    <!-- 样式设置 tab（对齐语雀：页面尺寸双卡 + 正文大小 + 段间距） -->
    <template v-if="activeTab === 'style'">
      <section class="rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
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
      <!-- 文档信息卡（对齐语雀：作者 + 更新时间，点击开「统计详情」） -->
      <section
        v-if="creatorLabel || updatedAtLabel"
        class="flex cursor-pointer items-center gap-3 rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)] transition hover:bg-brand-faint/30"
        @click="emit('open-stats')"
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-kb-xl bg-fill-muted text-ink-secondary"
        >
          <Icon icon="ph:notebook" :width="18" :height="18" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-medium text-ink">文档信息</p>
          <p class="mt-0.5 truncate text-[11px] text-ink-tertiary">
            {{ creatorLabel
            }}<template v-if="updatedAtLabel"> · 更新于 {{ updatedAtLabel }}</template>
          </p>
        </div>
        <Icon icon="ph:caret-right" :width="14" :height="14" class="shrink-0 text-ink-quaternary" />
      </section>

      <!-- 内容大纲置顶：信息面板首屏即见大纲（此前排快捷操作/概览之后需滚动才见） -->
      <section class="rounded-kb-3xl bg-surface p-4 shadow-[var(--kb-surface-shadow)]">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-ink">内容大纲</p>
            <p class="mt-1 text-xs text-ink-quaternary">快速跳到对应标题附近。</p>
          </div>
          <span
            class="rounded-full bg-fill-muted px-2.5 py-1 text-[11px] font-medium text-ink-tertiary"
          >
            {{ outlineItems.length }} 个标题
          </span>
        </div>

        <div
          v-if="outlineItems.length === 0"
          class="mt-4 rounded-kb-2xl bg-muted px-4 py-6 text-center"
        >
          <p class="text-sm font-medium text-ink-tertiary">还没有可用的大纲</p>
          <p class="mt-1 text-xs leading-5 text-ink-quaternary">
            插入 H1-H4 标题后，这里会自动生成结构。
          </p>
        </div>

        <div v-else class="mt-4 space-y-1.5">
          <button
            v-for="item in outlineItems"
            :key="item.id"
            type="button"
            class="flex h-7 w-full items-center gap-2 rounded-kb-sm px-2 text-left text-kb-sm text-ink-secondary transition-colors hover:bg-grey-200 hover:text-brand"
            :style="{ paddingLeft: `${12 + item.depth * 14}px` }"
            @click="emit('jump-outline', item.id)"
          >
            <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
            <span class="truncate">{{ item.text }}</span>
          </button>
        </div>
      </section>

      <DocumentInfoQuickActionsCard
        v-if="quickActions.length > 0"
        class="mt-4"
        :quick-actions="quickActions"
        :badge="quickActionsBadge"
        @trigger-action="handleQuickAction"
      />

      <DocumentInfoOverviewCard class="mt-4" :stats="stats" :meta="meta" />
    </template>
  </div>
</template>

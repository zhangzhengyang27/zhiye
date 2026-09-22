<script setup lang="ts">
/**
 * 编辑器快捷键速查面板（对齐语雀：右下角悬浮按钮 → 可搜索的对照表）。
 *
 * 数据来源：Lake 内核（yuque-editor-core 内置 doc.umd.js）的快捷键注册表——
 * 逐条从内核 bundle 的 registry（{name, keys, markdown} 结构）核对摘录，
 * 只收录文档编辑常用项；表格专属（合并单元格等）与存在歧义的注册项
 * （⇧⌘F 在内核同时注册了查找替换与全屏，实测编辑态唤起查找替换面板）收录
 * 「查找替换」。应用级「保存 ⌘S」来自
 * KnowledgeDocEditorView 的全局按键监听。
 *
 * 键位展示按平台映射（内核在 Windows 用 Ctrl 等价 Cmd）。
 */
import { computed, ref, watch } from "vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import AppIcon from "@/components/common/AppIcon.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

interface ShortcutRow {
  label: string
  /** 键位 token 序列：cmd/opt/shift/enter/tab/字母数字；无快捷键则省略 */
  keys?: string[]
  /** Markdown 输入语法与触发键，如 ["#","Space"]；无可省略 */
  markdown?: [string, string?]
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const keyword = ref("")
const isMac = computed(() => typeof navigator !== "undefined" && /mac/i.test(navigator.platform))

const groups: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "段落",
    rows: [
      { label: "标题 1", keys: ["opt", "cmd", "1"], markdown: ["#", "Space"] },
      { label: "标题 2", keys: ["opt", "cmd", "2"], markdown: ["##", "Space"] },
      { label: "标题 3", keys: ["opt", "cmd", "3"], markdown: ["###", "Space"] },
      { label: "标题 4", keys: ["opt", "cmd", "4"], markdown: ["####", "Space"] },
      { label: "标题 5", keys: ["opt", "cmd", "5"], markdown: ["#####", "Space"] },
      { label: "标题 6", keys: ["opt", "cmd", "6"], markdown: ["######", "Space"] },
      { label: "有序列表", keys: ["shift", "cmd", "7"], markdown: ["1.", "Space"] },
      { label: "无序列表", keys: ["shift", "cmd", "8"], markdown: ["*", "Space"] },
      { label: "任务列表", keys: ["opt", "cmd", "T"], markdown: ["[]", "Space"] },
      { label: "引用", keys: ["shift", "cmd", "U"], markdown: [">", "Space"] },
      { label: "分割线", keys: ["opt", "cmd", "S"], markdown: ["---", "Enter"] },
      { label: "软换行", keys: ["shift", "Enter"] },
    ],
  },
  {
    title: "行内格式",
    rows: [
      { label: "粗体", keys: ["cmd", "B"], markdown: ["**x**", "Space"] },
      { label: "斜体", keys: ["cmd", "I"], markdown: ["_x_", "Space"] },
      { label: "下划线", keys: ["cmd", "U"], markdown: ["++x++", "Space"] },
      { label: "删除线", keys: ["shift", "cmd", "X"], markdown: ["~~x~~", "Space"] },
      { label: "行内代码", keys: ["cmd", "E"], markdown: ["`x`", "Space"] },
      { label: "背景颜色（高亮）", keys: ["opt", "cmd", "H"], markdown: ["==x==", "Space"] },
      { label: "上标", keys: ["shift", "cmd", "."], markdown: ["^x^", "Space"] },
      { label: "下标", keys: ["shift", "cmd", ","], markdown: ["~x~", "Space"] },
      { label: "公式", markdown: ["$x$", "Space"] },
      { label: "清除格式", keys: ["cmd", "\\"] },
    ],
  },
  {
    title: "插入与排版",
    rows: [
      { label: "插入卡片（/ 菜单）", keys: ["cmd", "/"], markdown: ["/"] },
      { label: "链接", keys: ["cmd", "K"], markdown: ["[]()", "Space"] },
      { label: "图片", markdown: ["![]()", "Space"] },
      { label: "表格", markdown: ["|x|y|", "Enter"] },
      { label: "代码块", markdown: ["```", "Enter"] },
      { label: "增加缩进", keys: ["cmd", "]"] },
      { label: "减少缩进", keys: ["cmd", "["] },
      { label: "全选", keys: ["cmd", "A"] },
    ],
  },
  {
    title: "应用",
    rows: [
      { label: "保存文档", keys: ["cmd", "S"] },
      { label: "查找替换", keys: ["shift", "cmd", "F"] },
    ],
  },
]

const KEY_LABELS: Record<string, { mac: string; other: string }> = {
  cmd: { mac: "⌘", other: "Ctrl" },
  opt: { mac: "⌥", other: "Alt" },
  shift: { mac: "⇧", other: "Shift" },
  enter: { mac: "⏎", other: "Enter" },
  tab: { mac: "⇥", other: "Tab" },
}

const renderKey = (token: string) => {
  const label = KEY_LABELS[token]
  if (!label) {
    return token.toUpperCase()
  }
  return isMac.value ? label.mac : label.other
}

/** 搜索匹配功能名 / 语法文本 / 键位 token */
const filteredGroups = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) {
    return groups
  }

  return groups
    .map(group => ({
      title: group.title,
      rows: group.rows.filter(
        row =>
          row.label.toLowerCase().includes(query) ||
          (row.markdown?.[0] ?? "").toLowerCase().includes(query) ||
          (row.keys ?? []).some(key => key.toLowerCase().includes(query))
      ),
    }))
    .filter(group => group.rows.length > 0)
})

// 关闭后清空过滤词，避免下次打开仍停留在上次的搜索结果
watch(
  () => props.open,
  open => {
    if (!open) {
      keyword.value = ""
    }
  }
)

const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <!-- el-dialog 的关闭契约：Esc/遮罩/× 都走 update:model-value(false)，这里转成对外的 close 事件 -->
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-xl"
    :model-value="open"
    title="快捷键"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="value => !value && emit('close')"
  >
    <template #header>
      <KbDialogHeader title="快捷键" eyebrow="编辑器" @close="emit('close')" />
    </template>

    <div class="flex flex-col gap-4">
      <div class="relative">
        <el-input v-model="keyword" type="text" placeholder="输入功能关键字搜索" class="pl-9" />
        <!-- 图标改靠 DOM 序压在控件之上（原先用 z-10 硬抬，散落层级） -->
        <AppIcon
          name="i-lucide-search"
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-quaternary"
        />
      </div>

      <div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 px-1 text-[12px] font-medium text-ink-quaternary">
        <span>功能</span>
        <span>快捷键</span>
        <span>Markdown</span>
      </div>

      <div class="max-h-[46vh] overflow-y-auto pr-1">
        <p v-if="filteredGroups.length === 0" class="py-10 text-center text-sm text-ink-tertiary">
          没有匹配「{{ keyword }}」的快捷键。
        </p>

        <section v-for="group in filteredGroups" :key="group.title" class="mb-4 last:mb-0">
          <h4 class="mb-2 px-1 text-[12px] font-semibold text-ink-tertiary">{{ group.title }}</h4>

          <ul class="overflow-hidden rounded-kb-xl border border-line">
            <li
              v-for="row in group.rows"
              :key="row.label"
              class="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-line px-3 py-2 last:border-b-0 hover:bg-muted"
            >
              <span class="text-[13px] text-ink-secondary">{{ row.label }}</span>
              <span class="flex min-w-14 items-center justify-end gap-1">
                <template v-if="row.keys">
                  <kbd
                    v-for="key in row.keys"
                    :key="key"
                    class="inline-flex h-5 min-w-5 items-center justify-center rounded-kb-xs border border-line bg-muted px-1 font-mono text-[11px] text-ink-secondary"
                  >
                    {{ renderKey(key) }}
                  </kbd>
                </template>
              </span>
              <span v-if="row.markdown" class="min-w-28 text-right font-mono text-[11px] text-ink-tertiary">
                {{ row.markdown[0] }}<template v-if="row.markdown[1]"> + {{ row.markdown[1] }}</template>
              </span>
              <span v-else class="min-w-28 text-right font-mono text-[11px] text-ink-quaternary">—</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </el-dialog>
</template>

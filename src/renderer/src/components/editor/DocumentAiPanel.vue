<script setup lang="ts">
/**
 * 文档 AI 写作侧栏面板。
 *
 * 复用画板 AI 的 DeepSeek 通道（后端 /knowledge/documents/:id/ai/write）：
 * 内置「总结全文 / 生成大纲 / 续写 / 翻译英文 / 润色」快捷动作 + 自定义指令输入框，
 * 结果支持一键复制与「插入到文档末尾」。
 * 模型配置沿用画板 AI 的本地激活 profile，未配置时展示服务端提示。
 */
import { ref, watch } from "vue"
import UiIcon from "@/components/common/UiIcon.vue"
import AppIcon from "@/components/common/AppIcon.vue"
// DocumentSidePanelTabs 不引入：AI 框无 tab 条（顶栏竖条开关直达，见下方头部注释），
// 拼接残片曾误从 DocumentInfoPanel 带来该导入
import { generateDocumentAiWrite, type DocAiAction } from "@/services/knowledge-doc-ai"
import { isImeComposing } from "@/utils/keyboard"
import {
  getKnowledgeBoardAiStorageKey,
  readKnowledgeBoardAiStoredConfig,
  getKnowledgeBoardAiActiveProfile,
} from "@/utils/knowledge-board-ai-config"

type SidePanelTab = "search" | "comments" | "versions" | "info" | "ai"

const props = withDefaults(
  defineProps<{
    open: boolean
    documentId: string
    token?: string | null
    userId?: string | null
    /** 划选 AI 入口注入的种子指令（选中文本）；消费后由父层清空 */
    seedInstruction?: string | null
  }>(),
  {
    token: null,
    userId: null,
    seedInstruction: null,
  },
)

const emit = defineEmits<{
  close: []
  "switch-tab": [tab: SidePanelTab]
  "insert-to-end": [text: string]
}>()

const QUICK_ACTIONS: Array<{ action: DocAiAction; label: string }> = [
  { action: "summarize", label: "总结全文" },
  { action: "outline", label: "生成大纲" },
  { action: "continue", label: "续写" },
  { action: "translate", label: "翻译英文" },
  { action: "polish", label: "润色" },
]

const activeAction = ref<DocAiAction>("summarize")
const instruction = ref("")
const result = ref("")
const errorMessage = ref("")
const busy = ref(false)
const copied = ref(false)
const inserted = ref(false)

const clearOutput = () => {
  result.value = ""
  errorMessage.value = ""
  copied.value = false
  inserted.value = false
}

/** 划选 AI（B1 #7）：种子指令（选中文本）到达即切自定义模式预填，用户补一句指令或直接生成 */
watch(
  () => props.seedInstruction,
  (seed) => {
    if (!seed) return
    activeAction.value = "custom"
    instruction.value = `请基于以下选中内容：\n\n${seed}\n\n`
    clearOutput()
  },
  { immediate: true },
)

const run = async (action: DocAiAction) => {
  activeAction.value = action
  if (busy.value) return
  clearOutput()
  busy.value = true
  try {
    const storageKey = getKnowledgeBoardAiStorageKey(props.userId)
    const collection = await readKnowledgeBoardAiStoredConfig(storageKey, props.userId)
    const profile = getKnowledgeBoardAiActiveProfile(collection)
    const providerConfig = {
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
      timeoutMs: profile.timeoutMs,
    }
    const instructionText =
      activeAction.value === "custom"
        ? instruction.value.trim()
        : instruction.value.trim() || undefined
    const response = await generateDocumentAiWrite(
      props.documentId,
      {
        action: activeAction.value,
        instruction: instructionText,
        providerConfig,
      },
      props.token,
    )
    result.value = response.text
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "AI 生成失败，请稍后重试。"
  } finally {
    busy.value = false
  }
}

const handleQuickAction = (action: DocAiAction) => {
  void run(action)
}

const handleCustomSubmit = () => {
  if (!instruction.value.trim()) return
  void run("custom")
}

/** ⌘/Ctrl+Enter 提交；输入法组词中的 Enter 是确认候选，不触发提交 */
const handleInstructionKeydown = (event: KeyboardEvent | Event) => {
  if (!(event instanceof KeyboardEvent)) {
    return
  }
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || isImeComposing(event)) {
    return
  }

  event.preventDefault()
  handleCustomSubmit()
}

const copyResult = async () => {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1600)
  } catch {
    errorMessage.value = "复制失败，请手动选择文本复制。"
  }
}

const insertToEnd = () => {
  if (!result.value) return
  emit("insert-to-end", result.value)
  inserted.value = true
  window.setTimeout(() => (inserted.value = false), 1600)
}
</script>

<template>
  <aside
    class="flex h-full w-[375px] shrink-0 flex-col overflow-hidden border-l border-line bg-surface"
    aria-label="AI 助手面板"
  >
    <div class="shrink-0 px-4 pt-4">
      <!-- 对齐语雀「AI 独立框」头部：标题 + 收起，无 tab 条（顶栏竖条开关直达） -->
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-1.5 text-base font-semibold text-ink">
          <AppIcon name="i-lucide-sparkles" class="h-4 w-4 text-brand" />
          AI 写作
        </h2>
        <button
          type="button"
          class="rounded-kb-md p-1 text-ink-tertiary transition hover:bg-muted hover:text-ink-secondary"
          title="关闭"
          @click="emit('close')"
        >
          <AppIcon name="i-lucide-x" class="h-4 w-4" />
        </button>
      </div>
      <p class="mt-1 text-[12px] leading-relaxed text-ink-tertiary">
        模型通道与画板 AI 共用，配置沿用「模型配置」中的激活项。
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in QUICK_ACTIONS"
          :key="item.action"
          type="button"
          class="rounded-full border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-default disabled:opacity-50"
          :class="
            activeAction === item.action
              ? 'border-brand bg-brand-faint text-brand'
              : 'border-line bg-muted text-ink-secondary hover:border-brand-lighter hover:text-brand'
          "
          :disabled="busy"
          @click="handleQuickAction(item.action)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="mt-4">
        <el-input
          v-model="instruction"
          type="textarea"
          :rows="3"
          resize="none"
          class="resize-none overflow-hidden"
          placeholder="自定义指令，例如：用表格对比这几个方案，或把结论改写得更口语化…（⌘/Ctrl + Enter 生成）"
          :disabled="busy"
          @keydown="handleInstructionKeydown"
        />
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-[11px] text-ink-quaternary">也可先选择快捷动作直接生成</span>
          <el-button
            type="primary"
            class="rounded-kb-md px-3 gap-1.5"
            :loading="busy"
            :disabled="busy || !instruction.trim()"
            @click="handleCustomSubmit"
            ><template #loading
              ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
            /></template>
            <span class="truncate">生成</span>
          </el-button>
        </div>
      </div>

      <div v-if="busy" class="mt-5 flex items-center justify-center gap-2 py-8 text-ink-tertiary">
        <AppIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
        <span class="text-[13px]">AI 正在生成…</span>
      </div>

      <div
        v-else-if="errorMessage"
        class="mt-5 rounded-kb-xl border border-error-light bg-error-bg px-3 py-2.5 text-[13px] leading-relaxed text-error"
      >
        <div class="flex items-start gap-1.5">
          <AppIcon name="i-lucide-circle-alert" class="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p class="font-medium">生成失败</p>
            <p class="mt-0.5 break-all text-ink-secondary">{{ errorMessage }}</p>
            <p class="mt-1 text-[12px] text-ink-tertiary">
              可在画板文档的顶部「模型配置」中填写 API Key 后重试。
            </p>
          </div>
        </div>
      </div>

      <div v-else-if="result" class="mt-5 rounded-kb-xl border border-line bg-muted/60 p-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[12px] font-medium text-ink-tertiary">生成结果</span>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-kb-md px-2 py-1 text-[12px] text-ink-secondary transition hover:bg-surface hover:text-brand"
              @click="copyResult"
            >
              <AppIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="h-3.5 w-3.5" />
              {{ copied ? "已复制" : "复制" }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-kb-md px-2 py-1 text-[12px] text-ink-secondary transition hover:bg-surface hover:text-brand"
              @click="insertToEnd"
            >
              <AppIcon
                :name="inserted ? 'i-lucide-check' : 'i-lucide-corner-down-left'"
                class="h-3.5 w-3.5"
              />
              {{ inserted ? "已插入" : "插入文末" }}
            </button>
          </div>
        </div>
        <div
          class="max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink"
        >
          {{ result }}
        </div>
      </div>

      <div
        v-else
        class="mt-5 flex flex-col items-center gap-2 py-10 text-center text-ink-quaternary"
      >
        <AppIcon name="i-lucide-wand-2" class="h-6 w-6" />
        <p class="text-[12px] leading-relaxed">
          选择快捷动作或输入指令，<br />AI 将结合文档正文给出结果。
        </p>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
/** 负责承载画板 AI 提示词输入、生成反馈与结果应用操作。 */
import Icon from "@/components/common/UiIcon.vue"
import {
  KNOWLEDGE_BOARD_AI_MODES,
  type KnowledgeBoardAiKind,
  type KnowledgeBoardAiMode,
} from "@/types/knowledge-board-ai"

const props = withDefaults(
  defineProps<{
    prompt: string
    mode: KnowledgeBoardAiMode
    systemPrompt: string
    loading?: boolean
    error?: string
    summary?: string
    warnings?: string[]
    resultKind?: KnowledgeBoardAiKind | null
    hasGeneratedResult?: boolean
  }>(),
  {
    loading: false,
    error: "",
    summary: "",
    warnings: () => [],
    resultKind: null,
    hasGeneratedResult: false,
  },
)

const emit = defineEmits<{
  close: []
  generate: []
  applyReplace: []
  applyAppend: []
  "update:prompt": [value: string]
  "update:mode": [value: KnowledgeBoardAiMode]
}>()

interface BoardAiModeOption {
  value: KnowledgeBoardAiMode
  label: string
}

const modeOptions: BoardAiModeOption[] = [
  {
    value: KNOWLEDGE_BOARD_AI_MODES.auto,
    label: "自动",
  },
  {
    value: KNOWLEDGE_BOARD_AI_MODES.flowchart,
    label: "流程图",
  },
  {
    value: KNOWLEDGE_BOARD_AI_MODES.whiteboard,
    label: "白板卡片",
  },
]
</script>

<template>
  <aside
    class="flex h-full w-full max-w-[420px] flex-col border-l border-line bg-surface-soft shadow-[var(--kb-panel-shadow)]"
  >
    <header class="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <p class="text-[16px] font-semibold text-ink">AI 生成</p>
        <p class="mt-1 text-[12px] leading-5 text-ink-tertiary">先生成草稿，再决定替换或追加。</p>
      </div>
      <el-button
        plain
        class="h-9 border-line bg-surface px-3 text-[13px] text-ink-tertiary hover:border-brand-light hover:text-ink-secondary py-0 [line-height:inherit] font-semibold"
        @click="emit('close')"
        ><span class="truncate">关闭</span>
      </el-button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      <section
        class="rounded-kb-3xl border border-line bg-surface px-4 py-4 shadow-[var(--kb-surface-shadow)]"
      >
        <div class="flex items-center justify-between gap-3">
          <label class="text-[13px] font-semibold text-ink-secondary">需求描述</label>
          <span class="text-[11px] text-ink-quaternary">支持流程图与白板卡片</span>
        </div>
        <!-- el-input type=textarea 内部为 div 盒 + 内嵌 textarea：聚焦样式需用 focus-within: 变体（focus: 在盒上不命中） -->
        <el-input
          :model-value="props.prompt"
          type="textarea"
          :rows="4"
          placeholder="例如：帮我画一个知识库文档审批流程，或梳理一个 AI 画板接入方案的卡片白板。"
          class="mt-3 w-full resize-y overflow-hidden text-[14px] leading-6 text-ink-secondary"
          @update:model-value="emit('update:prompt', String($event ?? ''))"
        />

        <div class="mt-4">
          <el-segmented
            :model-value="props.mode"
            :options="modeOptions"
            @update:model-value="emit('update:mode', $event as KnowledgeBoardAiMode)"
          >
            <template #default="{ item }">
              <AppIcon
                v-if="(item as BoardAiModeOption).value === props.mode"
                name="i-lucide-check"
                class="h-3.5 w-3.5 text-success"
              />
              {{ (item as BoardAiModeOption).label }}
            </template>
          </el-segmented>
        </div>

        <el-button
          type="primary"
          :loading="props.loading"
          :disabled="props.loading || !props.prompt.trim()"
          class="mt-3 min-h-11 rounded-kb-2xl text-[14px] shadow-[var(--kb-glow-brand-faint)] disabled:bg-brand-lighter disabled:text-white/90 w-full [line-height:inherit]"
          @click="emit('generate')"
          ><template #loading
            ><Icon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">{{ props.hasGeneratedResult ? "重新生成草稿" : "生成草稿" }}</span>
        </el-button>

        <div class="mt-4 rounded-kb-2xl border border-line bg-surface-soft px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[13px] font-semibold text-ink-secondary">系统提示词</p>
            <span class="text-[11px] text-ink-quaternary">只读展示</span>
          </div>
          <pre
            class="mt-2 max-h-[180px] overflow-y-auto whitespace-pre-wrap text-[12px] leading-5 text-ink-quaternary"
            >{{ props.systemPrompt }}</pre>
        </div>
      </section>

      <section
        v-if="props.error"
        class="mt-4 rounded-kb-2xl border border-error-light bg-error-bg px-4 py-3 text-sm text-error-hover"
      >
        {{ props.error }}
      </section>

      <section
        v-if="props.summary || props.warnings.length > 0"
        class="mt-4 rounded-kb-3xl border border-line bg-surface px-4 py-4"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-[13px] font-semibold text-ink">生成摘要</p>
          <el-tag
            v-if="props.resultKind"
            disable-transitions
            :type="props.resultKind === 'flowchart' ? 'success' : undefined"
            effect="plain"
          >
            <Icon icon="ph:check-circle" :width="12" :height="12" />
            {{ props.resultKind === "flowchart" ? "流程图" : "白板卡片" }}
          </el-tag>
        </div>
        <p v-if="props.summary" class="mt-2 text-[13px] leading-6 text-ink-secondary">
          {{ props.summary }}
        </p>
        <ul
          v-if="props.warnings.length > 0"
          class="mt-3 space-y-2 text-[12px] leading-5 text-warning-hover"
        >
          <li
            v-for="warning in props.warnings"
            :key="warning"
            class="rounded-kb-xl border border-warning-light bg-warning-bg px-3 py-2"
          >
            {{ warning }}
          </li>
        </ul>
      </section>
    </div>

    <footer class="border-t border-line bg-surface px-5 py-4">
      <div class="grid gap-2">
        <el-button
          type="primary"
          :disabled="!props.hasGeneratedResult || props.loading"
          class="min-h-11 rounded-kb-2xl shadow-[var(--kb-glow-brand-faint)] disabled:bg-brand-lighter disabled:text-white/90 w-full"
          @click="emit('applyReplace')"
          ><span class="truncate">替换当前画板</span>
        </el-button>
        <el-button
          plain
          :disabled="!props.hasGeneratedResult || props.loading"
          class="rounded-kb-2xl w-full"
          @click="emit('applyAppend')"
          ><span class="truncate">追加到右侧</span>
        </el-button>
      </div>
    </footer>
  </aside>
</template>

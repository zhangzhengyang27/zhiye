<!-- 组件说明：KnowledgeAiWritingView 组件，负责「AI 写作」页的展示与交互。 -->
<script setup lang="ts">
/**
 * 页面组件：对齐语雀桌面端「AI 写作」页——大标题 + 副标题 + 指令输入卡
 * （深度思考开关 + 生成按钮），生成结果支持复制与存为文档（落到最近活跃知识库）。
 */
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { generateAiStandaloneWrite } from "@/services/knowledge-ai"
import { createKnowledgeDocument, type KnowledgeDocumentItem } from "@/services/knowledge-documents"
import {
  getKnowledgeBoardAiActiveProfile,
  getKnowledgeBoardAiStorageKey,
  readKnowledgeBoardAiStoredConfig,
} from "@/utils/knowledge-board-ai-config"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { isImeComposing } from "@/utils/keyboard"
import { useAuthStore } from "@/stores/auth"

const LAST_ACTIVE_KB_STORAGE_KEY = "knowledge:last-active-kb-id"

const router = useRouter()
const authStore = useAuthStore()
const { showToastMessage } = useTransientToast()

const instruction = ref("")
const deepThink = ref(false)
const generating = ref(false)
const resultText = ref("")
const savingDoc = ref(false)

const knowledgeBases = ref<Array<{ id: string; name: string }>>([])

const canGenerate = computed(() => instruction.value.trim().length > 0 && !generating.value)

/** 结果首行作为存为文档的默认标题（截断到 30 字） */
const resultTitle = computed(() => {
  const firstLine =
    resultText.value
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line.length > 0) ?? ""
  return firstLine.slice(0, 30) || "AI 生成文档"
})

/** ⌘/Ctrl+Enter 提交；输入法组词中的 Enter 是确认候选，不触发生成 */
const handleInstructionKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || isImeComposing(event)) {
    return
  }

  event.preventDefault()
  void handleGenerate()
}

/** 示例指令：对齐语雀 AI 写作页的灵感引导（点击回填输入框） */
const SAMPLE_PROMPTS = [
  "写一篇关于秋天的散文",
  "把一段话翻译成英文并润色",
  "帮我写一份周报模板",
  "用要点总结一个复杂主题",
  "写一封项目延期通知邮件",
]

interface AiWritingHistoryEntry {
  id: string
  instruction: string
  result: string
  deepThink: boolean
  createdAt: string
}

const AI_HISTORY_STORAGE_PREFIX = "knowledge:ai-writing-history:"
const AI_HISTORY_LIMIT = 20

const historyEntries = ref<AiWritingHistoryEntry[]>([])

const aiHistoryStorageKey = () => `${AI_HISTORY_STORAGE_PREFIX}${authStore.user?.id ?? "anon"}`

const loadHistoryEntries = () => {
  try {
    const raw = window.localStorage.getItem(aiHistoryStorageKey())
    const parsed: unknown = raw ? JSON.parse(raw) : []
    historyEntries.value = Array.isArray(parsed) ? (parsed as AiWritingHistoryEntry[]) : []
  } catch {
    historyEntries.value = []
  }
}

const persistHistoryEntries = () => {
  try {
    window.localStorage.setItem(aiHistoryStorageKey(), JSON.stringify(historyEntries.value))
  } catch {
    // 存储满/不可写时静默降级：历史只保留在当前会话内存中
  }
}

const addHistoryEntry = (instruction: string, result: string) => {
  historyEntries.value = [
    {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      instruction,
      result,
      deepThink: deepThink.value,
      createdAt: new Date().toISOString(),
    },
    ...historyEntries.value,
  ].slice(0, AI_HISTORY_LIMIT)
  persistHistoryEntries()
}

const applyHistoryEntry = (entry: AiWritingHistoryEntry) => {
  instruction.value = entry.instruction
  resultText.value = entry.result
  deepThink.value = entry.deepThink
}

/** 待确认清空历史：破坏性操作（本地 20 条生成记录不可恢复），与其他删除操作同样走确认 */
const confirmClearHistory = ref(false)

const clearHistoryEntries = () => {
  historyEntries.value = []
  persistHistoryEntries()
}

const formatHistoryTime = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? "-"
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const pad = (value: number) => String(value).padStart(2, "0")

const handleGenerate = async () => {
  const trimmed = instruction.value.trim()

  if (!trimmed || generating.value) {
    return
  }

  generating.value = true
  resultText.value = ""

  try {
    // 与文档 AI 面板一致：读取本地激活的模型配置随请求携带
    const storageKey = getKnowledgeBoardAiStorageKey(authStore.user?.id)
    const collection = await readKnowledgeBoardAiStoredConfig(storageKey, authStore.user?.id)
    const profile = getKnowledgeBoardAiActiveProfile(collection)
    const result = await generateAiStandaloneWrite(
      {
        instruction: trimmed,
        deepThink: deepThink.value,
        providerConfig: {
          provider: profile.provider,
          apiKey: profile.apiKey,
          baseUrl: profile.baseUrl,
          model: profile.model,
          timeoutMs: profile.timeoutMs,
        },
      },
      authStore.accessToken,
    )
    resultText.value = result.text
    addHistoryEntry(trimmed, result.text)
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "生成失败，请稍后重试。", "error")
  } finally {
    generating.value = false
  }
}

const copyResult = async () => {
  if (!resultText.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(resultText.value)
    showToastMessage("已复制到剪贴板。", "success")
  } catch {
    showToastMessage("当前环境不支持剪贴板复制。", "error")
  }
}

/** 存为文档：写入最近活跃的知识库后直接打开 */
const saveAsDocument = async () => {
  if (!resultText.value || savingDoc.value) {
    return
  }

  const kbId =
    knowledgeBases.value.find(
      (item) => item.id === window.localStorage.getItem(LAST_ACTIVE_KB_STORAGE_KEY),
    )?.id ?? knowledgeBases.value[0]?.id

  if (!kbId) {
    showToastMessage("暂无可用知识库，请先创建知识库。", "error")
    return
  }

  savingDoc.value = true

  try {
    const document: KnowledgeDocumentItem = await createKnowledgeDocument({
      kbId,
      title: resultTitle.value,
      content: { scheme: "text/markdown", value: resultText.value },
    })
    showToastMessage("已存为文档。", "success")
    router.push(
      getKnowledgeDocumentRouteTarget({
        kbId,
        docId: document.id,
        editorType: document.editorType,
      }),
    )
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "存为文档失败。", "error")
  } finally {
    savingDoc.value = false
  }
}

onMounted(async () => {
  loadHistoryEntries()
  // 目标知识库仅用于「存为文档」；加载失败时在保存动作里提示
  try {
    const { listKnowledgeBases } = await import("@/services/knowledge-base")
    knowledgeBases.value = await listKnowledgeBases()
  } catch {
    knowledgeBases.value = []
  }
})
</script>

<template>
  <KnowledgePageShell active-menu="ai-writing">
    <div class="kb-page-scroll kb-fade-in">
      <div class="kb-content-wrap">
        <!-- 页头：标题档统一走工作台页头既有 text-kb-xl（20px，D1 巡检收口三档并存） -->
        <h1 class="text-kb-xl font-semibold leading-8 text-ink">AI 写作</h1>
        <p class="mt-1 text-[13px] leading-5 text-ink-tertiary">
          帮你创作、润色、翻译，激发更多灵感
        </p>

        <!-- 指令输入卡 -->
        <div
          class="mt-5 rounded-kb-2xl border border-line bg-surface-soft p-4 transition-colors focus-within:border-brand-lighter"
        >
          <textarea
            v-model="instruction"
            rows="4"
            class="w-full resize-none bg-transparent text-[14px] leading-6 text-ink outline-none placeholder:text-ink-quaternary"
            placeholder="描述你想创作的内容，例如：写一篇关于秋天的散文"
            @keydown="handleInstructionKeydown"
          />

          <div class="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] transition"
              :class="
                deepThink
                  ? 'border-brand bg-brand-faint text-brand'
                  : 'border-line bg-surface text-ink-tertiary hover:border-brand-lighter hover:text-brand'
              "
              @click="deepThink = !deepThink"
            >
              <Icon icon="ph:brain" :width="13" :height="13" />
              深度思考
            </button>

            <!-- D1 巡检登记：初始态（指令为空）此钮 disabled + opacity-55，暗色实测像素
                 #27845d（= --kb-brand #2ed790 按 0.55 叠在 surface #1f1f1f 上，相邻
                 #236a4c 为同钮边缘抗锯齿采样）即禁用态的 brand 实心，非配色漂移，
                 EP disabled 口径豁免，无需改档 -->
            <button
              type="button"
              class="inline-flex h-8 items-center gap-1.5 rounded-kb-md bg-brand px-4 text-[13px] font-medium text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
              :disabled="!canGenerate"
              @click="handleGenerate"
            >
              <Icon
                v-if="generating"
                icon="ph:circle-notch"
                :width="14"
                :height="14"
                class="animate-spin"
              />
              <Icon v-else icon="ph:sparkle" :width="14" :height="14" />
              {{ generating ? "生成中…" : "生成" }}
            </button>
          </div>
        </div>

        <!-- 示例指令：点击回填输入框 -->
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            v-for="prompt in SAMPLE_PROMPTS"
            :key="prompt"
            type="button"
            class="inline-flex h-7 items-center rounded-full border border-line bg-surface px-3 text-[12px] text-ink-tertiary transition hover:border-brand-lighter hover:text-brand"
            @click="instruction = prompt"
          >
            {{ prompt }}
          </button>
        </div>

        <!-- 生成结果 -->
        <div v-if="resultText" class="mt-4 rounded-kb-2xl border border-line bg-surface p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[13px] font-medium text-ink">生成结果</p>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-kb-md px-2 text-[12px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
                @click="copyResult"
              >
                <Icon icon="ph:copy" :width="13" :height="13" />
                复制
              </button>
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-kb-md px-2 text-[12px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
                :disabled="savingDoc"
                @click="saveAsDocument"
              >
                <Icon icon="ph:note-blank" :width="13" :height="13" />
                {{ savingDoc ? "保存中…" : "存为文档" }}
              </button>
            </div>
          </div>

          <div
            class="mt-3 whitespace-pre-wrap break-words rounded-kb-xl bg-muted px-4 py-3 text-[13px] leading-6 text-ink-secondary"
          >
            {{ resultText }}
          </div>
        </div>

        <!-- 历史生成（本地保存，最近 20 条）：点击回填指令与结果；空态给引导文案避免下半页空白 -->
        <div class="mt-4 rounded-kb-2xl border border-line bg-surface p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-[13px] font-medium text-ink">历史生成</p>
            <button
              v-if="historyEntries.length > 0"
              type="button"
              class="inline-flex h-7 items-center rounded-kb-md px-2 text-[12px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
              @click="confirmClearHistory = true"
            >
              <Icon icon="ph:trash" :width="13" :height="13" class="mr-1" />
              清空
            </button>
          </div>
          <div v-if="historyEntries.length > 0" class="mt-2 space-y-0.5">
            <button
              v-for="entry in historyEntries"
              :key="entry.id"
              type="button"
              class="flex w-full items-center gap-3 rounded-kb-md px-2.5 py-2 text-left transition hover:bg-grey-100"
              @click="applyHistoryEntry(entry)"
            >
              <span class="min-w-0 flex-1 truncate text-[13px] text-ink-secondary">{{
                entry.instruction
              }}</span>
              <span class="shrink-0 text-[12px] text-ink-quaternary">{{
                formatHistoryTime(entry.createdAt)
              }}</span>
            </button>
          </div>
          <p v-else class="mt-2 px-2.5 py-6 text-center text-[13px] text-ink-quaternary">
            暂无历史生成，输入指令点击「生成」后，记录会保存在这里。
          </p>
        </div>
      </div>
    </div>
  </KnowledgePageShell>
  <ConfirmDialog
    v-model:open="confirmClearHistory"
    danger
    message="确认清空全部历史生成记录吗？清空后无法找回。"
    confirm-text="清空"
    @confirm="clearHistoryEntries"
  />
</template>

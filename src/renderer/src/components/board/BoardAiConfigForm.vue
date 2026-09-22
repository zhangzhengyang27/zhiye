<script setup lang="ts">
/** 负责编辑单个画板 AI 配置项，并校验服务商、模型与密钥输入。 */
import { computed, onMounted, ref } from "vue"
import { ChevronDown } from "lucide-vue-next"
import {
  KNOWLEDGE_BOARD_AI_PROVIDERS,
  type KnowledgeBoardAiProvider,
  type KnowledgeBoardAiProviderProfile,
} from "@/types/knowledge-board-ai"
import {
  KNOWLEDGE_BOARD_AI_DEEPSEEK_MODELS,
  applyKnowledgeBoardAiProviderPreset,
  resolveKnowledgeBoardAiConfigSummary,
} from "@/utils/knowledge-board-ai-config"
import { isLocalObfuscatedStorage } from "@/utils/knowledge-board-ai-secret"

const props = defineProps<{
  modelValue: KnowledgeBoardAiProviderProfile
}>()

const emit = defineEmits<{
  "update:modelValue": [value: KnowledgeBoardAiProviderProfile]
}>()

// 密钥存储方式提示：探测完成前先按较保守的「本地混淆」口径展示，桌面端随即修正
const localObfuscatedStorage = ref(true)

onMounted(() => {
  void isLocalObfuscatedStorage().then((value) => {
    localObfuscatedStorage.value = value
  })
})

const providerOptions = [
  {
    label: "DeepSeek",
    value: KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek,
  },
  {
    label: "OpenAI 兼容",
    value: KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible,
  },
]

const currentConfigSummary = computed(() => resolveKnowledgeBoardAiConfigSummary(props.modelValue))
const hasApiKey = computed(() => props.modelValue.apiKey.trim().length > 0)
const timeoutValue = computed(() => String(props.modelValue.timeoutMs || ""))

const patchProfile = (partial: Partial<KnowledgeBoardAiProviderProfile>) => {
  emit("update:modelValue", {
    ...props.modelValue,
    ...partial,
  })
}

const handleProviderChange = (provider: KnowledgeBoardAiProvider) => {
  const nextConfig = applyKnowledgeBoardAiProviderPreset(provider, props.modelValue)

  emit("update:modelValue", {
    ...props.modelValue,
    ...nextConfig,
  })
}

const TIMEOUT_MIN_MS = 5000
const TIMEOUT_MAX_MS = 120000

const handleTimeoutChange = (value: string) => {
  const nextValue = Number(value)

  // 手输可越出滑杆区间（如 0 或 1），存储前钳制到合法档，避免配置永久不可用
  patchProfile({
    timeoutMs: Number.isFinite(nextValue)
      ? Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.round(nextValue)))
      : props.modelValue.timeoutMs,
  })
}
</script>

<template>
  <div class="grid gap-5">
    <el-card class="rounded-kb-3xl shadow-[var(--kb-surface-shadow)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[14px] font-semibold text-ink">当前配置</p>
          <p class="mt-1 text-[13px] text-ink-tertiary">{{ currentConfigSummary }}</p>
        </div>
        <el-tag disable-transitions :type="hasApiKey ? 'success' : 'warning'" effect="plain">
          {{ hasApiKey ? "已配置密钥" : "未配置密钥" }}
        </el-tag>
      </div>
    </el-card>

    <el-card class="rounded-kb-3xl shadow-[var(--kb-surface-shadow)]">
      <div class="grid gap-4">
        <div>
          <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary">配置名称</label>
          <el-input
            :model-value="props.modelValue.name"
            placeholder="例如：DeepSeek 主账号"
            @update:model-value="patchProfile({ name: $event })"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary">服务商</label>
          <el-select
            :model-value="props.modelValue.provider"
            :options="providerOptions"
            :offset="6"
            :show-arrow="false"
            :suffix-icon="ChevronDown"
            @update:model-value="handleProviderChange($event as KnowledgeBoardAiProvider)"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary">API Key</label>
          <el-input
            :model-value="props.modelValue.apiKey"
            type="password"
            placeholder="输入当前模型服务的 API Key"
            @update:model-value="patchProfile({ apiKey: $event })"
          />
          <p class="mt-1.5 text-[12px] text-ink-quaternary">
            {{
              localObfuscatedStorage
                ? "Web 端密钥为本地混淆存储，桌面端为系统级加密"
                : "密钥由系统密钥链加密保存"
            }}
          </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary">Base URL</label>
            <el-input
              :model-value="props.modelValue.baseUrl"
              placeholder="https://api.deepseek.com/v1"
              @update:model-value="patchProfile({ baseUrl: $event })"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary"
              >超时（毫秒）</label
            >
            <el-input
              :model-value="timeoutValue"
              type="number"
              min="5000"
              max="120000"
              step="1000"
              placeholder="45000"
              @update:model-value="handleTimeoutChange"
            />
          </div>
        </div>

        <div v-if="props.modelValue.provider === KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek">
          <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary">模型</label>
          <el-select
            :model-value="props.modelValue.model"
            :options="KNOWLEDGE_BOARD_AI_DEEPSEEK_MODELS"
            :offset="6"
            :show-arrow="false"
            :suffix-icon="ChevronDown"
            @update:model-value="patchProfile({ model: String($event || '') })"
          />
        </div>

        <div v-else>
          <label class="mb-1.5 block text-[12px] font-medium text-ink-tertiary">模型名称</label>
          <el-input
            :model-value="props.modelValue.model"
            placeholder="例如：gpt-4.1-mini 或你自己的兼容模型名"
            @update:model-value="patchProfile({ model: $event })"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

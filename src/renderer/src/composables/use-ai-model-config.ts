/**
 * AI 模型配置集合的共享状态：按账号从本地加密存储加载配置，暴露激活 profile，
 * 编辑后防抖持久化（加密落盘细节见 utils/knowledge-board-ai-secret.ts）。
 *
 * 存储键 kb-board-ai-config:{userId} 是唯一事实源：偏好设置页
 * （SettingsAiModelGroup）负责编辑，画板 AI / 文档 AI / AI 写作页只读取，
 * 同一账号一处配置处处生效。API Key 不进数据库、不落服务端。
 */
import { computed, onScopeDispose, ref, watch } from "vue"
import { useAuthStore } from "@/stores/auth"
import type { KnowledgeBoardAiConfigCollection } from "@/types/knowledge-board-ai"
import {
  createKnowledgeBoardAiConfigCollection,
  getKnowledgeBoardAiActiveProfile,
  getKnowledgeBoardAiStorageKey,
  normalizeKnowledgeBoardAiConfigCollection,
  persistKnowledgeBoardAiStoredConfig,
  readKnowledgeBoardAiStoredConfig,
  resolveKnowledgeBoardAiConfigSummary,
} from "@/utils/knowledge-board-ai-config"

/** 变更后延迟持久化的窗口：合并表单连续输入，避免每次击键都做一次加密落盘。 */
const PERSIST_DEBOUNCE_MS = 400

export const useAiModelConfig = () => {
  const authStore = useAuthStore()

  const collection = ref<KnowledgeBoardAiConfigCollection>(createKnowledgeBoardAiConfigCollection())
  const saveError = ref("")

  const storageKey = computed(() => getKnowledgeBoardAiStorageKey(authStore.user?.id))
  const activeProfile = computed(() => getKnowledgeBoardAiActiveProfile(collection.value))
  const summary = computed(() => {
    return `${activeProfile.value.name} · ${resolveKnowledgeBoardAiConfigSummary(activeProfile.value)}`
  })
  const hasApiKey = computed(() => activeProfile.value.apiKey.trim().length > 0)

  let persistTimer: number | null = null
  let persistPending = false

  const clearPersistTimer = () => {
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer)
      persistTimer = null
    }
  }

  const persistNow = async () => {
    clearPersistTimer()
    persistPending = false
    try {
      await persistKnowledgeBoardAiStoredConfig(
        storageKey.value,
        collection.value,
        authStore.user?.id,
      )
      saveError.value = ""
    } catch (error) {
      saveError.value =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "模型配置保存失败，请稍后重试。"
    }
  }

  /** 设置页编辑入口：规整后写入集合，并安排防抖持久化。 */
  const updateCollection = (next: KnowledgeBoardAiConfigCollection) => {
    collection.value = normalizeKnowledgeBoardAiConfigCollection(next)
    clearPersistTimer()
    persistPending = true
    persistTimer = window.setTimeout(() => {
      persistTimer = null
      void persistNow()
    }, PERSIST_DEBOUNCE_MS)
  }

  // 切换账号（或首挂载）时按用户身份重新加载；加载是异步的，加载完成前的
  // 临时编辑以存储里的已存配置为准（storageKey 变化本身就是账号切换）
  watch(
    storageKey,
    (key) => {
      clearPersistTimer()
      persistPending = false
      void (async () => {
        const stored = await readKnowledgeBoardAiStoredConfig(key, authStore.user?.id)
        collection.value = normalizeKnowledgeBoardAiConfigCollection(stored)
      })()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    clearPersistTimer()
    // 卸载时若还有未落盘的改动，尽力补一次（fire-and-forget，失败静默）
    if (persistPending) {
      void persistKnowledgeBoardAiStoredConfig(
        storageKey.value,
        collection.value,
        authStore.user?.id,
      ).catch(() => undefined)
    }
  })

  return {
    collection,
    activeProfile,
    summary,
    hasApiKey,
    storageKey,
    saveError,
    updateCollection,
  }
}

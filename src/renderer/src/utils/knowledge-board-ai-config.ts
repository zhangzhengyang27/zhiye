/** 提供知识画板 AI 配置的默认值、序列化与本地持久化辅助能力。 */

import {
  KNOWLEDGE_BOARD_AI_PROVIDERS,
  type KnowledgeBoardAiConfigCollection,
  type KnowledgeBoardAiProvider,
  type KnowledgeBoardAiProviderConfig,
  type KnowledgeBoardAiProviderProfile,
  type KnowledgeBoardAiStoredConfig,
  type KnowledgeBoardAiStoredProfile,
} from "@/types/knowledge-board-ai"
import {
  decryptKnowledgeBoardAiSecret,
  encryptKnowledgeBoardAiSecret,
  resolveKnowledgeBoardAiSecretSupportIssue,
} from "@/utils/knowledge-board-ai-secret"
import { isRecord, toFiniteNumber } from "@/utils/knowledge-board-shared"

/** 知识画板 AI 请求的默认超时时间。 */
export const KNOWLEDGE_BOARD_AI_DEFAULT_TIMEOUT_MS = 45_000
/** DeepSeek 提供方的默认基础地址。 */
export const KNOWLEDGE_BOARD_AI_DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
/** DeepSeek 提供方的默认模型。 */
export const KNOWLEDGE_BOARD_AI_DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
/** 当前内置支持的 DeepSeek 模型候选列表。 */
export const KNOWLEDGE_BOARD_AI_DEEPSEEK_MODELS = [
  {
    label: "deepseek-chat",
    value: "deepseek-chat",
  },
  {
    label: "deepseek-reasoner",
    value: "deepseek-reasoner",
  },
]

const trimString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : ""
}

const generateProfileId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `board-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 返回提供方在界面中展示的标签文案。 */
export const resolveKnowledgeBoardAiProviderLabel = (provider: KnowledgeBoardAiProvider) => {
  return provider === KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek ? "DeepSeek" : "OpenAI 兼容"
}

/** 为指定提供方生成一份默认配置。 */
export const createKnowledgeBoardAiProviderConfig = (
  provider: KnowledgeBoardAiProvider = KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek
): KnowledgeBoardAiProviderConfig => {
  if (provider === KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek) {
    return {
      provider,
      apiKey: "",
      baseUrl: KNOWLEDGE_BOARD_AI_DEFAULT_DEEPSEEK_BASE_URL,
      model: KNOWLEDGE_BOARD_AI_DEFAULT_DEEPSEEK_MODEL,
      timeoutMs: KNOWLEDGE_BOARD_AI_DEFAULT_TIMEOUT_MS,
    }
  }

  return {
    provider,
    apiKey: "",
    baseUrl: "",
    model: "",
    timeoutMs: KNOWLEDGE_BOARD_AI_DEFAULT_TIMEOUT_MS,
  }
}

/** 将外部输入规整为可直接请求模型服务的提供方配置。 */
export const normalizeKnowledgeBoardAiProviderConfig = (value: unknown): KnowledgeBoardAiProviderConfig => {
  if (!isRecord(value)) {
    return createKnowledgeBoardAiProviderConfig()
  }

  const provider =
    value.provider === KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible
      ? KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible
      : KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek

  const baseConfig = createKnowledgeBoardAiProviderConfig(provider)

  return {
    provider,
    apiKey: trimString(value.apiKey),
    baseUrl: trimString(value.baseUrl) || baseConfig.baseUrl,
    model: trimString(value.model) || baseConfig.model,
    timeoutMs: Math.max(5_000, Math.min(120_000, toFiniteNumber(value.timeoutMs, baseConfig.timeoutMs))),
  }
}

/** 切换提供方时复用可保留字段，并补齐该提供方的默认配置。 */
export const applyKnowledgeBoardAiProviderPreset = (
  provider: KnowledgeBoardAiProvider,
  previousConfig?: KnowledgeBoardAiProviderConfig | null
) => {
  const nextConfig = createKnowledgeBoardAiProviderConfig(provider)

  if (!previousConfig) {
    return nextConfig
  }

  if (provider === KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek) {
    return {
      ...nextConfig,
      apiKey: previousConfig.apiKey,
      timeoutMs: previousConfig.timeoutMs || nextConfig.timeoutMs,
    }
  }

  return {
    ...nextConfig,
    apiKey: previousConfig.apiKey,
    timeoutMs: previousConfig.timeoutMs || nextConfig.timeoutMs,
    baseUrl:
      previousConfig.provider === KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible
        ? previousConfig.baseUrl
        : nextConfig.baseUrl,
    model:
      previousConfig.provider === KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible
        ? previousConfig.model
        : nextConfig.model,
  }
}

const createProfileName = (
  provider: KnowledgeBoardAiProvider,
  existingProfiles?: KnowledgeBoardAiProviderProfile[]
) => {
  const label = resolveKnowledgeBoardAiProviderLabel(provider)
  const matchedCount = (existingProfiles ?? []).filter(profile => profile.provider === provider).length

  return matchedCount > 0 ? `${label} ${matchedCount + 1}` : label
}

/** 为指定提供方创建一份可编辑的 AI 配置资料草稿。 */
export const createKnowledgeBoardAiProviderProfile = (
  provider: KnowledgeBoardAiProvider = KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek,
  options?: {
    id?: string
    name?: string
    existingProfiles?: KnowledgeBoardAiProviderProfile[]
  }
): KnowledgeBoardAiProviderProfile => {
  const config = createKnowledgeBoardAiProviderConfig(provider)

  return {
    id: options?.id || generateProfileId(),
    name: options?.name?.trim() || createProfileName(provider, options?.existingProfiles),
    ...config,
  }
}

const normalizeKnowledgeBoardAiProviderProfile = (
  value: unknown,
  existingProfiles?: KnowledgeBoardAiProviderProfile[]
): KnowledgeBoardAiProviderProfile => {
  const baseConfig = normalizeKnowledgeBoardAiProviderConfig(value)

  return {
    id: trimString(isRecord(value) ? value.id : "") || generateProfileId(),
    name: trimString(isRecord(value) ? value.name : "") || createProfileName(baseConfig.provider, existingProfiles),
    ...baseConfig,
  }
}

/** 创建一组包含默认配置项的 AI 配置集合。 */
export const createKnowledgeBoardAiConfigCollection = (): KnowledgeBoardAiConfigCollection => {
  const defaultProfile = createKnowledgeBoardAiProviderProfile()

  return {
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile],
  }
}

/** 深拷贝 AI 配置集合，供弹窗草稿独立编辑。 */
export const cloneKnowledgeBoardAiConfigCollection = (collection: KnowledgeBoardAiConfigCollection) => {
  return {
    activeProfileId: collection.activeProfileId,
    profiles: collection.profiles.map(profile => ({
      ...profile,
    })),
  } satisfies KnowledgeBoardAiConfigCollection
}

/** 规整本地读取或外部传入的配置集合，确保至少存在一条有效资料。 */
export const normalizeKnowledgeBoardAiConfigCollection = (value: unknown): KnowledgeBoardAiConfigCollection => {
  if (!isRecord(value)) {
    return createKnowledgeBoardAiConfigCollection()
  }

  const rawProfiles = Array.isArray(value.profiles) ? value.profiles : []
  const normalizedProfiles: KnowledgeBoardAiProviderProfile[] = []

  rawProfiles.forEach(profile => {
    const normalizedProfile = normalizeKnowledgeBoardAiProviderProfile(profile, normalizedProfiles)

    if (normalizedProfiles.some(item => item.id === normalizedProfile.id)) {
      normalizedProfile.id = generateProfileId()
    }

    normalizedProfiles.push(normalizedProfile)
  })

  if (normalizedProfiles.length === 0) {
    return createKnowledgeBoardAiConfigCollection()
  }

  const activeProfileId = trimString(value.activeProfileId)
  const resolvedActiveProfileId = normalizedProfiles.some(profile => profile.id === activeProfileId)
    ? activeProfileId
    : normalizedProfiles[0]?.id || ""

  return {
    activeProfileId: resolvedActiveProfileId,
    profiles: normalizedProfiles,
  }
}

/** 根据用户身份生成 AI 配置在本地存储中的键名。 */
export const getKnowledgeBoardAiStorageKey = (userId?: string | null) => {
  return `kb-board-ai-config:${userId || "anonymous"}`
}

const normalizeStoredProfile = (value: unknown): KnowledgeBoardAiStoredProfile | null => {
  if (!isRecord(value)) {
    return null
  }

  const provider =
    value.provider === KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible
      ? KNOWLEDGE_BOARD_AI_PROVIDERS.openAiCompatible
      : KNOWLEDGE_BOARD_AI_PROVIDERS.deepseek
  const baseConfig = createKnowledgeBoardAiProviderConfig(provider)

  return {
    id: trimString(value.id) || generateProfileId(),
    name: trimString(value.name) || createProfileName(provider),
    provider,
    baseUrl: trimString(value.baseUrl) || baseConfig.baseUrl,
    model: trimString(value.model) || baseConfig.model,
    timeoutMs: Math.max(5_000, Math.min(120_000, toFiniteNumber(value.timeoutMs, baseConfig.timeoutMs))),
    encryptedApiKey: isRecord(value.encryptedApiKey)
      ? {
          version: value.encryptedApiKey.version === 2 ? 2 : 1,
          algorithm: value.encryptedApiKey.algorithm === "XOR-LOCAL" ? "XOR-LOCAL" : "AES-GCM",
          iv: trimString(value.encryptedApiKey.iv),
          ciphertext: trimString(value.encryptedApiKey.ciphertext),
        }
      : null,
    updatedAt: trimString(value.updatedAt) || new Date(0).toISOString(),
  }
}

const createKnowledgeBoardAiStoredConfig = async (
  collection: KnowledgeBoardAiConfigCollection,
  userId?: string | null
): Promise<KnowledgeBoardAiStoredConfig> => {
  const normalizedCollection = normalizeKnowledgeBoardAiConfigCollection(collection)
  const profiles = await Promise.all(
    normalizedCollection.profiles.map(async profile => {
      const encryptedApiKey = await encryptKnowledgeBoardAiSecret(profile.apiKey, userId)

      if (profile.apiKey.trim() && !encryptedApiKey) {
        const supportIssue = resolveKnowledgeBoardAiSecretSupportIssue()
        throw new Error(supportIssue || "当前环境暂时无法安全保存 API Key，请在受支持的浏览器环境中重试。")
      }

      return {
        id: profile.id,
        name: profile.name.trim() || createProfileName(profile.provider),
        provider: profile.provider,
        baseUrl: profile.baseUrl.trim(),
        model: profile.model.trim(),
        timeoutMs: profile.timeoutMs,
        encryptedApiKey,
        updatedAt: new Date().toISOString(),
      } satisfies KnowledgeBoardAiStoredProfile
    })
  )

  const activeProfileId = profiles.some(profile => profile.id === normalizedCollection.activeProfileId)
    ? normalizedCollection.activeProfileId
    : profiles[0]?.id || ""

  return {
    activeProfileId,
    profiles,
    updatedAt: new Date().toISOString(),
  }
}

/** 读取并解密本地保存的 AI 配置集合。 */
export const readKnowledgeBoardAiStoredConfig = async (
  storageKey: string,
  userId?: string | null
): Promise<KnowledgeBoardAiConfigCollection> => {
  if (typeof window === "undefined") {
    return createKnowledgeBoardAiConfigCollection()
  }

  try {
    const raw = window.localStorage.getItem(storageKey)

    if (!raw) {
      return createKnowledgeBoardAiConfigCollection()
    }

    const parsed = JSON.parse(raw) as KnowledgeBoardAiStoredConfig
    const rawProfiles = Array.isArray(parsed.profiles) ? parsed.profiles : []
    const profiles: KnowledgeBoardAiProviderProfile[] = []

    for (const rawProfile of rawProfiles) {
      const normalizedProfile = normalizeStoredProfile(rawProfile)

      if (!normalizedProfile) {
        continue
      }

      profiles.push({
        id: normalizedProfile.id,
        name: normalizedProfile.name,
        provider: normalizedProfile.provider,
        apiKey: await decryptKnowledgeBoardAiSecret(normalizedProfile.encryptedApiKey, userId),
        baseUrl: normalizedProfile.baseUrl,
        model: normalizedProfile.model,
        timeoutMs: normalizedProfile.timeoutMs,
      })
    }

    if (profiles.length === 0) {
      return createKnowledgeBoardAiConfigCollection()
    }

    const activeProfileId = profiles.some(profile => profile.id === parsed.activeProfileId)
      ? parsed.activeProfileId
      : profiles[0]?.id || ""

    return {
      activeProfileId,
      profiles,
    }
  } catch {
    return createKnowledgeBoardAiConfigCollection()
  }
}

/** 将当前 AI 配置集合加密后写入本地存储。 */
export const persistKnowledgeBoardAiStoredConfig = async (
  storageKey: string,
  collection: KnowledgeBoardAiConfigCollection,
  userId?: string | null
) => {
  if (typeof window === "undefined") {
    return
  }

  const storedConfig = await createKnowledgeBoardAiStoredConfig(collection, userId)
  window.localStorage.setItem(storageKey, JSON.stringify(storedConfig))
}

/** 返回当前集合中应被视为激活态的配置资料。 */
export const getKnowledgeBoardAiActiveProfile = (collection: KnowledgeBoardAiConfigCollection) => {
  const normalizedCollection = normalizeKnowledgeBoardAiConfigCollection(collection)

  return (
    normalizedCollection.profiles.find(profile => profile.id === normalizedCollection.activeProfileId) ??
    normalizedCollection.profiles[0] ??
    createKnowledgeBoardAiProviderProfile()
  )
}

/** 生成配置卡片上展示的提供方与模型摘要。 */
export const resolveKnowledgeBoardAiConfigSummary = (config: KnowledgeBoardAiProviderConfig) => {
  const providerLabel = resolveKnowledgeBoardAiProviderLabel(config.provider)
  const modelLabel = config.model.trim() || "未设置模型"

  return `${providerLabel} / ${modelLabel}`
}

<script setup lang="ts">
/** 负责维护多份 AI 模型配置，并协调新增、切换与删除流程。 */
import { computed } from "vue"
import Icon from "@/components/common/UiIcon.vue"
import AiModelConfigForm from "@/components/settings/AiModelConfigForm.vue"
import type {
  KnowledgeBoardAiConfigCollection,
  KnowledgeBoardAiProviderProfile,
} from "@/types/knowledge-board-ai"
import {
  createKnowledgeBoardAiProviderProfile,
  getKnowledgeBoardAiActiveProfile,
  normalizeKnowledgeBoardAiConfigCollection,
  resolveKnowledgeBoardAiConfigSummary,
} from "@/utils/knowledge-board-ai-config"

const props = defineProps<{
  modelValue: KnowledgeBoardAiConfigCollection
}>()

const emit = defineEmits<{
  "update:modelValue": [value: KnowledgeBoardAiConfigCollection]
}>()

const normalizedCollection = computed(() =>
  normalizeKnowledgeBoardAiConfigCollection(props.modelValue),
)
const activeProfile = computed(() => getKnowledgeBoardAiActiveProfile(normalizedCollection.value))

const updateCollection = (nextCollection: KnowledgeBoardAiConfigCollection) => {
  emit("update:modelValue", normalizeKnowledgeBoardAiConfigCollection(nextCollection))
}

const selectProfile = (profileId: string) => {
  updateCollection({
    ...normalizedCollection.value,
    activeProfileId: profileId,
  })
}

const patchActiveProfile = (nextProfile: KnowledgeBoardAiProviderProfile) => {
  const nextProfiles = normalizedCollection.value.profiles.map((profile) => {
    if (profile.id !== nextProfile.id) {
      return profile
    }

    return {
      ...nextProfile,
      name: nextProfile.name.trim() || profile.name,
    }
  })

  updateCollection({
    activeProfileId: nextProfile.id,
    profiles: nextProfiles,
  })
}

const addProfile = () => {
  const nextProfile = createKnowledgeBoardAiProviderProfile(undefined, {
    existingProfiles: normalizedCollection.value.profiles,
  })

  updateCollection({
    activeProfileId: nextProfile.id,
    profiles: [...normalizedCollection.value.profiles, nextProfile],
  })
}

const removeActiveProfile = () => {
  if (normalizedCollection.value.profiles.length <= 1) {
    return
  }

  const nextProfiles = normalizedCollection.value.profiles.filter(
    (profile) => profile.id !== activeProfile.value.id,
  )
  const nextActiveProfileId = nextProfiles[0]?.id || ""

  updateCollection({
    activeProfileId: nextActiveProfileId,
    profiles: nextProfiles,
  })
}
</script>

<template>
  <div class="grid gap-5">
    <section
      class="rounded-kb-3xl border border-line bg-surface px-5 py-5 shadow-[var(--kb-surface-shadow)]"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-[14px] font-semibold text-ink">配置列表</p>
          <p class="mt-1 text-[13px] text-ink-tertiary">
            支持保存多个模型配置，画板 AI、文档 AI 与 AI 写作共用当前启用的配置。
          </p>
        </div>
        <el-button plain class="py-2" @click="addProfile"
          ><Icon icon="ph:plus" :width="16" :height="16" />
          <span class="truncate">新增配置</span>
        </el-button>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <button
          v-for="profile in normalizedCollection.profiles"
          :key="profile.id"
          type="button"
          class="rounded-kb-2xl border px-4 py-4 text-left transition"
          :class="
            normalizedCollection.activeProfileId === profile.id
              ? 'border-brand bg-brand-faint shadow-[var(--kb-glow-brand-faint)]'
              : 'border-line bg-surface-soft hover:border-brand-light'
          "
          @click="selectProfile(profile.id)"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-[14px] font-semibold text-ink">{{ profile.name }}</p>
            <span
              class="inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium"
              :class="
                normalizedCollection.activeProfileId === profile.id
                  ? 'bg-surface text-brand-hover'
                  : 'bg-surface-soft text-ink-tertiary'
              "
            >
              {{ normalizedCollection.activeProfileId === profile.id ? "当前使用" : "点击切换" }}
            </span>
          </div>
          <p class="mt-2 text-[12px] text-ink-tertiary">
            {{ resolveKnowledgeBoardAiConfigSummary(profile) }}
          </p>
        </button>
      </div>

      <div class="mt-4 flex justify-end">
        <el-button
          type="danger"
          text
          class="px-3 py-2"
          :disabled="normalizedCollection.profiles.length <= 1"
          @click="removeActiveProfile"
          ><Icon icon="ph:trash" :width="16" :height="16" />
          <span class="truncate">删除当前配置</span>
        </el-button>
      </div>
    </section>

    <AiModelConfigForm :model-value="activeProfile" @update:model-value="patchActiveProfile" />

    <p class="text-[12px] leading-6 text-ink-quaternary">
      API Key 不以明文写入本地存储。桌面端由操作系统密钥链（macOS Keychain / Windows DPAPI / Linux
      libsecret）加密保存；Web 端在安全上下文下使用 AES 加密，局域网 HTTP
      等非安全上下文自动切换为兼容模式的本地可逆加密存储。
    </p>
  </div>
</template>

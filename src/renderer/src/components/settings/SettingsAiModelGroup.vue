<script setup lang="ts">
/**
 * 偏好设置「AI 模型」分组：画板 AI、文档 AI 与 AI 写作共用的大模型接入配置。
 *
 * 配置按账号存在本机加密存储（桌面端系统密钥链 / Web 端 AES），随改随存
 * （400ms 防抖），保存失败时在组内展示错误说明；编辑能力由
 * AiModelConfigManager 承担，本组件只做分组壳与状态接入。
 */
import AiModelConfigManager from "@/components/settings/AiModelConfigManager.vue"
import { useAiModelConfig } from "@/composables/use-ai-model-config"

const { collection, saveError, updateCollection } = useAiModelConfig()
</script>

<template>
  <div class="kb-settings-group" data-testid="settings-ai-model">
    <h2>AI 模型</h2>
    <div class="kb-settings-item kb-settings-ai-item">
      <p class="kb-settings-ai-desc">
        配置画板 AI、文档 AI 与 AI 写作共用的大模型接入。API Key 按账号保存在本机，不上传服务器。
      </p>
      <AiModelConfigManager :model-value="collection" @update:model-value="updateCollection" />
      <p v-if="saveError" class="kb-settings-lock-error kb-settings-ai-error">
        {{ saveError }}
      </p>
    </div>
  </div>
</template>

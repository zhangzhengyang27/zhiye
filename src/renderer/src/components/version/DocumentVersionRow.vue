<script setup lang="ts">
/** 行组件，负责文档版本单项展示与行内操作。 */
import type { KnowledgeDocumentVersionItem } from "@/services/knowledge-documents"

const props = defineProps<{
  version: KnowledgeDocumentVersionItem
  selected: boolean
  versionDeleteBusy: boolean
  deleting: boolean
  formatDateTime: (input: string) => string
}>()

const emit = defineEmits<{
  "toggle-version": [versionId: string]
  "delete-version": [versionId: string]
  "rollback-version": [versionId: string]
}>()
</script>

<template>
  <div
    class="group rounded-kb-3xl bg-surface px-4 py-3 shadow-[var(--kb-surface-shadow)] transition hover:shadow-[var(--kb-float-shadow)]"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex flex-1 items-start gap-3">
        <!-- 直用 el-checkbox（T2 解散 AppCheckbox）：语雀观感由全局校准层
             element-plus-calibration.css 提供，mt-1 经 fallthrough 落根 label -->
        <el-checkbox
          :model-value="props.selected"
          :disabled="props.versionDeleteBusy"
          :aria-label="`选择版本 ${props.version.versionName || props.version.message || '自动保存版本'}`"
          class="mt-1"
          @update:model-value="emit('toggle-version', props.version.id)"
        />

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="truncate text-sm font-medium text-ink">
              {{ props.version.versionName || props.version.message || "自动保存版本" }}
            </p>
            <!-- 基线保真（T4 评审 I-1）：壳时代 AppBadge 的 sizeClass text-[11px] 与本处
                 text-[10px] 同层冲突、CSS 顺序偶然让 11px 胜出（实测行高
                 17.2865px=1.5715×11 互证），为基线渲染真值；解散后冲突消失、10px
                 生效导致文字变窄（versions 屏 pixdiff 404/473 major），按基线恢复 11px。
                 批 16 起 11px 已是 .el-tag 默认档，该保真由校准层承担，无需调用点声明 -->
            <el-tag disable-transitions>
              {{ props.version.author.name || props.version.author.email }}
            </el-tag>
          </div>
          <p
            v-if="props.version.message && props.version.message !== props.version.versionName"
            class="mt-2 line-clamp-2 rounded-kb-2xl bg-muted px-3 py-2 text-xs leading-5 text-ink-tertiary"
          >
            {{ props.version.message }}
          </p>
          <div class="mt-2 flex items-center gap-2 text-xs text-ink-tertiary">
            <span>{{ props.formatDateTime(props.version.createdAt) }}</span>
            <span>·</span>
            <span>支持回滚与对比</span>
          </div>
        </div>
      </div>

      <div
        class="flex translate-x-1 items-center gap-2 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100"
      >
        <el-button
          type="danger"
          text
          size="small"
          class="rounded-kb-xl"
          :loading="props.deleting"
          :disabled="props.versionDeleteBusy"
          @click="emit('delete-version', props.version.id)"
          ><template #loading
            ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">删除</span>
        </el-button>
        <el-button
          size="small"
          class="rounded-kb-xl bg-brand-faint text-brand hover:bg-brand-light kb-btn-soft"
          :disabled="props.versionDeleteBusy"
          @click="emit('rollback-version', props.version.id)"
          ><span class="truncate">回滚</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

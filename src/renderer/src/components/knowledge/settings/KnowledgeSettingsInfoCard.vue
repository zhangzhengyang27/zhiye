<script setup lang="ts">
/**
 * 知识库信息设置卡片（对齐语雀「知识库信息」）：名称 / 简介 / 封面。
 * 封面经 OSS 上传后存 URL（推荐 330×164）；整卡仅可管理角色可编辑。
 */
import { computed, ref, watch } from "vue"
import UiIcon from "@/components/common/UiIcon.vue"
import AppIcon from "@/components/common/AppIcon.vue"
import { updateKnowledgeBase } from "@/services/knowledge-base"
import { uploadKnowledgeAsset } from "@/services/knowledge-oss"
import type { KnowledgeBaseItem } from "@/services/knowledge-base"

const props = defineProps<{
  knowledgeBase: KnowledgeBaseItem
  canManage: boolean
}>()

const emit = defineEmits<{
  saved: [knowledgeBase: KnowledgeBaseItem]
  notify: [message: string, type?: "success" | "error" | "info"]
}>()

const DESCRIPTION_MAX = 255

const name = ref(props.knowledgeBase.name)
const description = ref(props.knowledgeBase.description ?? "")
const cover = ref(props.knowledgeBase.cover ?? "")
const saving = ref(false)
const uploadingCover = ref(false)
const coverFileInput = ref<HTMLInputElement | null>(null)

// 工作区上下文刷新后同步最新值，避免表单停留在旧数据上
watch(
  () => props.knowledgeBase,
  (next) => {
    name.value = next.name
    description.value = next.description ?? ""
    cover.value = next.cover ?? ""
  },
)

const dirty = computed(() => {
  return (
    name.value !== props.knowledgeBase.name ||
    description.value !== (props.knowledgeBase.description ?? "") ||
    cover.value !== (props.knowledgeBase.cover ?? "")
  )
})

const pickCover = () => {
  coverFileInput.value?.click()
}

const handleCoverChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""

  if (!file) {
    return
  }

  uploadingCover.value = true
  try {
    cover.value = await uploadKnowledgeAsset(file)
    emit("notify", "封面上传成功，记得保存。", "info")
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "封面上传失败", "error")
  } finally {
    uploadingCover.value = false
  }
}

const removeCover = () => {
  cover.value = ""
}

const handleSave = async () => {
  if (!name.value.trim()) {
    emit("notify", "知识库名称不能为空", "error")
    return
  }

  saving.value = true

  try {
    const updated = await updateKnowledgeBase(props.knowledgeBase.id, {
      name: name.value.trim(),
      description: description.value.trim() || null,
      cover: cover.value || null,
    })
    emit("saved", updated)
    emit("notify", "知识库信息已保存。", "success")
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "保存知识库信息失败", "error")
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="kb-section-shell p-4">
    <div class="px-2 pt-2">
      <h2 class="text-base font-semibold text-ink">知识库信息</h2>
      <p class="mt-1 text-[13px] leading-5 text-ink-tertiary">
        名称、简介与封面会在知识库首页与列表中展示。
      </p>
    </div>

    <div class="mt-5 space-y-5 px-2 pb-2">
      <div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_330px]">
        <div class="space-y-4">
          <label class="block">
            <span class="mb-1.5 block text-[13px] font-medium text-ink-secondary">名称</span>
            <el-input v-model="name" type="text" :disabled="!canManage" />
          </label>

          <label class="block">
            <span
              class="mb-1.5 flex items-center justify-between text-[13px] font-medium text-ink-secondary"
            >
              <span>简介</span>
              <span class="text-[11px] text-ink-quaternary"
                >{{ description.length }} / {{ DESCRIPTION_MAX }}</span
              >
            </span>
            <el-input
              v-model="description"
              type="textarea"
              :maxlength="DESCRIPTION_MAX"
              :rows="3"
              resize="none"
              :disabled="!canManage"
              placeholder="介绍一下这个知识库的内容"
              class="resize-none overflow-hidden"
            />
          </label>
        </div>

        <div>
          <span class="mb-1.5 block text-[13px] font-medium text-ink-secondary">封面</span>
          <div
            class="flex h-[164px] w-[330px] max-w-full items-center justify-center overflow-hidden rounded-kb-xl border border-line bg-muted"
          >
            <img v-if="cover" :src="cover" alt="知识库封面" class="h-full w-full object-cover" />
            <span v-else class="px-6 text-center text-[12px] text-ink-quaternary"
              >推荐尺寸 330 × 164</span
            >
          </div>
          <div v-if="canManage" class="mt-2 flex items-center gap-2">
            <el-button
              plain
              size="small"
              class="rounded-kb-lg"
              :loading="uploadingCover"
              @click="pickCover"
              ><template #loading
                ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
              /></template>
              <AppIcon v-if="!uploadingCover" name="i-lucide-image-up" class="h-3.5 w-3.5" />
              <span class="truncate">上传图片</span>
            </el-button>
            <el-button
              v-if="cover"
              text
              size="small"
              class="rounded-kb-lg text-ink-tertiary"
              @click="removeCover"
              ><span class="truncate">移除</span>
            </el-button>
            <input
              ref="coverFileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleCoverChange"
            />
          </div>
        </div>
      </div>

      <div v-if="canManage" class="flex items-center justify-end gap-3">
        <span v-if="dirty" class="text-[12px] text-warning">有未保存的修改</span>
        <el-button
          type="primary"
          size="small"
          class="rounded-kb-lg px-4"
          :disabled="!dirty"
          :loading="saving"
          @click="handleSave"
          ><template #loading
            ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">保存</span>
        </el-button>
      </div>
    </div>
  </section>
</template>

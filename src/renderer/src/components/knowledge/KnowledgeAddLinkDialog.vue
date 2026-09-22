<!-- 组件说明：KnowledgeAddLinkDialog 组件，负责「添加链接」外链树节点创建弹窗。 -->
<script setup lang="ts">
/**
 * 对齐语雀知识库「+」菜单的「添加链接」：输入名称与网址后，
 * 在当前目录下创建 type=link 的树节点，点击即新窗口打开目标地址。
 */
import { computed, ref, watch } from "vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"

const props = defineProps<{
  open: boolean
  /** 创建中状态（父组件执行创建请求） */
  submitting?: boolean
}>()

const emit = defineEmits<{
  (e: "update:open", value: boolean): void
  (e: "confirm", payload: { title: string; url: string }): void
}>()

const title = ref("")
const url = ref("")

/** 只放行 http/https：树节点点击时走 window.open，javascript:/file:/data: 等协议会被直接导航 */
const SAFE_URL_SCHEMES = ["http:", "https:"]

const classifyUrl = (raw: string) => {
  const trimmed = raw.trim()

  if (!trimmed) {
    return { url: "", error: "" }
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)

    if (!SAFE_URL_SCHEMES.includes(parsed.protocol)) {
      // 「localhost:3000」「127.0.0.1:5173」这类主机:端口会被误解析成自定义协议：
      // 形如 host:数字端口 时按缺省协议补 https 重试，其余自定义协议维持拒绝
      if (/^[^/:?#\s]+:\d+(?:[/?#]|$)/.test(trimmed)) {
        const retried = new URL(`https://${trimmed}`)
        return { url: retried.href, error: "" }
      }

      return { url: "", error: "仅支持 http/https 链接" }
    }

    return { url: parsed.href, error: "" }
  } catch {
    return { url: "", error: "请输入合法的网址" }
  }
}

const parsedUrl = computed(() => classifyUrl(url.value))
const normalizedUrl = computed(() => parsedUrl.value.url)
const urlError = computed(() => parsedUrl.value.error)

const canSubmit = computed(
  () => title.value.trim().length > 0 && normalizedUrl.value.length > 0 && !props.submitting,
)

const dialog = useDialogBehavior({
  open: () => props.open,
})

const submit = () => {
  if (!canSubmit.value) {
    return
  }
  emit("confirm", { title: title.value.trim(), url: normalizedUrl.value })
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      title.value = ""
      url.value = ""
    }
  },
)
</script>

<template>
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-md"
    :model-value="open"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => emit('update:open', value)"
  >
    <template #header>
      <KbDialogHeader
        title="添加链接"
        eyebrow="新建"
        description="把常用网址挂进目录树，点击即可打开"
        @close="emit('update:open', false)"
      />
    </template>

    <form class="space-y-4" @submit.prevent="submit">
      <label class="block">
        <span class="text-[13px] font-medium text-ink-secondary">名称</span>
        <el-input
          v-model="title"
          type="text"
          maxlength="200"
          data-autofocus
          class="mt-1.5"
          placeholder="例如：语雀帮助中心"
        />
      </label>
      <label class="block">
        <span class="text-[13px] font-medium text-ink-secondary">网址</span>
        <el-input
          v-model="url"
          type="text"
          inputmode="url"
          spellcheck="false"
          autocomplete="off"
          maxlength="2000"
          class="mt-1.5"
          placeholder="https://..."
        />
        <span v-if="urlError" class="mt-1 block text-[12px] text-danger">{{ urlError }}</span>
      </label>
      <div class="flex justify-end gap-2 pt-1">
        <el-button plain @click="emit('update:open', false)"
          ><span class="truncate">取消</span>
        </el-button>
        <button
          type="submit"
          class="inline-flex h-9 items-center rounded-kb-lg bg-brand px-4 text-[13px] font-medium text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="!canSubmit"
        >
          {{ submitting ? "创建中…" : "添加" }}
        </button>
      </div>
    </form>
  </el-dialog>
</template>

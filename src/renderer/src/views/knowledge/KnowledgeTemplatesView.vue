<script setup lang="ts">
/**
 * 模板中心页面：展示当前知识库中的模板文档，支持一键创建副本。
 * 模板来源为知识库内 type=template 的文档（与「从模板创建」同源接口）。
 */
import { computed, inject, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import UiIcon from "@/components/common/UiIcon.vue"
import {
  createKnowledgeDocumentFromTemplate,
  listKnowledgeDocumentTemplates,
} from "@/services/knowledge-documents"
import type { KnowledgeDocumentItem } from "@/services/knowledge-documents"
import { getApiErrorMessage } from "@/services/http-client"
import { useTransientToast } from "@/composables/use-transient-toast"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"
import { formatDate } from "@/utils/date-format"
import { knowledgeWorkspaceContextKey } from "./workspace-context"

const router = useRouter()
const { showToastMessage } = useTransientToast()
const workspaceContext = inject(knowledgeWorkspaceContextKey)

if (!workspaceContext) {
  throw new Error("KnowledgeWorkspaceContext is missing")
}

const kbId = workspaceContext.kbId
const kbName = computed(() => workspaceContext.knowledgeBase.value?.name || "知识库")

const templates = ref<Array<{ id: string; title: string; updatedAt: string }>>([])
const loading = ref(true)
const creatingId = ref("")
const errorMessage = ref("")

const loadTemplates = async () => {
  loading.value = true
  errorMessage.value = ""
  try {
    templates.value = await listKnowledgeDocumentTemplates(kbId.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "模板加载失败，请稍后重试。"
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadTemplates()
})

const createFromTemplate = async (templateId: string) => {
  if (creatingId.value) {
    return
  }

  const tpl = templates.value.find((template) => template.id === templateId)
  if (!tpl) {
    return
  }

  creatingId.value = templateId
  try {
    const document: KnowledgeDocumentItem = await createKnowledgeDocumentFromTemplate(templateId, {
      title: `${tpl.title} - 副本`,
    })
    void router.push(
      getKnowledgeDocumentRouteTarget({
        kbId: kbId.value,
        docId: document.id,
        editorType: document.editorType,
      }),
    )
    // 新文档要立刻出现在目录树里，否则回到工作台时看不到
    void workspaceContext.refreshTree()
  } catch (error) {
    showToastMessage(getApiErrorMessage(error, "从模板创建失败，请稍后重试。"), "error")
  } finally {
    creatingId.value = ""
  }
}

const goBackToWorkspace = () => {
  void router.push({
    name: "knowledge-workspace-home",
    params: { kbId: kbId.value },
  })
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-[var(--kb-muted-bg)] p-5 sm:p-6 lg:p-8">
    <header class="mx-auto max-w-5xl">
      <div class="flex items-center gap-2 text-sm text-ink-quaternary">
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
          title="返回知识库"
          @click="goBackToWorkspace"
        >
          <AppIcon name="i-lucide-arrow-left" class="h-4 w-4" />
        </button>
        <span class="truncate">{{ kbName }}</span>
        <span>/</span>
        <span class="text-ink-secondary">模板中心</span>
      </div>

      <div class="mt-6 flex items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-ink">模板中心</h1>
          <p class="mt-2 text-sm leading-6 text-ink-tertiary">
            从模板中获取灵感，一键生成新文档副本。
          </p>
        </div>
        <span class="shrink-0 text-xs text-ink-quaternary">共 {{ templates.length }} 个模板</span>
      </div>
    </header>

    <section class="mx-auto mt-6 max-w-5xl">
      <div
        v-if="errorMessage"
        class="rounded-kb-2xl border border-error-light bg-error-bg px-4 py-3 text-sm text-error"
      >
        {{ errorMessage }}
      </div>

      <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="index in 6" :key="index" class="h-36 animate-pulse rounded-[22px] bg-surface" />
      </div>

      <div
        v-else-if="templates.length === 0 && !errorMessage"
        class="rounded-[28px] bg-surface px-6 py-16 text-center shadow-[var(--kb-surface-shadow)]"
      >
        <span
          class="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] border border-line bg-muted text-ink-quaternary"
        >
          <AppIcon name="i-lucide-layout-template" class="h-7 w-7" />
        </span>
        <h2 class="mt-5 text-base font-semibold text-ink">暂无模板</h2>
        <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-tertiary">
          当前知识库还没有模板。打开任意文档，在设置中选择「设为模板」，即可在这里一键创建副本。
        </p>
        <el-button
          type="primary"
          class="mt-6 rounded-[14px] bg-brand px-4 py-2 text-white hover:bg-brand-hover font-semibold"
          @click="goBackToWorkspace"
          ><span class="truncate">返回知识库</span>
        </el-button>
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="tpl in templates"
          :key="tpl.id"
          class="group flex flex-col rounded-[22px] border border-line bg-surface p-5 transition hover:border-brand-lighter hover:shadow-[var(--kb-elevated-shadow)]"
        >
          <div class="flex items-start gap-3">
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-line bg-muted text-ink-quaternary transition group-hover:border-brand-lighter group-hover:text-brand"
            >
              <AppIcon name="i-lucide-layout-template" class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-sm font-semibold text-ink" :title="tpl.title">
                {{ tpl.title }}
              </h3>
              <p v-if="tpl.updatedAt" class="mt-1 text-xs text-ink-quaternary">
                更新于 {{ formatDate(tpl.updatedAt) }}
              </p>
            </div>
          </div>
          <div class="mt-auto pt-4">
            <el-button
              type="primary"
              class="w-full rounded-[12px] border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-secondary transition hover:border-brand-lighter hover:text-brand [line-height:inherit] font-semibold"
              :loading="creatingId === tpl.id"
              :disabled="Boolean(creatingId)"
              @click="createFromTemplate(tpl.id)"
              ><template #loading
                ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
              /></template>
              <span class="truncate">使用模板创建</span>
            </el-button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

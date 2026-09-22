<!-- 组件说明：KnowledgeBasesView 组件，负责「知识库」列表页展示与交互。 -->
<script setup lang="ts">
/**
 * 页面组件：对齐语雀「知识库」列表页——标题 +「常用」分组（可收起）+
 * 紧凑卡片网格（蓝色书本图标 + 名称 + 描述），点击进入工作台。
 * 新建入口在侧栏「+」菜单（真机列表页无新建按钮）。
 */
import { onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import KnowledgeCreateKbDialog from "@/components/knowledge/KnowledgeCreateKbDialog.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { listKnowledgeBases, type KnowledgeBaseItem } from "@/services/knowledge-base"
import { getApiErrorMessage } from "@/services/http-client"

const router = useRouter()
const { showToastMessage } = useTransientToast()

const loading = ref(true)
const errorMessage = ref("")
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const sectionCollapsed = ref(false)
const createDialogOpen = ref(false)

const openKb = (kb: KnowledgeBaseItem) => {
  router.push({ name: "knowledge-workspace-home", params: { kbId: kb.id } })
}

const handleCreated = async (kb: KnowledgeBaseItem) => {
  showToastMessage(`知识库「${kb.name}」创建成功。`, "success")
  try {
    knowledgeBases.value = await listKnowledgeBases()
  } catch {
    // 刷新失败不阻塞跳转（创建已成功），进入工作区后列表仍会重新加载
  }
  router.push({ name: "knowledge-workspace-home", params: { kbId: kb.id } })
}

const load = async () => {
  loading.value = true
  errorMessage.value = ""

  try {
    knowledgeBases.value = await listKnowledgeBases()
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "加载知识库列表失败。")
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <KnowledgePageShell>
    <div class="kb-page-scroll kb-fade-in">
      <div class="kb-content-wrap">
        <h1 class="text-[24px] font-semibold leading-8 text-ink">知识库</h1>

        <!-- 分组头：常用 + 收起/展开（对齐语雀列表页分组形态） -->
        <div class="mt-5 flex items-center justify-between gap-3">
          <h2 class="text-[15px] font-medium text-ink">常用</h2>
          <button
            type="button"
            class="inline-flex items-center gap-0.5 rounded-kb-sm px-1.5 py-0.5 text-[12px] text-ink-tertiary transition hover:bg-muted hover:text-ink-secondary"
            @click="sectionCollapsed = !sectionCollapsed"
          >
            {{ sectionCollapsed ? "展开" : "收起" }}
            <Icon
              icon="ph:caret-up"
              :width="12"
              :height="12"
              class="transition-transform duration-150"
              :class="sectionCollapsed ? 'rotate-180' : ''"
            />
          </button>
        </div>

        <p v-if="errorMessage" class="mt-4 text-kb-sm text-error">{{ errorMessage }}</p>

        <div v-if="loading && !sectionCollapsed" class="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="index in 6" :key="index" class="h-[55px] animate-pulse rounded-[10px] bg-grey-200" />
        </div>

        <div
          v-else-if="!loading && !errorMessage && knowledgeBases.length === 0 && !sectionCollapsed"
          class="mt-3 flex min-h-[280px] flex-col items-center justify-center rounded-[16px] border border-dashed border-line py-12 text-center"
        >
          <Icon icon="ph:book-open-text" :width="40" :height="40" class="text-ink-quaternary" />
          <p class="mt-3 text-[15px] font-medium text-ink-secondary">还没有知识库</p>
          <p class="mt-1.5 text-[13px] text-ink-tertiary">
            通过左侧
            <Icon icon="ph:plus" :width="12" :height="12" class="inline align-[-1px]" />
            菜单「创建知识库」，开始整理你的知识。
          </p>
        </div>

        <!-- 卡片网格：紧凑单卡（书本图标 + 名称 + 描述），点击进入工作台 -->
        <div v-else-if="!sectionCollapsed" class="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="kb in knowledgeBases"
            :key="kb.id"
            type="button"
            class="flex items-center gap-2.5 rounded-[10px] border border-line/70 bg-surface px-3 py-2 text-left transition duration-150 hover:border-brand-lighter hover:shadow-[0_4px_12px_rgba(15,23,42,0.05)]"
            @click="openKb(kb)"
          >
            <Icon
              icon="ph:book-fill"
              :width="20"
              :height="20"
              class="shrink-0 text-[var(--kb-blue-500)] dark:text-[var(--kb-blue-400)]"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium leading-5 text-ink" :title="kb.name">{{
                kb.name
              }}</span>
              <span class="block truncate text-[12px] leading-4 text-ink-tertiary" :title="kb.description || ''">
                {{ kb.description || "暂无描述" }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </KnowledgePageShell>

  <KnowledgeCreateKbDialog v-model:open="createDialogOpen" @created="handleCreated" />
</template>

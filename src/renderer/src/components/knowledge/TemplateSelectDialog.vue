<!-- 模板中心（B3d 对齐语雀模板中心：来源 tab + 实时预览；2026-09-22 按需求梳理 5.3
     实测补齐分类树：团队协作 11 类 + 个人管理折叠组，「使用此模板」主钮移至右栏顶部） -->
<script setup lang="ts">
/**
 * 对话框组件：语雀模板中心形态——左侧模板实时预览，右栏自上而下为
 * 「使用此模板」按钮 + 来源 tab（推荐（官方）/ 本知识库 / 我的）+ 分类树 + 模板列表。
 *
 * - 官方模板为前端内置 Markdown 集（utils/official-templates），创建即
 *   以 markdown scheme 新建文档；分类树仅作用于官方 tab（分类是官方模板的分类法），
 *   本知识库/我的两 tab 平铺展示；
 * - 本知识库模板沿用 create-from-template 接口；
 * - 预览用 markdown-it 渲染（默认关闭内嵌 HTML，安全）。
 * T9 起内脏为裸 el-dialog + useDialogBehavior；头部走 KbDialogHeader。
 */
import { computed, ref, watch } from "vue"
import { ElMessage } from "element-plus"
import MarkdownIt from "markdown-it"
import UiIcon from "@/components/common/UiIcon.vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import {
  listKnowledgeDocumentTemplates,
  listMyKnowledgeTemplates,
  createKnowledgeDocumentFromTemplate,
  createKnowledgeDocument,
} from "@/services/knowledge-documents"
import type { KnowledgeDocumentItem } from "@/services/knowledge-documents"
import { getApiErrorMessage } from "@/services/http-client"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import { formatDate } from "@/utils/date-format"
import { OFFICIAL_TEMPLATES } from "@/utils/official-templates"

const props = defineProps<{
  open: boolean
  kbId: string
  parentId?: string | null
}>()

const emit = defineEmits<{
  (e: "update:open", val: boolean): void
  (e: "created", document: KnowledgeDocumentItem): void
}>()

type TemplateSource = "official" | "kb" | "mine"

interface TemplateOption {
  key: string
  id: string
  title: string
  /** 官方模板为内部分类；本知识库固定文案；「我的」为来源知识库名（kb.name） */
  category: string
  description: string
  content: string
  /** 官方模板无更新时间语义，展示固定标签 */
  updatedAt?: string
  source: TemplateSource
}

const sourceTab = ref<TemplateSource>("official")
const kbTemplates = ref<TemplateOption[]>([])
/** 「我的」跨库模板（B4 #14）：切到该 tab 才懒加载，失败静默（保持空态） */
const myTemplates = ref<TemplateOption[]>([])
const myTemplatesLoaded = ref(false)
const loading = ref(false)
const creating = ref(false)
const loadError = ref("")
const selectedKey = ref("")

/** 分类树选中态：all=全部；仅官方 tab 展示分类树（5.3 实测：分类树挂在推荐来源下） */
const selectedCategory = ref("all")
/** 分类树分组展开态（5.3 实测：个人管理组默认折叠） */
const expandedGroups = ref<Record<string, boolean>>({
  团队协作: true,
  个人管理: false,
})

/** 分类树（5.3 实测：团队协作 11 类；个人管理组默认折叠，内容为自有官方模板分类） */
const categoryTree = [
  {
    label: "团队协作",
    categories: [
      "会议记录",
      "工作汇报",
      "项目立项",
      "用研报告",
      "需求文档",
      "需求管理",
      "系分文档",
      "缺陷管理",
      "故障复盘",
      "接口文档",
      "项目复盘",
    ],
  },
  {
    label: "个人管理",
    categories: ["个人计划", "读书笔记"],
  },
]

const markdown = new MarkdownIt({ html: false, breaks: true })

const officialOptions: TemplateOption[] = OFFICIAL_TEMPLATES.map((template) => ({
  key: template.id,
  id: template.id,
  title: template.title,
  category: template.category,
  description: template.description,
  content: template.content,
  source: "official" as const,
}))

/** 官方 tab 的模板列表：按分类树选中项过滤（分组折叠只收起树导航，不影响「全部」列表） */
const officialListedOptions = computed(() => {
  if (selectedCategory.value === "all") {
    return officialOptions
  }
  return officialOptions.filter((option) => option.category === selectedCategory.value)
})

const sourceOptions = computed(() => {
  if (sourceTab.value === "official") {
    return officialListedOptions.value
  }
  return sourceTab.value === "mine" ? myTemplates.value : kbTemplates.value
})

/** 官方 tab 按分类分组展示；本知识库 tab 平铺 */
const groupedOptions = computed(() => {
  const groups = new Map<string, TemplateOption[]>()
  for (const option of sourceOptions.value) {
    const list = groups.get(option.category) ?? []
    list.push(option)
    groups.set(option.category, list)
  }
  return [...groups.entries()]
})

const selectedTemplate = computed(
  () => sourceOptions.value.find((option) => option.key === selectedKey.value) ?? null,
)

const previewHtml = computed(() => {
  const template = selectedTemplate.value
  if (!template) {
    return ""
  }
  return markdown.render(template.content)
})

watch(
  () => props.open,
  async (val) => {
    if (!val) return
    selectedKey.value = officialOptions[0]?.key ?? ""
    sourceTab.value = "official"
    selectedCategory.value = "all"
    expandedGroups.value = { 团队协作: true, 个人管理: false }
    if (kbTemplates.value.length === 0) {
      loading.value = true
      loadError.value = ""
      try {
        const items = await listKnowledgeDocumentTemplates(props.kbId)
        kbTemplates.value = items.map((item) => ({
          key: item.id,
          id: item.id,
          title: item.title,
          category: "本知识库",
          description: "",
          content:
            item.content?.scheme === "text/markdown"
              ? item.content.value
              : typeof item.content?.value === "string"
                ? String(item.content.value)
                : "",
          updatedAt: item.updatedAt,
          source: "kb" as const,
        }))
      } catch (error) {
        // 失败不阻塞官方 tab，仅在本知识库 tab 内展示错误
        loadError.value = getApiErrorMessage(error, "模板加载失败，请稍后重试。")
      } finally {
        loading.value = false
      }
    }
  },
  // 挂载时 open 可能已为 true（父层 v-if 控制），immediate 保证模板列表仍会加载
  { immediate: true },
)

watch(sourceTab, (tab) => {
  if (tab === "mine") {
    void loadMyTemplates()
  }
  selectedCategory.value = "all"
  const first =
    tab === "official"
      ? officialListedOptions.value[0]
      : tab === "mine"
        ? myTemplates.value[0]
        : kbTemplates.value[0]
  selectedKey.value = first?.key ?? ""
})

const handleSelectCategory = (category: string) => {
  selectedCategory.value = category
  selectedKey.value = officialListedOptions.value[0]?.key ?? ""
}

/** 「我的」模板懒加载（B4 #14）：只拉一次；失败静默（空态可重进 tab 重试不再拉） */
const loadMyTemplates = async () => {
  if (myTemplatesLoaded.value) {
    return
  }

  myTemplatesLoaded.value = true
  try {
    const items = await listMyKnowledgeTemplates()
    myTemplates.value = items.map((item) => ({
      key: `mine-${item.id}`,
      id: item.id,
      title: item.title,
      // category = 来源知识库名（列表按库分组展示）
      category: item.kb?.name || "我的模板",
      description: "",
      content:
        item.content?.scheme === "text/markdown"
          ? item.content.value
          : typeof item.content?.value === "string"
            ? String(item.content.value)
            : "",
      updatedAt: item.updatedAt,
      source: "mine" as const,
    }))
  } catch {
    // 静默失败：「我的」tab 呈现空态，不影响官方/本知识库两个 tab
    myTemplates.value = []
  }
}

const handleUseTemplate = async () => {
  const template = selectedTemplate.value
  if (!template || creating.value) return
  creating.value = true
  try {
    const doc =
      template.source === "official"
        ? await createKnowledgeDocument({
            kbId: props.kbId,
            title: template.title,
            status: "draft",
            type: "doc",
            parentId: props.parentId ?? undefined,
            content: { scheme: "text/markdown", value: template.content },
          })
        : await createKnowledgeDocumentFromTemplate(template.id, {
            title: `${template.title} - 副本`,
            parentId: props.parentId ?? undefined,
            // 「我的」模板跨库创建（B4 #14）：新文档落入当前知识库
            ...(template.source === "mine" ? { targetKbId: props.kbId } : {}),
          })
    emit("created", doc)
    emit("update:open", false)
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, "从模板创建失败，请稍后重试。"))
  } finally {
    creating.value = false
  }
}

const dialog = useDialogBehavior({
  open: () => props.open,
})
</script>

<template>
  <!-- eslint-disable vue/no-v-html —— 预览渲染来自 markdown-it（html:false），内嵌 HTML 已转义 -->
  <el-dialog
    v-bind="dialog.elDialogBindings"
    class="max-w-4xl"
    :model-value="open"
    title="模板中心"
    close-on-click-modal
    close-on-press-escape
    @update:model-value="(value) => !value && emit('update:open', false)"
  >
    <template #header>
      <KbDialogHeader
        title="模板中心"
        description="左侧实时预览，选择模板后一键生成文档副本。"
        @close="emit('update:open', false)"
      />
    </template>

    <div class="flex h-[min(640px,80vh)] gap-4">
      <!-- 左：实时预览 -->
      <div
        class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-kb-xl border border-line bg-surface"
      >
        <p
          class="shrink-0 border-b border-line px-4 py-2.5 text-[12px] font-medium text-ink-tertiary"
        >
          {{ selectedTemplate ? `模板预览 · ${selectedTemplate.title}` : "模板预览" }}
        </p>
        <div
          v-if="selectedTemplate"
          class="template-preview min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-6 text-ink-secondary"
          v-html="previewHtml"
        />
        <p v-else class="px-5 py-16 text-center text-[13px] text-ink-quaternary">
          从右侧选择一个模板
        </p>
      </div>

      <!-- 右栏（5.3 实测形态）：使用此模板主钮 → 来源 tab → 分类树 → 模板列表 -->
      <div class="flex w-80 shrink-0 flex-col">
        <el-button
          type="primary"
          class="w-full py-2"
          :disabled="!selectedTemplate"
          :loading="creating"
          @click="handleUseTemplate"
          ><template #loading
            ><UiIcon icon="i-lucide-loader-circle" class="shrink-0 animate-spin"
          /></template>
          <span class="truncate">使用此模板</span>
        </el-button>

        <div class="mt-3 flex rounded-kb-lg bg-grey-200 p-0.5">
          <button
            v-for="tab in [
              { key: 'official' as const, label: '推荐（官方）' },
              { key: 'kb' as const, label: '本知识库' },
              { key: 'mine' as const, label: '我的' },
            ]"
            :key="tab.key"
            type="button"
            class="h-7 flex-1 rounded-kb-md text-[12px] font-medium transition"
            :class="
              sourceTab === tab.key
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-tertiary hover:text-ink'
            "
            @click="sourceTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- 分类树：仅官方 tab 展示（分类是官方模板的分类法）；分组可折叠，个人管理默认折叠。
             树取自然高度不内滚（全部+两组 15 行约 420px，右栏总高 640 内放得下；内滚会藏住尾部分类） -->
        <div v-if="sourceTab === 'official'" class="mt-2 shrink-0 space-y-0.5">
          <button
            type="button"
            class="flex h-7 w-full items-center rounded-kb-md px-2 text-left text-[13px] transition"
            :class="
              selectedCategory === 'all'
                ? 'bg-brand-faint font-medium text-brand'
                : 'text-ink-secondary hover:bg-grey-100'
            "
            @click="handleSelectCategory('all')"
          >
            全部模板
          </button>
          <div v-for="group in categoryTree" :key="group.label">
            <button
              type="button"
              class="flex h-7 w-full items-center gap-1 rounded-kb-md px-2 text-left text-[12px] font-medium text-ink-tertiary transition hover:bg-grey-100"
              @click="expandedGroups[group.label] = !expandedGroups[group.label]"
            >
              <UiIcon
                icon="ph:caret-right"
                class="h-2.5 w-2.5 shrink-0 transition"
                :class="expandedGroups[group.label] ? 'rotate-90' : ''"
              />
              {{ group.label }}
            </button>
            <template v-if="expandedGroups[group.label]">
              <button
                v-for="category in group.categories"
                :key="category"
                type="button"
                class="flex h-7 w-full items-center rounded-kb-md pl-7 pr-2 text-left text-[13px] transition"
                :class="
                  selectedCategory === category
                    ? 'bg-brand-faint font-medium text-brand'
                    : 'text-ink-secondary hover:bg-grey-100'
                "
                @click="handleSelectCategory(category)"
              >
                <span class="min-w-0 flex-1 truncate">{{ category }}</span>
                <span class="shrink-0 text-[11px] text-ink-quaternary">
                  {{ officialOptions.filter((option) => option.category === category).length }}
                </span>
              </button>
            </template>
          </div>
        </div>

        <div class="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          <p
            v-if="sourceTab === 'kb' && loading"
            class="px-2 py-8 text-center text-[13px] text-ink-quaternary"
          >
            正在加载模板…
          </p>
          <p
            v-else-if="sourceTab === 'kb' && loadError"
            class="rounded-kb-lg bg-error-bg px-3 py-6 text-center text-[12px] leading-5 text-error"
          >
            {{ loadError }}
          </p>
          <p
            v-else-if="sourceOptions.length === 0"
            class="px-2 py-8 text-center text-[13px] leading-5 text-ink-quaternary"
          >
            {{
              sourceTab === "kb"
                ? "本知识库暂无模板，可先将文档设为模板。"
                : sourceTab === "mine"
                  ? "暂无我的模板，可在文档「更多」中将文档设为模板。"
                  : "该分类暂无模板"
            }}
          </p>

          <template v-for="[category, options] in groupedOptions" :key="category">
            <p
              v-if="selectedCategory === 'all'"
              class="px-1 pt-2 text-[11px] font-medium text-ink-quaternary"
            >
              {{ category }}
            </p>
            <button
              v-for="option in options"
              :key="option.key"
              type="button"
              class="w-full rounded-kb-lg border px-3 py-2.5 text-left transition"
              :class="
                selectedKey === option.key
                  ? 'border-brand-lighter bg-brand-faint'
                  : 'border-transparent hover:border-line hover:bg-grey-100'
              "
              @click="selectedKey = option.key"
            >
              <span class="flex items-center gap-2">
                <UiIcon
                  icon="i-lucide-layout-template"
                  class="h-3.5 w-3.5 shrink-0"
                  :class="selectedKey === option.key ? 'text-brand' : 'text-ink-quaternary'"
                />
                <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{{
                  option.title
                }}</span>
                <span
                  v-if="selectedKey === option.key"
                  class="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-brand"
                >
                  已选择
                </span>
              </span>
              <span
                v-if="option.description"
                class="mt-0.5 block truncate px-5 text-[11px] text-ink-tertiary"
              >
                {{ option.description }}
              </span>
              <span
                v-else-if="option.updatedAt"
                class="mt-0.5 block px-5 text-[11px] text-ink-quaternary"
              >
                更新于 {{ formatDate(option.updatedAt) }}
              </span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.template-preview :deep(h1),
.template-preview :deep(h2),
.template-preview :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-weight: 600;
  color: var(--kb-text);
}
.template-preview :deep(h1) {
  font-size: 18px;
}
.template-preview :deep(h2) {
  font-size: 15px;
}
.template-preview :deep(h3) {
  font-size: 14px;
}
.template-preview :deep(p) {
  margin: 0.4em 0;
}
.template-preview :deep(ul),
.template-preview :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.4em;
}
.template-preview :deep(table) {
  margin: 0.6em 0;
  border-collapse: collapse;
  font-size: 12px;
}
.template-preview :deep(th),
.template-preview :deep(td) {
  border: 1px solid var(--kb-border);
  padding: 4px 8px;
}
.template-preview :deep(code) {
  padding: 1px 5px;
  border-radius: var(--kb-radius-xs);
  background: var(--kb-muted-bg);
  font-size: 12px;
}
.template-preview :deep(pre) {
  margin: 0.6em 0;
  padding: 10px 12px;
  border-radius: var(--kb-radius-md);
  background: var(--kb-muted-bg);
  overflow-x: auto;
}
.template-preview :deep(pre code) {
  padding: 0;
  background: transparent;
}
.template-preview :deep(blockquote) {
  margin: 0.6em 0;
  padding-left: 12px;
  border-left: 3px solid var(--kb-border);
  color: var(--kb-text-tertiary);
}
.template-preview :deep(hr) {
  margin: 0.8em 0;
  border: none;
  border-top: 1px solid var(--kb-border);
}
</style>

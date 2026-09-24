import { readFileSync, writeFileSync } from "node:fs"

// ============ KnowledgeSidebarHeader：logo 下拉改为空间切换器（B7 #25） ============
const headerPath = "src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
let h = readFileSync(headerPath, "utf8")

h = h.replace(
  /const props = defineProps<\{[\s\S]*?\}>/,
  [
    "const props = defineProps<{",
    "  avatar?: string | null",
    "  userLabel: string",
    "  hasActiveKb: boolean",
    "  /** 空间切换器（B7 #25）：列表 + 当前选中 */",
    "  spaces?: Array<{ id: string | null; name: string; role: string; memberCount: number }>",
    "  activeSpaceId?: string | null",
    "}>()",
  ].join("\n"),
)

h = h.replace(
  /const emit = defineEmits<\{[\s\S]*?\}>/,
  [
    "const emit = defineEmits<{",
    '  "open-account": []',
    '  "open-search": []',
    '  "open-create": []',
    '  create: [kind: "doc" | "folder" | "template"]',
    '  import: [kind: "md" | "docx" | "lake"]',
    '  "create-kb": []',
    '  "avatar-error": []',
    "  /** 切换空间（null = 个人空间） */",
    '  "change-space": [spaceId: string | null]',
    '  "create-space": [name: string]',
    "}>()",
  ].join("\n"),
)

const headerOld = [
  "      <button",
  '        type="button"',
  '        class="flex min-w-0 items-center gap-2 rounded-kb-md py-1 pr-2 text-left transition duration-150 hover:bg-grey-200"',
  "        @click=\"emit('open-account')\"",
  "      >",
  '        <img :src="yuqueLogo" alt="语雀" class="h-6.5 w-6.5 shrink-0 rounded-kb-sm" />',
  '        <span class="truncate text-[15px] font-semibold tracking-tight text-ink">语雀</span>',
  '        <Icon icon="ph:caret-down" :width="12" :height="12" class="shrink-0 text-ink-tertiary" />',
  "      </button>",
].join("\n")

const headerNew = [
  '      <el-dropdown trigger="click" :offset="6" class="min-w-0">',
  "        <button",
  '          type="button"',
  '          class="flex min-w-0 items-center gap-2 rounded-kb-md py-1 pr-2 text-left transition duration-150 hover:bg-grey-200"',
  "          @click.stop",
  "        >",
  '          <img :src="yuqueLogo" alt="语雀" class="h-6.5 w-6.5 shrink-0 rounded-kb-sm" />',
  '          <span class="truncate text-[15px] font-semibold tracking-tight text-ink">语雀</span>',
  '          <Icon icon="ph:caret-down" :width="12" :height="12" class="shrink-0 text-ink-tertiary" />',
  "        </button>",
  "        <template #dropdown>",
  '          <div class="kb-menu min-w-[220px] py-1">',
  '            <p class="px-3 pb-1 pt-1.5 text-[11px] text-ink-quaternary">空间</p>',
  "            <button",
  '              v-for="space in spaces ?? []"',
  "              :key=\"space.id ?? '__personal__'\"",
  '              type="button"',
  '              class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition hover:bg-muted"',
  "              :class=\"activeSpaceId === space.id ? 'text-brand' : 'text-ink-secondary'\"",
  "              @click=\"emit('change-space', space.id)\"",
  "            >",
  '              <span class="min-w-0 truncate">{{ space.name }}</span>',
  '              <span class="shrink-0 text-[11px] text-ink-quaternary">{{ space.memberCount }}成员</span>',
  "            </button>",
  '            <div class="my-1 border-t border-line" />',
  "            <button",
  '              type="button"',
  '              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  '              @click="createSpaceInline = true"',
  "            >",
  '              <Icon icon="ph:plus" :width="13" :height="13" />',
  "              创建空间",
  "            </button>",
  "            <button",
  '              type="button"',
  '              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted"',
  "              @click=\"emit('open-account')\"",
  "            >",
  "              个人设置",
  "            </button>",
  "          </div>",
  "        </template>",
  "      </el-dropdown>",
  "      <input",
  '        v-if="createSpaceInline"',
  '        v-model="newSpaceName"',
  '        type="text"',
  '        class="h-7 w-24 rounded-kb-sm border border-line bg-surface px-2 text-[12px] text-ink outline-none focus:border-brand-lighter"',
  '        placeholder="空间名"',
  '        @keydown.enter.prevent="submitCreateSpace"',
  '        @blur="submitCreateSpace"',
  "      />",
].join("\n")

if (!h.includes(headerOld)) {
  console.error("header anchor missing")
  process.exit(1)
}
h = h.replace(headerOld, headerNew)

h = h.replace(
  "</script>",
  [
    "",
    "// 空间切换（B7 #25）",
    "const createSpaceInline = ref(false)",
    'const newSpaceName = ref("")',
    "",
    "const submitCreateSpace = () => {",
    "  const name = newSpaceName.value.trim()",
    "  if (name) {",
    '    emit("create-space", name)',
    "  }",
    '  newSpaceName.value = ""',
    "  createSpaceInline.value = false",
    "}",
    "</script>",
  ].join("\n"),
)

writeFileSync(headerPath, h)
console.log("header ok")

// ============ KnowledgeSidebarMenu：空间状态 + KB 过滤 ============
const menuPath = "src/renderer/src/components/knowledge/KnowledgeSidebarMenu.vue"
let m = readFileSync(menuPath, "utf8")

m = m.replace(
  'import { listKnowledgeBases, updateKnowledgeBaseSortOrder, type KnowledgeBaseItem } from "@/services/knowledge-base"',
  [
    "import {",
    "  createKnowledgeSpace,",
    "  listKnowledgeBases,",
    "  listKnowledgeSpaces,",
    "  type KnowledgeBaseItem,",
    "  type KnowledgeSpaceItem,",
    "  updateKnowledgeBaseSortOrder,",
    '} from "@/services/knowledge-base"',
  ].join("\n"),
)

const menuState = [
  "const knowledgeBases = ref<KnowledgeBaseItem[]>([])",
  "// 空间切换（B7 #25）：选中态持久化，KB 列表按归属过滤",
  "const spaces = ref<KnowledgeSpaceItem[]>([])",
  "const activeSpaceId = ref<string | null>(null)",
  'const SPACE_STORAGE_KEY = "knowledge:active-space-id"',
  "",
  "const filteredKnowledgeBases = computed(() =>",
  "  activeSpaceId.value === null",
  "    ? knowledgeBases.value",
  "    : knowledgeBases.value.filter(item => item.spaceId === activeSpaceId.value)",
  ")",
  "",
  "const loadSpaces = async () => {",
  "  try {",
  "    spaces.value = await listKnowledgeSpaces()",
  "    const stored = window.localStorage.getItem(SPACE_STORAGE_KEY)",
  "    if (stored === null || stored === '' || spaces.value.some(space => space.id === stored)) {",
  "      activeSpaceId.value = stored === null || stored === '' ? null : stored",
  "    }",
  "  } catch {",
  "    spaces.value = [{ id: null, name: '个人', role: 'personal', memberCount: 1, kbCount: knowledgeBases.value.length }]",
  "  }",
  "}",
  "",
  "const handleSpaceChanged = (spaceId: string | null) => {",
  "  activeSpaceId.value = spaceId",
  '  window.localStorage.setItem(SPACE_STORAGE_KEY, spaceId ?? "")',
  "}",
  "",
  "const handleSpaceCreated = async (name: string) => {",
  "  try {",
  "    await createKnowledgeSpace(name)",
  "    await loadSpaces()",
  "    showToastMessage('空间「' + name + '」已创建。', 'success')",
  "  } catch (error) {",
  "    showToastMessage(error instanceof Error ? error.message : '创建空间失败', 'error')",
  "  }",
  "}",
].join("\n")

if (!m.includes("const knowledgeBases = ref<KnowledgeBaseItem[]>([])")) {
  console.error("menu state anchor missing")
  process.exit(1)
}
m = m.replace("const knowledgeBases = ref<KnowledgeBaseItem[]>([])", menuState)

const headerBindOld = [
  "    <KnowledgeSidebarHeader",
  '      :avatar="currentUserAvatar"',
  '      :user-label="currentUserLabel"',
  '      :has-active-kb="!!resolvedActiveKbId"',
].join("\n")
const headerBindNew = [
  "    <KnowledgeSidebarHeader",
  '      :avatar="currentUserAvatar"',
  '      :user-label="currentUserLabel"',
  '      :has-active-kb="!!resolvedActiveKbId"',
  '      :spaces="spaces"',
  '      :active-space-id="activeSpaceId"',
  '      @change-space="handleSpaceChanged"',
  '      @create-space="handleSpaceCreated"',
].join("\n")
if (!m.includes(headerBindOld)) {
  console.error("menu header bind missing")
  process.exit(1)
}
m = m.replace(headerBindOld, headerBindNew)

m = m.replace(
  [
    "        <KnowledgeSidebarKnowledgeBasesSection",
    '          :expanded="knowledgeMenuExpanded"',
    '          :knowledge-bases="knowledgeBases"',
  ].join("\n"),
  [
    "        <KnowledgeSidebarKnowledgeBasesSection",
    '          :expanded="knowledgeMenuExpanded"',
    '          :knowledge-bases="filteredKnowledgeBases"',
  ].join("\n"),
)

// 加载空间列表：loadKnowledgeBases 成功后顺带
m = m.replace(
  "    knowledgeBases.value = await listKnowledgeBases()",
  "    knowledgeBases.value = await listKnowledgeBases()\n    void loadSpaces()",
)

writeFileSync(menuPath, m)
console.log("menu ok")

import { readFileSync, writeFileSync } from "node:fs"

// 1) SpaceMembersDialog：静态 import 改正（去掉双 script hack）
const dialogPath = "src/renderer/src/components/knowledge/SpaceMembersDialog.vue"
let d = readFileSync(dialogPath, "utf8")
d = d.replace(
  'import ConfirmDialogPlaceholder from "@/components/common/ConfirmDialog.vue"\n',
  ""
)
d = d.replace(
  'import { useTransientToast } from "@/composables/use-transient-toast"',
  'import KbDialogHeader from "@/components/common/KbDialogHeader.vue"\nimport { useTransientToast } from "@/composables/use-transient-toast"'
)
d = d.replace(
  /\n<script lang="ts">\nimport KbDialogHeader from "@\/components\/common\/KbDialogHeader.vue"\nexport default \{ components: \{ KbDialogHeader \} \}\n<\/script>\n$/,
  "\n"
)
writeFileSync(dialogPath, d)
console.log("dialog imports ok")

// 2) Header：owner 空间显示「管理成员」入口
const headerPath = "src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarHeader.vue"
let h = readFileSync(headerPath, "utf8")
h = h.replace(
  `  "create-space": [name: string]`,
  `  "create-space": [name: string]
  "manage-members": [spaceId: string]`
)
h = h.replace(
  `            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
              @click="emit('open-account')"
            >
              个人设置
            </button>`,
  `            <button
              v-for="managed in (spaces ?? []).filter(space => space.role === 'owner' && space.id)"
              :key="'manage-' + managed.id"
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
              @click="emit('manage-members', managed.id!)"
            >
              <Icon icon="ph:users" :width="13" :height="13" />
              管理「{{ managed.name }}」成员
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink-secondary transition hover:bg-muted"
              @click="emit('open-account')"
            >
              个人设置
            </button>`
)
writeFileSync(headerPath, h)
console.log("header manage entry ok")

// 3) SidebarMenu：宿主弹窗 + 事件
const menuPath = "src/renderer/src/components/knowledge/KnowledgeSidebarMenu.vue"
let m = readFileSync(menuPath, "utf8")
m = m.replace(
  'import KnowledgeSidebarKnowledgeBasesSection from "@/components/knowledge/sidebar/KnowledgeSidebarKnowledgeBasesSection.vue"',
  'import KnowledgeSidebarKnowledgeBasesSection from "@/components/knowledge/sidebar/KnowledgeSidebarKnowledgeBasesSection.vue"\nimport SpaceMembersDialog from "@/components/knowledge/SpaceMembersDialog.vue"'
)
m = m.replace(
  "const handleSpaceCreated = async (name: string) => {",
  `const membersDialogSpace = ref<{ id: string; name: string } | null>(null)

const handleManageMembers = (spaceId: string) => {
  const space = spaces.value.find(item => item.id === spaceId)
  if (space?.id) {
    membersDialogSpace.value = { id: space.id, name: space.name }
  }
}

const handleSpaceCreated = async (name: string) => {`
)
m = m.replace(
  '      @create-space="handleSpaceCreated"',
  '      @create-space="handleSpaceCreated"\n      @manage-members="handleManageMembers"'
)
m = m.replace(
  `    <KnowledgeSidebarKnowledgeBasesSection`,
  `    <SpaceMembersDialog
      v-if="membersDialogSpace"
      :visible="!!membersDialogSpace"
      :space-id="membersDialogSpace.id"
      :space-name="membersDialogSpace.name"
      :token="authStore.accessToken"
      @close="membersDialogSpace = null"
    />

    <KnowledgeSidebarKnowledgeBasesSection`
)
writeFileSync(menuPath, m)
console.log("menu host ok")

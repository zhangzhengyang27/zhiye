<!-- 组件说明：KnowledgeFavoritesView 组件，负责「收藏」页面展示与交互。 -->
<script setup lang="ts">
/**
 * 页面组件：对齐语雀「收藏」页样式——两行式列表行（标题 + 作者/来源知识库），
 * 行尾文档类型图块，不展示收藏时间；「取消收藏」收进 hover 图标按钮。
 */
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import Icon from "@/components/common/UiIcon.vue"
import KnowledgeContentHeader from "@/components/knowledge/KnowledgeContentHeader.vue"
import KnowledgeFilterToolbar from "@/components/knowledge/KnowledgeFilterToolbar.vue"
import KnowledgePageShell from "@/components/knowledge/KnowledgePageShell.vue"
import { useTransientToast } from "@/composables/use-transient-toast"
import { listKnowledgeBases, type KnowledgeBaseItem } from "@/services/knowledge-base"
import {
  createFavoriteFolder,
  listFavoriteFolders,
  listKnowledgeFavorites,
  moveFavoriteToFolder,
  removeFavoriteFolder,
  removeKnowledgeFavorite,
  renameFavoriteFolder,
  type KnowledgeFavoriteFolder,
  type KnowledgeFavoriteItem,
  type KnowledgeFavoriteListResult,
} from "@/services/knowledge-favorites"
import ConfirmDialog from "@/components/common/ConfirmDialog.vue"
import { getKnowledgeDocumentRouteTarget } from "@/utils/knowledge-document"

const router = useRouter()
const loading = ref(false)
const errorMessage = ref("")
const keyword = ref("")
const ALL_KB_VALUE = "__all_kb__"
const selectedKbId = ref(ALL_KB_VALUE)
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const favoriteResult = ref<KnowledgeFavoriteListResult | null>(null)
const cancelingDocIds = ref<string[]>([])
const FAVORITES_PAGE_SIZE = 100
const favoritesPage = ref(1)
const loadingMore = ref(false)

// ---- 收藏夹分组（B3a 对齐语雀收藏页左列） ----
const ALL_FOLDER_VALUE = "__all__"
const folders = ref<KnowledgeFavoriteFolder[]>([])
const activeFolderId = ref<string>(ALL_FOLDER_VALUE)
const folderBusy = ref(false)
/** 行内重命名：editingFolderId 非空时该夹名称进入输入态 */
const editingFolderId = ref<string | null>(null)
const editingFolderName = ref("")
const creatingFolder = ref(false)
const creatingFolderName = ref("")
const deletingFolder = ref<KnowledgeFavoriteFolder | null>(null)
const deletingFolderMessage = computed(() =>
  deletingFolder.value
    ? `删除收藏夹「${deletingFolder.value.name}」后，夹内收藏将回到「全部收藏」，收藏本身不会被删除。`
    : "",
)

const hasMoreFavorites = computed(
  () => (favoriteResult.value?.total ?? 0) > favoriteItems.value.length,
)

const { showToastMessage } = useTransientToast()

const favoriteItems = computed(() => favoriteResult.value?.items ?? [])

const filteredItems = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()

  return favoriteItems.value
    .filter((item) => {
      if (activeFolderId.value === ALL_FOLDER_VALUE) {
        return true
      }

      return item.folderId === activeFolderId.value
    })
    .filter((item) => {
      if (!normalizedKeyword) {
        return true
      }

      return [item.title, item.kbName || "", item.creator || ""].some((field) =>
        field.toLowerCase().includes(normalizedKeyword),
      )
    })
})

// 页头计数用接口 total（pageSize 100 截断时 filteredItems.length 会少计）
const summary = computed(
  () => `${favoriteResult.value?.total ?? filteredItems.value.length} 篇收藏`,
)

const knowledgeBaseItems = computed(() => [
  { label: "全部知识库", value: ALL_KB_VALUE },
  ...knowledgeBases.value.map((item) => ({ label: item.name, value: item.id })),
])

/** 行尾来源描述：作者 / 知识库（对齐语雀真机归属分隔符「/」，与开始页一致）；创建者缺失时兜底。
 * 数据链结论（D1 巡检）：收藏列表接口本就返回 creator（favorites.service listFavorites 取
 * document.creator.displayName），「未知」行是存量数据缺创建者——模板副本创建路径
 * （documents-template.service）未写 creatorId、seed 数据同样不带、用户删除 SetNull，
 * 前端无法回补，只能按规范把兜底文案从「未知用户」改为「未知成员」。 */
const rowMeta = (item: KnowledgeFavoriteItem) => {
  const creator = item.creator || "未知成员"
  return `${creator} / ${item.kbName || "知识库"}`
}

const openDoc = (item: KnowledgeFavoriteItem) => {
  router.push(
    getKnowledgeDocumentRouteTarget({
      kbId: item.kbId,
      docId: item.id,
      editorType: item.editorType,
    }),
  )
}

// 筛选切换的过期序号守卫：慢响应晚归不得覆盖当前筛选的列表
let loadSeq = 0

const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  errorMessage.value = ""

  try {
    if (knowledgeBases.value.length === 0) {
      knowledgeBases.value = await listKnowledgeBases()
    }

    const result = await listKnowledgeFavorites({
      kbId: selectedKbId.value === ALL_KB_VALUE ? undefined : selectedKbId.value,
      page: 1,
      pageSize: FAVORITES_PAGE_SIZE,
    })

    if (seq !== loadSeq) {
      return
    }

    favoritesPage.value = 1
    favoriteResult.value = result
  } catch (error) {
    if (seq !== loadSeq) {
      return
    }
    errorMessage.value = error instanceof Error ? error.message : "加载收藏文档失败。"
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

const loadMoreFavorites = async () => {
  if (loadingMore.value || !favoriteResult.value) {
    return
  }

  // 追加分页同样要防过期：请求期间的筛选切换或重新加载都会让这一页失去意义
  const seq = loadSeq
  const requestedKbId = selectedKbId.value

  loadingMore.value = true
  try {
    const result = await listKnowledgeFavorites({
      kbId: requestedKbId === ALL_KB_VALUE ? undefined : requestedKbId,
      page: favoritesPage.value + 1,
      pageSize: FAVORITES_PAGE_SIZE,
    })

    if (seq !== loadSeq || requestedKbId !== selectedKbId.value) {
      return
    }

    favoritesPage.value += 1
    // 本地关键字筛选的 filteredItems 不受影响：追加到全量列表末尾
    favoriteResult.value = {
      ...result,
      items: [...favoriteItems.value, ...result.items],
    }
  } catch (error) {
    if (seq !== loadSeq || requestedKbId !== selectedKbId.value) {
      return
    }
    showToastMessage(error instanceof Error ? error.message : "加载更多收藏失败。", "error")
  } finally {
    // 无条件复位：过期分支若不复位，loadingMore 永远为 true，按钮永久「加载中…」
    // 且守卫挡住重试（同族修复见 KnowledgeTrashView 的 loadMore）
    loadingMore.value = false
  }
}

const handleCancelFavorite = async (item: KnowledgeFavoriteItem) => {
  // 逐行独立：一行在途不应把整页的「取消收藏」都锁住
  if (cancelingDocIds.value.includes(item.id)) {
    return
  }

  cancelingDocIds.value = [...cancelingDocIds.value, item.id]

  try {
    await removeKnowledgeFavorite(item.id)
    showToastMessage("已取消收藏。", "success")
    await load()
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "取消收藏失败。", "error")
  } finally {
    cancelingDocIds.value = cancelingDocIds.value.filter((id) => id !== item.id)
  }
}

const loadFolders = async () => {
  try {
    folders.value = await listFavoriteFolders()
  } catch {
    // 分组加载失败不阻塞收藏列表，仅表现为无分组
    folders.value = []
  }
}

const submitCreateFolder = async () => {
  const name = creatingFolderName.value.trim()
  if (!name || folderBusy.value) {
    return
  }

  folderBusy.value = true
  try {
    const created = await createFavoriteFolder(name)
    folders.value = [...folders.value, created]
    creatingFolder.value = false
    creatingFolderName.value = ""
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "新建收藏夹失败。", "error")
  } finally {
    folderBusy.value = false
  }
}

const startRenameFolder = (folder: KnowledgeFavoriteFolder) => {
  editingFolderId.value = folder.id
  editingFolderName.value = folder.name
}

const submitRenameFolder = async () => {
  const folderId = editingFolderId.value
  const name = editingFolderName.value.trim()
  editingFolderId.value = null
  if (!folderId || !name || folderBusy.value) {
    return
  }

  folderBusy.value = true
  try {
    const updated = await renameFavoriteFolder(folderId, name)
    folders.value = folders.value.map((folder) => (folder.id === updated.id ? updated : folder))
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "重命名失败。", "error")
  } finally {
    folderBusy.value = false
  }
}

const confirmDeleteFolder = async () => {
  const folder = deletingFolder.value
  if (!folder || folderBusy.value) {
    return
  }

  folderBusy.value = true
  try {
    await removeFavoriteFolder(folder.id)
    folders.value = folders.value.filter((item) => item.id !== folder.id)
    if (activeFolderId.value === folder.id) {
      activeFolderId.value = ALL_FOLDER_VALUE
    }
    deletingFolder.value = null
    showToastMessage("收藏夹已删除，夹内收藏回到全部收藏。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "删除收藏夹失败。", "error")
  } finally {
    folderBusy.value = false
  }
}

/** 收藏移入夹 / 移出夹（folderId null = 移出） */
const handleMoveToFolder = async (item: KnowledgeFavoriteItem, folderId: string | null) => {
  try {
    await moveFavoriteToFolder(item.id, folderId)
    const target = folderId
    favoriteResult.value = favoriteResult.value
      ? {
          ...favoriteResult.value,
          items: favoriteItems.value.map((candidate) =>
            candidate.id === item.id ? { ...candidate, folderId: target } : candidate,
          ),
        }
      : favoriteResult.value
    const folder = folders.value.find((candidate) => candidate.id === folderId)
    showToastMessage(folder ? `已移入「${folder.name}」。` : "已移出收藏夹。", "success")
  } catch (error) {
    showToastMessage(error instanceof Error ? error.message : "移动失败。", "error")
  }
}

onMounted(() => {
  void load()
  void loadFolders()
})
</script>

<template>
  <KnowledgePageShell active-menu="favorites">
    <div class="flex h-full min-h-0 flex-col bg-surface">
      <KnowledgeContentHeader title="收藏" :meta="summary" />

      <div class="flex min-h-0 flex-1 gap-6 overflow-hidden px-6 py-5">
        <!-- 左：收藏夹分组栏（B3a 对齐语雀收藏页左列：全部收藏 + 自定义夹 + 新建） -->
        <aside class="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto pb-2">
          <button
            type="button"
            class="flex h-8 items-center justify-between gap-2 rounded-kb-md px-2.5 text-left text-[13px] transition"
            :class="
              activeFolderId === ALL_FOLDER_VALUE
                ? 'bg-grey-300 font-medium text-ink'
                : 'text-ink-secondary hover:bg-grey-200'
            "
            @click="activeFolderId = ALL_FOLDER_VALUE"
          >
            <span class="min-w-0 truncate">全部收藏</span>
            <span class="shrink-0 text-[11px] text-ink-quaternary"
              >{{ favoriteResult?.total ?? 0 }}条</span
            >
          </button>

          <button
            v-for="folder in folders"
            :key="folder.id"
            type="button"
            class="group flex h-8 items-center justify-between gap-2 rounded-kb-md px-2.5 text-left text-[13px] transition"
            :class="
              activeFolderId === folder.id
                ? 'bg-grey-300 font-medium text-ink'
                : 'text-ink-secondary hover:bg-grey-200'
            "
            @click="activeFolderId = folder.id"
          >
            <template v-if="editingFolderId === folder.id">
              <el-input
                v-model="editingFolderName"
                type="text"
                size="small"
                maxlength="30"
                class="min-w-0 flex-1 px-1.5"
                @keydown.enter.prevent="submitRenameFolder"
                @blur="submitRenameFolder"
              />
            </template>
            <template v-else>
              <span class="min-w-0 truncate" :title="folder.name">{{ folder.name }}</span>
              <span class="flex shrink-0 items-center gap-0.5">
                <span class="text-[11px] text-ink-quaternary transition group-hover:hidden"
                  >{{ folder.count }}条</span
                >
                <span class="hidden items-center gap-0.5 group-hover:flex">
                  <span
                    class="inline-flex h-5 w-5 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-300 hover:text-ink"
                    title="重命名"
                    role="button"
                    tabindex="0"
                    @click.stop="startRenameFolder(folder)"
                    @keydown.enter.stop.prevent="startRenameFolder(folder)"
                  >
                    <Icon icon="ph:pencil-simple" :width="12" :height="12" />
                  </span>
                  <span
                    class="inline-flex h-5 w-5 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-300 hover:text-error"
                    title="删除收藏夹"
                    role="button"
                    tabindex="0"
                    @click.stop="deletingFolder = folder"
                    @keydown.enter.stop.prevent="deletingFolder = folder"
                  >
                    <Icon icon="ph:trash" :width="12" :height="12" />
                  </span>
                </span>
              </span>
            </template>
          </button>

          <form
            v-if="creatingFolder"
            class="flex h-8 items-center gap-1 px-2.5"
            @submit.prevent="submitCreateFolder"
          >
            <el-input
              v-model="creatingFolderName"
              type="text"
              size="small"
              maxlength="30"
              autofocus
              class="min-w-0 flex-1 px-1.5"
              placeholder="收藏夹名称"
              @keydown.esc.prevent="creatingFolder = false"
              @blur="creatingFolderName.trim() ? submitCreateFolder() : (creatingFolder = false)"
            />
          </form>
          <button
            v-else
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-kb-md px-2.5 text-[13px] text-ink-tertiary transition hover:bg-grey-200 hover:text-ink"
            @click="creatingFolder = true"
          >
            <Icon icon="ph:plus" :width="13" :height="13" />
            新建收藏夹
          </button>
        </aside>

        <!-- 右：收藏列表 -->
        <div class="min-w-0 flex-1 overflow-y-auto pb-2">
          <div class="space-y-4">
            <KnowledgeFilterToolbar
              v-model="keyword"
              :filters="knowledgeBaseItems"
              :filter-value="selectedKbId"
              placeholder="按标题、作者或知识库名称筛选收藏"
              :loading="loading"
              @update:filter-value="
                (value) => {
                  selectedKbId = value
                  load()
                }
              "
              @refresh="load"
            />

            <p v-if="errorMessage" class="px-1 text-kb-sm text-error">{{ errorMessage }}</p>

            <div v-if="loading" class="divide-y divide-line border-y border-line">
              <div v-for="index in 5" :key="index" class="flex items-center gap-4 py-4">
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="h-4 w-1/3 animate-pulse rounded bg-grey-200" />
                  <div class="h-3 w-1/4 animate-pulse rounded bg-grey-100" />
                </div>
                <div class="h-11 w-11 shrink-0 animate-pulse rounded-kb-lg bg-grey-200" />
              </div>
            </div>

            <div
              v-else-if="filteredItems.length === 0 && !errorMessage"
              class="flex min-h-[300px] flex-col items-center justify-center py-12 text-center text-ink-tertiary"
            >
              <Icon icon="ph:star" :width="42" :height="42" class="mb-4 text-ink-quaternary" />
              <p class="text-base font-medium text-ink-secondary">暂无收藏文档</p>
              <p class="mt-2 max-w-sm text-sm leading-6 text-ink-tertiary">
                可先在文档页内添加收藏，再回到这里快速继续工作。
              </p>
            </div>

            <!-- 对齐语雀收藏列表：两行式行（标题 + 作者/来源），行尾类型图块，不展示时间 -->
            <div v-else class="divide-y divide-line border-y border-line">
              <div
                v-for="item in filteredItems"
                :key="item.id"
                class="group flex cursor-pointer items-center gap-4 px-1 py-3.5 transition-colors duration-100 hover:bg-grey-100"
                @click="openDoc(item)"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[14px] font-medium text-ink">
                    {{ item.title || "无标题文档" }}
                  </p>
                  <p class="mt-1 truncate text-[12px] leading-5 text-ink-tertiary">
                    {{ rowMeta(item) }}
                  </p>
                </div>

                <!-- 移入收藏夹：行 hover 出现，下拉列全部夹（当前夹标勾/置灰） -->
                <el-dropdown
                  v-if="folders.length > 0"
                  trigger="click"
                  placement="bottom-end"
                  :show-arrow="false"
                  class="shrink-0 opacity-0 transition group-hover:opacity-100"
                  @command="
                    (folderId: string | number | object | undefined) =>
                      handleMoveToFolder(
                        item,
                        folderId === '__move_out__' || folderId === undefined
                          ? null
                          : String(folderId),
                      )
                  "
                >
                  <button
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded-kb-sm text-ink-quaternary transition hover:bg-grey-300 hover:text-ink"
                    title="移动到收藏夹"
                    @click.stop.prevent
                  >
                    <Icon icon="ph:folder-simple-plus" :width="15" :height="15" />
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="folder in folders"
                        :key="folder.id"
                        :command="folder.id"
                        :disabled="item.folderId === folder.id"
                      >
                        {{ folder.name }}{{ item.folderId === folder.id ? " ✓" : "" }}
                      </el-dropdown-item>
                      <el-dropdown-item v-if="item.folderId" divided command="__move_out__"
                        >移出收藏夹</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-kb-sm text-ink-quaternary opacity-0 transition hover:bg-grey-300 hover:text-error group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-55"
                  :disabled="cancelingDocIds.includes(item.id)"
                  title="取消收藏"
                  @click.stop.prevent="handleCancelFavorite(item)"
                >
                  <Icon icon="ph:x" :width="15" :height="15" />
                </button>

                <span
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-kb-lg bg-grey-200 text-ink-quaternary"
                >
                  <Icon
                    :icon="item.editorType === 'board' ? 'ph:frame-corners' : 'ph:file-text'"
                    :width="20"
                    :height="20"
                  />
                </span>
              </div>
            </div>

            <div v-if="hasMoreFavorites" class="flex justify-center py-4">
              <el-button
                plain
                size="small"
                class="rounded-kb-lg border-line bg-surface px-4 text-[13px] text-ink-secondary"
                :disabled="loadingMore"
                @click="loadMoreFavorites"
                >{{
                  loadingMore ? "加载中…" : `加载更多（共 ${favoriteResult?.total ?? 0} 条）`
                }}</el-button
              >
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        :open="Boolean(deletingFolder)"
        danger
        :message="deletingFolderMessage"
        confirm-text="删除收藏夹"
        :loading="folderBusy ? true : null"
        @update:open="
          (value) => {
            if (!value) deletingFolder = null
          }
        "
        @confirm="confirmDeleteFolder"
      />
    </div>
  </KnowledgePageShell>
</template>

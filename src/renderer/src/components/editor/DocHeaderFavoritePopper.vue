<script setup lang="ts">
/**
 * 顶栏 ☆ 收藏的「选择分组」浮层内容(对齐语雀真机 2026-09-21):
 * 副文案(含「取消收藏」蓝链)+ 分组列表 +「+ 新建分组」;壳(标题行/定位/动画)由 DocHeaderPopper 承担。
 * 数据走收藏夹分组 API(B3a);文档当前所在分组行高亮,点击行即移入。
 * 语雀浮层里的「高质量知识库」勾选属官方计划能力,本产品无对应概念,不渲染。
 */
import { computed, onMounted, ref } from "vue"
import AppIcon from "@/components/common/AppIcon.vue"
import {
  createFavoriteFolder,
  listFavoriteFolders,
  listKnowledgeFavorites,
  moveFavoriteToFolder,
  type KnowledgeFavoriteFolder,
} from "@/services/knowledge-favorites"

const props = defineProps<{
  documentId: string
  favorited: boolean
}>()

const emit = defineEmits<{
  close: []
  unfavorited: []
  moved: [folderName: string]
}>()

const folders = ref<KnowledgeFavoriteFolder[]>([])
const currentFolderId = ref<string | null>(null)
const loading = ref(false)
const loadError = ref("")
const busy = ref(false)
const creating = ref(false)
const newFolderName = ref("")

const canSubmitNewFolder = computed(
  () => newFolderName.value.trim().length > 0 && newFolderName.value.length <= 30,
)

const loadFolders = async () => {
  loading.value = true
  loadError.value = ""
  try {
    const [folderList, favoriteList] = await Promise.all([
      listFavoriteFolders(),
      listKnowledgeFavorites({ page: 1, pageSize: 200 }),
    ])
    folders.value = folderList
    currentFolderId.value =
      favoriteList.items.find((item) => item.id === props.documentId)?.folderId ?? null
  } catch {
    folders.value = []
    loadError.value = "分组加载失败，请重试。"
  } finally {
    loading.value = false
  }
}

const handleMoveTo = async (folder: KnowledgeFavoriteFolder) => {
  if (busy.value || folder.id === currentFolderId.value) {
    return
  }
  busy.value = true
  try {
    await moveFavoriteToFolder(props.documentId, folder.id)
    emit("moved", folder.name)
  } finally {
    busy.value = false
  }
}

const handleCreateFolder = async () => {
  const name = newFolderName.value.trim()
  if (!name || busy.value) {
    return
  }
  busy.value = true
  try {
    const folder = await createFavoriteFolder(name)
    await moveFavoriteToFolder(props.documentId, folder.id)
    newFolderName.value = ""
    creating.value = false
    emit("moved", folder.name)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (props.favorited) {
    void loadFolders()
  }
})
</script>

<template>
  <div class="select-none px-3 pb-2 pt-3">
    <p class="px-1 text-[12px] leading-5 text-ink-tertiary">
      你可以选择分组或直接
      <button type="button" class="text-brand hover:underline" @click.stop="emit('unfavorited')">
        取消收藏
      </button>
    </p>

    <div v-if="loading" class="space-y-1 px-1 py-2">
      <div v-for="index in 3" :key="index" class="h-8 animate-pulse rounded-kb-md bg-muted" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-start gap-2 px-1 py-3">
      <p class="text-[12px] text-ink-tertiary">{{ loadError }}</p>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-kb-md border border-line px-2 py-1 text-[12px] text-ink-secondary transition hover:border-brand-lighter hover:text-brand"
        @click.stop="loadFolders"
      >
        <AppIcon name="i-lucide-refresh-cw" class="h-3 w-3" />
        重新加载
      </button>
    </div>

    <template v-else>
      <div v-if="folders.length > 0" class="mt-1 max-h-56 overflow-y-auto">
        <button
          v-for="folder in folders"
          :key="folder.id"
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-kb-md px-2 py-2 text-left text-[13px] text-ink transition hover:bg-fill-muted disabled:opacity-55"
          :disabled="busy"
          @click.stop="handleMoveTo(folder)"
        >
          <span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
          <span v-if="folder.id === currentFolderId" class="shrink-0 text-[11px] text-brand"
            >当前</span
          >
        </button>
      </div>

      <div class="mt-1 border-t border-line pt-1">
        <button
          v-if="!creating"
          type="button"
          class="flex w-full items-center gap-1.5 rounded-kb-md px-2 py-2 text-left text-[13px] text-ink-secondary transition hover:bg-fill-muted"
          @click.stop="creating = true"
        >
          <AppIcon name="i-lucide-plus" class="h-3.5 w-3.5 shrink-0" />
          <span>新建分组</span>
        </button>
        <form
          v-else
          class="flex items-center gap-1.5 px-1 py-1.5"
          @submit.prevent="handleCreateFolder"
        >
          <input
            v-model="newFolderName"
            type="text"
            maxlength="30"
            autofocus
            placeholder="分组名称"
            class="h-7 min-w-0 flex-1 rounded-kb-md border border-line-input bg-surface px-2 text-[12px] text-ink outline-none placeholder:text-ink-quaternary focus:border-brand-lighter"
          />
          <button
            type="submit"
            class="h-7 shrink-0 rounded-kb-md bg-brand px-2.5 text-[12px] font-medium text-on-brand! transition hover:bg-brand-hover disabled:opacity-55"
            :disabled="!canSubmitNewFolder || busy"
          >
            确定
          </button>
          <button
            type="button"
            class="h-7 shrink-0 rounded-kb-md px-1.5 text-[12px] text-ink-tertiary transition hover:text-ink"
            @click.stop="creating = false"
          >
            取消
          </button>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/** 界面组件，负责 Excalidraw 画板实例挂载、数据同步与素材库联动。 */
import { CaptureUpdateAction, Excalidraw, MainMenu, restoreLibraryItems, serializeAsJSON } from "@excalidraw/excalidraw"
import "@excalidraw/excalidraw/index.css"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { KnowledgeBoardDocument } from "@/types/knowledge-board"
import type {
  KnowledgeBoardLibraryBinaryFile,
  KnowledgeBoardLibraryChangePayload,
  KnowledgeBoardLibraryItem,
} from "@/types/knowledge-board-library"
import { normalizeExcalidrawBoardDocument } from "@/utils/knowledge-board"
import {
  extractKnowledgeBoardLibraryBinaryFiles,
  mergeKnowledgeBoardLibraryBinaryFiles,
  normalizeKnowledgeBoardLibraryBinaryFiles,
} from "@/utils/knowledge-board-library"

const props = withDefaults(
  defineProps<{
    scene: KnowledgeBoardDocument
    libraryItems?: KnowledgeBoardLibraryItem[]
    libraryFiles?: KnowledgeBoardLibraryBinaryFile[]
    readonly?: boolean
    heightClass?: string
    resetToken?: string | number
  }>(),
  {
    libraryItems: () => [],
    libraryFiles: () => [],
    readonly: false,
    heightClass: "h-full min-h-[620px]",
    resetToken: "default",
  }
)

const emit = defineEmits<{
  change: [scene: KnowledgeBoardDocument]
  libraryChange: [payload: KnowledgeBoardLibraryChangePayload]
  requestSave: []
}>()

/**
 * 保存 Excalidraw 容器与 React 根节点，确保组件销毁时可以正确释放实例。
 */
const hostRef = ref<HTMLElement | null>(null)

let reactRoot: Root | null = null
let excalidrawApi: {
  getAppState: () => {
    openDialog?: { name: string } | null
  }
  getFiles: () => Record<string, unknown>
  updateLibrary: (payload: {
    libraryItems: unknown
    merge?: boolean
    prompt?: boolean
    openLibraryMenu?: boolean
    defaultStatus?: "published" | "unpublished"
  }) => Promise<unknown>
  updateScene: (sceneData: {
    appState?: {
      openDialog?: { name: "help" } | null
      openMenu?: null
    }
    captureUpdate?: unknown
  }) => void
  addFiles: (files: KnowledgeBoardLibraryBinaryFile[]) => void
  refresh: () => void
} | null = null
let lastSerializedScene = ""
let lastSerializedLibrary = ""
let lastSerializedLibraryFiles = ""

/**
 * 统一规范化素材库条目，避免第三方恢复逻辑抛错时影响主画布渲染。
 */
const normalizeLibraryItems = (value: unknown) => {
  try {
    const restored = restoreLibraryItems(
      Array.isArray(value) ? (value as Parameters<typeof restoreLibraryItems>[0]) : [],
      "unpublished"
    )

    return JSON.parse(JSON.stringify(restored)) as KnowledgeBoardLibraryItem[]
  } catch {
    return [] as KnowledgeBoardLibraryItem[]
  }
}

const shortcutsMenuIcon = createElement(
  "svg",
  {
    "aria-hidden": "true",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  },
  createElement("rect", {
    x: 1.5,
    y: 3,
    width: 13,
    height: 10,
    rx: 2,
    stroke: "currentColor",
    strokeWidth: 1.25,
  }),
  createElement("rect", {
    x: 4,
    y: 5.5,
    width: 1.75,
    height: 1.75,
    rx: 0.5,
    fill: "currentColor",
  }),
  createElement("rect", {
    x: 6.75,
    y: 5.5,
    width: 1.75,
    height: 1.75,
    rx: 0.5,
    fill: "currentColor",
  }),
  createElement("rect", {
    x: 9.5,
    y: 5.5,
    width: 1.75,
    height: 1.75,
    rx: 0.5,
    fill: "currentColor",
  }),
  createElement("rect", {
    x: 4,
    y: 8.25,
    width: 7.25,
    height: 1.75,
    rx: 0.5,
    fill: "currentColor",
  })
)

const saveBoardMenuIcon = createElement(
  "svg",
  {
    "aria-hidden": "true",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  },
  createElement("path", {
    d: "M3 2.5h7.5l2 2V13a1 1 0 0 1-1 1h-8A1.5 1.5 0 0 1 2 12.5v-8A2 2 0 0 1 3 2.5Z",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinejoin: "round",
  }),
  createElement("path", {
    d: "M5 2.5v3h4v-3",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
  createElement("rect", {
    x: 4.5,
    y: 8.5,
    width: 7,
    height: 3,
    rx: 0.75,
    stroke: "currentColor",
    strokeWidth: 1.25,
  })
)

const toggleShortcutsDialog = () => {
  if (!excalidrawApi) {
    return
  }

  const isHelpDialogOpen = excalidrawApi.getAppState().openDialog?.name === "help"

  excalidrawApi.updateScene({
    appState: {
      openDialog: isHelpDialogOpen ? null : { name: "help" },
      openMenu: null,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  })
}

const requestManualSave = () => {
  if (props.readonly) {
    return
  }

  emit("requestSave")
}

const BoardSaveMenuItem = () =>
  createElement(MainMenu.Item, {
    key: "save-board",
    children: "保存画板",
    icon: saveBoardMenuIcon,
    shortcut: "Ctrl/Cmd+S",
    onSelect: requestManualSave,
  })

const BoardShortcutsMenuItem = () =>
  createElement(MainMenu.Item, {
    key: "shortcuts",
    children: "快捷键列表",
    icon: shortcutsMenuIcon,
    shortcut: "?",
    onSelect: toggleShortcutsDialog,
  })

const buildMainMenu = () => {
  const items = []

  if (!props.readonly) {
    items.push(createElement(BoardSaveMenuItem, { key: "save-board" }))
    items.push(createElement(MainMenu.Separator, { key: "save-separator" }))
    items.push(createElement(MainMenu.DefaultItems.LoadScene, { key: "load-scene" }))
  }

  items.push(createElement(MainMenu.DefaultItems.SaveAsImage, { key: "save-as-image" }))
  items.push(createElement(BoardShortcutsMenuItem, { key: "shortcuts" }))

  if (!props.readonly) {
    items.push(createElement(MainMenu.Separator, { key: "clear-separator" }))
    items.push(createElement(MainMenu.DefaultItems.ClearCanvas, { key: "clear-canvas" }))
  }

  return createElement(MainMenu, {}, ...items)
}

const handleBoardChange = (elements: unknown, appState: unknown, files: unknown) => {
  if (props.readonly) {
    return
  }

  let exportedScene: Record<string, unknown>

  try {
    type SerializeElements = Parameters<typeof serializeAsJSON>[0]
    type SerializeAppState = Parameters<typeof serializeAsJSON>[1]
    type SerializeFiles = Parameters<typeof serializeAsJSON>[2]

    exportedScene = JSON.parse(
      serializeAsJSON(
        Array.isArray(elements) ? (elements as SerializeElements) : ([] as SerializeElements),
        appState && typeof appState === "object" ? (appState as SerializeAppState) : ({} as SerializeAppState),
        files && typeof files === "object" ? (files as SerializeFiles) : ({} as SerializeFiles),
        "database"
      )
    ) as Record<string, unknown>
  } catch {
    return
  }

  const nextScene = normalizeExcalidrawBoardDocument({
    type: exportedScene.type,
    version: exportedScene.version,
    source: exportedScene.source,
    elements: exportedScene.elements,
    appState: exportedScene.appState,
    files: exportedScene.files,
  })
  const nextSerializedScene = JSON.stringify(nextScene)

  if (nextSerializedScene === lastSerializedScene) {
    return
  }

  lastSerializedScene = nextSerializedScene
  emit("change", nextScene)
}

const handleLibraryChange = (libraryItems: unknown) => {
  if (props.readonly) {
    return
  }

  const nextLibraryItems = normalizeLibraryItems(libraryItems)
  const nextSerializedLibrary = JSON.stringify(nextLibraryItems)
  const nextLibraryFiles = excalidrawApi
    ? extractKnowledgeBoardLibraryBinaryFiles(nextLibraryItems, excalidrawApi.getFiles())
    : []

  if (
    nextSerializedLibrary === lastSerializedLibrary &&
    JSON.stringify(nextLibraryFiles) === lastSerializedLibraryFiles
  ) {
    return
  }

  lastSerializedLibrary = nextSerializedLibrary
  lastSerializedLibraryFiles = JSON.stringify(nextLibraryFiles)
  emit("libraryChange", {
    items: nextLibraryItems,
    files: nextLibraryFiles,
  })
}

const renderSurface = () => {
  if (!hostRef.value) {
    return
  }

  const scene = normalizeExcalidrawBoardDocument(props.scene)
  const libraryItems = normalizeLibraryItems(props.libraryItems)
  const normalizedLibraryFiles = normalizeKnowledgeBoardLibraryBinaryFiles(props.libraryFiles)
  const mergedFiles = mergeKnowledgeBoardLibraryBinaryFiles(
    normalizeKnowledgeBoardLibraryBinaryFiles(Object.values(scene.files || {})),
    normalizedLibraryFiles
  )
  lastSerializedScene = JSON.stringify(scene)
  lastSerializedLibrary = JSON.stringify(libraryItems)
  lastSerializedLibraryFiles = JSON.stringify(normalizedLibraryFiles)

  if (!reactRoot) {
    reactRoot = createRoot(hostRef.value)
  }

  const excalidrawProps: Record<string, unknown> = {
    key: `${props.resetToken}:${props.readonly ? "readonly" : "edit"}`,
    excalidrawAPI: (api: typeof excalidrawApi) => {
      excalidrawApi = api
    },
    initialData: {
      elements: scene.elements,
      appState: scene.appState,
      files: Object.fromEntries(mergedFiles.map(file => [file.id, file])),
      libraryItems,
      scrollToContent: true,
    },
    langCode: "zh-CN",
    viewModeEnabled: props.readonly,
    theme: "light",
    name: "小叶画板",
    UIOptions: props.readonly
      ? {
          canvasActions: {
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: false,
            toggleTheme: false,
          },
        }
      : {
          canvasActions: {
            export: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        },
    onChange: props.readonly ? undefined : handleBoardChange,
    onLibraryChange: props.readonly ? undefined : handleLibraryChange,
  }

  reactRoot.render(createElement(Excalidraw, excalidrawProps, buildMainMenu()))
}

watch(
  () => [props.resetToken, props.readonly],
  () => {
    renderSurface()
  }
)

watch(
  () => JSON.stringify(normalizeLibraryItems(props.libraryItems)),
  signature => {
    if (props.readonly || !excalidrawApi || signature === lastSerializedLibrary) {
      return
    }

    lastSerializedLibrary = signature
    void excalidrawApi.updateLibrary({
      libraryItems: normalizeLibraryItems(props.libraryItems),
      merge: false,
      prompt: false,
      openLibraryMenu: false,
      defaultStatus: "unpublished",
    })
  }
)

watch(
  () => JSON.stringify(normalizeKnowledgeBoardLibraryBinaryFiles(props.libraryFiles)),
  signature => {
    if (props.readonly || !excalidrawApi || signature === lastSerializedLibraryFiles) {
      return
    }

    const normalizedFiles = normalizeKnowledgeBoardLibraryBinaryFiles(props.libraryFiles)

    lastSerializedLibraryFiles = signature

    if (normalizedFiles.length === 0) {
      return
    }

    excalidrawApi.addFiles(normalizedFiles)
    excalidrawApi.refresh()
  }
)

watch(
  () => (props.readonly ? JSON.stringify(normalizeExcalidrawBoardDocument(props.scene)) : ""),
  signature => {
    if (!signature) {
      return
    }

    renderSurface()
  }
)

onMounted(() => {
  renderSurface()
})

onBeforeUnmount(() => {
  excalidrawApi = null
  reactRoot?.unmount()
  reactRoot = null
})
</script>

<template>
  <div class="relative h-full w-full" :class="heightClass">
    <div ref="hostRef" class="h-full w-full" />
  </div>
</template>

<style scoped>
:deep(.excalidraw),
:deep(.excalidraw .App) {
  height: 100%;
}

:deep(.excalidraw .layer-ui__wrapper) {
  font-family: inherit;
}

:deep(.excalidraw .App) {
  background: var(--kb-surface-soft-bg);
}
</style>

<style>
/* 工具按钮的快捷键数字角标（1-9,0）视觉上像渲染噪点；
   快捷键已由 title 提示与 aria-keyshortcuts 承载，隐藏纯视觉角标 */
.excalidraw .ToolIcon__keybinding {
  display: none !important;
}

.excalidraw .HelpDialog__header {
  display: none !important;
}

.excalidraw .HelpDialog__header + h3 {
  margin-top: 0 !important;
}

.excalidraw .Island:has(.HelpDialog__islands-container) .Dialog__title {
  display: none !important;
}

.excalidraw .Island:has(.HelpDialog__islands-container) .Dialog__content {
  padding-top: 1rem !important;
}
</style>


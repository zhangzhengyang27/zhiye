<script setup lang="ts">
/** 骨架组件，负责知识Page页面结构编排与插槽承载。 */
import { computed, ref } from "vue"
import { usePanelResize } from "@/composables/use-panel-resize"
import KnowledgeSidebarMenu from "./KnowledgeSidebarMenu.vue"
import type { KnowledgeSidebarMenuKey } from "@/types/knowledge-sidebar"

const props = withDefaults(
  defineProps<{
    activeMenu?: KnowledgeSidebarMenuKey
    activeKbId?: string | null
    refreshKey?: number
  }>(),
  {
    activeMenu: undefined,
    activeKbId: null,
    refreshKey: 0,
  }
)

/** 侧栏「新建」菜单意图透传：侧栏在多个页面复用，创建/导入动作统一由页面层消费 */
const emit = defineEmits<{
  "sidebar-create": [action: "doc" | "folder" | "template"]
  "sidebar-import": [kind: "md" | "docx"]
}>()

const forwardSidebarCreate = (action: "doc" | "folder" | "template") => emit("sidebar-create", action)
const forwardSidebarImport = (kind: "md" | "docx") => emit("sidebar-import", kind)

const shellFrameRef = ref<HTMLElement | null>(null)

/** 侧栏宽度全局共享一份（不随知识库变化），拖拽机制与目录列共用 usePanelResize */
const {
  resizing: resizingSidebar,
  gridStyle: shellGridStyle,
  start: startSidebarResize,
} = usePanelResize({
  containerRef: shellFrameRef,
  storageKey: computed(() => "knowledge-page-shell:sidebar-width"),
  min: 220,
  max: 320,
  defaultWidth: 250,
})
</script>

<template>
  <section class="kb-shell-container h-screen overflow-x-auto bg-surface">
    <div
      ref="shellFrameRef"
      class="kb-shell-grid grid h-full min-h-[760px] min-w-[1080px] overflow-hidden bg-surface transition-colors duration-300"
      :style="shellGridStyle"
    >
      <KnowledgeSidebarMenu
        :active-menu="props.activeMenu"
        :active-kb-id="props.activeKbId"
        :refresh-key="props.refreshKey"
        @create="forwardSidebarCreate"
        @import="forwardSidebarImport"
      />

      <button
        type="button"
        class="group relative z-10 -mx-1.5 cursor-col-resize bg-transparent outline-none touch-none"
        aria-label="调整导航栏宽度"
        @pointerdown.prevent="startSidebarResize"
      >
        <!-- 拖拽条不占列宽（0px 列 + 负外边距撑出 12px 命中面），指示条压在侧栏 border-r 上，边界只有这一条线 -->
        <span
          class="absolute inset-y-0 left-[5px] w-[3px] rounded-full bg-transparent transition group-hover:bg-grey-400"
          :class="resizingSidebar ? 'bg-grey-600!' : ''"
        />
      </button>

      <main class="kb-shell-main relative min-w-0 overflow-hidden bg-surface">
        <!-- 正文列顶部同一条拖窗带：逐路由量过，除编辑器顶栏（其控件由全局 no-drag 让位）外
             这 24px 都是页面自己的空留白，压不到任何可点件 -->
        <div class="kb-window-drag-band" />
        <slot />
      </main>
    </div>
  </section>
</template>

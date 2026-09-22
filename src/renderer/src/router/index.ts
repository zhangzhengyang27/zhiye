/** 配置应用路由、认证守卫与页面跳转规则。 */

import { h } from "vue"
import { createRouter, createWebHistory } from "vue-router"
import { useAuthStore } from "@/stores/auth"

/**
 * 画板编辑器路由占位：原 KnowledgeBoardEditorView.vue 在删除事故中遗失（全仓无副本）。
 * 路由名 knowledge-board-editor 是承重点（工作区 openDoc、use-knowledge-tree 都按名
 * 跳转），不能摘——恢复真身前先以占位页保住路由名，避免打开画板文档时抛「No match」。
 */
const KnowledgeBoardEditorPlaceholder = () =>
  h(
    "div",
    { class: "flex min-h-screen items-center justify-center text-sm text-ink-tertiary" },
    "画板编辑器暂不可用（恢复中）。"
  )

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/knowledge",
    },
    {
      path: "/test",
      component: () => import("@/views/EditorTest.vue"),
    },
    {
      path: "/share/:shareKey",
      name: "public-share",
      component: () => import("@/views/public/ShareView.vue"),
    },
    {
      path: "/auth/login",
      name: "login",
      component: () => import("@/views/auth/LoginView.vue"),
      meta: {
        requiresGuest: true,
      },
    },
    {
      path: "/account",
      name: "account",
      component: () => import("@/views/auth/AccountView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/settings/DesktopSettingsView.vue"),
      meta: {
        // 语雀的偏好设置入口本身要求已登录（菜单项 visible: currentUser.isLogin）
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge",
      name: "knowledge",
      component: () => import("@/views/knowledge/KnowledgeBasesView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/start",
      name: "knowledge-start",
      component: () => import("@/views/knowledge/KnowledgeStartView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/ai-writing",
      name: "knowledge-ai-writing",
      component: () => import("@/views/knowledge/KnowledgeAiWritingView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/notes",
      name: "knowledge-notes",
      component: () => import("@/views/knowledge/KnowledgeNotesView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/recent",
      name: "knowledge-recent",
      component: () => import("@/views/knowledge/KnowledgeRecentView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/boards",
      name: "knowledge-boards",
      component: () => import("@/views/knowledge/KnowledgeBoardsView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/favorites",
      name: "knowledge-favorites",
      component: () => import("@/views/knowledge/KnowledgeFavoritesView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/trash",
      name: "knowledge-trash",
      component: () => import("@/views/knowledge/KnowledgeTrashView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/:kbId",
      component: () => import("@/views/knowledge/KnowledgeWorkspaceLayout.vue"),
      meta: {
        requiresAuth: true,
      },
      children: [
        {
          path: "",
          name: "knowledge-workspace-home",
          component: () => import("@/views/knowledge/KnowledgeWorkspaceHomeView.vue"),
        },
        {
          path: "overview",
          name: "knowledge-overview",
          component: () => import("@/views/knowledge/KnowledgeOverviewView.vue"),
        },
        {
          path: "search",
          name: "knowledge-search",
          component: () => import("@/views/knowledge/KnowledgeSearchView.vue"),
        },
        {
          path: "doc/:docId",
          name: "knowledge-doc-editor",
          component: () => import("@/views/knowledge/KnowledgeDocEditorView.vue"),
        },
        {
          path: "board/:docId",
          name: "knowledge-board-editor",
          component: KnowledgeBoardEditorPlaceholder,
        },
        {
          path: "settings",
          name: "knowledge-settings",
          component: () => import("@/views/knowledge/KnowledgeSettingsView.vue"),
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/knowledge",
    },
  ],
})

router.beforeEach(async to => {
  const authStore = useAuthStore()
  await authStore.ensureHydrated()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return {
      name: "login",
      query: {
        redirect: to.fullPath,
      },
    }
  }

  if (to.meta.requiresGuest && authStore.isLoggedIn) {
    return typeof to.query.redirect === "string" ? to.query.redirect : "/knowledge"
  }

  return true
})

export default router

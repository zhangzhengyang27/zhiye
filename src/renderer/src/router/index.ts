/** 配置应用路由、认证守卫与页面跳转规则。 */

import { createRouter, createWebHistory } from "vue-router"
import { useAuthStore } from "@/stores/auth"

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
      path: "/auth/reset",
      name: "auth-reset",
      component: () => import("@/views/auth/ResetPasswordView.vue"),
      meta: {
        requiresGuest: true,
      },
    },
    {
      // 锁屏窗口专用路由：不挂 requiresAuth/requiresGuest——锁定须无视登录态，
      // App.vue 也按 name=desktop-lock 拦截托盘导航，防止用导航指令绕过锁定
      path: "/lock",
      name: "desktop-lock",
      component: () => import("@/views/lock/DesktopLockView.vue"),
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
      // KB 设置独立窗口（⋯ 菜单「更多设置」落点）：只含设置功能，无工作台外壳
      path: "/kb-settings/:kbId",
      name: "kb-settings-standalone",
      component: () => import("@/views/knowledge/KnowledgeSettingsStandaloneView.vue"),
      meta: {
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
          component: () => import("@/views/knowledge/KnowledgeBoardEditorView.vue"),
        },
        {
          path: "datatable/:docId",
          name: "knowledge-datatable-editor",
          component: () => import("@/views/knowledge/KnowledgeDataTableEditorView.vue"),
        },
        {
          path: "sheet/:docId",
          name: "knowledge-sheet-editor",
          component: () => import("@/views/knowledge/KnowledgeSheetEditorView.vue"),
        },
        {
          path: "mindmap/:docId",
          name: "knowledge-mindmap-editor",
          component: () => import("@/views/knowledge/KnowledgeMindmapEditorView.vue"),
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

/**
 * 解析登录后重定向地址：只接受站内路径（单斜杠开头），拒绝协议相对
 * （// 外站）与 /auth 前缀（已登录不应再回认证页），非法时回落工作台。
 */
const resolveSafeRedirect = (value: unknown): string => {
  if (typeof value !== "string") {
    return "/knowledge"
  }

  const trimmed = value.trim()

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/auth")) {
    return "/knowledge"
  }

  return trimmed
}

router.beforeEach(async (to) => {
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
    return resolveSafeRedirect(to.query.redirect)
  }

  return true
})

export default router

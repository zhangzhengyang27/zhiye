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
      path: "/drive-share/:shareKey",
      name: "public-drive-share",
      component: () => import("@/views/public/DriveShareView.vue"),
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
      path: "/knowledge",
      name: "knowledge",
      component: () => import("@/views/knowledge/KnowledgeBasesView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/snippets",
      name: "knowledge-snippets",
      component: () => import("@/views/knowledge/KnowledgeSnippetsView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/drive",
      name: "knowledge-drive",
      component: () => import("@/views/knowledge/KnowledgeDriveView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/drive/shares",
      name: "knowledge-drive-shares",
      component: () => import("@/views/knowledge/KnowledgeDriveSharesView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/drive/folder/:folderId",
      name: "knowledge-drive-folder",
      component: () => import("@/views/knowledge/KnowledgeDriveView.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/knowledge/drive/trash",
      name: "knowledge-drive-trash",
      component: () => import("@/views/knowledge/KnowledgeDriveView.vue"),
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
          path: "home",
          name: "knowledge-workspace-home",
          component: () => import("@/views/knowledge/KnowledgeWorkspaceHomeView.vue"),
        },
        {
          path: "",
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
    return typeof to.query.redirect === "string" ? to.query.redirect : "/knowledge"
  }

  return true
})

// 清理 Nuxt UI UModal 残留的 overlay 元素
// 当 Modal 打开状态下路由跳转时，overlay DOM 可能不会被正确清理
router.afterEach(() => {
  // Nuxt UI UModal 会在 body 下创建 overlay 元素
  // 检查并移除残留的 overlay 和空的 dialog 容器
  const body = document.body

  // 移除可能的 overlay 元素（Nuxt UI 通常创建 div.overlay 或类似元素）
  const overlays = body.querySelectorAll(
    ':scope > div[class*="overlay"], :scope > div[class*="backdrop"]',
  )
  overlays.forEach((el) => el.remove())

  // 移除空的 dialog 容器
  const dialogs = body.querySelectorAll(':scope > div[role="dialog"]')
  dialogs.forEach((el) => {
    if (el.children.length === 0 || el.getAttribute("aria-hidden") === "true") {
      el.remove()
    }
  })

  // 恢复 body 滚动（Modal 可能锁定了滚动）
  body.style.overflow = ""
  body.style.paddingRight = ""
})

export default router

<script setup lang="ts">
/** 应用根组件：初始化主题模式、渲染路由出口，并兜底处理认证失效。 */
import { onBeforeUnmount, onMounted, watch } from "vue"
import { RouterView, useRouter } from "vue-router"
import zhCn from "element-plus/es/locale/lang/zh-cn"
import { Z_EP_PROVIDER_BASE } from "./constants/z-index"
import { useThemeMode } from "./composables/useThemeMode"
import { useInAppShortcuts, IN_APP_COMMAND_EVENT } from "./composables/use-in-app-shortcuts"
import { isImeComposing } from "./utils/keyboard"
import { AUTH_UNAUTHORIZED_EVENT } from "./services/auth-events"
import { useAuthStore } from "./stores/auth"

// 初始化主题（读取持久化偏好，决定 <html> 是否带 .dark）
useThemeMode()
// 应用内快捷键（新建文档、全局搜索）：读偏好设置里用户改过的组合键
useInAppShortcuts()

const router = useRouter()
const authStore = useAuthStore()

/**
 * 登出去重标志：事件到达时会话往往已被刷新链路清空（token 判空去重在
 * auth-session「先派发后清理」时序下永远命中），因此用独立标志去重，
 * 并在新会话建立（登录/刷新成功写入新 token）时复位。
 */
let unauthorizedHandled = false

/**
 * 请求层 401 → 清会话并跳登录页。
 * 并发请求可能触发多次事件，由 unauthorizedHandled 保证只处理一次。
 *
 * 桌面端分叉：登录走独立小窗（窗口化登录），不再在内容窗里整页跳登录页——
 * 唤起登录窗并把当前页面带回跳目标，登录成功后主进程统一刷新各内容窗。
 */
const handleUnauthorized = () => {
  if (unauthorizedHandled) {
    return
  }
  unauthorizedHandled = true

  authStore.clearSession()

  const desktop = window.xiaoyeDesktop
  if (desktop?.openLoginWindow) {
    void desktop.openLoginWindow(router.currentRoute.value.fullPath)
    return
  }

  const current = router.currentRoute.value
  if (current.name !== "login") {
    void router
      .push({
        name: "login",
        query: { redirect: current.fullPath },
      })
      .catch(() => {})
  }
}

// 新会话建立（登录/静默刷新写入新 token）后复位去重标志，允许下一轮失效再次触发
watch(
  () => authStore.accessToken,
  (token) => {
    if (token) {
      unauthorizedHandled = false
    }
  },
)

/**
 * 登录窗自举：hydration 后若 refresh cookie 仍有效（自动登录），通知主进程
 * 关登录窗、开主窗。requiresGuest 守卫此时已拦下工作台路由（返回 false），
 * 「跳过登录」的信号由这里统一发——登录窗里只可能挂空路由或登录/重置表单。
 */
const bootstrapLoginWindow = async () => {
  const desktop = window.xiaoyeDesktop
  if (!desktop?.isLoginWindow || !desktop.notifyAuthSessionEstablished) {
    return
  }

  await authStore.ensureHydrated()
  if (!authStore.isLoggedIn) {
    return
  }

  const redirect = router.currentRoute.value.query.redirect
  void desktop.notifyAuthSessionEstablished(typeof redirect === "string" ? redirect : undefined)
}

/** 登录窗（hiddenInset 无边框）顶部拖拽带：没有它无边框窗拖不动。 */
const isLoginWindow = Boolean(window.xiaoyeDesktop?.isLoginWindow)
// 语雀同款：登录窗标题就是「登录」（渲染层 document.title 会盖掉 BrowserWindow title）
if (isLoginWindow) {
  document.title = "登录"
}

/**
 * 托盘/全局快捷键广播 → 路由跳转（桌面端）。
 * - navigate-start：开始页
 * - navigate-notes：小记（全局快捷键「唤起小记」的落点）
 *
 * 广播发给所有窗口，但有两类窗口不该被导航指令带走：偏好设置是独立窗口
 * （见主进程 openSettingsWindow）；锁定窗（/lock）被带走等于用托盘导航绕过
 * 锁定——主进程广播侧已按窗口标识排除锁定窗，这里再按当前路由挡一道
 * （双保险：任何来源的导航命令都不能把 /lock 换成真实内容页）。
 */
let unsubscribeTrayCommand: (() => void) | null = null
let unsubscribeMenuCommand: (() => void) | null = null

/** Web 端没有原生菜单，⌘,/Ctrl+, 由渲染层兜底：主窗口内路由打开设置页（标准页面导航）。 */
const handlePreferencesKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "," && !isImeComposing(event)) {
    event.preventDefault()
    void router.push({ name: "settings" })
  }
}

onMounted(() => {
  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  void bootstrapLoginWindow()

  // knowledge:// 深链：主进程解析为站内路径后经 IPC 推送，这里跳转
  // （锁定窗/设置窗不接受导航指令——与托盘命令同口径，仅主窗内容窗响应）
  window.xiaoyeDesktop?.onDeepLink?.((targetPath) => {
    const routeName = router.currentRoute.value.name
    if (routeName === "settings" || routeName === "desktop-lock") {
      return
    }
    void router.push(targetPath).catch(() => {})
  })

  if (!window.xiaoyeDesktop) {
    window.addEventListener("keydown", handlePreferencesKeydown)
    return
  }

  unsubscribeTrayCommand = window.xiaoyeDesktop.onTrayCommand((command) => {
    const routeName = router.currentRoute.value.name
    // 偏好设置窗与锁定窗都不接受导航指令（锁定窗被导航走即锁定被绕过）
    if (routeName === "settings" || routeName === "desktop-lock") {
      return
    }

    if (command === "navigate-start") {
      void router.push("/knowledge/start")
    } else if (command === "navigate-notes") {
      void router.push("/knowledge/notes")
    }
  })

  // 原生应用菜单命令（语雀式中文菜单：历史前进后退、在当页查找、查看文档历史、搜索）
  unsubscribeMenuCommand = window.xiaoyeDesktop.onInAppMenu((command) => {
    const routeName = router.currentRoute.value.name
    // 与托盘命令同口径：偏好设置窗与锁定窗不响应菜单命令
    if (routeName === "settings" || routeName === "desktop-lock") {
      return
    }

    if (command === "navigate-back") {
      router.go(-1)
    } else if (command === "navigate-forward") {
      router.go(1)
    } else if (command === "open-search") {
      // 复用应用内命令总线，命令面板由侧栏承接（⌘J 同一落点）
      window.dispatchEvent(new CustomEvent(IN_APP_COMMAND_EVENT, { detail: "open-search" }))
    } else if (command === "find-in-page") {
      // Lake 编辑器工具栏搜索按钮（与 verify-editor-search 同一入口）；非编辑器页无此按钮，静默忽略
      const searchButton = document.querySelector<HTMLElement>(".ne-ui-toolbar-search")
      searchButton?.click()
    } else if (command === "doc-history") {
      // 编辑器视图监听并打开「版本」侧栏面板；非编辑器页无监听方，静默忽略
      window.dispatchEvent(new CustomEvent("xiaoye:open-doc-history"))
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  window.removeEventListener("keydown", handlePreferencesKeydown)
  unsubscribeTrayCommand?.()
  unsubscribeTrayCommand = null
  unsubscribeMenuCommand?.()
  unsubscribeMenuCommand = null
})
</script>

<template>
  <!-- 380 对齐 kb 层级：overlay 300 < 对话框（Z_DIALOG）400 < popper/toast 500（popper 经样式表 !important 与 toast 同层，靠 DOM 序决胜）；唯一事实源见 constants/z-index.ts -->
  <el-config-provider :z-index="Z_EP_PROVIDER_BASE" :locale="zhCn">
    <!-- 登录窗顶部拖拽带（hiddenInset 红绿灯浮在 6,6，卡片从 py-10 起，互不遮挡） -->
    <div
      v-if="isLoginWindow"
      aria-hidden="true"
      class="fixed inset-x-0 top-0 z-50 h-8 [-webkit-app-region:drag]"
    />
    <RouterView />
  </el-config-provider>
</template>

<script setup lang="ts">
/** 应用根组件：初始化主题模式、渲染路由出口，并兜底处理认证失效。 */
import { onBeforeUnmount, onMounted } from "vue"
import { RouterView, useRouter } from "vue-router"
import zhCn from "element-plus/es/locale/lang/zh-cn"
import { Z_EP_PROVIDER_BASE } from "./constants/z-index"
import { useThemeMode } from "./composables/useThemeMode"
import { useInAppShortcuts } from "./composables/use-in-app-shortcuts"
import { isImeComposing } from "./utils/keyboard"
import { AUTH_UNAUTHORIZED_EVENT } from "./services/auth-events"
import { openSettingsWindow } from "./services/desktop-bridge"
import { useAuthStore } from "./stores/auth"

// 初始化主题（读取持久化偏好，决定 <html> 是否带 .dark）
useThemeMode()
// 应用内快捷键（新建文档、全局搜索）：读偏好设置里用户改过的组合键
useInAppShortcuts()

const router = useRouter()
const authStore = useAuthStore()

/**
 * 请求层 401 → 清会话并跳登录页。
 * 并发请求可能触发多次事件：清空后 accessToken 为 null，直接跳过即完成去重。
 */
const handleUnauthorized = () => {
  if (!authStore.accessToken) {
    return
  }

  authStore.clearSession()

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

/**
 * 托盘/全局快捷键广播 → 路由跳转（桌面端）。
 * - navigate-start：开始页
 * - navigate-recent：最近访问
 * - navigate-notes：小记（全局快捷键「唤起小记」的落点）
 *
 * 广播发给所有窗口，但有两类窗口不该被导航指令带走：偏好设置是独立窗口
 * （见主进程 openSettingsWindow）；锁定窗（/lock）被带走等于用托盘导航绕过
 * 锁定——主进程广播侧已按窗口标识排除锁定窗，这里再按当前路由挡一道
 * （双保险：任何来源的导航命令都不能把 /lock 换成真实内容页）。
 */
let unsubscribeTrayCommand: (() => void) | null = null

/** Web 端没有原生菜单，⌘,/Ctrl+, 由渲染层兜底；同样开新窗口，不占用当前页。 */
const handlePreferencesKeydown = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "," && !isImeComposing(event)) {
    event.preventDefault()
    openSettingsWindow()
  }
}

onMounted(() => {
  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)

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
    } else if (command === "navigate-recent") {
      void router.push("/knowledge/recent")
    } else if (command === "navigate-notes") {
      void router.push("/knowledge/notes")
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
  window.removeEventListener("keydown", handlePreferencesKeydown)
  unsubscribeTrayCommand?.()
  unsubscribeTrayCommand = null
})
</script>

<template>
  <!-- 380 对齐 kb 层级：overlay 300 < 对话框（Z_DIALOG）400 < popper/toast 500（popper 经样式表 !important 与 toast 同层，靠 DOM 序决胜）；唯一事实源见 constants/z-index.ts -->
  <el-config-provider :z-index="Z_EP_PROVIDER_BASE" :locale="zhCn">
    <RouterView />
  </el-config-provider>
</template>

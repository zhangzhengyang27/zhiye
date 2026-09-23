import { shell } from "electron"
import type { WebContents } from "electron"

/**
 * 窗口整窗导航防护：只放行应用自身页面（生产态 `app://bundle`，开发态 Vite
 * dev server），其余一律阻止。正文/分享内容里的无 target 外链（`<a href>`）、
 * `location.href` 赋值等会触发整窗导航，把远端页面加载进带 IPC 桥的窗口——
 * preload 暴露的 secureStoreGet/verifyLockPassword/notify 等能力会随之交给
 * 远端 origin（Electron 安全清单标准项；window.open 已由
 * setWindowOpenHandler 拦截，这里补的是同窗导航这条道）。
 *
 * http(s) 外链转交系统浏览器打开，与 createWindowOpenHandler 行为一致。
 */
const isAppInternalUrl = (url: string): boolean => {
  // 生产态：app://bundle（特权协议，host 固定）
  if (url === "app://bundle" || url.startsWith("app://bundle/")) {
    return true
  }

  // 开发态：ELECTRON_RENDERER_URL（形如 http://localhost:5173）
  const devOrigin = process.env.ELECTRON_RENDERER_URL
  if (devOrigin && (url === devOrigin || url.startsWith(`${devOrigin}/`))) {
    return true
  }

  return false
}

export const attachNavigationGuard = (webContents: WebContents) => {
  webContents.on("will-navigate", (event, url) => {
    if (isAppInternalUrl(url)) {
      return
    }

    event.preventDefault()
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url)
    }
  })
}

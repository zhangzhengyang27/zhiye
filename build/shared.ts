/**
 * Web（vite.config.ts）与桌面端（electron.vite.config.ts）共享的渲染层构建配置。
 *
 * 注意：manualChunks 的 vendor 拆包规则是刻意的性能配置，详见 CLAUDE.md，
 * 调整前必须跑 `pnpm profile:workbench` 对比，请勿随手改动。
 */
import path from "path"
import fs from "node:fs"
import vue from "@vitejs/plugin-vue"
import Components from "unplugin-vue-components/vite"
import { ElementPlusResolver } from "unplugin-vue-components/resolvers"
import { yuqueAssets } from "yuque-editor-core/vite-assets"
import { loadEnv, type UserConfig } from "vite"

/**
 * 解析 `/api` 代理目标后端地址：优先取当前模式的环境变量，开发模式再回落到
 * development 环境文件，最后回落到本地 xiaoye-server 默认端口 3200。
 */
export const resolveDevProxyTarget = (mode: string, projectRoot: string) => {
  const env = loadEnv(mode, projectRoot, "")
  const developmentEnv = mode === "development" ? env : loadEnv("development", projectRoot, "")
  return (env.VITE_DEV_PROXY_TARGET || developmentEnv.VITE_DEV_PROXY_TARGET || "http://localhost:3200").trim()
}

/**
 * 构造 `/api` 反向代理与 `/collab` WebSocket 代理配置（开发服务器与 preview 服务器共用）。
 * 协作感知 WS（services/knowledge-collab.ts 连当前站点 origin 的 /collab）在
 * dev 与 preview 下必须一并转发到后端，否则连接失败进入无限重连。
 */
export const createApiProxy = (mode: string, projectRoot: string) => ({
  "/api": {
    target: resolveDevProxyTarget(mode, projectRoot),
    changeOrigin: true,
  },
  "/collab": {
    target: resolveDevProxyTarget(mode, projectRoot),
    changeOrigin: true,
    ws: true,
  },
})

/** 读 package.json 的版本号，注入为渲染层的编译期常量。 */
const readPackageVersion = (projectRoot: string): string =>
  (JSON.parse(fs.readFileSync(path.resolve(projectRoot, "package.json"), "utf-8")) as { version?: string }).version ??
  "0.0.0"

/**
 * 渲染层（Web 与 Electron 共用）的公共 Vite 配置片段。
 *
 * @param projectRoot 项目根目录（调用方配置文件所在目录），所有路径基于它解析。
 */
export const createRendererSharedConfig = (projectRoot: string): UserConfig => ({
  // .env / .env.development.local 统一放在项目根目录，渲染层 root 下移后需显式指定
  envDir: projectRoot,
  // 设置页「关于」分组要显示版本号：Web 端拿不到 app.getVersion()，
  // 双端统一从 package.json 注入编译期常量
  define: {
    __APP_VERSION__: JSON.stringify(readPackageVersion(projectRoot)),
  },
  // 资源用绝对根路径引用（/assets/...）：桌面端深链加载时页面 URL 带路由前缀
  // （app://bundle/auth/login），相对引用 ./assets 会被解析进路由子路径导致
  // 模块 404（fallback 成 HTML 报 MIME 错误，应用白屏）
  base: "/",
  css: {
    postcss: path.resolve(projectRoot, "postcss.config.js"),
  },
  plugins: [
    vue(),
    // 业务组件自动注册（AppButton、KnowledgeTreeNode 等模板免 import）。
    // dirs/dts 必须用绝对路径：插件相对 vite root（src/renderer）解析，相对路径会指向不存在的目录
    Components({
      dirs: [path.resolve(projectRoot, "src/renderer/src/components")],
      deep: true,
      extensions: ["vue"],
      dts: path.resolve(projectRoot, "src/renderer/components.d.ts"),
      // 用预编译 css 而非 sass：避免引入 sass 构建依赖；EP 样式 unlayered，覆盖 Tailwind 工具类时注意（同 antd.css 坑）
      resolvers: [ElementPlusResolver({ importStyle: "css" })],
    }),
    // 语雀 Lake 编辑器离线资源：dev 由中间件服务 /yuque-assets/*，build 产物随包输出
    yuqueAssets(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src/renderer/src"),
    },
  },
  optimizeDeps: {
    // 原生依赖（fsevents / lightningcss / tailwind oxide）不要被预打包
    exclude: ["fsevents", "lightningcss", "@tailwindcss/oxide"],
  },
  build: {
    chunkSizeWarningLimit: 1300,
    // 关闭 modulepreload polyfill：它会被打进某个大 chunk（实践中落到
    // board-excalidraw），导致入口同步依赖整个 4.8MB chunk、HTML 把它整块
    // preload 到首屏。Electron 44 与现代浏览器原生支持 modulepreload，无需 polyfill。
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) {
            return
          }

          if (
            id.includes("/node_modules/vue/") ||
            id.includes("/node_modules/vue-router/") ||
            id.includes("/node_modules/pinia/")
          ) {
            return "framework"
          }

          // EP 组件库独立成块；其传递依赖（dayjs/lodash-es@4.18.1 等）走默认拆分，接入 EP 后需 profile 复核
          if (id.includes("/node_modules/element-plus/") || id.includes("/node_modules/@element-plus/icons-vue/")) {
            return "element-plus"
          }

          if (
            id.includes("/node_modules/@excalidraw/") ||
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/@radix-ui/react-") ||
            id.includes("/node_modules/roughjs/") ||
            id.includes("/node_modules/perfect-freehand/") ||
            id.includes("/node_modules/fractional-indexing/") ||
            id.includes("/node_modules/open-color/") ||
            id.includes("/node_modules/jotai/") ||
            id.includes("/node_modules/jotai-scope/") ||
            id.includes("/node_modules/browser-fs-access/") ||
            id.includes("/node_modules/canvas-roundrect-polyfill/") ||
            id.includes("/node_modules/points-on-curve/") ||
            id.includes("/node_modules/pako/") ||
            id.includes("/node_modules/pica/") ||
            id.includes("/node_modules/png-chunk-text/") ||
            id.includes("/node_modules/png-chunks-encode/") ||
            id.includes("/node_modules/png-chunks-extract/") ||
            id.includes("/node_modules/pwacompat/") ||
            id.includes("/node_modules/tunnel-rat/")
          ) {
            return "board-excalidraw"
          }

          if (
            id.includes("/node_modules/markdown-it/") ||
            id.includes("/node_modules/linkify-it/") ||
            id.includes("/node_modules/mdurl/") ||
            id.includes("/node_modules/uc.micro/")
          ) {
            return "markdown"
          }

          if (id.includes("/node_modules/diff/")) {
            return "knowledge-extra"
          }
        },
      },
    },
  },
})

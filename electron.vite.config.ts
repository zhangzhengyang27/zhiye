import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { createApiProxy, createRendererSharedConfig } from "./build/shared"

/**
 * 桌面端构建配置（electron-vite）。
 *
 * - main / preload 默认入口：src/main/index.ts、src/preload/index.ts
 * - renderer 默认 root：src/renderer（与 Web 端共享 build/shared.ts 中的配置）
 * - 构建产物：out/main、out/preload、out/renderer（electron-builder 打包输入）
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          // sandbox 模式下的 preload 不支持 ESM，固定输出 CommonJS
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    ...createRendererSharedConfig(__dirname),
    // electron-vite 默认把 renderer base 强制为 "./"（file:// 场景），但本项目
    // 生产用 app:// 自定义协议 + SPA 深链，相对引用会被路由前缀污染导致模块 404，
    // 必须显式用绝对根路径（shared 里的 base 会被 electron-vite 默认值覆盖）
    base: "/",
    server: {
      proxy: createApiProxy(process.env.NODE_ENV ?? "development", __dirname),
    },
  },
})

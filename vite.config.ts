import { defineConfig } from "vite"
import path from "path"
import { createApiProxy, createRendererSharedConfig } from "./build/shared"

// https://vite.dev/config/
// Web 端构建配置：与桌面端（electron.vite.config.ts）共享渲染层配置，
// 区别仅在于 root 指向 src/renderer、产物输出到根目录 dist/ 供 smoke 使用。
export default defineConfig(({ mode }) => {
  const shared = createRendererSharedConfig(__dirname)

  return {
    root: "src/renderer",
    ...shared,
    server: {
      host: "0.0.0.0",
      proxy: createApiProxy(mode, __dirname),
    },
    preview: {
      proxy: createApiProxy(mode, __dirname),
    },
    build: {
      ...shared.build,
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  }
})

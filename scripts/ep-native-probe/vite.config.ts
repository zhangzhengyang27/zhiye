import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

/**
 * EP 原生行为探针的独立 vite 配置：vue / element-plus / @vitejs/plugin-vue 均从主仓
 * node_modules 向上 resolve（探针目录位于主仓 scripts/ 下），与主仓同版本构建。
 */
export default defineConfig({
  base: "./",
  plugins: [vue()],
  build: {
    // 产物放主仓 node_modules/.cache（仓外）：避免进入 eslint 扫描面（flat config 的
    // "dist/**" 只匹配根 dist）与 git 工作区，verify 脚本每次重构建
    outDir: "../../node_modules/.cache/ep-native-probe",
    emptyOutDir: true,
  },
})

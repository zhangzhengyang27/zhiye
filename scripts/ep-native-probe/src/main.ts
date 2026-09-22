/**
 * EP 原生行为探针入口：全量引入 element-plus（与主仓同版本，经 pnpm 从主仓
 * node_modules resolve），行为结论由 scripts/verify-ep-native-behavior.mjs 驱动。
 */
import { createApp } from "vue"
import ElementPlus from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"
import "element-plus/dist/index.css"
import App from "./App.vue"

declare global {
  interface Window {
    __probe: Array<{ scope: string; key: string; value: unknown }>
  }
}

window.__probe = []

const app = createApp(App)
app.use(ElementPlus, { locale: zhCn })
app.mount("#app")

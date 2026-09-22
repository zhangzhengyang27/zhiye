/** 挂载 Vue 应用并注册全局插件。 */

import { createApp } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"
import router from "./router"
/* EP 暗色变量必须最先、kb 桥接紧随其后（靠顺序压过 html.dark 同名变量）、style.css 最后 */
import "element-plus/theme-chalk/dark/css-vars.css"
import "./assets/styles/element-plus-bridge.css"
import "./style.css"
/* EP 全局校准层必须在 style.css 之后：@import "tailwindcss"（style.css 首行）建立
   theme/base/components/utilities 全局层序，本文件的 @layer components 块要落进
   已存在的 components 层——排到前面会让 components 抢在 theme/base 之前建立，
   Tailwind 的层序声明只追加缺失层，层序即被破坏（详见校准文件头） */
import "./assets/styles/element-plus-calibration.css"
import { setupElInputRootFocus } from "./utils/el-input-focus"
import { setupElSelectRootBehavior } from "./utils/el-select-root"
import { setupWindowChrome } from "./utils/window-chrome"

const app = createApp(App)

/* 窗口形态类必须在首帧前落到 <html>，否则侧栏/目录列首行会先按有标题栏的位置画一帧再跳 */
setupWindowChrome()

app.use(createPinia())
app.use(router)
app.mount("#app")

/* el-input / el-textarea 根 padding 盲区的点击聚焦（T5 解散 AppInput 的行为收编，
   全局一处装配，见 utils/el-input-focus.ts 文件头） */
setupElInputRootFocus()

/* el-select 根 padding 盲区点击开合 + Space/Esc 键盘契约（T6 解散 AppSelect 的行为收编，
   全局一处装配，见 utils/el-select-root.ts 文件头） */
setupElSelectRootBehavior()

/**
 * Umami 访问统计（仅 Web 生产构建；桌面端不加统计，避免 app:// 与文档子窗口重复计数）。
 * script.js 自带 SPA history 路由监听，动态注入后无需手动 afterEach 上报。
 */
const UMAMI_SRC = "https://analytics.zhangzhengyang.com/script.js"
const UMAMI_WEBSITE_ID = "4e44b999-f747-4d04-b39d-f782607d8354"

if (
  import.meta.env.PROD &&
  !window.xiaoyeDesktop &&
  !document.querySelector(`script[src="${UMAMI_SRC}"]`)
) {
  const tracker = document.createElement("script")
  tracker.defer = true
  tracker.src = UMAMI_SRC
  tracker.setAttribute("data-website-id", UMAMI_WEBSITE_ID)
  document.head.appendChild(tracker)
}

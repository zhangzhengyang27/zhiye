/** 挂载 Vue 应用并注册全局插件。 */

import { createApp } from "vue"
import { createPinia } from "pinia"
import ui from "@nuxt/ui/vue-plugin"
import App from "./App.vue"
import router from "./router"
import "./style.css"

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ui)
app.mount("#app")

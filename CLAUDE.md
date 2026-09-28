# 知叶前端项目开发规范

## 项目概述

知叶（zhīyè，2026-09-22 定名，取「一叶知秋」与「叶=页」双关）——AI 知识库管理系统，**Electron 桌面端 + Web 双端**（electron-vite），基于 Vue 3 + TypeScript + Tailwind CSS 4，覆盖认证、账户设置、知识库工作区、语雀 Lake 富文本编辑与 Excalidraw 画板编辑。UI 层为「**EP 直用 + 全局校准层**」模型（2026-09-14 决策，原 App\* 适配层已解散）：调用方模板直接写 element-plus（el-\*）组件，语雀像素观感由全局校准层 `assets/styles/element-plus-calibration.css` 统一提供、EP 缺口行为收进共享 composable（详见「EP 直用约定」）；知识树/右键菜单/划词浮条等高定制件保持自建。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 桌面端开发（electron-vite dev，渲染层 dev server 代理 `/api` 到 `http://localhost:3200`） |
| `pnpm dev:web` | Web 端开发（纯 vite） |
| `pnpm build` | 桌面端生产构建（electron-vite build，产物在 `out/`） |
| `pnpm build:web` | Web 生产构建（含 `vue-tsc` 类型检查，产物在 `dist/`，smoke 使用） |
| `pnpm start` | 以生产构建启动桌面端（electron-vite preview） |
| `pnpm dist` | `electron-vite build` + electron-builder 打包（macOS arm64 dmg，输出 `release/`） |
| `pnpm icons` | 重新生成图标映射 `icon-map.generated.ts`（扫描源码 `icon="ph:xxx"`/`i-lucide-*` 引用；`dev`/`build` 已自动前置） |
| `pnpm typecheck` | `vue-tsc -b` 类型检查 |
| `pnpm lint` / `pnpm lint:fix` | ESLint（检查/自动修复） |
| `pnpm format` | Prettier 格式化 |
| `pnpm test` | vitest 单测 |
| `pnpm smoke:workspace[:headed]` | 工作区冒烟（目录树、语雀编辑器挂载） |
| `pnpm smoke:periphery[:headed]` | 最近/收藏/回收站等外围流程冒烟 |
| `pnpm smoke:account[:headed]` | 账户设置冒烟（头像上传依赖对象存储，MinIO 隧道/bucket 不可用时会在该步失败） |
| `pnpm verify:settings` | 偏好设置页验收（分组结构/度量逐值、主题三态落盘、快捷键改键与生效、代理校验与桌面下发） |
| `pnpm verify:settings:native` | 桌面端真跑（需 `pnpm dev --remoteDebuggingPort=9222` 在跑；自启/快捷键/代理/托盘） |
| `pnpm profile:workbench[:warm\|:cold]` | 工作台性能分析 |

## 验证实践

- 主要验证路径：`pnpm typecheck` + `pnpm lint` + `pnpm build:web` + `pnpm build` + 按改动范围选 smoke/profile。
- 改动登录态/账户流程跑 `smoke:account`；工作区/侧栏/编辑器壳层跑 `smoke:workspace`；外围导航跑 `smoke:periphery`。`smoke:account` 的入口/账户页选择器已对齐 09-22 账号页现状（资料行 label 结构、「保存资料/更新密码」文案、内联改密流程、注册/找回走邮箱验证码 dev 回显），头像上传链路已于 09-22 接回（AccountView → AvatarCropDialog → oss/upload → 保存资料持久化），可直接使用。
- EP 专项验证脚本（`scripts/`，前置同冒烟：后端 3200 + `build:web` + preview :4173）：
  - `visual-pixdiff.mjs`：改动前后双口径像素对比（同轮自配对 before/after；校准层/EP 直用相关改动必跑）
  - EP 直用改造全套回归资产（T2-T10 逐组件解散的 verify/capture，明细与门禁口径见 `docs/EP直用改造与适配层解散实施计划-2026-09-14.md`）：`verify-appcheckbox-t2.mjs` + `verify-t3..t10.mjs`（行为断言 36-134 项/件）、`visual-capture-t2..t10.mjs`（同屏同参截图采集）
  - `verify-task-3.4.mjs`：全局通知（use-transient-toast）行为断言 25 项（toast 件仍在，Task 3.4 资产）
  - `visual-capture-ep-baseline.mjs` / `visual-capture-replica.mjs` / `visual-baseline-report.mjs`：EP 基线/自绘版截图采集与报告（通用工具）
  - `verify-ep-native-behavior.mjs` + `scripts/ep-native-probe/`：EP 2.14.5 原生行为探针（独立 vite 静态应用，不含项目样式；升级 EP 版本时复测）
- 冒烟脚本跑 Web 路径（preview :4173），需后端 zhiye-server 在 3200 运行；桌面端改动另需 `pnpm start` 人工走查。

## 当前技术栈

- **electron-vite 5 + Electron 44**（桌面端）、Vite 7（Web 双端共享构建配置 `build/shared.ts`）
- Vue 3 + TypeScript、Vue Router、Pinia
- **element-plus 2.14.5**（精确锁版无 `^`；EP 上游处维护收缩期，升级需按校准层各组件段与探针 `scripts/ep-native-probe/` 复测内部类名与行为前提，见「EP 直用约定」）
- **Tailwind CSS 4**（`@theme inline` + tokens，无 tailwind.config.js）
- **yuque-editor-core**（语雀 Lake 编辑器内核 + `vite-assets` 离线资源插件）
- `@phosphor-icons/vue` + `lucide-vue-next`（本地图标组件，源码写 `icon="ph:xxx"` 字符串经 `scripts/build-icon-map.mjs` 构建期生成映射）
- `@vueuse/core`（useDark 主题切换）
- `@excalidraw/excalidraw`、`markdown-it`、ali-oss
- 传递依赖提示：`dayjs` / `lodash-es` 由 element-plus 带入（日期格式化与工具函数），如需直接 import 以 EP 锁定版本为准
- electron-builder（打包）

## 架构要点

### 双端结构

```text
src/
├── main/           # Electron 主进程（app:// 协议、窗口、下载/外链接管、服务器地址解析）
├── preload/        # sandbox preload：contextBridge 暴露 xiaoyeDesktop（同步服务器地址）
└── renderer/       # 渲染层（Web 与桌面共用）
    ├── index.html
    └── src/
        ├── components/common/   # 图标（UiIcon/AppIcon）+ 业务对话框件（ConfirmDialog/KbDialogHeader）（全局自动注册）
        ├── views/  services/  stores/  router/  utils/  types/  composables/
        └── assets/styles/       # tokens.css（设计令牌）+ element-plus-bridge.css（--el-*→--kb-* 变量桥）+ element-plus-calibration.css（EP 全局校准层）
build/shared.ts       # 双端共享 vite 配置（plugins/alias/manualChunks）
electron.vite.config.ts / vite.config.ts   # 桌面 / Web 构建入口
electron-builder.yml  # 打包配置
```

### 桌面端运行时

- 生产模式通过特权协议 `app://bundle` 加载本地渲染层（protocol.handle + SPA fallback，**HTML5 History 路由无需 hash**）；开发模式加载 electron-vite dev server。
- **登录是独立小窗**（`src/main/login-window.ts`，对齐语雀 windows/login 语义）：未登录时只开 400×649 登录窗（macOS hiddenInset、正式包不可调宽、窗题「登录」、渲染层为扁平无卡片版式），登录成功才销毁它并开主窗；refresh cookie 仍有效时登录窗自举后自动跳过进主窗。会话失效（auth:unauthorized）与退出登录（AccountView → `logoutDesktop`）都回到登录窗，不在内容窗内整页跳登录页；登录窗不在广播接收名单（同锁定窗）。主窗几何持久化与失焦自动锁定要求 `asMain: true`（登录后主窗带回跳路由创建，不能靠「无 targetPath」推断主窗身份）。
- 后端地址解析优先级：`XIAOYE_SERVER_URL` 环境变量 > `userData/config.json`（`serverBaseUrl`/`webBaseUrl`）> `http://localhost:3200`；经环境变量注入 sandbox preload，渲染层 `services/desktop-bridge.ts` 同步读取。Web 端行为与历史完全一致（相对 `/api` + location.origin）。
- **认证请求必须带 `credentials: "include"`**（login/register/phone-auth/logout）：桌面端页面与后端跨源（app://bundle 或 dev 5173 → 3200），不 include 则响应里的 `kb_refresh` HttpOnly cookie 被浏览器丢弃，重启后无法静默续期（后端 CORS 本就按 credentials:true + 显式白名单设计）。`/auth/refresh` 一直带 include。
- window.open 三分流：空白页（PDF 打印窗）放行；下载端点（drive 下载 / OSS 签名直链）转 session 下载；其余 http(s) 走系统浏览器。

### Design Tokens（重要）

- `assets/styles/tokens.css` 三层：原始色板（`--kb-grey/green/blue/red/yellow/orange-*`，值移植自语雀 v4.2.1，`.dark` 整体反转）→ 语义层（`--kb-brand/--kb-text/--kb-border` 等，沿用 `--kb-*` 命名）→ 结构层（radius/transition/z/font）。
- `style.css` 通过 `@theme inline` 暴露 utility：`bg-brand`、`text-ink-secondary`、`border-line`、`bg-error-bg` 等；`primary` 是 brand 的别名组。
- **暗色切换**：`composables/useThemeMode.ts`（useDark）在 `<html>` 切 `.dark`；语义层引用原始层变量，绝大多数组件无需写 `dark:` 变体。
- **首屏防闪白**：`src/renderer/index.html` 有一段内联脚本，在样式计算前同步补 `.dark`。它硬编码读取 localStorage key `vueuse-color-scheme`（useDark 的默认值）——**改动 useDark 的 storageKey 必须同步改这段脚本**，否则暗色用户首屏会闪一帧亮色。
- **暗色下 hover/active 方向**：暗色色板的亮度与亮色相反（500 比 600 深、700 比 600 亮），所以状态色在 `.dark` 里显式覆写为 `hover=700`（更亮）/ `active=500`（更暗），与亮色的 `hover=500`/`active=700` 手感一致。**新增状态色时两套都要写**，别只写 `:root`。
- **禁止在组件里写死颜色**；新颜色先进 tokens.css。白名单例外：代码高亮主题（.hljs-*）、代码预览深色面板（`bg-slate-950` + `text-slate-100`，两种模式都是深底浅字）、彩底白字、**以及 tokens.css 里阴影档自身的 rgba**——组件侧只许 `shadow-[var(--kb-*-shadow)]`，守卫第 5 项会拦字面量（批 19 已把 14 处一次性阴影收档，其中 7 处曾把亮色 brand `#00b96b` 写死、暗色不换档）。`--kb-glow-brand-*` 三档是 color-mix 派生的，色跟 `--kb-brand` 自动换档，**不要在 `.dark` 段重复写一份**（会造出第二事实源）。
- token 提取脚本：`scripts/extract-yuque-tokens.mjs` → `docs/yuque-tokens.json`（参考数据，勿外发）。

### 公共组件与校准层（components/common/ 与 assets/styles/）

**EP 直用**：输入/选择/开关/弹窗/下拉/按钮/徽标/卡片/页签/布局壳等一律在调用方模板直写 el-\*（2026-09-14 起原 App\* 适配壳全部解散，逐组件记录见 `docs/EP直用改造与适配层解散实施计划-2026-09-14.md`；此前的换底记录见 `docs/ElementPlus迁移实施计划-2026-09-13.md`）。

**保留的公共组件**：

- 业务对话框件（壳保留、内脏为裸 el-dialog，对外 API 与适配层时代逐条保真）：`ConfirmDialog`；`KbDialogHeader` 为对话框头部共享片段（eyebrow chip / h3 标题 / 描述 / 关闭钮）。
- 树节点重命名**不开对话框**（对齐语雀实测）：`KnowledgeInlineTitleInput.vue` 就地编辑，目录树行与「全部文档」平铺卡片共用；原 `InputDialog` 因此为孤儿组件已删除。
- 图标：`UiIcon`（通用入口，`icon="ph:xxx"` / `i-lucide-*` 字符串）与 `AppIcon`（承接旧引用）。
- 策略 C 高定制件（无对应 EP 语义，明确不迁）：知识树拖拽 `views/knowledge/use-tree-drag.ts`、右键菜单 `views/knowledge/tree-node-menu.ts` + `KnowledgeTreeNodeMenu.vue`、划词浮条 `EditorSelectionToolbar`、编辑器「更多操作」菜单 `EditorMoreMenu`（el-dropdown 承担开合/定位/roving，面板内容按基线重刻）。
- 全局通知不走组件：`composables/use-transient-toast.ts` 命令式 `ElNotification`（原 StatusToast 组件已删）。
- 中性实心（`bg-neutral text-neutral-ink hover:bg-neutral-hover`）的明暗底色由 `--kb-neutral*` 换档，组件里不要再写 `bg-grey-900 text-grey-100`——暗色下 grey-900 是最亮的一档，会变成刺眼的白块。
- **图标是本地组件 + 构建期映射**（非 iconify 运行时）：源码写 `icon="ph:xxx"` / `icon="i-lucide-xxx"` 字符串，`scripts/build-icon-map.mjs` 扫描源码生成 `components/common/icon-map.generated.ts`（Phosphor 字重 `ph:book-fill` 映射为同组件 + `weight` prop）。`dev`/`build`/`dist` 已前置该脚本；新增图标引用后跑 `pnpm icons`，不要手改生成文件，也不要全量 import 图标包。`AppIcon` 默认 `h-[1.2em]` 随字号缩放。
- **全局自动注册**：`build/shared.ts` 里 `unplugin-vue-components`（dirs 绝对路径 `src/renderer/src/components`）。**注意 dirs/dts 必须用绝对路径**——插件相对 vite root（src/renderer）解析，相对路径会指向不存在的目录导致组件静默不渲染。生成的 `src/renderer/components.d.ts` **已入库**（2026-09-14 T11 决策：`build:web` 的 vue-tsc 先于 vite build，全新 clone 无法靠 build 自愈，入库换 typecheck 稳定）——新增/删除组件后 dev/build 会再生该文件，diff 一并提交。
- 旧 TipTap 栈已删除；文档编辑器为 `components/editor/YuqueDocEditor.vue`（yuque-editor-core 受控封装，插槽名 kebab：`#surface-header`/`#surface-footer`——Vue 插槽名不归一化）。评论锚点/@提及/AI 补全/搜索替换已随 TipTap 下线，后续基于 Lake API 重设计。

### EP 直用约定

调用方直接写 el-\*；语雀观感与行为由全局校准层 + 行为 composable 统一提供。改 EP 相关代码前先读 `assets/styles/element-plus-calibration.css` 文件头（三层规则、级联前提、禁止事项）与对应组件段落注释。要点：

- **校准层三层规则**（`element-plus-calibration.css`，main.ts 中在 style.css **之后**引入——`@import "tailwindcss"` 先建立全局层序，勿调回前面）：① unlayered 中和段：对 EP 强设声明写 revert-layer（统一 `.el-x.el-x` 双写前缀压特异性，不依赖加载顺序），使 EP 工厂值退回 Tailwind 4 层序；② `@layer components` 默认段：`.el-*` 类上的语雀默认观感，色值全部取 `--kb-*` token，明暗自动换档；③ z 契约钉段。中和/默认两段必须**成对**扩充：只 revert「components 段有落点（或继承/初始值即目标）」的属性，避免回退到错误初始值。
- **覆盖契约：caller utilities 永远赢**——禁止在校准层 unlayered 段写任何非 revert-layer 的视觉声明（会压死调用方覆盖）；不得用 `--el-button-*` 变量矩阵方案（Task 2.7 已否）。
- **新对话框一律接 `useDialogBehavior`**（`composables/use-dialog-behavior.ts`）：`const dialog = useDialogBehavior({ open: () => props.open })` + `<el-dialog v-bind="dialog.elDialogBindings">` 一行铺开——滚动锁（EP lock-scroll 乱序关闭会提前解锁，自建实例计数接管）、`data-autofocus` 优先聚焦（EP 不识别该标记，宏任务聚焦兜底首可聚焦）、IME 组词 Esc 守卫、z 叠放（Z_DIALOG=400 基准按打开时栈深 +1 递增）、`kb-dialog`/`kb-dialog-overlay` chrome 类一次到位，调用方只追加 `max-w-*` 档位类；头部用 `KbDialogHeader`。刻意绕开的裸 el-dialog = 要 EP 出厂观感。菜单类行为收编在 `composables/use-dropdown-menu.ts`（Esc 截停/打开聚焦首项/面板内展开状态机）；el-input / el-select 根 padding 盲区的点击聚焦与 Space/Esc 契约由 `utils/el-input-focus.ts`、`utils/el-select-root.ts` 全局装配（main.ts）。
- **el-input 档位只有两档，别再手绘第 13 个 input**（样式排查批 11 已把 12 处手绘 input/textarea/checkbox 收编进 EP 本体）：默认 `.el-input`（36px/1px kb-border/10px 圆角/muted 底/13px 字，盒面在校准层根上，wrapper 与 inner 已幽灵化）与紧凑档 `.el-input--small`（24px/12px 字，收藏夹行内改名与浮层搜索框用）。**就地编辑档 `.kb-input-inplace`**：树行与「全部文档」卡片的行内改名专用——摘掉整套盒面（border/padding/底/圆角归零），字号行高字重与所替换的标题文本逐属性同值（14px/20px/500），`height: auto` 防被默认 36px 撑破行高。裸 `<input>` 在这里不可用：编辑器页 antd.css 的 unlayered `input{font-size:inherit}` 会压过 `@layer utilities` 的字号类（AGENTS.md 坑 13），走本档则由根继承反而成立。
- **新弹层 z 走 `var(--kb-z-*)`**：`el-config-provider :z-index="380"`（App.vue）起计数且随打开次数上浮，一切有确定层级要求的弹层必须显式钉——对话框经 elDialogBindings 钉 Z_DIALOG=400 基准、叠放按打开时栈深 +1（use-dialog-behavior 动态下发，叠层 401/402…）、EP popper 由校准层 z 钉段钉 500（`z-index: var(--kb-z-popper) !important`，压过 EP 写入的内联计数值）、全局 toast 500（props.zIndex 内联）。数值唯一事实源 `src/renderer/src/constants/z-index.ts`（TS 侧 import 常量消费），CSS 侧 `var(--kb-z-*)`（tokens.css 结构层），两侧不得再写散落字面量。
- **暗色承重链（接管新组件文字色必查）**：① style.css 的 `html.dark .text-ink-*`（!important）劫持字色 utility；② `html.dark p/span/label/li { color: inherit }`（unlayered）把 EP 以 label/span/li 充当的组件元素压成继承 body 色（segmented item / el-tag 内容 / select 弹层条目先例）；③ 编辑器/画板页懒注入的 Lake antd.css 劫持 input/button 字号行高色与 h1-h6 字重色（AGENTS.md 坑 13 同族）。校准层暗色段已按基线链路逐处复刻，新组件照方抓药。
- **CSS 注释纪律**：校准层/桥接层注释正文不得出现星号紧连斜杠的序列（如「宽度/字号」斜杠连写）——会提前终止块注释，后续文字被并入下一条规则的选择器，整条规则静默丢弃且构建零报错；凡动 CSS 注释，修后必跑对应 verify-tN 的 CSS bundle 结构哨兵 + pixdiff 复验。
- **桥接机制**：`element-plus-bridge.css` 职能有二：① 把 `--el-*` 全量映射到 `--kb-*`（唯一视觉源，禁止直写色值），选择器用 `html:root`（特异性 0,1,1）压过 EP base 的 `:root` 默认值、与加载顺序无关；暗色靠 main.ts 中 bridge 排在 `dark/css-vars.css` 之后 import 的顺序取胜；② 承载全局 toast 的 `.el-notification.kb-toast` 自绘 chrome 规则（约 150 行，use-transient-toast 的视觉层，属组件规则非变量桥）。T10 起桥内不再保留任何防御性组件规则（暗色实心钮墨字防御已删——未来若产品拍板改暗色按钮配色，应重拍基线而非恢复防御规则）。
- **业务件内覆盖 EP 弹层**：teleport 到 body 的弹层用 `popper-class` + 组件内非 scoped `<style>` 块（EditorMoreMenu 先例）；EP 内部元素不带 scope id，scoped 内必须显式 `:deep()`。

### 编辑器入口

- 文档编辑：`KnowledgeDocEditorView.vue` + `YuqueDocEditor.vue`（Lake 内核，内容为 markdown/html 字符串，无 TipTap JSON）
- 画板编辑：`KnowledgeBoardEditorView.vue` + `ExcalidrawBoardSurface.vue`（与文档编辑彼此独立）
- yuque-assets 离线资源由 `yuqueAssets()` vite 插件托管：dev 走中间件，build 产物随包输出（桌面端经 app:// 协议服务）。

## 构建与配置要点

- `@` 别名指向 `src/renderer/src`。
- 渲染层 root 是 `src/renderer`，`.env` 在项目根目录（各配置显式 `envDir`）；Web 构建输出 `dist/`，桌面端输出 `out/`。
- `manualChunks` 的 framework / board-excalidraw / markdown / knowledge-extra / element-plus 拆分是刻意配置，调整前跑 `pnpm profile:workbench` 对比。
- `build.modulePreload.polyfill` 已关闭：vite 会把动态 import 的 preload helper 打进入口首个引用的手动 chunk（实践中是 board-excalidraw），导致入口连带依赖整块 4.8MB 画板 chunk 并 preload 到首屏。Electron 44 与现代浏览器原生支持 modulepreload。**已知遗留**：helper 落点仍使 board-excalidraw 的 JS/CSS 被 HTML 预载（浏览器低优先级预取，不阻塞；桌面端本地磁盘影响可忽略）。若要彻底解耦需等 vite 调整 chunk 放置策略或改手动 chunk 分组，勿随意改。
- eslint ignores 含 `out/**`、`release/**`、`docs/**`——新构建产物目录必须同步加入，否则 lint 会卡死在产物上。
- pnpm `onlyBuiltDependencies` 含 electron/esbuild；新增带 install 脚本的依赖需要补。
- 发版走「打 `v*` tag → CI 打包 → GitHub Releases 草稿 → 人工 Publish」：SOP 与踩坑（GitHub Packages 须授权 zhiye 仓、产物名必须 ASCII、改构建配置须挪 tag）见 `docs/发布链路-2026-09-28.md`；`electron-builder.yml` 的 `artifactName` 与两个 workflow 的 Packages 认证段是承重配置勿删。

## Git 提交前缀

- `feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`

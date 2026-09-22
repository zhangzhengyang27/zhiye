# Element Plus 调研与选型对比（vs ant-design-vue）（2026-09-13）

> 本文回答一个问题：UI 组件库选 **ant-design-vue 4.2.6** 还是 **element-plus**？结论供拍板，迁移计划主体见 [AntD迁移调研与实施计划-2026-09-13.md](./AntD迁移调研与实施计划-2026-09-13.md)（其适配层架构对两者通用，选 EP 需要的改动见第四节 delta）。

## 一、结论 TL;DR

**两者都能落进同一套迁移架构**（自建 App* 适配层保 API、调用方零改动、token 桥接、Tailwind 4 不动）。逐项对比后，**我的推荐是 Element Plus**：它消除了本项目最大的两个风险源（Lake 编辑器 antd.css 类名冲突、上游停止维护），主题桥接机制还更简单（纯 CSS 变量，无 JS 运行时主题）。antd-vue 唯一的实质优势是设计血统更贴近语雀（语雀本身就是 antd 系），但这在逐组件视觉校准面前权重有限。

## 二、Element Plus 关键事实（2026-09 核实）

- **版本与兼容**：npm 最新 **2.14.5**，peer `vue ^3.3.7`，与本项目 Vue 3.5.25 兼容。
- **维护状态**：**活跃维护中**。发布节奏约 1-2 月一个 minor（2.9.x → 2.11.x → 2.14.5），issue 处理正常，26.5k+ stars。注意点：2024 年底有核心维护者减少投入的公开讨论，社区对长期维护有关注，但截至今日仍在持续发版——和 ant-design-vue 的「官方宣布停止、不会有 5.x」是两种性质的差。
- **样式机制**：纯静态 CSS（theme-chalk），**没有 CSS-in-JS 运行时**。样式随组件经 ElementPlusResolver 按需 import，注入顺序确定；没有 antd cssinjs 的运行时生成与 `:where` 特异性问题。
- **暗色模式**：官方机制就是 `html.dark` + `import 'element-plus/theme-chalk/dark/css-vars.css'`（文档推荐用 VueUse useDark 切换）——**和本项目 `useThemeMode`（useDark，`<html>.dark`）零成本对齐**，自定义变量在 EP 样式之后用 CSS 覆盖即可（明暗两套都走变量）。
- **ConfigProvider**（el-config-provider）：`z-index`（全局弹层初始 z-index，默认 2000）与 `namespace`（类名前缀，默认 `el`）均有。
  - `z-index` 可直接设为 ~380 对齐 kb 层级（同 antd 计划 Task 1.4 的思路）。
  - `namespace` **不需要动**：改前缀需要连同 `$namespace` SCSS 变量重编译主题才有意义，而我们要它保持 `el`（见下一条）。
- **类名前缀 `el-*`**：与 Lake 编辑器注入的 antd v4 静态 CSS（`.ant-*`，7126 个选择器）**零交集**——antd 计划里最高风险的 Phase 1.3 spike / 附录 A fallback 整体消失，只剩「同屏共存确认」级别的验证。
- **组件覆盖**：本项目迁移面所需的 input/textarea/select/checkbox/switch/radio/dialog/dropdown 全有；`el-segmented`（2.7.0+）可承接 AppRadioGroup 的 segmented 变体；tree 拖拽虽强但按既定策略不迁。
- **体积**：npm 包解压 43.5MB（含全部样式源码），实际按需 tree-shake 后与 antd-vue 同量级（数十~数百 KB gzip），Electron 离线场景无网络成本。

## 三、逐轴对比

| 维度 | ant-design-vue 4.2.6 | element-plus 2.14.5 | 对本项目影响 |
| --- | --- | --- | --- |
| 上游维护 | **停止积极维护**，官方声明无 5.x | 活跃（2.11→2.14.5），有维护者投入减少的社区讨论 | **EP 占优**；且两边都有适配层兜底，可换底 |
| 与 Lake antd.css 冲突 | `.ant-*` 类名正面冲突，需 prefixCls 改前缀 + spike 决策门 + fallback 预案 | `el-*` 与 `.ant-*` 零交集，无需隔离方案 | **EP 占优（最大差异项）** |
| 主题桥接 | JS 侧：ConfigProvider theme + getComputedStyle 读 token，暗色切换重建 | CSS 侧：`:root { --el-*: var(--kb-*) }` + color-mix 派生色阶，**暗色自动跟随**（custom property 在 html 元素上取级联值，.dark 换档天然生效） | **EP 占优**（少一个运行时机制、少一类 bug 面） |
| 样式优先级对抗 | cssinjs unlayered 动态注入，与 unlayered 编辑器 CSS / Tailwind @layer 的博弈顺序敏感 | 静态 CSS，import 顺序确定 | EP 占优；但「Tailwind @layer 输给 unlayered」的坑两边一样，适配层覆盖都用 scoped CSS |
| 设计血统 | **antd 系——语雀 Web 本身就是 antd 系**（tokens.css 注释即「对齐语雀 Ant Design 5 阶梯」），默认比例/交互模式更接近 | 自成体系，视觉默认值偏离语雀更多 | **antd 占优**；但视觉最终都靠适配层校准，差距可抹平，只影响校准工作量 |
| z-index | token `zIndexPopupBase` 对齐 380 | ConfigProvider `:z-index` 直接设 | 打平 |
| 暗色 | 算法（darkAlgorithm）+ JS 重算 | `html.dark` + css-vars 文件，与现有 useDark 同键 | **EP 占优**（机制同构） |
| 组件覆盖（本项目所需） | 全覆盖 | 全覆盖（含 el-segmented） | 打平 |
| 迁移工作量（相对） | 基准 | 约省 0.5-1 天（砍掉 spike/fallback 与 JS 主题桥接） | EP 占优 |

## 四、若选 Element Plus，迁移计划怎么变（delta）

适配层架构、Phase 划分、组件策略表（谁换谁留）、验证与回滚方式**全部不变**，只改基建层：

1. **Task 1.1**：`pnpm add --save-exact element-plus@2.14.5`；resolver 换 `ElementPlusResolver({ importStyle: 'css' })`；manualChunks 增设 `element-plus` 独立 chunk。
2. **Task 1.2 重写**：主题桥接从「JS composable + ConfigProvider theme」改为纯 CSS——新建 `src/renderer/src/assets/styles/element-plus-bridge.css`，在 `style.css` 之前 import（保证覆盖顺序在 EP 样式之后生效）：

   ```css
   /* --el-* 桥接到 --kb-*。
      选择器用 html:root（特异性 0,1,1）而不是 :root：EP 的 dark/css-vars.css
      用 html.dark 声明了同名变量，:root 会被压过；html:root 与其同特异性，
      本文件排在 EP 样式之后 import，靠顺序取胜，明暗两套共用这一份声明
      （custom property 在 html 元素上按级联取值，.dark 换档后 var() 自动解析为暗色值） */
   html:root {
     --el-color-primary: var(--kb-brand);
     /* 派生色阶往 surface-bg 混而不是往白混：暗色下 EP 的 light-N 本应往深底混，
        引用 var(--kb-surface-bg) 后明暗自动各得其所 */
     --el-color-primary-light-3: color-mix(in srgb, var(--kb-brand) 70%, var(--kb-surface-bg));
     --el-color-primary-light-5: color-mix(in srgb, var(--kb-brand) 50%, var(--kb-surface-bg));
     --el-color-primary-light-7: color-mix(in srgb, var(--kb-brand) 30%, var(--kb-surface-bg));
     --el-color-primary-light-8: color-mix(in srgb, var(--kb-brand) 20%, var(--kb-surface-bg));
     --el-color-primary-light-9: color-mix(in srgb, var(--kb-brand) 10%, var(--kb-surface-bg));
     --el-color-primary-dark-2: color-mix(in srgb, var(--kb-brand) 80%, black);
     /* success/warning/danger/info 同构映射到 --kb-success/-warning/-error/-info */
     --el-color-danger: var(--kb-error);
     --el-color-error: var(--kb-error);
     --el-text-color-primary: var(--kb-text);
     --el-text-color-regular: var(--kb-text-secondary);
     --el-text-color-secondary: var(--kb-text-tertiary);
     --el-text-color-placeholder: var(--kb-text-quaternary);
     --el-border-color: var(--kb-border-input);
     --el-border-color-light: var(--kb-border);
     --el-border-color-lighter: var(--kb-border-soft);
     --el-fill-color-blank: var(--kb-surface-bg);
     --el-fill-color-light: var(--kb-muted-bg);
     --el-bg-color: var(--kb-surface-bg);
     --el-bg-color-overlay: var(--kb-surface-bg);
     --el-border-radius-base: 8px;   /* --kb-radius-md */
     --el-component-size: 32px;      /* --kb-control-height-md */
     --el-font-family: var(--kb-font-body);
   }
   ```

   main.ts import 顺序：`element-plus/theme-chalk/dark/css-vars.css` → `element-plus-bridge.css` → `style.css`；App.vue 包 `<el-config-provider :z-index="380">`。
3. **Task 1.3 spike 降级**：从「隔离决策门」降为常规同屏验证（编辑器 + el-* 组件共存、暗色、z-index 叠放），预期一次通过。
4. **风险登记表更新**：R2（antd.css 冲突）降为低；R1（上游维护）降为低；新增「EP 维护者投入减少的社区讨论」为观察项（适配层兜底已覆盖）。
5. **语雀视觉校准工作量略增**：antd 的 token 词汇（borderRadius/controlHeight）与语雀同源可直接对数，EP 需按上面映射表换算——一次性成本，已含在 bridge 文件里。

## 五、决策建议

| 如果你看重 | 选 |
| --- | --- |
| 长期维护确定性、最少的坑、更简单的主题机制 | **Element Plus** |
| 与语雀最大程度的设计同源（语雀=antd 系）、团队对 antd API 更熟 | ant-design-vue |

我的推荐：**Element Plus**。理由按权重排：① 本项目特有的 Lake antd.css 冲突直接不存在了（省掉整个最高风险环节）；② 上游健康度差距是结构性的；③ 主题/暗色机制与现有 token 体系同构（纯 CSS，无 JS 桥接层）；④ 代价只是视觉校准多一点，而这件事在适配层架构下无论如何都要做。

## 参考

- [element-plus（npm）](https://www.npmjs.com/package/element-plus)
- [Element Plus Config Provider 文档](https://element-plus.org/en-US/component/config-provider.html)（z-index / namespace props）
- [Element Plus 暗色模式文档](https://element-plus.org/en-US/guide/dark-mode.html)（html.dark + dark/css-vars.css）
- [ant-design-vue（npm）](https://www.npmjs.com/package/ant-design-vue)（4.2.6，维护模式公告见其 GitHub issue #7659）

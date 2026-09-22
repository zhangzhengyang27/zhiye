# 语雀 Token 体系移植实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用从语雀客户端提取的 design tokens 重建 xiaoye 项目的样式 token 层：品牌色换语雀绿、引入明暗双主题、清除组件内硬编码颜色，全部基于 Tailwind CSS 4 原生机制（不依赖 Nuxt UI，保持解耦以便日后移除）。

**Architecture:** 三层 token——原始色板（grey/green/blue/red/yellow/orange 六个色相 × 50–900，明暗两套，`.dark` 整体覆盖）→ 语义层（沿用现有 `--kb-*` 变量名，值改为引用原始层）→ 消费层（组件内联 `var(--kb-*)` + Tailwind `@theme inline` 暴露的 utility class）。暗色切换由 `@vueuse/core` 的 `useDark` 在 `<html>` 上切 `.dark` 类实现。

**Tech Stack:** Tailwind CSS 4（`@theme inline` / `@custom-variant dark`）、CSS 自定义属性、Vue 3 + @vueuse/core、Node 脚本（token 提取）。数据源：`/Users/xiaoye/Desktop/AI/知识库/yuque-source/build/renderer/*.theme.css`（语雀 v4.2.1 解包产物）。

**语雀调色板（已验证的真实值，执行时可由 Task 1 脚本再次全量导出）：**

| Token | 亮色 | 暗色 | | Token | 亮色 | 暗色 |
|---|---|---|---|---|---|---|
| grey-100 | #fafafa | #141414 | | green-50 | #ecfaf4 | #10211a |
| grey-200 | #f4f5f5 | #1f1f1f | | green-100 | #daf6ea | #0e2f22 |
| grey-300 | #eff0f0 | #292929 | | green-200 | #c7f0df | #255641 |
| grey-400 | #e7e9e8 | #333333 | | green-300 | #82edc0 | #18774f |
| grey-500 | #d8dad9 | #424242 | | green-400 | #45de9d | #298e64 |
| grey-600 | #bec0bf | #505050 | | green-500 | #0bd07d | #29ad76 |
| grey-700 | #8a8f8d | #848484 | | green-600 | #00b96b | #51b88d |
| grey-800 | #585a5a | #b3b3b3 | | green-700 | #009456 | #6bd1a6 |
| grey-900 | #262626 | #e2e2e2 | | green-800 | #00663b | #97d8bc |
| background-base | #ffffff | #141414 | | green-900 | #003d23 | #bce6d5 |
| blue-500/600/700 | #2f8ef4 / #117cee / #0c68ca | #2b6bb1 / #3b82ce / #689fd9 | | red-500/600/700 | #e4495b / #df2a3f / #ad1a2b | #b62536 / #ca3f4f / #cc7b84 |
| yellow-500/600/700 | #f3bb2f / #ecaa04 / #c99103 | #c29219 / #d2a638 / #e8be54 | | orange-500/600/700 | #f38f39 / #ed740c / #c75c00 | #bc6820 / #d37f36 / #de9f68 |

各色相 50–900 全阶值见 Task 1 脚本导出的 `docs/yuque-tokens.json`。暗色色阶方向反转（低阶=深、高阶=浅），保证语义（低阶做浅背景、高阶做深文字）在两种模式下一致——这是直接采用语雀暗色值的原因。

**语义规则（照抄语雀 antd 映射）：** 状态色 base=600 阶，hover=500 阶，active=700 阶，light=100 阶，bg=50 阶；主色 hover/active 用 700 阶。

---

### Task 1: 创建分支 + token 提取脚本

**Files:**
- Create: `scripts/extract-yuque-tokens.mjs`
- Create: `docs/yuque-tokens.json`（脚本产物，提交入库供查阅）

- [ ] **Step 1: 建工作分支**

```bash
cd /Users/xiaoye/Desktop/AI/知识库/xiaoye
git checkout -b feature/yuque-tokens
```

- [ ] **Step 2: 写提取脚本**

创建 `scripts/extract-yuque-tokens.mjs`（完整内容）：

```js
// 从语雀解包产物中提取明暗两套 --yq-* token，导出为 JSON 供移植参考。
// 用法: node scripts/extract-yuque-tokens.mjs [theme.css 路径]
import fs from 'node:fs'
import path from 'node:path'

const cssPath = process.argv[2] ?? '../yuque-source/build/renderer/app.theme.css'
const css = fs.readFileSync(path.resolve(cssPath), 'utf8')

// 语雀把色板(:root)与暗色(html[data-kumuhana=pouli])各拆成多个块，必须合并全部匹配
const light = {}
const dark = {}
for (const m of css.matchAll(/:root\{([^}]+)\}/g))
  for (const d of m[1].matchAll(/(--yq-[a-z0-9-]+):([^;}]+)/g)) light[d[1]] = d[2]
for (const m of css.matchAll(/html\[data-kumuhana=pouli\]\{([^}]+)\}/g))
  for (const d of m[1].matchAll(/(--yq-[a-z0-9-]+):([^;}]+)/g)) dark[d[1]] = d[2]

const out = { source: cssPath, extractedAt: new Date().toISOString(), light: {}, dark: {} }
for (const [k, v] of Object.entries(light)) out.light[k.slice(5)] = v
for (const [k, v] of Object.entries(dark)) out.dark[k.slice(5)] = v

fs.mkdirSync('docs', { recursive: true })
fs.writeFileSync('docs/yuque-tokens.json', JSON.stringify(out, null, 2))
console.log(`light: ${Object.keys(light).length} tokens, dark: ${Object.keys(dark).length} tokens -> docs/yuque-tokens.json`)
```

- [ ] **Step 3: 运行脚本并验证**

Run: `cd /Users/xiaoye/Desktop/AI/知识库/xiaoye && node scripts/extract-yuque-tokens.mjs`
Expected: 输出 `light: 655 tokens, dark: 497 tokens -> docs/yuque-tokens.json`

Run: `grep -c "yuque-green-500" docs/yuque-tokens.json`
Expected: `2`

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-yuque-tokens.mjs docs/yuque-tokens.json
git commit -m "chore: add yuque token extraction script and reference data"
```

---

### Task 2: 创建 tokens.css（原始色板 + 语义层，明暗两套）

**Files:**
- Create: `src/renderer/src/assets/styles/tokens.css`

本文件是整个改造的核心产物。原始色板照抄语雀暗色反转值；语义层沿用现有 `--kb-*` 名字（12 个消费文件零改动继续工作），值全部改为引用原始层。

- [ ] **Step 1: 写入完整 token 定义**

创建 `src/renderer/src/assets/styles/tokens.css`（完整内容）：

```css
/* ============================================================
 * Design Tokens —— 三层结构，色值移植自语雀 v4.2.1（明暗两套）
 * 1. 原始色板: --kb-grey-*, --kb-green-* 等（.dark 整体反转覆盖）
 * 2. 语义层:   --kb-brand / --kb-text / --kb-border 等（引用原始层，几乎不需要按模式覆写）
 * 3. 结构层:   radius / transition / z-index / font / layout（与颜色无关，单套）
 * ============================================================ */

:root {
  color-scheme: light;

  /* ---------- 1. 原始色板（亮色，源自语雀 :root） ---------- */
  --kb-white: #ffffff;
  --kb-black: #000000;
  --kb-background-base: #ffffff;

  --kb-grey-100: #fafafa;
  --kb-grey-200: #f4f5f5;
  --kb-grey-300: #eff0f0;
  --kb-grey-400: #e7e9e8;
  --kb-grey-500: #d8dad9;
  --kb-grey-600: #bec0bf;
  --kb-grey-700: #8a8f8d;
  --kb-grey-800: #585a5a;
  --kb-grey-900: #262626;

  --kb-green-50: #ecfaf4;
  --kb-green-100: #daf6ea;
  --kb-green-200: #c7f0df;
  --kb-green-300: #82edc0;
  --kb-green-400: #45de9d;
  --kb-green-500: #0bd07d;
  --kb-green-600: #00b96b;
  --kb-green-700: #009456;
  --kb-green-800: #00663b;
  --kb-green-900: #003d23;

  --kb-blue-50: #ecf4fd;
  --kb-blue-100: #d9eafc;
  --kb-blue-200: #c0ddfc;
  --kb-blue-300: #81bbf8;
  --kb-blue-400: #5fa8f6;
  --kb-blue-500: #2f8ef4;
  --kb-blue-600: #117cee;
  --kb-blue-700: #0c68ca;
  --kb-blue-800: #074a92;
  --kb-blue-900: #00346b;

  --kb-red-50: #fdf1f3;
  --kb-red-100: #fbe4e7;
  --kb-red-200: #f8ced3;
  --kb-red-300: #f1a2ab;
  --kb-red-400: #ea7583;
  --kb-red-500: #e4495b;
  --kb-red-600: #df2a3f;
  --kb-red-700: #ad1a2b;
  --kb-red-800: #8f0515;
  --kb-red-900: #70000d;

  --kb-yellow-50: #fcf5e6;
  --kb-yellow-100: #f9efcd;
  --kb-yellow-200: #f6e1ac;
  --kb-yellow-300: #f5d480;
  --kb-yellow-400: #f5cb61;
  --kb-yellow-500: #f3bb2f;
  --kb-yellow-600: #ecaa04;
  --kb-yellow-700: #c99103;
  --kb-yellow-800: #8f6600;
  --kb-yellow-900: #664900;

  --kb-orange-50: #fef2e9;
  --kb-orange-100: #fde6d3;
  --kb-orange-200: #f8d6b9;
  --kb-orange-300: #f8b881;
  --kb-orange-400: #f6a055;
  --kb-orange-500: #f38f39;
  --kb-orange-600: #ed740c;
  --kb-orange-700: #c75c00;
  --kb-orange-800: #944400;
  --kb-orange-900: #663000;

  /* ---------- 2. 语义层：品牌（语雀绿） ---------- */
  --kb-brand: var(--kb-green-600);
  --kb-brand-hover: var(--kb-green-700);
  --kb-brand-active: var(--kb-green-700);
  --kb-brand-light: var(--kb-green-100);
  --kb-brand-lighter: var(--kb-green-200);
  --kb-brand-ultra-light: var(--kb-green-50);

  /* ---------- 2. 语义层：状态色（base=600 / hover=500 / active=700 / light=100 / bg=50） ---------- */
  --kb-success: var(--kb-green-600);
  --kb-success-hover: var(--kb-green-500);
  --kb-success-active: var(--kb-green-700);
  --kb-success-light: var(--kb-green-100);
  --kb-success-bg: var(--kb-green-50);

  --kb-warning: var(--kb-yellow-600);
  --kb-warning-hover: var(--kb-yellow-500);
  --kb-warning-active: var(--kb-yellow-700);
  --kb-warning-light: var(--kb-yellow-100);
  --kb-warning-bg: var(--kb-yellow-50);

  --kb-error: var(--kb-red-600);
  --kb-error-hover: var(--kb-red-500);
  --kb-error-active: var(--kb-red-700);
  --kb-error-light: var(--kb-red-100);
  --kb-error-bg: var(--kb-red-50);

  --kb-info: var(--kb-blue-600);
  --kb-info-hover: var(--kb-blue-500);
  --kb-info-active: var(--kb-blue-700);
  --kb-info-light: var(--kb-blue-100);
  --kb-info-bg: var(--kb-blue-50);

  /* ---------- 2. 语义层：表面 / 边框 / 文字 ---------- */
  --kb-surface-bg: #ffffff;
  --kb-surface-soft-bg: var(--kb-grey-100);
  --kb-muted-bg: var(--kb-grey-100);
  --kb-border: var(--kb-grey-300);
  --kb-border-soft: var(--kb-grey-200);
  --kb-border-input: var(--kb-grey-400);

  --kb-text: var(--kb-grey-900);
  --kb-text-secondary: var(--kb-grey-800);
  --kb-text-tertiary: var(--kb-grey-700);
  --kb-text-quaternary: var(--kb-grey-600);

  /* ---------- 2. 语义层：背景 / 阴影 ---------- */
  --kb-shell-bg:
    radial-gradient(circle at top left, rgba(236, 250, 244, 0.92), transparent 22%),
    radial-gradient(circle at bottom right, rgba(17, 124, 238, 0.05), transparent 20%),
    linear-gradient(180deg, #fafafa 0%, #f4f5f5 42%, #eff0f0 100%);
  --kb-paper-shadow: 0 18px 44px rgba(0, 0, 0, 0.08);
  --kb-shell-outer-shadow: 0 30px 80px rgba(0, 0, 0, 0.28);
  --kb-panel-shadow: 0 24px 60px rgba(0, 0, 0, 0.1);
  --kb-card-shadow: 0 10px 28px rgba(0, 0, 0, 0.05);
  --kb-hover-shadow: 0 14px 34px rgba(0, 0, 0, 0.06);
  --kb-elevated-shadow: 0 20px 48px rgba(0, 0, 0, 0.1);

  /* ---------- 3. 结构层（与颜色无关，沿用现有值） ---------- */
  --kb-radius-sm: 10px;
  --kb-radius-md: 14px;
  --kb-radius-lg: 18px;
  --kb-radius-xl: 22px;
  --kb-radius-2xl: 28px;
  --kb-radius-3xl: 30px;
  --kb-radius-full: 999px;

  --kb-transition-fast: 120ms ease;
  --kb-transition-base: 180ms ease;
  --kb-transition-slow: 280ms ease;
  --kb-transition-spring: 350ms cubic-bezier(0.34, 1.56, 0.64, 1);

  --kb-z-dropdown: 100;
  --kb-z-sticky: 200;
  --kb-z-overlay: 300;
  --kb-z-modal: 400;
  --kb-z-toast: 500;

  --kb-font-display: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  --kb-font-body: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  --kb-font-mono: "SFMono-Regular", "JetBrains Mono", "Consolas", "Menlo", monospace;

  --kb-sidebar-width: 300px;
}

/* ---------- 暗色：整体反转原始色板（值源自语雀 html[data-kumuhana=pouli]） ---------- */
.dark {
  color-scheme: dark;

  --kb-white: #000000;
  --kb-black: #ffffff;
  --kb-background-base: #141414;

  --kb-grey-100: #141414;
  --kb-grey-200: #1f1f1f;
  --kb-grey-300: #292929;
  --kb-grey-400: #333333;
  --kb-grey-500: #424242;
  --kb-grey-600: #505050;
  --kb-grey-700: #848484;
  --kb-grey-800: #b3b3b3;
  --kb-grey-900: #e2e2e2;

  --kb-green-50: #10211a;
  --kb-green-100: #0e2f22;
  --kb-green-200: #255641;
  --kb-green-300: #18774f;
  --kb-green-400: #298e64;
  --kb-green-500: #29ad76;
  --kb-green-600: #51b88d;
  --kb-green-700: #6bd1a6;
  --kb-green-800: #97d8bc;
  --kb-green-900: #bce6d5;

  --kb-blue-50: #15212d;
  --kb-blue-100: #193048;
  --kb-blue-200: #253c56;
  --kb-blue-300: #1d4672;
  --kb-blue-400: #245a94;
  --kb-blue-500: #2b6bb1;
  --kb-blue-600: #3b82ce;
  --kb-blue-700: #689fd9;
  --kb-blue-800: #8db5e2;
  --kb-blue-900: #b5d0ed;

  --kb-red-50: #29191c;
  --kb-red-100: #402125;
  --kb-red-200: #5b2027;
  --kb-red-300: #741b25;
  --kb-red-400: #981f2d;
  --kb-red-500: #b62536;
  --kb-red-600: #ca3f4f;
  --kb-red-700: #cc7b84;
  --kb-red-800: #d49199;
  --kb-red-900: #e6bcc1;

  --kb-yellow-50: #241f15;
  --kb-yellow-100: #352d17;
  --kb-yellow-200: #564825;
  --kb-yellow-300: #775c18;
  --kb-yellow-400: #9c781c;
  --kb-yellow-500: #c29219;
  --kb-yellow-600: #d2a638;
  --kb-yellow-700: #e8be54;
  --kb-yellow-800: #efcf81;
  --kb-yellow-900: #eedeb4;

  --kb-orange-50: #251e18;
  --kb-orange-100: #382a1e;
  --kb-orange-200: #5e3b1d;
  --kb-orange-300: #774418;
  --kb-orange-400: #9d571b;
  --kb-orange-500: #bc6820;
  --kb-orange-600: #d37f36;
  --kb-orange-700: #de9f68;
  --kb-orange-800: #e0af85;
  --kb-orange-900: #e9cfb9;

  /* 语义层仅需覆写语雀特殊处理的主色与表面 */
  --kb-brand: #2ed790;
  --kb-brand-hover: var(--kb-green-400);
  --kb-brand-active: var(--kb-green-600);
  --kb-surface-bg: var(--kb-grey-200);
  --kb-surface-soft-bg: var(--kb-grey-200);
  --kb-shell-bg:
    radial-gradient(circle at top left, rgba(46, 215, 144, 0.06), transparent 22%),
    radial-gradient(circle at bottom right, rgba(59, 130, 206, 0.05), transparent 20%),
    linear-gradient(180deg, #141414 0%, #101010 42%, #0d0d0d 100%);
  --kb-paper-shadow: 0 18px 44px rgba(0, 0, 0, 0.5);
  --kb-shell-outer-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  --kb-panel-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  --kb-card-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  --kb-hover-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
  --kb-elevated-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 2: 自检关键变量完整性**

Run:
```bash
grep -c "^  --kb-" src/renderer/src/assets/styles/tokens.css
grep -c "^  --" src/renderer/src/assets/styles/tokens.css | head -1
for v in kb-brand kb-green-600 kb-grey-900 kb-text-quaternary kb-shell-bg; do
  grep -q -- "--$v:" src/renderer/src/assets/styles/tokens.css && echo "$v OK" || echo "$v MISSING"
done
```
Expected: 第一个计数 ≥ 60（语义+结构层）；循环输出 5 行 `OK`，无 `MISSING`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/assets/styles/tokens.css
git commit -m "feat(tokens): add yuque-derived token palette with light/dark modes"
```

---

### Task 3: style.css 接线（导入 tokens、@custom-variant dark、@theme inline、移除旧 ：root）

**Files:**
- Modify: `src/renderer/src/style.css:1-80`

- [ ] **Step 1: 替换文件头部**

将 `style.css` 第 1–80 行（`@import` 三行 + 整个 `:root { ... }` 块）替换为：

```css
@import "tailwindcss";
@import "@nuxt/ui";
@import "./assets/styles/enhanced-rich-blocks.css";
@import "./assets/styles/tokens.css";

/* Tailwind 暗色变体（类式，挂 <html>）。与 @nuxt/ui 内置定义一致；
   显式声明使未来移除 @nuxt/ui 后 dark: 前缀继续可用 */
@custom-variant dark (&:is(.dark, .dark *));

/* Tailwind 4 utility 映射：让模板里能写 bg-brand / text-ink-secondary / border-line 等。
   inline 模式使 utility 引用 var(--kb-*) 本体，暗色切换时自动跟随 */
@theme inline {
  /* 品牌 */
  --color-brand: var(--kb-brand);
  --color-brand-hover: var(--kb-brand-hover);
  --color-brand-active: var(--kb-brand-active);
  --color-brand-light: var(--kb-brand-light);
  --color-brand-lighter: var(--kb-brand-lighter);
  --color-brand-faint: var(--kb-brand-ultra-light);

  /* 灰阶 */
  --color-grey-100: var(--kb-grey-100);
  --color-grey-200: var(--kb-grey-200);
  --color-grey-300: var(--kb-grey-300);
  --color-grey-400: var(--kb-grey-400);
  --color-grey-500: var(--kb-grey-500);
  --color-grey-600: var(--kb-grey-600);
  --color-grey-700: var(--kb-grey-700);
  --color-grey-800: var(--kb-grey-800);
  --color-grey-900: var(--kb-grey-900);

  /* 状态色（success/warning/error/info × base/hover/active/light/bg） */
  --color-success: var(--kb-success);
  --color-success-hover: var(--kb-success-hover);
  --color-success-active: var(--kb-success-active);
  --color-success-light: var(--kb-success-light);
  --color-success-bg: var(--kb-success-bg);
  --color-warning: var(--kb-warning);
  --color-warning-hover: var(--kb-warning-hover);
  --color-warning-active: var(--kb-warning-active);
  --color-warning-light: var(--kb-warning-light);
  --color-warning-bg: var(--kb-warning-bg);
  --color-error: var(--kb-error);
  --color-error-hover: var(--kb-error-hover);
  --color-error-active: var(--kb-error-active);
  --color-error-light: var(--kb-error-light);
  --color-error-bg: var(--kb-error-bg);
  --color-info: var(--kb-info);
  --color-info-hover: var(--kb-info-hover);
  --color-info-active: var(--kb-info-active);
  --color-info-light: var(--kb-info-light);
  --color-info-bg: var(--kb-info-bg);

  /* 表面 / 边框 / 文字别名 */
  --color-surface: var(--kb-surface-bg);
  --color-surface-soft: var(--kb-surface-soft-bg);
  --color-muted: var(--kb-muted-bg);
  --color-line: var(--kb-border);
  --color-line-soft: var(--kb-border-soft);
  --color-line-input: var(--kb-border-input);
  --color-ink: var(--kb-text);
  --color-ink-secondary: var(--kb-text-secondary);
  --color-ink-tertiary: var(--kb-text-tertiary);
  --color-ink-quaternary: var(--kb-text-quaternary);
}
```

说明：旧 `:root` 中 radius/transition/z/font/sidebar 等 token 已整体迁入 `tokens.css`，此处不再保留；`html, body, #app { height: 100% }` 及之后的全部内容原样保留。

- [ ] **Step 2: 修正 body/selection/focus 引用（同文件）**

`body` 与全局规则里三处旧值改为 token 引用：

```css
::selection {
  background: rgba(0, 185, 107, 0.2);
  color: var(--kb-text);
}
```

（`:focus-visible` 的 `outline: 2px solid var(--kb-brand)` 与 `body` 的 `var(--kb-muted-bg)`/`var(--kb-text)` 不变——变量名没变，值已由 tokens.css 接管。）

- [ ] **Step 3: 构建验证**

Run: `npm run build:web 2>&1 | tail -5`
Expected: 构建成功，无 CSS 报错（tokens.css 中变量定义如打错名字，会在该步以 CSS 语法/导入错误形式暴露）

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/style.css
git commit -m "feat(tokens): wire token file into style.css and expose tailwind theme mapping"
```

---

### Task 4: 暗色模式切换（useDark composable + App.vue）

**Files:**
- Create: `src/renderer/src/composables/useThemeMode.ts`
- Modify: `src/renderer/src/App.vue`

- [ ] **Step 1: 写 composable**

创建 `src/renderer/src/composables/useThemeMode.ts`：

```ts
import { useDark } from "@vueuse/core"

/**
 * 主题模式切换。useDark 会在 <html> 上切换 .dark 类并持久化到
 * localStorage（key: vueuse-color-scheme），tokens.css 的 .dark 块随之生效。
 */
export function useThemeMode() {
  const isDark = useDark({
    selector: "html",
    attribute: "class",
    valueDark: "dark",
    valueLight: "",
  })

  function toggleTheme() {
    isDark.value = !isDark.value
  }

  return { isDark, toggleTheme }
}
```

- [ ] **Step 2: App.vue 接线**

在 `App.vue` 的 `<script setup>` 中加入（已有 import 区之后）：

```ts
import { useThemeMode } from "./composables/useThemeMode"

// 初始化主题（读取持久化偏好，决定 <html> 是否带 .dark）
useThemeMode()
```

- [ ] **Step 3: 验证切换生效**

Run: `npm run dev:web`（后台），浏览器控制台执行 `document.documentElement.classList.add('dark')`
Expected: 页面立即切换为暗色（背景 #141414、文字 #e2e2e2、按钮变 #2ed790）；移除类恢复亮色

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/composables/useThemeMode.ts src/renderer/src/App.vue
git commit -m "feat(theme): add dark mode toggle via useDark"
```

---

### Task 5: style.css 自身硬编码颜色清理

**Files:**
- Modify: `src/renderer/src/style.css`（`@layer components` 全部、`.ProseMirror`/`.tiptap` 段、scrollbar）

**统一映射表**（本任务与 Task 6–9 共用；`rgba(0,0,0,α)` 按透明度分档归入文字四级）：

| 硬编码值 | 替换为 |
|---|---|
| `#53b672` | `var(--kb-brand)` |
| `#3da35d` | `var(--kb-brand-hover)` |
| `#308a4c` | `var(--kb-brand-active)` |
| `#e8f7ed` | `var(--kb-brand-light)` |
| `#d1efda` | `var(--kb-brand-lighter)` |
| `#f6ffed` | `var(--kb-brand-ultra-light)`（作 success 背景处用 `var(--kb-success-bg)`） |
| `rgba(83,182,114,α)` | `rgba(0,185,107,α)`（green-600 同透明度） |
| `rgba(0,0,0,0.88)` | `var(--kb-text)` |
| `rgba(0,0,0,0.82/0.72/0.68/0.65)` | `var(--kb-text-secondary)` |
| `rgba(0,0,0,0.55/0.45/0.42)` | `var(--kb-text-tertiary)` |
| `rgba(0,0,0,0.4/0.35/0.25)` | `var(--kb-text-quaternary)` |
| `#faf9f7` / `#f8f7f4` | `var(--kb-muted-bg)` |
| `#f1f1ef` | `var(--kb-grey-200)` |
| `#e8e7e4` | `var(--kb-grey-300)` |
| `#ece7de` / `#ebe7e0` | `var(--kb-border)` |
| `#e6e1da` / `#d9d9d9` | `var(--kb-border-input)` |
| `#d6e6d9` / `#b6dbbf` / `#edf9f0` | `var(--kb-brand-lighter)` / `var(--kb-brand-lighter)` / `var(--kb-brand-ultra-light)` |
| 背景用途 `#fff` / `rgba(255,255,255,0.9x)` | `var(--kb-surface-bg)` |
| `#fffdfb` | `var(--kb-surface-soft-bg)` |
| `#f5222d` / `#cf1322` / `#ffccc7` / `#fff1f0` | `var(--kb-error)` / `var(--kb-error-hover)` / `var(--kb-error-light)` / `var(--kb-error-bg)` |
| `#52c41a` / `#389e0d` / `#d9f7be` | `var(--kb-success)` / `var(--kb-success-hover)` / `var(--kb-success-light)` |
| `#faad14` / `#d48806` / `#fff1b8` / `#fffbe6` | `var(--kb-warning)` / `var(--kb-warning-hover)` / `var(--kb-warning-light)` / `var(--kb-warning-bg)` |
| `#1677ff` / `#0958d9` / `#bae0ff` / `#e6f4ff` | `var(--kb-info)` / `var(--kb-info-hover)` / `var(--kb-info-light)` / `var(--kb-info-bg)` |
| `rgb(229 231 235)` | `var(--kb-border)` |
| `rgb(249 250 251)` | `var(--kb-muted-bg)` |
| `rgb(55 65 81)` / `rgb(75 85 99)` | `var(--kb-text-secondary)` |
| `rgb(156 163 175)` | `var(--kb-text-quaternary)` |
| `rgb(191 219 254)` | `var(--kb-info-light)` |
| `rgb(37 99 235)` / `rgb(29 78 216)` / `rgb(96 165 250)` | `var(--kb-info)` / `var(--kb-info-hover)` / `var(--kb-info)` |
| `rgb(59 130 246 / 0.12)` | `rgba(17, 124, 238, 0.12)` |
| `rgb(37 99 235)`（.column-resize-handle） | `var(--kb-info)` |

**白名单（保留字面值，不替换）：**
1. `.kb-code-block--one-dark-pro` / `--slate` / `--github-light` 全部背景/文字色 + 所有 `.hljs-*` 语法高亮色——这是代码内容配色方案，不属于 UI token；
2. 阴影中的 `rgba(0,0,0,x)` / `rgba(15,23,42,x)`——明暗两态通用；
3. 彩色背景上的 `color: #fff` / `color: white`——主按钮文字恒为白色。

- [ ] **Step 1: 清理 @layer components**

逐个类替换（示例，`.kb-card-elevated`）：

```css
/* 改前 */
.kb-card-elevated {
  border: 1px solid #ece7de;
  background: rgba(255, 255, 255, 0.98);
}

/* 改后 */
.kb-card-elevated {
  border: 1px solid var(--kb-border);
  background: var(--kb-surface-bg);
}
```

按映射表处理全部 22 个组件类（kb-surface、kb-panel-shell、kb-icon-button、kb-quiet-card、kb-stat-card、kb-muted-chip、kb-input-shell、kb-empty-state、kb-list-row、kb-section-shell、kb-section-card、kb-hover-card、kb-soft-chip、kb-meta-chip、kb-action-button 系列、kb-float-chip、kb-glass、kb-gradient-text 等）。

- [ ] **Step 2: 清理 .ProseMirror 与 .tiptap 段**

示例（blockquote）：

```css
/* 改前 */
.tiptap blockquote {
  border-left: 3px solid rgb(191 219 254);
  background: rgb(249 250 251);
  color: rgb(75 85 99);
}

/* 改后 */
.tiptap blockquote {
  border-left: 3px solid var(--kb-info-light);
  background: var(--kb-muted-bg);
  color: var(--kb-text-secondary);
}
```

`.tiptap` 的标题色 `rgba(0,0,0,0.88)` → `var(--kb-text)`；表格、链接、代码、placeholder、`.has-focus`、`.selectedCell`、`.column-resize-handle` 按映射表处理。

- [ ] **Step 3: 验收**

Run: `grep -cE '#(53b672|d1efda|ece7de|faf9f7|f1f1ef|3da35d|f8f7f4|ebe7e0|f5222d)' src/renderer/src/style.css`
Expected: `0`

Run: `npm run build:web 2>&1 | tail -3`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/style.css
git commit -m "refactor(style): replace hard-coded colors in base styles with tokens"
```

---

### Task 6: 共享组件硬编码清理

**Files:**
- Modify: `src/renderer/src/components/common/AppInput.vue`
- Modify: `src/renderer/src/components/knowledge/KnowledgePageShell.vue`
- Modify: `src/renderer/src/components/knowledge/KnowledgePageHero.vue`
- Modify: `src/renderer/src/components/knowledge/KnowledgeFilterToolbar.vue`
- Modify: `src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarNav.vue`
- Modify: `src/renderer/src/assets/styles/enhanced-rich-blocks.css`

- [ ] **Step 1: 逐文件枚举硬编码颜色**

```bash
for f in src/renderer/src/components/common/AppInput.vue \
         src/renderer/src/components/knowledge/KnowledgePageShell.vue \
         src/renderer/src/components/knowledge/KnowledgePageHero.vue \
         src/renderer/src/components/knowledge/KnowledgeFilterToolbar.vue \
         src/renderer/src/components/knowledge/sidebar/KnowledgeSidebarNav.vue \
         src/renderer/src/assets/styles/enhanced-rich-blocks.css; do
  echo "== $f"; grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' "$f" | head -20
done
```

- [ ] **Step 2: 按 Task 5 映射表替换**

模板里的 Tailwind 任意值类（如 `text-[rgba(0,0,0,0.65)]`、`bg-[#f6ffed]`）优先换成映射出的 utility（`text-ink-secondary`、`bg-brand-faint`）；`<style>` 内的替换为 `var(--kb-*)`。示例：

```vue
<!-- 改前 -->
<span class="text-[rgba(0,0,0,0.45)]">最近编辑 {{ time }}</span>

<!-- 改后 -->
<span class="text-ink-tertiary">最近编辑 {{ time }}</span>
```

白名单同样适用（若有代码高亮类配色则保留）。

- [ ] **Step 3: 验收**

Run: `grep -cE '#(53b672|d1efda|f6ffed|ece7de|faf9f7)' src/renderer/src/components/common/AppInput.vue src/renderer/src/components/knowledge/*.vue src/renderer/src/components/knowledge/sidebar/*.vue src/renderer/src/assets/styles/enhanced-rich-blocks.css`
Expected: 所有文件计数为 `0`

Run: `npm run typecheck && npm run build:web 2>&1 | tail -3`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A src/renderer/src/components src/renderer/src/assets/styles
git commit -m "refactor(components): tokenize shared knowledge components"
```

---

### Task 7: 知识库视图清理（第一批）

**Files:**
- Modify: `src/renderer/src/views/knowledge/KnowledgeWorkspaceHomeView.vue`（45 处）
- Modify: `src/renderer/src/views/knowledge/KnowledgeWorkspaceLayout.vue`（40 处）
- Modify: `src/renderer/src/views/knowledge/KnowledgeOverviewView.vue`
- Modify: `src/renderer/src/views/knowledge/KnowledgeRecentView.vue`
- Modify: `src/renderer/src/views/knowledge/KnowledgeSearchView.vue`
- Modify: `src/renderer/src/views/knowledge/KnowledgeFavoritesView.vue`

- [ ] **Step 1: 枚举各文件硬编码颜色**

```bash
for f in src/renderer/src/views/knowledge/KnowledgeWorkspaceHomeView.vue \
         src/renderer/src/views/knowledge/KnowledgeWorkspaceLayout.vue \
         src/renderer/src/views/knowledge/KnowledgeOverviewView.vue \
         src/renderer/src/views/knowledge/KnowledgeRecentView.vue \
         src/renderer/src/views/knowledge/KnowledgeSearchView.vue \
         src/renderer/src/views/knowledge/KnowledgeFavoritesView.vue; do
  echo "== $f"; grep -cE '#[0-9a-fA-F]{3,8}\b|rgba?\(' "$f"
done
```

- [ ] **Step 2: 按 Task 5 映射表替换**（规则与示例同 Task 6）

- [ ] **Step 3: 验收**

Run: `grep -rlE '#(53b672|d1efda|f6ffed|faf9f7|f1f1ef|3da35d)' src/renderer/src/views/knowledge/ | wc -l`
Expected: `0`（输出 0 行）

Run: `npm run typecheck && npm run build:web 2>&1 | tail -3`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A src/renderer/src/views/knowledge
git commit -m "refactor(views): tokenize knowledge workspace views"
```

---

### Task 8: 视图清理（第二批：登录/账户/共享）

**Files:**
- Modify: `src/renderer/src/views/auth/LoginView.vue`（38 处）
- Modify: `src/renderer/src/views/auth/AccountView.vue`
- Modify: `src/renderer/src/views/knowledge/KnowledgeDriveSharesView.vue`（96 处，最大户）
- Modify: `src/renderer/src/components/knowledge/KnowledgeHomeReplica.vue`（52 处）
- Modify: `src/renderer/src/views/public/DriveShareView.vue`（53 处）

- [ ] **Step 1: 枚举各文件硬编码颜色**

```bash
for f in src/renderer/src/views/auth/LoginView.vue \
         src/renderer/src/views/auth/AccountView.vue \
         src/renderer/src/views/knowledge/KnowledgeDriveSharesView.vue \
         src/renderer/src/components/knowledge/KnowledgeHomeReplica.vue \
         src/renderer/src/views/public/DriveShareView.vue; do
  echo "== $f"; grep -cE '#[0-9a-fA-F]{3,8}\b|rgba?\(' "$f"
done
```

- [ ] **Step 2: 按 Task 5 映射表替换**（规则与示例同 Task 6 Step 2：模板任意值类换 utility，style 块换 var(--kb-*)，白名单保留）

- [ ] **Step 3: 验收**

Run: `grep -cE '#(53b672|d1efda|f6ffed|faf9f7|f1f1ef|ece7de|3da35d)' src/renderer/src/views/auth/*.vue src/renderer/src/views/knowledge/KnowledgeDriveSharesView.vue src/renderer/src/components/knowledge/KnowledgeHomeReplica.vue src/renderer/src/views/public/*.vue`
Expected: 所有文件计数为 `0`

Run: `npm run typecheck && npm run build:web 2>&1 | tail -3`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A src/renderer/src/views src/renderer/src/components
git commit -m "refactor(views): tokenize auth, account and share views"
```

---

### Task 9: 编辑器组件清理

**Files:**
- Modify: `src/renderer/src/components/editor/RichTextEditor.vue`（82 处）
- Modify: `src/renderer/src/components/editor/extensions/EditorCodeBlockNode.vue`（81 处）

**特别规则：** `EditorCodeBlockNode.vue` 里代码块主题（one-dark-pro / slate / github-light）与 `.hljs-*` 高亮色是内容配色，全部保留字面值；只清理工具栏、边框、容器等结构性颜色。`RichTextEditor.vue` 的工具栏/气泡菜单/占位符颜色按映射表替换。

- [ ] **Step 1: 枚举两文件硬编码颜色并区分结构色与主题色**

```bash
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/renderer/src/components/editor/RichTextEditor.vue | head -30
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src/renderer/src/components/editor/extensions/EditorCodeBlockNode.vue | head -40
```

- [ ] **Step 2: 按映射表替换结构色，主题色加白名单注释**

在保留的主题色代码块上方加一行注释说明保留原因：

```css
/* 代码高亮主题色板（one-dark-pro 等）为内容配色，不接入 UI token */
```

- [ ] **Step 3: 验收**

Run: `grep -cE '#(53b672|d1efda|f6ffed|faf9f7|ece7de)' src/renderer/src/components/editor/RichTextEditor.vue`
Expected: `0`

Run: `npm run typecheck && npm run build:web 2>&1 | tail -3`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/editor
git commit -m "refactor(editor): tokenize editor structural colors, keep syntax themes"
```

---

### Task 10: 终验（全局验收 + 冒烟）

- [ ] **Step 1: 全局硬编码残留扫描（白名单外应为零）**

Run:
```bash
grep -rohE '#[0-9a-fA-F]{3,8}\b' src/renderer/src --include="*.vue" --include="*.css" | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn | head -15
```
Expected: 残留仅限白名单——代码块主题色（#282c34/#1f2329/#abb2bf/#c678dd/#98c379/#d19a66/#56b6c2/#61afef/#7f848e 等）、`#fff`/`#ffffff`（彩色背景上的文字）、github-light 主题色。原 TOP 高频（#53b672×174、#d1efda×113、#ece7de×101、rgba(0,0,0,0.45)×158 等）全部消失。

- [ ] **Step 2: 冒烟测试**

Run: `npm run smoke:account && npm run smoke:workspace`
Expected: 两个冒烟脚本全部通过

- [ ] **Step 3: 明暗两态人工目检**

Run: `npm run dev:web`，逐页检查（登录页 / 工作台首页 / 文档编辑器 / 文件共享页 / 账户设置），每页切换 `.dark` 类确认：
- 亮色：语雀绿按钮、灰阶中性背景、无暖色残留（旧 #ece7de 米色边框应已消失）
- 暗色：背景 #141414、卡片 #1f1f1f、文字 #e2e2e2、主按钮 #2ed790，无白底残留、无不可读文字

- [ ] **Step 4: 收尾提交**

```bash
git add -A
git commit -m "chore: finalize yuque token migration" --allow-empty
```

---

## 风险与说明

1. **Nuxt UI 解耦**：全程不改 Nuxt UI 配置、不依赖 `--ui-*` 变量。`@custom-variant dark` 已显式声明，未来移除 `@import "@nuxt/ui"` 一行即可，token 层零改动。若 Tailwind 对重复的 dark 变体定义有告警，属良性（两处定义行为一致）。
2. **旧绿→新绿的视觉跳变**：品牌色从 #53b672 换为 #00b96b，所有依赖绿色的渐变/阴影/选区色已同步换算（rgba 83,182,114 → 0,185,107）。
3. **暖纸色→中性灰**：旧 token 的米色系（#ece7de/#faf9f7/#f8f7f4）统一并入党雀中性灰阶，页面整体从"暖纸"转为"冷灰"，这是采用语雀值体系的必然结果。
4. **暗色阴影**：暗色下阴影加深而非消除，保证浮层层次感；若目检觉得过重，调 tokens.css `.dark` 块中 shadow 组即可，只动一处。
5. **语雀数据源版权**：token 色值与命名结构仅作个人项目设计参考，提取脚本与 JSON 不要对外分发。

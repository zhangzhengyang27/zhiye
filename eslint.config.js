import js from "@eslint/js"
import tseslint from "typescript-eslint"
import pluginVue from "eslint-plugin-vue"
import prettier from "eslint-plugin-prettier/recommended"

const browserGlobals = {
  AbortController: "readonly",
  AbortSignal: "readonly",
  BeforeUnloadEvent: "readonly",
  Blob: "readonly",
  ClipboardEvent: "readonly",
  CustomEvent: "readonly",
  DOMParser: "readonly",
  DataTransfer: "readonly",
  DragEvent: "readonly",
  Element: "readonly",
  Event: "readonly",
  File: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  HTMLElement: "readonly",
  HTMLCanvasElement: "readonly",
  HTMLImageElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLTextAreaElement: "readonly",
  Image: "readonly",
  IntersectionObserver: "readonly",
  KeyboardEvent: "readonly",
  MouseEvent: "readonly",
  MutationObserver: "readonly",
  Node: "readonly",
  Request: "readonly",
  ResizeObserver: "readonly",
  Response: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  alert: "readonly",
  cancelAnimationFrame: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  confirm: "readonly",
  console: "readonly",
  crypto: "readonly",
  document: "readonly",
  fetch: "readonly",
  getComputedStyle: "readonly",
  history: "readonly",
  CSS: "readonly",
  CSSLayerBlockRule: "readonly",
  CSSLayerStatementRule: "readonly",
  CSSMediaRule: "readonly",
  CSSSupportsRule: "readonly",
  CSSContainerRule: "readonly",
  NodeFilter: "readonly",
  PointerEvent: "readonly",
  localStorage: "readonly",
  location: "readonly",
  navigator: "readonly",
  performance: "readonly",
  requestAnimationFrame: "readonly",
  sessionStorage: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  structuredClone: "readonly",
  window: "readonly",
}

const nodeGlobals = {
  Buffer: "readonly",
  Blob: "readonly",
  File: "readonly",
  FormData: "readonly",
  Headers: "readonly",
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  global: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
}

export default [
  {
    ignores: [
      "dist/**",
      "out/**",
      "release/**",
      "docs/**",
      "coverage/**",
      "node_modules/**",
      "**/components.d.ts",
      "**/offline-icons.generated.json",
      // 删除事故恢复期的隔离/暂存区：历史件与外仓误植件，不参与 lint（说明见目录内 README）
      "_quarantine-2026-09-22/**",
      "_recovered-usable/**",
      "_compiled-from-cache/**",
      "output/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  prettier,
  {
    files: ["*.js", "**/*.js", "*.mjs", "**/*.mjs", "*.cjs", "**/*.cjs"],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    files: ["*.ts", "**/*.ts", "*.tsx", "**/*.tsx"],
    languageOptions: {
      globals: nodeGlobals,
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx,vue}"],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...browserGlobals,
      },
    },
  },
  {
    files: ["*.vue", "**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    // v-html 的内容统一经 utils/sanitize.ts（DOMPurify 白名单）清洗后才注入，
    // vue/no-v-html 无法静态识别 computed 中间层，属于误报，放行
    files: [
      "src/renderer/src/components/snippets/SnippetDetailPreviewSection.vue",
      "src/renderer/src/components/snippets/SnippetInsertDetail.vue",
      "src/renderer/src/components/snippets/SnippetRenderPreview.vue",
    ],
    rules: {
      "vue/no-v-html": "off",
    },
  },
  {
    rules: {
      "vue/multi-word-component-names": "off",
      // 防退化：新代码不得新增 any / 显式类型压制（生成物已 ignore）
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
          "ts-expect-error": "allow-with-description",
        },
      ],
    },
  },
  {
    // scripts/ 下的 probe/verify/tmp 是 Playwright 浏览器上下文的一次性探针与
    // 补丁脚本：需要在 node 环境外引用 document/getComputedStyle 等浏览器全局，
    // 且未使用变量/空 catch 属于探针常态，不做主源码级别的苛求。
    // 置于配置末尾：压过上方无范围的防退化块。
    files: ["scripts/**/*.{js,mjs,cjs,ts,mts}"],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...browserGlobals,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // 部分探针脚本会在局部重新声明 document 等同名句柄
      "no-redeclare": "off",
    },
  },
]

/**
 * 冒烟/验证脚本公共工具库（2026-09-22 复原重建）。
 *
 * 工作区 09-21 删除事故中本文件随两仓丢失；按全部消费脚本（smoke:workspace
 * 与 verify-* 系列）的 import 契约与调用形态重建。要点：
 * - 统一 --no-proxy-server：本机代理（Clash）会劫持无头浏览器 localhost 请求
 *   （ERR_CONNECTION_CLOSED），冒烟/验证只访问本地服务，强制不走系统代理；
 * - 登录走真实 UI（demo 账号），token 从 localStorage 的 tools-web-auth-session 读取；
 * - API 直连后端 :3200/api（Bearer），错误抛 Error（含服务端 message）。
 */
import { chromium } from "playwright"

const DEFAULT_ACCOUNT = "demo@example.com"
const DEFAULT_PASSWORD = "123456"
const DEFAULT_BASE_URL = "http://127.0.0.1:4173"
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3200/api"

/** 运行配置：环境变量可覆盖（SMOKE_ACCOUNT/SMOKE_PASSWORD/SMOKE_BASE_URL/SMOKE_HEADED）。 */
export const smokeConfig = {
  account: process.env.SMOKE_ACCOUNT || DEFAULT_ACCOUNT,
  password: process.env.SMOKE_PASSWORD || DEFAULT_PASSWORD,
  baseUrl: process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL,
  apiBaseUrl: process.env.SMOKE_API_BASE_URL || DEFAULT_API_BASE_URL,
  headed: process.env.SMOKE_HEADED === "1" || process.env.SMOKE_HEADED === "true",
  timeout: Number(process.env.SMOKE_TIMEOUT || 30_000),
}

/** 步骤日志（统一前缀，便于在并行输出里分辨来源脚本）。 */
export function logStep(prefix, message) {
  console.log(`${prefix} ${message}`)
}

/** 诊断收集器：console.error 与未捕获页面异常分桶记录。 */
export function createDiagnostics() {
  return { consoleErrors: [], pageErrors: [] }
}

/** 挂接 page 的 console/pageerror 监听，写入诊断桶。 */
export function attachPageDiagnostics(page, diagnostics) {
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.consoleErrors.push(`[dbg ${response.status()}] ${response.url()}`)
    }
  })
  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push(message.text())
    }
  })
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(String(error?.message ?? error))
  })
}

/** 断言无页面异常/控制台错误（调用方按需先过滤已知白名单）。 */
export function assertNoPageErrors(diagnostics) {
  if (diagnostics.pageErrors.length > 0) {
    throw new Error(`页面异常：${diagnostics.pageErrors.join(" | ")}`)
  }
  if (diagnostics.consoleErrors.length > 0) {
    throw new Error(`控制台错误：${diagnostics.consoleErrors.join(" | ")}`)
  }
}

/**
 * 创建浏览器与页面。本机代理劫持 localhost 的坑见文件头——必须带 --no-proxy-server。
 * options: { headless, viewport:{width,height}, hasTouch, isMobile }
 */
export async function createBrowserPage(options = {}) {
  const browser = await chromium.launch({
    headless: !smokeConfig.headed,
    args: ["--no-proxy-server"],
  })

  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 960 },
    hasTouch: options.hasTouch || false,
    isMobile: options.isMobile || false,
  })

  const page = await context.newPage()

  return { browser, context, page }
}

/** 真实 UI 登录（demo 账号），成功后默认落在 /knowledge。 */
export async function loginThroughUi(page, prefix, targetPath = "/knowledge") {
  logStep(prefix, `使用账号 ${smokeConfig.account} 登录`)
  await page.goto(new globalThis.URL("/auth/login", smokeConfig.baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  })

  await page.getByRole("textbox", { name: "账号" }).fill(smokeConfig.account)
  await page.getByRole("textbox", { name: "密码" }).fill(smokeConfig.password)
  await page.getByRole("button", { name: "登录并进入" }).click()
  await page
    .waitForURL(new globalThis.URL(targetPath, smokeConfig.baseUrl).origin + "/**", {
      timeout: smokeConfig.timeout,
    })
    .catch(() => {})
  await page.waitForTimeout(800)

  // 09-21 认证加固后 token 仅存内存（localStorage 只存登录标记），
  // UI 登录后补一次 API 登录取 accessToken 供脚本 Bearer 调用
  const loginResponse = await fetch(`${smokeConfig.apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: smokeConfig.account, password: smokeConfig.password }),
  })
  if (loginResponse.ok) {
    const payload = await loginResponse.json().catch(() => ({}))
    lastApiToken = payload?.accessToken ?? ""
  }

  logStep(prefix, "登录完成")
}

/** 最近一次 API 登录的 accessToken（09-21 加固后 token 不落 localStorage）。 */
let lastApiToken = ""

export async function readAccessToken(_page) {
  return lastApiToken
}

/** 直连后端 API 的 fetch 封装：非 2xx 抛错（带服务端 message）。 */
export async function apiRequest(
  path,
  { method = "GET", token, body, errorMessage = "请求失败" } = {},
) {
  // 字符串拼接而非 new URL(path, base)：base 自带 /api 前缀，URL 语义会用绝对 path 覆盖掉它
  const response = await fetch(`${smokeConfig.apiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = payload?.message
    const detailText = Array.isArray(detail) ? detail.join("；") : detail
    throw new Error(detailText ? `${errorMessage}：${detailText}` : errorMessage)
  }

  return payload
}

/** 树结构拍平（含子级深度）。 */
export function flattenTree(nodes, depth = 0) {
  const result = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1))
    }
  }
  return result
}

/** 按名确保知识库存在（复用同名，避免冒烟残留堆积）。 */
export async function ensureKnowledgeBase(token, prefix, name) {
  const kbs = await apiRequest("/knowledge/knowledge-bases", {
    token,
    errorMessage: "读取知识库列表失败",
  })
  const existed = (Array.isArray(kbs) ? kbs : []).find((kb) => kb.name === name)
  if (existed) return existed

  logStep(prefix, `创建知识库 ${name}`)
  return apiRequest("/knowledge/knowledge-bases", {
    method: "POST",
    token,
    body: { name, description: `${prefix} 自动创建` },
    errorMessage: "创建知识库失败",
  })
}

/** 按标题确保文档存在（可选带标准内容；创建端点不带内容时由调用方 PATCH）。 */
export async function ensureDocument(kbId, token, options = {}) {
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kbId)}`, {
    token,
    errorMessage: "读取文档树失败",
  })

  const allNodes = flattenTree(Array.isArray(tree) ? tree : [])
  const existed = allNodes.find(
    (node) => node.type === "doc" && (!options.title || node.title === options.title),
  )
  if (existed) return existed

  return apiRequest("/knowledge/documents", {
    method: "POST",
    token,
    body: {
      kbId,
      title: options.title || "Smoke 验收文档",
      status: options.status || "draft",
      type: "doc",
      content: {
        scheme: "text/markdown",
        value: options.content || "# Smoke 验收\n\n用于知识库前端 smoke 验证。",
      },
    },
    errorMessage: "创建文档失败",
  })
}

/** 确保文档已收藏（先查后收藏）。 */
export async function ensureFavoriteDocument(kbId, token, options = {}) {
  const document = await ensureDocument(kbId, token, options)

  const existsResult = await apiRequest(`/knowledge/favorites/exists/${document.id}`, { token })
  if (!existsResult?.favorited) {
    await apiRequest("/knowledge/favorites", {
      method: "POST",
      token,
      body: { documentId: document.id },
    })
  }

  return document
}

/** 确保文档产生近期浏览记录（POST view）。 */
export async function ensureRecentDocument(kbId, token, options = {}) {
  const document = await ensureDocument(kbId, token, options)
  await apiRequest(`/knowledge/documents/${document.id}/view`, { method: "POST", token }).catch(
    () => {},
  )
  return document
}

/** 确保文档在回收站（先 trash）。 */
export async function ensureTrashedDocument(kbId, token, options = {}) {
  const document = await ensureDocument(kbId, token, options)
  await apiRequest(`/knowledge/documents/${document.id}/trash`, { method: "POST", token }).catch(
    () => {},
  )
  return document
}

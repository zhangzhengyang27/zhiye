/**
 * 账号设置冒烟：登录 → 侧栏头像入口进账户页 → 资料更新 → 头像裁剪上传 → 修改密码 → 退出重登校验持久化。
 *
 * 入口与选择器对照当前源码（2026-09-13 修复）：
 * - 进入账户页走真实用户路径：侧栏头部头像按钮（KnowledgeSidebarHeader，title=用户名）
 *   → open-account → /account；旧「当前账号」账号卡 + 「进入账号设置」按钮已随
 *   09-11 侧栏语雀化重构（72143d1）移除。
 * - 昵称/手机号输入框：09-07 账号页重设计（9739d7f）后为行式布局（span 标签与输入框
 *   无 label 包裹、无 accessible name），按行结构定位。
 * - 修改密码：改为「修改密码」按钮打开 AppDialog，确认按钮文案为「确认修改」。
 * - 头像上传后断言：旧「头像链接」输入框已移除，改为回读保存后的服务端资料（GET /users/me）。
 *
 * 已知限制（非脚本缺陷）：头像上传依赖对象存储（现 MinIO/S3，见 xiaoye-server .env），
 * 存储隧道/bucket 不可用时会在头像步失败。
 */
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { smokeConfig } from "./lib/knowledge-smoke-utils.mjs"

const STEP_PREFIX = "[smoke:account]"
const PNG_FIXTURE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAA6ElEQVR4nO2XQQ6DMAwE+///c6lVhYqFvXoJmAq1I7tvL1cJgR9g8wQAAAB4TT4B+4mx4X8dx8m5A8eZbM7L7q2W7jCvmgQ2ckW3rYTRkK6b0hi5gZJb6o0W8QX0m1x8N3Q+8GptY2cM0c8v0j8/1C2gEtp0k3mW6h9M6gPqKcH5O8r1L9Jq5S7g6BBN8YjkmkJzdoN1e2R6xN6s3cQb4kTQjD4g2tM7S7IEmZ9zq1m+1L8TjM9kq5K0+1n1c3z8L3S8O4Cz0c9bM8fNQ8QZKJ6vX6G5Cq0CqW6A1a1u9XQAAAPgqNn0B7cD6V0Wm8P8AAAAASUVORK5CYII="

// 默认地址/账号/超时统一复用 lib smokeConfig 的默认逻辑（4173 preview，SMOKE_* 环境变量可覆盖）；
// 本脚本另有 SMOKE_NEW_PASSWORD 专属变量在此处理
const baseUrl = smokeConfig.baseUrl
const apiBaseUrl = smokeConfig.apiBaseUrl
const account = smokeConfig.account
const password = smokeConfig.password
const newPassword = process.env.SMOKE_NEW_PASSWORD || buildNextPassword(password)
const timeout = smokeConfig.timeout
const headed = smokeConfig.headed

const cleanupState = {
  originalProfile: null,
  profileChanged: false,
  passwordState: "original",
}

const consoleErrors = []
const pageErrors = []

function logStep(message) {
  console.log(`${STEP_PREFIX} ${message}`)
}

function buildNextPassword(currentPassword) {
  const trimmedPassword = currentPassword.trim()

  if (!trimmedPassword) {
    return "123456A1#"
  }

  const suffix = "A1#"
  const basePassword = trimmedPassword.slice(0, 128 - suffix.length)
  const candidate = `${basePassword}${suffix}`

  if (candidate !== trimmedPassword) {
    return candidate
  }

  return `${trimmedPassword.slice(0, 125)}B2!`
}

async function parseJson(response) {
  const bodyText = await response.text()
  return bodyText ? JSON.parse(bodyText) : null
}

async function apiRequest(routePath, options = {}) {
  const headers = new Headers(options.headers || {})

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`)
  }

  let body = options.body

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
    body = JSON.stringify(body)
  }

  const normalizedPath = routePath.startsWith("/") ? routePath : `/${routePath}`
  const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
    method: options.method || "GET",
    headers,
    body,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`${options.errorMessage || "接口请求失败"} (${response.status}): ${errorBody}`)
  }

  if (response.status === 204) {
    return null
  }

  return parseJson(response)
}

async function loginByApi(currentPassword) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: {
      account,
      password: currentPassword,
    },
    errorMessage: "登录失败",
  })
}

async function ensureBaselineSession() {
  try {
    return await loginByApi(password)
  } catch (originalLoginError) {
    try {
      const recoverySession = await loginByApi(newPassword)
      await apiRequest("/users/me/change-password", {
        method: "POST",
        token: recoverySession.accessToken,
        body: {
          currentPassword: newPassword,
          newPassword: password,
        },
        errorMessage: "恢复基线密码失败",
      })

      return await loginByApi(password)
    } catch {
      throw originalLoginError
    }
  }
}

function serializeProfile(profile) {
  return {
    displayName: profile.displayName,
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    avatar: profile.avatar ?? "",
  }
}

/** 与 KnowledgeSidebarMenu.currentUserLabel 同源的侧栏用户名兜底链（头像按钮的 title 值） */
function sidebarUserLabelFromProfile(profile) {
  return profile.displayName || profile.email || profile.phone || "未命名用户"
}

/**
 * 账户页行式设置项的输入框定位：行结构为
 * `<div class="flex items-center ..."><span>昵称</span><AppInput/></div>`，
 * 行标签与输入框无 label 包裹（无 accessible name），按「span 精确文本的直接父行」定位。
 */
function profileRowInput(page, rowLabel) {
  return page.locator(`div:has(> span:text-is("${rowLabel}")) input`)
}

async function createAvatarFixture() {
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), "xiaoye-account-smoke-"))
  const fixturePath = path.join(fixtureDir, "avatar-test.png")
  await writeFile(fixturePath, Buffer.from(PNG_FIXTURE_BASE64, "base64"))
  return fixturePath
}

async function waitForToast(page, text) {
  // EP el-notification 为堆叠制（同文本可多条共存，如两次「保存修改」间隔短于 toast 存活期），
  // 旧 StatusToast 单实例语义下可直接 getByText；这里取栈顶（DOM 序最新）一条断言即可
  await page.getByText(text, { exact: true }).last().waitFor({
    state: "visible",
    timeout,
  })
}

async function loginThroughUi(page, currentPassword) {
  logStep(`使用账号 ${account} 登录`)
  await page.goto(new URL("/auth/login", baseUrl).toString(), {
    waitUntil: "networkidle",
  })

  await page.getByRole("textbox", { name: "账号" }).fill(account)
  await page.getByRole("textbox", { name: "密码" }).fill(currentPassword)

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/knowledge", { timeout }),
    page.getByRole("button", { name: "登录并进入" }).click(),
  ])
}

async function openAccountPageFromSidebar(page, userLabel) {
  logStep("通过侧栏头像按钮进入账号设置页")
  // 真实用户路径：侧栏头部头像按钮（title=用户名）单击直达 /account（open-account 事件）；
  // title 兜底链与 KnowledgeSidebarMenu.currentUserLabel 同源，头像图加载失败也不影响定位
  await page.locator("aside").getByTitle(userLabel).click()

  await page.waitForURL((url) => url.pathname === "/account", { timeout })

  await profileRowInput(page, "昵称").waitFor({
    state: "visible",
    timeout,
  })
}

async function saveProfile(page) {
  const saveResponse = page.waitForResponse(
    (response) => {
      return (
        response.url().includes("/api/users/me") &&
        response.request().method() === "PATCH" &&
        response.status() === 200
      )
    },
    { timeout },
  )

  await page.getByRole("button", { name: "保存修改" }).click()

  await saveResponse
  await waitForToast(page, "账号资料已更新。")
}

async function changePasswordThroughUi(page, currentPassword, nextPassword) {
  const passwordResponse = page.waitForResponse(
    (response) => {
      return (
        response.url().includes("/api/users/me/change-password") &&
        response.request().method() === "POST" &&
        response.status() === 201
      )
    },
    { timeout },
  )

  // 09-07 账号页重设计后修改密码收进 AppDialog：先点「修改密码」打开弹窗再填写
  await page.getByRole("button", { name: "修改密码" }).click()
  await page.getByRole("textbox", { name: "当前密码" }).fill(currentPassword)
  await page.getByRole("textbox", { name: "新密码", exact: true }).fill(nextPassword)
  await page.getByRole("textbox", { name: "确认新密码" }).fill(nextPassword)
  // 弹窗确认按钮文案（旧版内联卡片为「更新密码」）
  await page.getByRole("button", { name: "确认修改" }).click()

  await passwordResponse
  await waitForToast(page, "密码已更新。下次登录请使用新密码。")
}

async function restoreByApi() {
  if (!cleanupState.originalProfile) {
    return
  }

  const candidatePasswords =
    cleanupState.passwordState === "new" ? [newPassword, password] : [password, newPassword]

  let activeSession = null

  for (const candidatePassword of candidatePasswords) {
    try {
      activeSession = await loginByApi(candidatePassword)
      break
    } catch {
      // 尝试下一个密码
    }
  }

  if (!activeSession?.accessToken) {
    throw new Error("清理失败，无法获取有效登录态")
  }

  const accessToken = activeSession.accessToken

  if (cleanupState.profileChanged) {
    logStep("通过接口恢复原始账号资料")
    await apiRequest("/users/me", {
      method: "PATCH",
      token: accessToken,
      body: serializeProfile(cleanupState.originalProfile),
      errorMessage: "恢复账号资料失败",
    })
    cleanupState.profileChanged = false
  }

  if (cleanupState.passwordState === "new") {
    logStep("通过接口恢复原始密码")
    await apiRequest("/users/me/change-password", {
      method: "POST",
      token: accessToken,
      body: {
        currentPassword: newPassword,
        newPassword: password,
      },
      errorMessage: "恢复原始密码失败",
    })
    cleanupState.passwordState = "original"
  }
}

async function main() {
  assert.notEqual(
    password,
    newPassword,
    "SMOKE_NEW_PASSWORD 生成失败，请显式提供一个与 SMOKE_PASSWORD 不同的新密码。",
  )

  const browser = await chromium.launch({
    headless: !headed,
    // 本机代理（127.0.0.1:7890）会劫持 localhost 请求（见 AGENTS.md 已知坑 1），与其余 smoke 脚本一致固定绕行
    args: ["--no-proxy-server"],
  })
  const context = await browser.newContext()
  const page = await context.newPage()
  const avatarFixturePath = await createAvatarFixture()
  let failureScreenshotPath

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text())
    }
  })

  page.on("pageerror", (error) => {
    pageErrors.push(error.message)
  })

  try {
    logStep(`开始联调，前端地址 ${baseUrl.toString()}`)

    const originalLogin = await ensureBaselineSession()
    cleanupState.originalProfile = await apiRequest("/users/me", {
      token: originalLogin.accessToken,
      errorMessage: "读取原始账号资料失败",
    })

    await loginThroughUi(page, password)
    await openAccountPageFromSidebar(
      page,
      sidebarUserLabelFromProfile(cleanupState.originalProfile),
    )

    const nicknameSuffix = String(Date.now()).slice(-6)
    const nextDisplayName = `联调${nicknameSuffix}`
    const nextPhone = `139${String(Date.now()).slice(-8)}`

    logStep("验证资料更新链路")
    await profileRowInput(page, "昵称").fill(nextDisplayName)
    await profileRowInput(page, "手机号").fill(nextPhone)
    await saveProfile(page)
    cleanupState.profileChanged = true

    logStep("验证头像裁剪与上传链路")
    await page.locator('input[type="file"]').setInputFiles(avatarFixturePath)
    await page.getByRole("heading", { name: "裁剪头像" }).waitFor({
      state: "visible",
      timeout,
    })

    const uploadResponse = page.waitForResponse(
      (response) => {
        return (
          response.url().includes("/api/knowledge/oss/upload") &&
          response.request().method() === "POST" &&
          response.status() === 201
        )
      },
      { timeout },
    )

    await page.getByRole("button", { name: "确认裁剪" }).click()
    await uploadResponse
    await waitForToast(page, "头像上传成功，保存后生效。")
    await saveProfile(page)

    // 旧版通过「头像链接」输入框回读；该输入框已随账号页重设计移除，
    // 改为回读保存后的服务端资料断言已写入对象存储公开地址。
    // 09-11 存储迁移（aliyun-oss → MinIO/S3）后公开 URL 由 S3_PUBLIC_BASE_URL
    // 生成为 http://，故协议断言放宽为 https?://（语义不变：非空、非 data: 的真实地址）
    const profileAfterAvatarSave = await apiRequest("/users/me", {
      token: originalLogin.accessToken,
      errorMessage: "回读账号资料失败",
    })
    assert.match(
      profileAfterAvatarSave?.avatar ?? "",
      /^https?:\/\/.+/,
      "头像上传后未写入有效对象存储地址",
    )

    logStep("验证修改密码链路")
    await changePasswordThroughUi(page, password, newPassword)
    cleanupState.passwordState = "new"

    logStep("验证新密码可重新登录")
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/auth/login", { timeout }),
      page.getByRole("button", { name: "退出登录" }).click(),
    ])

    await loginThroughUi(page, newPassword)
    await openAccountPageFromSidebar(page, nextDisplayName)

    const persistedDisplayName = await profileRowInput(page, "昵称").inputValue()
    const persistedPhone = await profileRowInput(page, "手机号").inputValue()
    assert.equal(persistedDisplayName, nextDisplayName, "昵称更新未持久化")
    assert.equal(persistedPhone, nextPhone, "手机号更新未持久化")

    assert.equal(consoleErrors.length, 0, `页面出现 console error: ${consoleErrors.join(" | ")}`)
    assert.equal(pageErrors.length, 0, `页面出现运行时错误: ${pageErrors.join(" | ")}`)

    logStep("冒烟验证通过")
  } catch (error) {
    const screenshotDir = path.join(os.tmpdir(), "xiaoye-account-smoke-artifacts")
    await mkdir(screenshotDir, { recursive: true })
    failureScreenshotPath = path.join(screenshotDir, `account-settings-failure-${Date.now()}.png`)
    await page.screenshot({
      path: failureScreenshotPath,
      fullPage: true,
    })
    console.error(`${STEP_PREFIX} 失败截图已保存到 ${failureScreenshotPath}`)
    throw error
  } finally {
    await browser.close()
    await restoreByApi()
  }
}

main().catch((error) => {
  console.error(
    `${STEP_PREFIX} ${error instanceof Error ? error.stack || error.message : String(error)}`,
  )
  process.exitCode = 1
})

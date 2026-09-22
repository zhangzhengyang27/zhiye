/* global window */
/**
 * 桌面端锁定（#27）+ 反馈直达（#30）验收（Web 端 Playwright 真跑 + 桌面桩桥）。
 *
 * 前置：后端 :3200 + `pnpm build:web` + `pnpm preview:web --port 4173 --host 127.0.0.1`。
 * 用法：`node scripts/verify-desktop-lock.mjs`（或 `pnpm verify:desktop-lock`）。
 *
 * Web 端能验：设置页锁定组控件结构与交互（桩桥模拟主进程锁定 IPC 的载荷契约）、
 * 「锁定桌面端 ⌘L」快捷键条目点亮（桩桥注册链路）、/lock 锁定窗渲染层 UI 与校验
 * 状态机（错误/冷却/解锁）、mailto 反馈载荷（侧栏 + 关于组）。
 * 跑不到（待真机，`pnpm dev --remoteDebuggingPort=9222`）：LockWindow 真窗
 * （全屏/置顶/skipTaskbar/close 拦截）、sha256 快照落盘、失焦自动锁定计时、
 * 连错 5 次主进程冷却、原生 Application 菜单/托盘/Help 菜单项、系统级 ⌘L。
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import {
  attachPageDiagnostics,
  assertNoPageErrors,
  createBrowserPage,
  createDiagnostics,
  loginThroughUi,
  logStep,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

/**
 * 假 xiaoyeDesktop：带可变锁定状态的桩。setLockPassword/clearLockPassword 会真的
 * 改 hasPassword 并校验当前密码（口令在桩内存里，页面可用 window.__lockPassword 覆盖），
 * verifyLockPassword 按 window.__lockVerify（fail/cooldown/ok）返回三种校验结果。
 */
const FAKE_DESKTOP_BRIDGE = `
  (() => {
    const calls = []
    window.__bridgeCalls = calls
    const record = (name, payload) => {
      calls.push([name, payload === undefined ? null : payload])
    }
    const lockState = { hasPassword: false, autoLockOnBlur: false, autoLockDelayMinutes: 1, locked: false }
    let storedPassword = window.__lockPassword || "lock1234"
    window.xiaoyeDesktop = {
      isDesktop: true,
      platform: "darwin",
      getServerBaseUrl: () => "",
      getWebBaseUrl: () => "",
      getConfig: () => Promise.resolve({ serverBaseUrl: "", webBaseUrl: "", platform: "darwin", appVersion: "0.0.0" }),
      openDocumentInNewWindow: () => Promise.resolve({ opened: true }),
      notify: () => Promise.resolve({ shown: true }),
      onTrayCommand: () => () => {},
      getOpenAtLogin: () => Promise.resolve(true),
      setOpenAtLogin: () => Promise.resolve(true),
      setProxySettings: () => Promise.resolve(true),
      setTrayVisible: () => Promise.resolve(true),
      setGlobalShortcut: payload => {
        record("setGlobalShortcut", JSON.parse(JSON.stringify(payload)))
        return Promise.resolve(true)
      },
      openExternal: url => {
        record("openExternal", url)
        return Promise.resolve(true)
      },
      getLockState: () => Promise.resolve({ ...lockState }),
      setLockPassword: payload => {
        record("setLockPassword", JSON.parse(JSON.stringify(payload)))
        if (lockState.hasPassword && payload.currentPassword !== storedPassword) {
          return Promise.resolve({ ok: false, reason: "unauthorized" })
        }
        storedPassword = payload.newPassword
        lockState.hasPassword = true
        return Promise.resolve({ ok: true })
      },
      clearLockPassword: currentPassword => {
        record("clearLockPassword", typeof currentPassword === "string" ? "len:" + currentPassword.length : null)
        if (currentPassword !== storedPassword) {
          return Promise.resolve({ ok: false, reason: "unauthorized" })
        }
        lockState.hasPassword = false
        lockState.autoLockOnBlur = false
        return Promise.resolve({ ok: true })
      },
      verifyLockPassword: password => {
        record("verifyLockPassword", typeof password === "string" ? "len:" + password.length : null)
        const mode = window.__lockVerify || "fail"
        if (mode === "ok") return Promise.resolve({ ok: true })
        if (mode === "cooldown") return Promise.resolve({ ok: false, reason: "cooldown", waitSeconds: 30 })
        return Promise.resolve({ ok: false, reason: "mismatch", remainingAttempts: 4 })
      },
      setAutoLock: payload => {
        record("setAutoLock", JSON.parse(JSON.stringify(payload)))
        lockState.autoLockOnBlur = payload.enabled
        lockState.autoLockDelayMinutes = payload.delayMinutes
        return Promise.resolve({ ...lockState })
      },
      lockNow: () => {
        record("lockNow")
        return Promise.resolve({ locked: true })
      },
      unlockAfterLogout: () => {
        record("unlockAfterLogout")
        return Promise.resolve({ ok: true })
      },
    }
  })()
`

const PREFIX = "[desktop-lock]"

let checks = 0

const pass = label => {
  checks += 1
  logStep(PREFIX, `✓ ${label}`)
}

const check = async (label, fn) => {
  await fn()
  pass(label)
}

const bridgeCalls = async page => page.evaluate(() => window.__bridgeCalls)

/** goto + 稳定等待：networkidle 可能早于 Vue 异步路由组件挂载完成。 */
const gotoStable = async (page, pathname) => {
  await page.goto(new URL(pathname, smokeConfig.baseUrl).toString(), { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
}

/** mailto 断言：subject 带版本、body 带平台与 UA 摘要。 */
const assertFeedbackMailto = rawUrl => {
  assert.match(rawUrl, /^mailto:feedback@example\.com\?/)
  const url = new URL(rawUrl)
  const subject = decodeURIComponent(url.searchParams.get("subject") ?? "")
  const body = decodeURIComponent(url.searchParams.get("body") ?? "")
  assert.match(subject, /知识库问题反馈（v\d+\.\d+\.\d+）/)
  assert.ok(body.includes("请描述你遇到的问题"), "body 缺问题描述引导")
  assert.ok(body.includes("应用版本：0."), "body 缺应用版本")
  assert.ok(body.includes("平台：darwin"), "body 缺平台")
  assert.ok(body.includes("User Agent："), "body 缺 UA 摘要")
}

const run = async () => {
  const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
  const diagnostics = createDiagnostics()
  attachPageDiagnostics(page, diagnostics)

  try {
    await loginThroughUi(page, PREFIX)
    await readAccessToken(page)

    // ---------------- Web 真态：锁定组整体禁用 ----------------
    await gotoStable(page, "/settings")

    await check("Web 端锁定组：状态未启用、开启锁定禁用并标注仅桌面端可用", async () => {
      assert.ok((await page.getByText("应用锁定模式：未启用").count()) >= 1)
      assert.equal(await page.getByRole("button", { name: "开启锁定" }).isDisabled(), true)
      assert.ok((await page.getByText("仅桌面端可用").count()) >= 1)
      assert.equal(await page.locator('[data-testid="lock-password-toggle"]').count(), 0)
    })

    // ---------------- 桌面桩桥：锁定组交互与 IPC 载荷契约 ----------------
    await page.context().addInitScript(FAKE_DESKTOP_BRIDGE)
    await gotoStable(page, "/settings")

    await check("桌面态锁定组：设置密码/开启锁定/失焦自动锁定控件齐备（无密码时后两者禁用）", async () => {
      assert.equal(await page.locator('[data-testid="lock-password-toggle"]').count(), 1)
      assert.equal(await page.getByRole("button", { name: "设置锁定密码" }).count(), 1)
      assert.equal(await page.locator('[data-testid="lock-now"].is-disabled').count(), 1)
      assert.equal(await page.locator('[data-testid="lock-auto-switch"].is-disabled').count(), 1)
      // EP 的 el-select 把 is-disabled 放在内层 wrapper 上（同 verify-desktop-settings 的 change-language）
      assert.equal(await page.locator('[data-testid="lock-delay"] .el-select__wrapper.is-disabled').count(), 1)
    })

    await check("设置锁定密码：两遍不一致被拦；一致后经 IPC 下发且状态翻已启用", async () => {
      await page.click('[data-testid="lock-password-toggle"]')
      await page.getByPlaceholder("设置新密码（4-32 位）").fill("lock1234")
      await page.getByPlaceholder("再次输入新密码").fill("lock1235")
      await page.click('[data-testid="lock-password-save"]')
      assert.equal(await page.getByText("两次输入的密码不一致").count(), 1)

      await page.getByPlaceholder("再次输入新密码").fill("lock1234")
      await page.click('[data-testid="lock-password-save"]')
      await page.waitForTimeout(300)
      const calls = await bridgeCalls(page)
      const applied = calls.filter(([name]) => name === "setLockPassword").pop()
      assert.deepEqual(applied?.[1], { newPassword: "lock1234" })
      assert.ok((await page.getByText("应用锁定模式：已启用").count()) >= 1)
      assert.equal(await page.getByRole("button", { name: "修改锁定密码" }).count(), 1)
    })

    await check("失焦自动锁定：开关联动延迟档可点，载荷为 {enabled, delayMinutes}", async () => {
      assert.equal(await page.locator('[data-testid="lock-auto-switch"].is-disabled').count(), 0)
      await page.click('[data-testid="lock-auto-switch"]')
      await page.waitForTimeout(250)
      let calls = await bridgeCalls(page)
      assert.deepEqual(calls.filter(([name]) => name === "setAutoLock").pop()?.[1], {
        enabled: true,
        delayMinutes: 1,
      })

      await page.click('[data-testid="lock-delay"]')
      await page.getByRole("option", { name: "15 分钟", exact: true }).click()
      await page.waitForTimeout(250)
      calls = await bridgeCalls(page)
      assert.deepEqual(calls.filter(([name]) => name === "setAutoLock").pop()?.[1], {
        enabled: true,
        delayMinutes: 15,
      })
    })

    await check("修改锁定密码：当前密码错误被主进程拒回；正确后新密码下发", async () => {
      await page.click('[data-testid="lock-password-toggle"]')
      assert.equal(await page.getByPlaceholder("请输入当前密码").count(), 1)

      await page.getByPlaceholder("请输入当前密码").fill("wrong")
      await page.getByPlaceholder("设置新密码（4-32 位）").fill("lock4321")
      await page.getByPlaceholder("再次输入新密码").fill("lock4321")
      await page.click('[data-testid="lock-password-save"]')
      await page.waitForTimeout(250)
      assert.equal(await page.getByText("当前密码不正确").count(), 1)

      await page.getByPlaceholder("请输入当前密码").fill("lock1234")
      await page.click('[data-testid="lock-password-save"]')
      await page.waitForTimeout(300)
      const calls = await bridgeCalls(page)
      const applied = calls.filter(([name]) => name === "setLockPassword").pop()
      assert.deepEqual(applied?.[1], { currentPassword: "lock1234", newPassword: "lock4321" })
    })

    await check("清除锁定密码：需当前密码，成功后回到未启用且自动锁定关闭", async () => {
      await page.click('[data-testid="lock-password-toggle"]')
      await page.getByPlaceholder("请输入当前密码").fill("lock4321")
      await page.click('[data-testid="lock-password-clear"]')
      await page.waitForTimeout(300)
      assert.ok((await page.getByText("应用锁定模式：未启用").count()) >= 1)
      assert.equal(await page.locator('[data-testid="lock-now"].is-disabled').count(), 1)
      assert.equal(await page.locator('[data-testid="lock-auto-switch"].is-disabled').count(), 1)
      // 重新设回密码，给失焦开关恢复可交互态（后续无依赖，仅保持状态干净）
      await page.click('[data-testid="lock-password-toggle"]')
      await page.getByPlaceholder("设置新密码（4-32 位）").fill("lock1234")
      await page.getByPlaceholder("再次输入新密码").fill("lock1234")
      await page.click('[data-testid="lock-password-save"]')
      await page.waitForTimeout(300)
    })

    // ---------------- 快捷键条目点亮（⌘L 随既有 globalShortcut 机制） ----------------
    await check("「锁定桌面端 ⌘L」条目点亮：可编辑、默认 ⌘ L、随启动回灌注册", async () => {
      assert.equal(await page.$$eval(".kb-shortcut-input.is-disabled", nodes => nodes.length), 1)
      const lockTip = await page.$$eval(".kb-shortcut-tip", nodes => nodes[4]?.textContent.trim())
      assert.equal(lockTip, "⌘ L")
      const calls = await bridgeCalls(page)
      const lockRegistration = calls
        .filter(([name]) => name === "setGlobalShortcut")
        .map(([, payload]) => payload)
        .find(payload => payload.key === "lockWindow")
      assert.deepEqual(lockRegistration, { key: "lockWindow", value: "CommandOrControl+L" })
    })

    // ---------------- 反馈直达（#30）：侧栏与关于组 ----------------
    await gotoStable(page, "/knowledge")

    await check("侧栏「更多 → 问题反馈」：mailto 预填版本/平台/UA（主进程 shell.openExternal 契约）", async () => {
      await page.getByRole("button", { name: /^更多/ }).click()
      await page.click('[data-testid="sidebar-feedback"]')
      await page.waitForTimeout(300)
      const calls = await bridgeCalls(page)
      const applied = calls.filter(([name]) => name === "openExternal").pop()?.[1]
      assertFeedbackMailto(String(applied))
    })

    await check("关于组「问题反馈」已点亮，点击走同一 mailto 载荷", async () => {
      await gotoStable(page, "/settings")
      assert.equal(await page.locator('[data-testid="kb-feedback"].is-disabled').count(), 0)
      await page.click('[data-testid="kb-feedback"]')
      await page.waitForTimeout(300)
      const calls = await bridgeCalls(page)
      const applied = calls.filter(([name]) => name === "openExternal").pop()?.[1]
      assertFeedbackMailto(String(applied))
    })

    // ---------------- /lock 锁定窗渲染层 UI 与校验状态机 ----------------
    await gotoStable(page, "/lock")

    await check("锁定窗 UI：标题/密码输入/解锁/退出登录齐备", async () => {
      assert.ok((await page.getByText("知识库已锁定").count()) >= 1)
      // el-input 会把 data-testid 透传给内层 <input>，这里直接按占位文案定位输入框
      assert.equal(await page.getByPlaceholder("请输入锁定密码").count(), 1)
      assert.equal(await page.locator('[data-testid="lock-unlock"]').count(), 1)
      assert.equal(await page.locator('[data-testid="lock-logout"]').count(), 1)
    })

    await check("密码错误：提示剩余尝试次数（主进程 5 次口径）", async () => {
      await page.getByPlaceholder("请输入锁定密码").fill("wrong")
      await page.click('[data-testid="lock-unlock"]')
      await page.waitForTimeout(250)
      assert.equal(await page.getByText("密码错误，还可尝试 4 次").count(), 1)
    })

    await check("连错 5 次冷却：提示等待秒数、输入与解锁禁用", async () => {
      await page.evaluate(() => {
        window.__lockVerify = "cooldown"
      })
      await page.getByPlaceholder("请输入锁定密码").fill("wrong")
      await page.click('[data-testid="lock-unlock"]')
      await page.waitForTimeout(250)
      assert.ok((await page.getByText("尝试次数已达上限，请等待 30 秒后重试").count()) >= 1)
      assert.equal(await page.locator('[data-testid="lock-unlock"].is-disabled').count(), 1)
    })

    await check("解锁成功：无错误态（真实关闭由主进程销毁锁定窗完成）", async () => {
      // 冷却中的输入框被禁用，刷新一页恢复干净状态；桩模式须在导航后再设（导航会清 window 态）
      await gotoStable(page, "/lock")
      await page.evaluate(() => {
        window.__lockVerify = "ok"
      })
      await page.getByPlaceholder("请输入锁定密码").fill("right")
      await page.click('[data-testid="lock-unlock"]')
      await page.waitForTimeout(250)
      assert.equal(await page.locator('[data-testid="lock-error"]').count(), 0)
      const calls = await bridgeCalls(page)
      assert.equal(calls.filter(([name]) => name === "verifyLockPassword").length >= 1, true)
    })

    await check("锁定窗「退出登录」：清会话后请求主进程关窗（unlockAfterLogout）", async () => {
      await gotoStable(page, "/lock")
      await page.click('[data-testid="lock-logout"]')
      await page.waitForTimeout(400)
      const calls = await bridgeCalls(page)
      assert.equal(calls.filter(([name]) => name === "unlockAfterLogout").length >= 1, true)
    })

    // ---------------- 主进程产物结构断言（菜单/托盘/IPC 通道在打包产物里） ----------------
    const mainBundlePath = path.resolve("out/main/index.js")
    if (fs.existsSync(mainBundlePath)) {
      const mainBundle = fs.readFileSync(mainBundlePath, "utf-8")
      await check("主进程产物含锁定与反馈装配（菜单/托盘/IPC 通道字面量）", async () => {
        for (const needle of [
          "锁定桌面端",
          "问题反馈",
          "mailto:",
          "feedback@example.com",
          "xiaoye:lock:set-password",
          "xiaoye:lock:verify-password",
          "xiaoye:lock:set-auto-lock",
          "xiaoye:lock:unlock-after-logout",
        ]) {
          assert.ok(mainBundle.includes(needle), `主进程产物缺少 ${needle}`)
        }
      })
    } else {
      logStep(PREFIX, "跳过主进程产物断言（out/main/index.js 不存在，请先 pnpm build）")
    }

    assertNoPageErrors(diagnostics)

    logStep(PREFIX, `通过 ${checks} 项断言`)
    logStep(PREFIX, "未覆盖（Web 端跑不到，需 pnpm dev --remoteDebuggingPort=9222 真机走查）：")
    logStep(PREFIX, "  LockWindow 真窗行为（全屏置顶/skipTaskbar/close 拦截）、sha256 快照落盘")
    logStep(PREFIX, "  userData/desktop-settings.json、失焦自动锁定计时、连错 5 次主进程冷却、")
    logStep(PREFIX, "  Application 菜单/托盘/Help 菜单的锁定与反馈项、系统级 ⌘L 按键触发")
  } finally {
    await browser.close()
  }
}

run().catch(error => {
  console.error(`${PREFIX} 失败：`, error.message)
  process.exitCode = 1
})

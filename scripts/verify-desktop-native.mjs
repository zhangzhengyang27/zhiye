/* global localStorage, window, AbortSignal */
/**
 * 桌面端真跑验收（CDP 连到 `pnpm dev --remoteDebuggingPort=9222` 起的实例）。
 * 只验 Web 端跑不到的部分：代理落到 session、globalShortcut 真注册与占用回退、
 * 开机自启系统真值、状态栏图标显隐、快照落盘。用完即还原现场。
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { chromium } from "playwright"

/** userData 目录名取自 package.json 的 name（xiaoye），不是 app.setName 的「知识库」——
 *  两个候选都探一次，取真实存在的那个。 */
const SNAP =
  ["xiaoye", "知识库"]
    .map(name => path.join(os.homedir(), "Library/Application Support", name, "desktop-settings.json"))
    .find(candidate => fs.existsSync(candidate)) ?? ""
const step = msg => console.log(`[桌面] ${msg}`)
let checks = 0
const ok = msg => {
  checks += 1
  step(`✓ ${msg}`)
}

const readSnapshot = () => {
  try {
    return JSON.parse(fs.readFileSync(SNAP, "utf-8"))
  } catch {
    return null
  }
}

const cdp = await chromium.connectOverCDP("http://127.0.0.1:9222")
const context = cdp.contexts()[0]
const page = context.pages().find(p => !p.url().startsWith("devtools"))
assert.ok(page, "没找到应用窗口")
step(`已连接 ${page.url()}`)

const goto = async path => {
  await page.goto(new URL(path, page.url()).toString(), { waitUntil: "domcontentloaded" }).catch(() => {})
  await page.waitForTimeout(1500)
}

// 登录态：没有会话就先登录
if (!/knowledge|settings/.test(page.url())) {
  await page.getByRole("textbox", { name: "账号" }).fill("demo@example.com")
  await page.getByRole("textbox", { name: "密码" }).fill("123456")
  await page.getByRole("button", { name: "登录并进入" }).click()
  await page.waitForURL(/knowledge/, { timeout: 20_000 })
  step("已登录")
}

const bridge = () => page.evaluate(() => window.xiaoyeDesktop?.getConfig?.() ?? null)
const cfg = await bridge()
assert.ok(cfg?.serverBaseUrl, "preload 桥接不可用（说明连的不是桌面端）")
ok(`桌面端桥接可用，后端 ${cfg.serverBaseUrl}`)

// ---------- 1. macOS 分组齐备 ----------
await goto("/settings")
const titles = await page.$$eval(".kb-settings-group > h2, .kb-proxy-wrapper > h2", nodes =>
  nodes.map(node => node.textContent.trim())
)
assert.deepEqual(titles, [
  "颜色主题",
  "语言和时间",
  "启动和登录",
  "全局快捷键",
  "桌面端锁定",
  "代理设置",
  "其他设置",
  "加入内测版体验计划",
  "关于知识库",
])
ok(`9 个分组齐备（macOS 的「其他设置」在位）`)

// ---------- 2. 开机自启：记录 → 真开 → 断言 → 还原 ----------
const beforeAutoLogin = await page.evaluate(() => window.xiaoyeDesktop.getOpenAtLogin())
const turnedOn = await page.evaluate(v => window.xiaoyeDesktop.setOpenAtLogin(v), !beforeAutoLogin)
const afterOn = await page.evaluate(() => window.xiaoyeDesktop.getOpenAtLogin())
assert.equal(turnedOn, true, "setOpenAtLogin 未成功")
assert.equal(afterOn, !beforeAutoLogin, "系统真值未随写入翻转")
await page.evaluate(v => window.xiaoyeDesktop.setOpenAtLogin(v), beforeAutoLogin)
const restored = await page.evaluate(() => window.xiaoyeDesktop.getOpenAtLogin())
assert.equal(restored, beforeAutoLogin, "开机自启未还原")
ok(`开机自启真跑并还原（原值 ${beforeAutoLogin} → 翻转 ${afterOn} → 还原 ${restored}）`)

// ---------- 3. globalShortcut：真注册 + 占用回退 ----------
const acc = (key, value) =>
  page.evaluate(([k, v]) => window.xiaoyeDesktop.setGlobalShortcut({ key: k, value: v }), [key, value])

const registered = await acc("openMainWindow", "CommandOrControl+Alt+Y")
assert.equal(registered, true, "默认全局快捷键注册失败")
ok("globalShortcut 注册成功（⌘⌥Y）")

const dup = await acc("openMiniWindow", "CommandOrControl+Alt+Y")
assert.equal(dup, false, "重复组合键应被判定为占用")
ok("同一组合键二次注册被拒（占用回退路径生效）")

const cancelled = await acc("openMiniWindow", "NO_SHORTCUT")
assert.equal(cancelled, true)
const freed = await acc("openMiniWindow", "CommandOrControl+Alt+Y")
assert.equal(freed, false, "取消后仍占用说明 unregister 没走通")
await acc("openMiniWindow", "CommandOrControl+Shift+Y")
await acc("openMainWindow", "CommandOrControl+Alt+Y")
ok("取消（NO_SHORTCUT）会真正注销，随后同键可再注册")

const snapAfterShortcuts = readSnapshot()
assert.equal(snapAfterShortcuts?.globalShortcuts?.openMiniWindow, "CommandOrControl+Shift+Y")
ok(`快照已落盘：${SNAP}`)

// ---------- 4. 代理：真落到 session ----------
/**
 * 代理生效与否只能用**非 loopback** 目标验证：Chromium 默认对 localhost/127.0.0.1
 * 直连 bypass，拿 127.0.0.1:9 当代理测不出任何差异（第一版就踩了这个）。
 * 后端监听 `*:3200`，故取本机局域网 IPv4 作探针。
 */
const lanIp = Object.values(os.networkInterfaces())
  .flat()
  .find(addr => addr?.family === "IPv4" && !addr.internal)?.address
assert.ok(lanIp, "找不到非 loopback 的 IPv4，代理无法验证")
const PROBE_SERVER = `http://${lanIp}:${new URL(cfg.serverBaseUrl).port || "3200"}`
const DEAD_PROXY = "http://127.0.0.1:9"

const reachable = async target =>
  page.evaluate(async url => {
    try {
      const res = await fetch(`${url}/api/knowledge/knowledge-bases`, { signal: AbortSignal.timeout(6000) })
      return `http:${res.status}`
    } catch (error) {
      return `err:${error.message}`
    }
  }, target)

const setProxy = enable =>
  page.evaluate(
    ([on, url, key]) => {
      const value = { enable: on, mode: "HTTP", type: "HTTP", url: on ? url : "" }
      localStorage.setItem(key, JSON.stringify(value))
      return window.xiaoyeDesktop.setProxySettings(value)
    },
    [enable, DEAD_PROXY, "proxy"]
  )

const baseline = await reachable(PROBE_SERVER)
assert.match(baseline, /^http:/, `基线就走不通（${baseline}），无法判断代理影响`)

assert.equal(await setProxy(true), true, "主进程拒绝了代理设置")
await page.waitForTimeout(1200)
const throughProxy = await reachable(PROBE_SERVER)

assert.equal(await setProxy(false), true)
await page.waitForTimeout(1200)
const afterOff = await reachable(PROBE_SERVER)

step(`代理实验（探针 ${PROBE_SERVER}）：基线 ${baseline} / 开代理 ${throughProxy} / 关代理 ${afterOff}`)
assert.match(throughProxy, /^err:/, `开了死代理仍可直连（${throughProxy}）——代理没落到 session`)
assert.match(afterOff, /^http:/, `关闭代理后未恢复直连（${afterOff}）`)
ok("代理真落到 session：死端口令请求失败，关掉后恢复")

const snapAfterProxy = readSnapshot()
assert.equal(snapAfterProxy?.proxy?.enable, false)

// ---------- 5. 状态栏图标显隐 ----------
const hidden = await page.evaluate(() => window.xiaoyeDesktop.setTrayVisible(false))
assert.equal(hidden, true)
await page.waitForTimeout(800)
const shown = await page.evaluate(() => window.xiaoyeDesktop.setTrayVisible(true))
assert.equal(shown, true)
ok("状态栏图标可销毁与重建（开关往返不报错）")

// ---------- 6. 偏好设置是独立窗口，不带走主窗口 ----------
await goto("/knowledge")
const before = context.pages().filter(item => !item.url().startsWith("devtools"))
/**
 * 菜单 accelerator 由原生菜单层处理，CDP 注入的按键到不了（实测 press Meta+Comma
 * 无反应），只能像人一样点：先按 pid 锁定本应用（本机还有别的 Electron 应用同名），
 * 再走 AX 点 Application 菜单第 2 项。
 */
// 本机同时跑着好几个 Electron 应用（leaf-desktop 等），且都叫 "Electron"——
// 模式必须带版本与主程序名，否则会点到别的应用的菜单
const ourPid = execFileSync(
  "pgrep",
  ["-f", "electron@44.1.1/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"],
  { encoding: "utf-8" }
)
  .trim()
  .split("\n")[0]
assert.ok(ourPid, "没找到本项目的 Electron 主进程")
const clickPrefsMenu = () =>
  execFileSync("osascript", [
    "-e",
    `tell application "System Events" to tell (first process whose unix id is ${ourPid}) to click menu item "偏好设置" of menu 1 of menu bar item 2 of menu bar 1`,
  ])
clickPrefsMenu()
await page.waitForTimeout(2500)
const settingsPage = context.pages().find(item => new URL(item.url()).pathname === "/settings")
assert.ok(settingsPage, "⌘, 没有开出偏好设置窗口")
const settingsSize = await settingsPage.evaluate(() => [window.outerWidth, window.outerHeight])
assert.deepEqual(settingsSize, [830, 768], `设置窗尺寸应为 830x768，实测 ${settingsSize.join("x")}`)
assert.equal(new URL(page.url()).pathname, "/knowledge", "主窗口被设置页带走了")
ok(`⌘, 开出独立设置窗 ${settingsSize.join("x")}，主窗口留在 /knowledge`)
// 单例：再点一次不应多开
clickPrefsMenu()
await page.waitForTimeout(1500)
assert.equal(
  context.pages().filter(item => new URL(item.url()).pathname === "/settings").length,
  1,
  "设置窗未复用（开了第二个）"
)
ok("重复打开复用同一个设置窗")
await settingsPage.close()
assert.equal(context.pages().length, before.length, "关闭设置窗后主窗口数应与打开前一致")

// ---------- 还原 ----------
await page.evaluate(
  keys => keys.forEach(key => localStorage.removeItem(key)),
  ["proxy", "custom-short-cut", "tray_status", "vueuse-color-scheme"]
)
step(`通过 ${checks} 项桌面断言`)
step("未覆盖：系统级快捷键的「按下触发」需真实键盘事件（CDP 注入不进 globalShortcut），托盘图标的肉眼可见性")
await cdp.close()

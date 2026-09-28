/* global document, getComputedStyle, localStorage, window */
/**
 * 偏好设置页验收（Web 端 Playwright 真跑）。
 *
 * 前置：后端 :3200 + `pnpm build:web` + `pnpm preview:web --port 4173 --host 127.0.0.1`。
 * 用法：`pnpm verify:settings`
 *
 * 桌面专属能力（开机自启、代理落到 session、系统级 globalShortcut、托盘、原生菜单 ⌘,）
 * 在 Web 端跑不到，脚本末尾如实打印未覆盖清单，不计入通过。
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

/** 假 xiaoyeDesktop：让渲染层走桌面分支，并记录它对主进程的每一次下发。 */
const FAKE_DESKTOP_BRIDGE = `
  (() => {
    const calls = []
    window.__bridgeCalls = calls
    const record = (name, payload) => {
      calls.push([name, payload === undefined ? null : payload])
    }
    window.xiaoyeDesktop = {
      isDesktop: true,
      platform: "darwin",
      // 主窗口标识：useDesktopSettings 的启动回灌（全局快捷键/代理下发主进程）
      // 以 desktop.isMainWindow 为守卫，缺它整段跳过
      isMainWindow: true,
      // 桌面分支下渲染层用该地址直连后端（resolveServerOriginUrl 首选 bridge 值）；
      // 空串会回落 preview origin 且丢失登录态被踢回登录页，必须给真实后端
      getServerBaseUrl: () => "http://127.0.0.1:3200",
      getWebBaseUrl: () => "",
      getConfig: () => {
        record("getConfig")
        return Promise.resolve({ serverBaseUrl: "", webBaseUrl: "", platform: "darwin", appVersion: "0.0.0" })
      },
      openDocumentInNewWindow: () => Promise.resolve({ opened: true }),
      notify: () => Promise.resolve({ shown: true }),
      onTrayCommand: () => () => {},
      onSettingOpen: () => () => {},
      // App.vue 挂载即订阅（preload 已实现该成员，桩同步补齐防 not-a-function）
      onInAppMenu: () => () => {},
      getOpenAtLogin: () => {
        record("getOpenAtLogin")
        return Promise.resolve(true)
      },
      setOpenAtLogin: value => {
        record("setOpenAtLogin", value)
        return Promise.resolve(true)
      },
      setProxySettings: value => {
        record("setProxySettings", JSON.parse(JSON.stringify(value)))
        return Promise.resolve(true)
      },
      setTrayVisible: value => {
        record("setTrayVisible", value)
        return Promise.resolve(true)
      },
      setGlobalShortcut: payload => {
        record("setGlobalShortcut", JSON.parse(JSON.stringify(payload)))
        return Promise.resolve(true)
      },
      openExternal: url => {
        record("openExternal", url)
        return Promise.resolve(true)
      },
      // lock 族（#27）：desktopAvailable 只看 bridge 对象存在，桩必须提供 getLockState
      // 否则设置页 refresh 抛 not-a-function；返回未启用态走「启用锁定」表单分支
      getLockState: () => {
        record("getLockState")
        return Promise.resolve({ hasPassword: false, autoLockOnBlur: false, autoLockDelayMinutes: 1, locked: false })
      },
    }
  })()
`

const PREFIX = "[settings]"
const OUTPUT_DIR = path.resolve("output/desktop-settings")
const STORAGE = { theme: "vueuse-color-scheme", shortcuts: "custom-short-cut", proxy: "proxy" }
const PALETTE_PLACEHOLDER = "搜索内容，或输入 > 唤醒更多"

let checks = 0

const pass = (label) => {
  checks += 1
  logStep(PREFIX, `✓ ${label}`)
}

const check = async (label, fn) => {
  await fn()
  pass(label)
}

const readStorageJson = async (page, key) => {
  const raw = await page.evaluate((name) => localStorage.getItem(name), key)
  return raw ? JSON.parse(raw) : null
}

const readStorageRaw = async (page, key) => page.evaluate((name) => localStorage.getItem(name), key)

const collectMetrics = (page) =>
  page.evaluate(() => {
    const pick = (selector, props) => {
      const el = document.querySelector(selector)
      if (!el) {
        return null
      }
      const style = getComputedStyle(el)
      return Object.fromEntries(props.map((prop) => [prop, style[prop]]))
    }

    return {
      h1: pick(".kb-settings-title h1", ["width", "fontSize", "fontWeight", "marginTop"]),
      inner: pick(".kb-settings-inner", ["width", "paddingLeft"]),
      h2: pick(".kb-settings-group > h2", ["fontSize", "marginTop", "marginBottom", "fontWeight"]),
      item: pick(".kb-settings-group .kb-settings-item", [
        "lineHeight",
        "paddingBottom",
        "borderBottomWidth",
      ]),
      row: pick(".kb-settings-row", ["display", "gridTemplateColumns"]),
      shortcutTip: pick(".kb-shortcut-tip", ["position", "textAlign"]),
      shortcutAction: pick(".kb-shortcut-action", ["width", "position"]),
      pageBg: getComputedStyle(document.querySelector(".kb-settings-page")).backgroundColor,
    }
  })

const selectOption = async (page, testId, optionName) => {
  await page.click(`[data-testid="${testId}"]`)
  await page.getByRole("option", { name: optionName, exact: true }).click()
  await page.waitForTimeout(250)
}

const goSettings = async (page) => {
  await page.goto(new URL("/settings", smokeConfig.baseUrl).toString(), {
    waitUntil: "networkidle",
  })
}

const run = async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
  const diagnostics = createDiagnostics()
  attachPageDiagnostics(page, diagnostics)

  try {
    await loginThroughUi(page, PREFIX)
    await readAccessToken(page)

    // ---------------- 入口 ----------------
    // 2026-09-28 起 Web 端偏好设置不再弹独立窗：菜单/⌘, 均为主窗口路由跳转
    await page.getByRole("button", { name: /^更多/ }).click()
    await page.getByRole("button", { name: /偏好设置/ }).click()
    await page.waitForURL("**/settings")
    await check("侧栏「更多 → 偏好设置」主窗口路由进入 /settings", async () => {
      assert.equal(new URL(page.url()).pathname, "/settings")
    })

    // 从设置页返回：有历史则原路返回（进入前是 /knowledge）
    await page.locator(".kb-settings-back").click()
    await page.waitForURL("**/knowledge")
    await check("设置页「＜」原路返回进入前的页面", async () => {
      assert.equal(new URL(page.url()).pathname, "/knowledge")
    })

    await page.keyboard.press("Meta+Comma")
    await page.waitForURL("**/settings")
    await check("Web 端 ⌘, 兜底路由打开设置页", async () => {
      assert.equal(new URL(page.url()).pathname, "/settings")
    })

    // ---------------- 结构与度量 ----------------
    // 直接子级：代理组的 h2 住在自己的 wrapper 里（语雀同构），而「关于」下的
    // 四条链接在语雀也是 h2，用后代选择器会把它们混进来
    const titles = await page.$$eval(".kb-settings-group > h2, .kb-proxy-wrapper > h2", (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    )
    await check("9 个分组按语雀 render 顺序渲染（Web 端不出「其他设置」）", async () => {
      assert.deepEqual(titles, [
        "颜色主题",
        "语言和时间",
        "启动和登录",
        "全局快捷键",
        "桌面端锁定",
        "代理设置",
        "加入内测版体验计划",
        // 自有差异组（2026-09-28 起，画板「模型配置」弹层迁入），语雀无此分组
        "AI 模型",
        "关于知叶",
      ])
    })

    await check("AI 模型分组渲染：描述 + 配置列表 + 表单件齐备", async () => {
      const group = page.locator('[data-testid="settings-ai-model"]')
      assert.equal((await group.locator("h2").textContent())?.trim(), "AI 模型")
      assert.equal(await group.getByText("配置列表").count(), 1)
      assert.equal(await group.getByRole("button", { name: "新增配置" }).count(), 1)
      // 默认一条配置卡片且处于启用态；API Key 输入件为密码框
      assert.equal(await group.getByText("当前使用", { exact: true }).count(), 1)
      assert.ok((await group.locator("input[type=password]").count()) >= 1)
    })

    const m = await collectMetrics(page)
    await check("度量对齐语雀：h1 726/28px/500、内容列 780 内缩 32、h2 16px 上下 24", async () => {
      assert.equal(m.h1.width, "726px")
      assert.equal(m.h1.fontSize, "28px")
      assert.equal(m.h1.fontWeight, "500")
      assert.equal(m.h1.marginTop, "30px")
      assert.equal(m.inner.width, "780px")
      assert.equal(m.inner.paddingLeft, "32px")
      assert.equal(m.h2.fontSize, "16px")
      assert.equal(m.h2.fontWeight, "500")
      assert.equal(m.h2.marginTop, "24px")
      assert.equal(m.h2.marginBottom, "24px")
    })

    await check("设置行 32 行高 + 32 下内边距 + 1px 分隔；18/6 分栏＝75%/25%", async () => {
      assert.equal(m.item.lineHeight, "32px")
      assert.equal(m.item.paddingBottom, "32px")
      assert.equal(m.item.borderBottomWidth, "1px")
      assert.equal(m.row.display, "grid")
      const [labelCol, controlCol] = m.row.gridTemplateColumns.split(" ")
      assert.ok(
        Math.abs(parseFloat(labelCol) / (parseFloat(labelCol) + parseFloat(controlCol)) - 0.75) <
          0.01,
        `分栏比例应为 75/25，实测 ${m.row.gridTemplateColumns}`,
      )
    })

    await check("快捷键输入件：占位浮层绝对定位居中 + 右侧动作钮 30px 绝对定位", async () => {
      assert.equal(m.shortcutTip.position, "absolute")
      assert.equal(m.shortcutTip.textAlign, "center")
      assert.equal(m.shortcutAction.width, "30px")
      assert.equal(m.shortcutAction.position, "absolute")
    })

    const labels = await page.$$eval(
      ".kb-shortcut-item .kb-settings-row > span:first-child",
      (nodes) => nodes.map((node) => node.textContent.trim()),
    )
    await check("快捷键 6 行文案与语雀一致（仅产品名替换）", async () => {
      assert.deepEqual(labels, [
        "打开知叶主窗口",
        "全局唤起小记新建窗口",
        "新建文档",
        "全局搜索",
        "锁定桌面端",
        "打开AI独立框",
      ])
    })

    const displays = await page.$$eval(".kb-shortcut-tip", (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    )
    await check("默认组合键按 macOS 符号渲染（⌘⌥⇧^ 空格分隔）", async () => {
      assert.deepEqual(displays, ["⌘ ⌥ Y", "⌘ ⇧ Y", "⌘ N", "⌘ J", "⌘ L", "⌘ ⇧ E"])
    })

    // ---------------- 颜色主题（真实副作用）----------------
    await selectOption(page, "change-theme", "暗黑模式")
    const dark = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains("dark"),
      bg: getComputedStyle(document.querySelector(".kb-settings-page")).backgroundColor,
    }))
    await check("切「暗黑模式」→ html.dark 挂上且页面底色换档", async () => {
      assert.equal(dark.hasDarkClass, true)
      assert.notEqual(dark.bg, m.pageBg)
    })
    // VueUse 对字符串初值用 raw 序列化（不带 JSON 引号），index.html 防闪烁脚本读的正是裸串
    await check("暗色存储值为 dark（与防闪烁脚本同一读法）", async () => {
      assert.equal(await readStorageRaw(page, STORAGE.theme), "dark")
    })
    await page.screenshot({ path: path.join(OUTPUT_DIR, "settings-dark.png"), fullPage: true })

    await selectOption(page, "change-theme", "跟随系统")
    await check("切「跟随系统」→ 存储值用 vueuse 的 auto（与防闪烁脚本同值域）", async () => {
      assert.equal(await readStorageRaw(page, STORAGE.theme), "auto")
    })

    await selectOption(page, "change-theme", "浅色模式")
    const light = await page.evaluate(() => ({
      hasDarkClass: document.documentElement.classList.contains("dark"),
      bg: getComputedStyle(document.querySelector(".kb-settings-page")).backgroundColor,
    }))
    await check("切回「浅色模式」→ 类名撤掉且底色回到原值", async () => {
      assert.equal(light.hasDarkClass, false)
      assert.equal(light.bg, m.pageBg)
    })

    // ---------------- 快捷键改键与真实生效 ----------------
    await page.click(".kb-shortcut-input >> nth=3")
    await page.keyboard.press("Meta+Shift+K")
    await page.waitForTimeout(300)

    const storedShortcuts = await readStorageJson(page, STORAGE.shortcuts)
    await check("改「全局搜索」为 ⌘⇧K → 落盘 custom-short-cut", async () => {
      assert.equal(storedShortcuts.showGlobalSearchModal, "CommandOrControl+Shift+K")
      assert.equal(storedShortcuts.createNewDoc, "CommandOrControl+N")
    })

    await check("改键后右列即时显示新组合键", async () => {
      const next = await page.$$eval(".kb-shortcut-tip", (nodes) => nodes[3]?.textContent.trim())
      assert.equal(next, "⌘ ⇧ K")
    })

    // 命令面板挂在侧栏壳里：离开设置页再按新键才算「真生效」
    await page.goto(new URL("/knowledge", smokeConfig.baseUrl).toString(), {
      waitUntil: "networkidle",
    })
    await page.keyboard.press("Meta+Shift+K")
    await page.waitForTimeout(400)
    await check("按新键 ⌘⇧K 真的唤起命令面板（应用内快捷键链路跑通）", async () => {
      assert.equal(
        await page.getByPlaceholder(PALETTE_PLACEHOLDER).count(),
        1,
        "命令面板未打开：应用内快捷键未生效",
      )
    })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)

    await goSettings(page)
    await page.hover(".kb-shortcut-item .kb-settings-row >> nth=3")
    await page.click('[data-testid="shortcut-cancel-showGlobalSearchModal"]')
    await page.waitForTimeout(250)
    await check("点「取消快捷键」→ 写入 NO_SHORTCUT 且右列回落占位「设置快捷键」", async () => {
      const after = await readStorageJson(page, STORAGE.shortcuts)
      assert.equal(after.showGlobalSearchModal, "NO_SHORTCUT")
      const shown = await page.$$eval(".kb-shortcut-tip", (nodes) => nodes[3]?.textContent.trim())
      assert.equal(shown, "设置快捷键")
    })

    await page.hover(".kb-shortcut-item .kb-settings-row >> nth=3")
    await page.click('[data-testid="shortcut-revert-showGlobalSearchModal"]')
    await page.waitForTimeout(250)
    await check("点「重置快捷键」→ 回到默认 ⌘J", async () => {
      const after = await readStorageJson(page, STORAGE.shortcuts)
      assert.equal(after.showGlobalSearchModal, "CommandOrControl+J")
    })

    await check("Web 端禁用 4 行（桌面族 2 + 本仓无能力族 2）", async () => {
      assert.equal(await page.$$eval(".kb-shortcut-input.is-disabled", (nodes) => nodes.length), 4)
    })

    // ---------------- 代理 + 桌面契约（用桩 bridge 假装桌面端）----------------
    // Web 端代理无处生效，整组按设计禁用；装一个记录调用的假 xiaoyeDesktop 后，
    // 既跑得动交互与校验，又能断言渲染层下发给主进程的载荷（真正的集成契约）。
    await check("Web 端「启用代理」开关禁用并标注仅桌面端可用", async () => {
      assert.equal(await page.locator(".kb-proxy-wrapper .el-switch.is-disabled").count(), 1)
      assert.equal(await page.locator('[data-testid="change-login"].is-disabled').count(), 1)
      assert.ok((await page.getByText("仅桌面端可用").count()) >= 1)
    })

    await page.context().addInitScript(FAKE_DESKTOP_BRIDGE)
    await goSettings(page)

    await check("桩 bridge 下 10 个分组齐了（macOS 才有的「其他设置」出现）", async () => {
      const all = await page.$$eval(".kb-settings-group > h2, .kb-proxy-wrapper > h2", (nodes) =>
        nodes.map((node) => node.textContent.trim()),
      )
      assert.deepEqual(all.slice(5, 9), ["代理设置", "其他设置", "加入内测版体验计划", "AI 模型"])
    })

    await page.click(".kb-proxy-wrapper .el-switch")
    await page.waitForTimeout(350)
    await check("打开「启用代理」→ 模式/协议/服务器三行按条件出现", async () => {
      const rows = await page.$$eval(".kb-proxy-title", (nodes) =>
        nodes.map((node) => node.textContent.trim()),
      )
      assert.deepEqual(rows, ["启用代理", "代理模式", "代理协议", "代理服务器"])
    })

    await page.getByRole("button", { name: "修改" }).click()
    await page.waitForTimeout(400)
    await check("「修改」拉起设置代理地址弹窗（含占位文案）", async () => {
      assert.equal(await page.getByText("设置代理地址").count(), 1)
      assert.equal(await page.getByPlaceholder("协议://IP:端口").count(), 1)
    })

    await page.getByPlaceholder("协议://IP:端口").fill("ht!tp://bad host")
    await page.getByRole("button", { name: "确定" }).click()
    await page.waitForTimeout(300)
    await check("非法地址 → 报「代理地址输入错误」且弹窗不关", async () => {
      assert.equal(await page.getByText("代理地址输入错误").count(), 1)
      assert.equal(await page.getByPlaceholder("协议://IP:端口").count(), 1)
    })

    await page.getByPlaceholder("协议://IP:端口").fill("http://127.0.0.1:7890")
    await page.getByRole("button", { name: "确定" }).click()
    await page.waitForTimeout(400)
    await check("合法地址 → 落盘 + 回显 + 以正确载荷下发主进程", async () => {
      const proxy = await readStorageJson(page, STORAGE.proxy)
      assert.equal(proxy.url, "http://127.0.0.1:7890")
      assert.equal(await page.getByText("http://127.0.0.1:7890").count(), 1)

      const calls = await page.evaluate(() => window.__bridgeCalls)
      const applied = calls.filter(([name]) => name === "setProxySettings").pop()
      assert.deepEqual(applied?.[1], {
        enable: true,
        mode: "HTTP",
        type: "HTTP",
        url: "http://127.0.0.1:7890",
      })
    })

    // 代理协议行只在 HTTP 模式下出现（语雀同判据 e.mode===MODE.http）
    await page.click(".kb-proxy-wrapper .kb-settings-row >> nth=1 >> .el-select")
    await page.getByRole("option", { name: "PAC 代理", exact: true }).click()
    await page.waitForTimeout(350)
    await check("切到 PAC 代理 → 「代理协议」行收起且值落盘", async () => {
      // 服务器标题里嵌着当前地址的回显（语雀把 url 放在 itemTitle 内），只取首行文字
      const rows = await page.$$eval(".kb-proxy-title", (nodes) =>
        nodes.map((node) => node.textContent.trim().split(" ")[0]),
      )
      assert.deepEqual(rows, ["启用代理", "代理模式", "代理服务器"])
      assert.equal((await readStorageJson(page, STORAGE.proxy)).mode, "PAC")
    })

    await check("桌面端可编辑 6 行快捷键中的 5 行，且全局族逐条下发主进程注册", async () => {
      // 仅「打开AI独立框」恒禁用（unavailable，本仓无对应能力）；「锁定桌面端」
      // 在 #27 实现后已可编辑，不再置灰
      assert.equal(await page.$$eval(".kb-shortcut-input.is-disabled", (nodes) => nodes.length), 1)
      const calls = await page.evaluate(() => window.__bridgeCalls)
      const registered = calls
        .filter(([name]) => name === "setGlobalShortcut")
        .map(([, payload]) => payload.key)
      // 启动回灌各注册一次（语雀同款：主进程只持 globalShortcut 族；
      // #27 起锁定行升级为 globalShortcut 族，回灌含 lockWindow）
      assert.deepEqual(registered.sort(), ["lockWindow", "openMainWindow", "openMiniWindow"])
    })

    await check("开机自启按系统真值回显（启动时向主进程取）", async () => {
      assert.equal(await page.locator('[data-testid="change-login"].is-checked').count(), 1)
    })

    await check("关掉状态栏图标开关 → 下发 setTrayVisible(false)", async () => {
      await page.click('[data-testid="change-mac-tray"]')
      await page.waitForTimeout(300)
      const calls = await page.evaluate(() => window.__bridgeCalls)
      assert.deepEqual(
        calls.filter(([name]) => name === "setTrayVisible").map(([, v]) => v),
        [true, false],
      )
      assert.equal(await readStorageJson(page, "tray_status"), false)
    })

    // ---------------- 缺能力组 + 关于 ----------------
    // 自启与「仅桌面端可用」的禁用断言已在上面（真 Web 上下文）验过；
    // 此处已在桩 bridge 的桌面态，只查与平台无关的缺能力标注与锁定组形态
    await check("语言/内测照原样禁用；锁定组在桩桌面态渲染未启用表单", async () => {
      assert.equal(
        await page
          .locator('[data-testid="change-language"] .el-select__wrapper.is-disabled')
          .count(),
        1,
      )
      assert.equal(await page.locator('[data-testid="change-beta"].is-disabled').count(), 1)
      // #27 后锁定组在桌面态（桩提供 bridge 即视为桌面）渲染设/改/清表单；
      // 桩 getLockState 返回未启用 → 「应用锁定模式：未启用」+ 「启用锁定」主按钮
      assert.ok((await page.getByText("应用锁定模式：未启用").count()) >= 1)
      assert.equal(await page.getByRole("button", { name: "启用锁定" }).count(), 1)
      assert.ok((await page.getByText("尚未接入更新通道").count()) >= 1)
      assert.ok((await page.getByText("界面文案尚未接入多语言").count()) >= 1)
    })

    const about = await page.evaluate(() => ({
      version: document.querySelector(".kb-about-version")?.textContent.trim(),
      links: [...document.querySelectorAll(".kb-about-term h2")].map((node) =>
        node.textContent.trim(),
      ),
      disabled: document.querySelectorAll(".kb-about-term h2.is-disabled").length,
      logoWidth: getComputedStyle(document.querySelector(".kb-about-logo")).width,
    }))
    await check("关于组：版本号来自构建常量 + 四条链接（无地址即置灰）+ logo 60px", async () => {
      assert.match(about.version, /^\d+\.\d+\.\d+$/)
      assert.deepEqual(about.links, ["更新日志", "常见问题", "问题反馈", "知叶服务协议"])
      assert.equal(about.disabled, 4)
      assert.equal(about.logoWidth, "60px")
    })

    await page.screenshot({ path: path.join(OUTPUT_DIR, "settings-light.png"), fullPage: true })

    assertNoPageErrors(diagnostics)

    // ---------------- 现场还原 ----------------
    await page.evaluate(
      (keys) => keys.forEach((key) => localStorage.removeItem(key)),
      Object.values(STORAGE),
    )
    logStep(PREFIX, `通过 ${checks} 项断言；截图：${path.relative(process.cwd(), OUTPUT_DIR)}/`)
    logStep(PREFIX, "未覆盖（Web 端跑不到，需 pnpm start 桌面端人工走查）：")
    logStep(
      PREFIX,
      "  开机自启真值、代理落到 session.defaultSession、系统级 globalShortcut 与占用提示、",
    )
    logStep(
      PREFIX,
      "  状态栏图标显隐、原生 Application 菜单与托盘的「偏好设置」、app:// 下直达 /settings",
    )
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(`${PREFIX} 失败：`, error.message)
  process.exitCode = 1
})

/* global window, document, localStorage, getComputedStyle */
/**
 * 桌面层 B6（#28 在线子窗口 / #29 应用菜单组项 / #31 knowledge:// 协议 / #33 最小宽 720）验收。
 *
 * 用法：`node scripts/verify-desktop-b6.mjs`（或 `pnpm verify:desktop-b6`）。
 *
 * 分四段：
 * 1. 纯函数单测级断言：级联几何（online-window-cascade.ts）与深链解析（deep-link.ts）
 *    经 node 原生 type-stripping 直接加载，无需 Electron；
 * 2. 源码结构断言：菜单字面量/快捷键/缩放档位/minWidth 720/协议注册/preload 事件口；
 * 3. 产物断言（out/main/index.js、out/preload/index.cjs 存在时）：关键字面量进包；
 * 4. Web 端 720 宽四屏审计（需后端 :3200 + build:web + preview :4173）：页面级无横向
 *    滚动 + 溢出元素无「硬剪裁」（均在可滚动容器内可达）。
 *
 * 跑不到（待真机，`pnpm dev --remoteDebuggingPort=9222`）：菜单点击 → 渲染层事件到达、
 * 窗口置顶/缩放真窗行为、连开 6 扇第 6 扇被拒 + 级联落点、超限 toast 显现
 * （渲染层消费端待接线）、knowledge:// 冷/热启动路由命中、缩放档位 radio 勾选。
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..")

const {
  attachPageDiagnostics,
  assertNoPageErrors,
  createBrowserPage,
  createDiagnostics,
  loginThroughUi,
  logStep,
  readAccessToken,
  smokeConfig,
} = await import(path.join(repoRoot, "scripts/lib/knowledge-smoke-utils.mjs"))

const PREFIX = "[desktop-b6]"

let checks = 0

const pass = label => {
  checks += 1
  logStep(PREFIX, `✓ ${label}`)
}

const check = async (label, fn) => {
  await fn()
  pass(label)
}

// ---------------- 1. 纯函数单测级断言 ----------------
const cascade = await import(path.join(repoRoot, "src/main/online-window-cascade.ts"))
const deepLink = await import(path.join(repoRoot, "src/main/deep-link.ts"))

await check("#28 常量：上限 5 / 级联 24px / 超限文案 / 回卷步数", () => {
  assert.equal(cascade.MAX_ONLINE_WINDOWS, 5)
  assert.equal(cascade.CASCADE_OFFSET_PX, 24)
  assert.equal(cascade.ONLINE_WINDOW_LIMIT_TOAST, "最多同时打开 5 个窗口")
  assert.equal(cascade.CASCADE_MAX_STEPS, 10)
})

await check("#28 级联序列：首窗 +24，逐窗递增 24，超出 10 步回卷", () => {
  const base = { x: 100, y: 100, width: 800, height: 600 }
  assert.deepEqual(cascade.computeCascadeOrigin(base, 0), { x: 124, y: 124 })
  assert.deepEqual(cascade.computeCascadeOrigin(base, 1), { x: 148, y: 148 })
  assert.deepEqual(cascade.computeCascadeOrigin(base, 4), { x: 220, y: 220 })
  assert.deepEqual(cascade.computeCascadeOrigin(base, 9), { x: 340, y: 340 })
  // 第 11 扇回到第一步
  assert.deepEqual(cascade.computeCascadeOrigin(base, 10), { x: 124, y: 124 })
  assert.deepEqual(cascade.computeCascadeOrigin(base, 11), { x: 148, y: 148 })
})

await check("#28 级联夹取：无基准退化为原点级联；越界落点夹回工作区（标题栏可达）", () => {
  assert.deepEqual(cascade.computeCascadeOrigin(null, 0), { x: 24, y: 24 })
  // 基准贴近屏幕右下：落点被夹到工作区右下角内
  const origin = cascade.computeCascadeOrigin({ x: 1900, y: 900, width: 400, height: 300 }, 0, {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  })
  assert.deepEqual(origin, { x: 1520, y: 880 })
})

await check("#31 深链解析：knowledge://kb/:id/doc/:id → SPA 路由，非法形态全拒", () => {
  assert.equal(deepLink.DEEP_LINK_PROTOCOL, "knowledge")
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://kb/abc123/doc/xyz_-9"), "/knowledge/abc123/doc/xyz_-9")
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://kb/u1/doc/v2?from=tray"), "/knowledge/u1/doc/v2")
  // 非 knowledge 协议 / 非 kb host / 缺段 / 多段 / 目录穿越 / 非法字符 / 非 URL
  assert.equal(deepLink.parseKnowledgeDeepLink("https://kb/u1/doc/v2"), null)
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://other/u1/doc/v2"), null)
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://kb/u1/doc"), null)
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://kb/u1/doc/v2/extra"), null)
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://kb/../doc/v2"), null)
  assert.equal(deepLink.parseKnowledgeDeepLink("knowledge://kb/u1/doc/v 2"), null)
  assert.equal(deepLink.parseKnowledgeDeepLink("不是 URL"), null)
})

// ---------------- 2. 源码结构断言 ----------------
const readSource = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), "utf-8")

const mainSource = readSource("src/main/index.ts")
const managerSource = readSource("src/main/online-window-manager.ts")
const preloadSource = readSource("src/preload/index.ts")
const shellSource = readSource("src/renderer/src/components/knowledge/KnowledgePageShell.vue")

await check("#29 菜单字面量与快捷键：编辑组查找/历史、窗口组置顶/缩放/演示模式", () => {
  for (const needle of [
    "在当页查找",
    "查看文档历史",
    "窗口置顶",
    "视图缩放",
    "演示模式",
    "CommandOrControl+F",
    "CommandOrControl+Y",
    "CommandOrControl+Alt+P",
    'type: "checkbox"',
    'type: "radio"',
    "setAlwaysOnTop",
    "setZoomFactor",
    "xiaoye:in-app-menu",
  ]) {
    assert.ok(mainSource.includes(needle), `主进程源码缺少 ${needle}`)
  }
})

await check("#29 缩放档位：0.75 / 0.9 / 1.0 / 1.25 / 1.5 / 2.00（对齐语雀字面）", () => {
  const zoomBlock = mainSource.slice(mainSource.indexOf("ZOOM_LEVELS"), mainSource.indexOf("ZOOM_EPSILON"))
  for (const label of ["0.75", "0.9", "1.0", "1.25", "1.5", "2.00"]) {
    assert.ok(zoomBlock.includes(`label: "${label}"`), `缩放档位缺少 ${label}`)
  }
})

await check("#28 管理器接管：open-document-window 走管理器，上限/级联/超限 toast 齐", () => {
  for (const needle of ["MAX_ONLINE_WINDOWS", "ONLINE_WINDOW_LIMIT_TOAST", "computeCascadeOrigin", 'once("closed"']) {
    assert.ok(managerSource.includes(needle), `管理器缺少 ${needle}`)
  }
  assert.ok(mainSource.includes('ipcMain.handle("xiaoye:open-document-window"'), "IPC 通道缺失")
  assert.ok(
    mainSource.includes("openOnlineWindow({") && mainSource.includes("onLimit:"),
    "open-document-window 未走管理器"
  )
  assert.ok(mainSource.includes("send(TOAST_CHANNEL, message)"), "超限 toast 未发给渲染层")
})

await check("#31 协议注册与深链接线：setAsDefaultProtocolClient + open-url/second-instance", () => {
  assert.ok(mainSource.includes("app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL"), "协议注册缺失")
  assert.ok(mainSource.includes('app.on("open-url"'), "open-url 监听缺失")
  assert.ok(mainSource.includes('app.on("second-instance"'), "second-instance 监听缺失")
  assert.ok(mainSource.includes("parseKnowledgeDeepLink"), "深链解析未接入")
  assert.ok(mainSource.includes("pendingDeepLinkPath"), "冷启动深链兜底缺失")
  // dev 模式 argv 传参（macOS dev 下协议唤起 electron 壳需带应用入口）
  assert.ok(mainSource.includes("process.defaultApp"), "dev 模式协议登记未处理 argv")
})

await check("#33 最小宽 720：主窗 minWidth 常量与壳层 min-w 同步", () => {
  assert.ok(/const WINDOW_MIN_WIDTH = 720/.test(mainSource), "WINDOW_MIN_WIDTH 应为 720")
  assert.ok(!/const WINDOW_MIN_WIDTH = 1080/.test(mainSource), "WINDOW_MIN_WIDTH 仍是 1080")
  assert.ok(shellSource.includes("min-w-[720px]"), "KnowledgePageShell 应为 min-w-[720px]")
  assert.ok(!shellSource.includes("min-w-[1080px]"), "KnowledgePageShell 仍是 min-w-[1080px]")
})

await check("#28/#29 preload 事件口：onInAppMenu / onToast 已暴露（渲染层消费端待接线）", () => {
  assert.ok(preloadSource.includes("onInAppMenu"), "preload 缺 onInAppMenu")
  assert.ok(preloadSource.includes("xiaoye:in-app-menu"), "preload 缺 in-app-menu 通道")
  assert.ok(preloadSource.includes("onToast"), "preload 缺 onToast")
  assert.ok(preloadSource.includes("xiaoye:toast"), "preload 缺 toast 通道")
})

// ---------------- 3. 产物断言（存在才验） ----------------
const mainBundlePath = path.join(repoRoot, "out/main/index.js")
const preloadBundlePath = path.join(repoRoot, "out/preload/index.cjs")

if (fs.existsSync(mainBundlePath)) {
  const mainBundle = fs.readFileSync(mainBundlePath, "utf-8")
  await check("主进程产物含 B6 装配（菜单/toast/协议/深链字面量）", () => {
    for (const needle of [
      "在当页查找",
      "查看文档历史",
      "窗口置顶",
      "视图缩放",
      "演示模式",
      "最多同时打开 5 个窗口",
      "xiaoye:in-app-menu",
      "xiaoye:toast",
      "xiaoye:open-document-window",
    ]) {
      assert.ok(mainBundle.includes(needle), `主进程产物缺少 ${needle}`)
    }
  })
} else {
  logStep(PREFIX, "跳过主进程产物断言（out/main/index.js 不存在，请先 pnpm build）")
}

if (fs.existsSync(preloadBundlePath)) {
  const preloadBundle = fs.readFileSync(preloadBundlePath, "utf-8")
  await check("preload 产物含事件通道字面量", () => {
    for (const needle of ["xiaoye:in-app-menu", "xiaoye:toast", "onInAppMenu", "onToast"]) {
      assert.ok(preloadBundle.includes(needle), `preload 产物缺少 ${needle}`)
    }
  })
} else {
  logStep(PREFIX, "跳过 preload 产物断言（out/preload/index.cjs 不存在，请先 pnpm build）")
}

// ---------------- 4. Web 端 720 宽四屏审计（后端/preview 不可达时跳过） ----------------
const previewReachable = await fetch(smokeConfig.baseUrl, { method: "GET" })
  .then(() => true)
  .catch(() => false)

if (!previewReachable) {
  logStep(
    PREFIX,
    "跳过 720 宽四屏审计（preview 不可达：请先 pnpm build:web && pnpm preview:web --port 4173 --host 127.0.0.1）"
  )
} else {
  const { browser, page } = await createBrowserPage({ viewport: { width: 720, height: 760 } })
  const diagnostics = createDiagnostics()
  attachPageDiagnostics(page, diagnostics)

  try {
    await loginThroughUi(page, PREFIX)
    await readAccessToken(page)

    // 取一个真实 KB 与文档（只读，不造数据；无数据则跳过对应屏）
    const kbList = await page.evaluate(async () => {
      const session = JSON.parse(localStorage.getItem("tools-web-auth-session") || "{}")
      const res = await fetch("/api/knowledge/knowledge-bases", {
        headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` },
      })
      return res.json()
    })
    const kb = Array.isArray(kbList) ? kbList[0] : null
    let docPath = null
    if (kb) {
      const tree = await page.evaluate(async kbId => {
        const session = JSON.parse(localStorage.getItem("tools-web-auth-session") || "{}")
        const res = await fetch(`/api/knowledge/documents/tree?kbId=${encodeURIComponent(kbId)}`, {
          headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` },
        })
        return res.json()
      }, kb.id)
      const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])])
      const doc = flatten(Array.isArray(tree) ? tree : []).find(node => node.type === "doc")
      if (doc) {
        docPath = `/knowledge/${kb.id}/doc/${doc.id}`
      }
    }

    /**
     * 720 宽审计：页面级无横向滚动；溢出元素不允许「硬剪裁」——首个横向滚动
     * 祖先必须真的溢出（scrollWidth 超出 clientWidth，元素可滚入视口）。
     * settings 内容列 780 为 views/settings 既有定宽（B6 范围禁改）：窄窗下由
     * 其自身滚动容器兜底（容器内横向滚动条），不按硬剪裁断言，仅作登记。
     */
    const auditScreen = async (label, urlPath, strict) => {
      await page.setViewportSize({ width: 720, height: 760 })
      await page.goto(new URL(urlPath, smokeConfig.baseUrl).toString(), { waitUntil: "networkidle" })
      await page.waitForTimeout(900)
      const result = await page.evaluate(() => {
        const vw = window.innerWidth
        const scrolling = document.scrollingElement
        const isScrollable = el => {
          let node = el.parentElement
          while (node && node !== document.body) {
            if (/(auto|scroll)/.test(getComputedStyle(node).overflowX)) {
              // 第一个横向滚动容器即裁剪边界：它自身真的溢出（scrollWidth 超出）才可达
              return node.scrollWidth > node.clientWidth + 1
            }
            node = node.parentElement
          }
          return false
        }
        let clipped = 0
        let overflowCount = 0
        for (const el of document.querySelectorAll("body *")) {
          const rect = el.getBoundingClientRect()
          if (rect.width > 0 && rect.right > vw + 1) {
            overflowCount += 1
            if (!isScrollable(el)) {
              clipped += 1
            }
          }
        }
        return {
          scrollWidth: scrolling ? scrolling.scrollWidth : document.documentElement.scrollWidth,
          innerWidth: vw,
          overflowCount,
          clipped,
        }
      })
      assert.equal(
        result.scrollWidth <= result.innerWidth + 1,
        true,
        `${label} 页面级横向滚动：scrollWidth=${result.scrollWidth}`
      )
      if (strict) {
        assert.equal(result.clipped, 0, `${label} 存在硬剪裁元素（不可达）：${result.clipped}`)
      }
      logStep(
        PREFIX,
        `${label}: scrollWidth=${result.scrollWidth}/${result.innerWidth} 溢出元素=${result.overflowCount} 硬剪裁=${result.clipped}`
      )
      await page.screenshot({ path: path.join(repoRoot, "output", `b6-720-${label}.png`) })
    }

    await check("720 宽·开始页：无页面级横向滚动", async () => {
      await auditScreen("start", "/knowledge/start", true)
    })

    if (kb) {
      await check("720 宽·工作区：无页面级横向滚动，溢出元素均可滚动可达", async () => {
        await auditScreen("workspace", `/knowledge/${kb.id}`, true)
      })
    } else {
      logStep(PREFIX, "跳过工作区审计（无知识库数据）")
    }

    if (docPath) {
      await check("720 宽·编辑页：Lake 500px 内核下限走滚动兜底，无硬剪裁", async () => {
        await auditScreen("doc", docPath, true)
      })
    } else {
      logStep(PREFIX, "跳过编辑页审计（无文档数据）")
    }

    await check("720 宽·设置页：无页面级横向滚动（780 定宽走自身滚动容器兜底，登记不断言）", async () => {
      await auditScreen("settings", "/settings", false)
      logStep(
        PREFIX,
        "登记：设置页内容列 780 定宽在 <780 窗宽下出现容器内横向滚动条（views/settings 为 B6 禁改范围，未动）"
      )
    })

    assertNoPageErrors(diagnostics)
  } finally {
    await browser.close()
  }
}

logStep(PREFIX, `通过 ${checks} 项断言`)
logStep(PREFIX, "未覆盖（Web 端跑不到，需 pnpm dev --remoteDebuggingPort=9222 真机走查）：")
logStep(PREFIX, "  #28 连开 6 扇第 6 扇被拒 + 级联落点 + 超限 toast 显现（渲染层消费端待接线）、关窗即移除跟踪")
logStep(PREFIX, "  #29 菜单点击 → 渲染层 onInAppMenu 事件到达（渲染层消费端待接线）、窗口置顶/缩放真窗生效、演示模式")
logStep(PREFIX, "  #31 knowledge:// 冷/热启动路由命中（open -a 真机）、macOS dev argv 协议登记生效")
logStep(PREFIX, "  #33 Electron 真窗 minWidth=720 拖拽下限（Web 审计已覆盖壳层与溢出收敛）")

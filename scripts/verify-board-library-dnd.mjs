/**
 * 素材库「画布拖拽添加素材」GUI 复验（PLAN.md AI 画板遗留项）：
 * 1. 记录当前用户级素材库 items（测试后原样还原）
 * 2. API 播种一个矩形 library item + 创建画板文档
 * 3. GUI：打开画板 → 打开素材库抽屉 → 拖拽素材到画布
 * 4. 断言：自动保存后文档 content 含播种的元素 id；重载后无页面错误
 *
 * 前置：后端 3200 + 4173 preview（build:web 产物）在跑。
 *   node scripts/verify-board-library-dnd.mjs
 */
import fs from "node:fs"
import {
  apiRequest,
  assertNoPageErrors,
  attachPageDiagnostics,
  createBrowserPage,
  createDiagnostics,
  ensureKnowledgeBase,
  loginThroughUi,
  logStep,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const PREFIX = "[素材库复验]"
const ELEMENT_ID = "kbverify-rect-1"
const SHOT_DIR = "output/playwright"
fs.mkdirSync(SHOT_DIR, { recursive: true })

/** 构造一个 Excalidraw 0.18 可 restore 的最小矩形 library item。 */
const makeRectangleLibraryItem = () => ({
  id: "kbverify-libitem",
  status: "unpublished",
  created: Date.now(),
  elements: [
    {
      type: "rectangle",
      id: ELEMENT_ID,
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "#a5d8ff",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 },
      seed: 12345,
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    },
  ],
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const { browser, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

let kbId = null
let originalLibraryItems = null

try {
  await loginThroughUi(page, PREFIX)
  const token = await readAccessToken(page)
  logStep(PREFIX, "✅ 登录成功")

  // 1. 记录原素材库（测试后还原；board-library 是用户级全局配置）
  originalLibraryItems = await apiRequest("/knowledge/board-library", { token })
  logStep(PREFIX, `原素材库 items：${(originalLibraryItems?.items ?? []).length} 个`)

  // 2. 播种矩形素材
  await apiRequest("/knowledge/board-library", {
    method: "PUT",
    token,
    body: { items: [makeRectangleLibraryItem()] },
  })
  logStep(PREFIX, "✅ 已播种 1 个矩形素材")

  // 3. 建画板文档并打开
  const kb = await ensureKnowledgeBase(token, "Smoke Workspace", "Smoke Workspace 素材库拖拽复验")
  kbId = kb.id
  const doc = await apiRequest("/knowledge/documents", {
    method: "POST",
    token,
    body: { kbId, title: "素材库拖拽复验画板", type: "doc", editorType: "board" },
  })
  await page.goto(new URL(`/knowledge/${kbId}/doc/${doc.id}`, "http://127.0.0.1:4173").href, {
    waitUntil: "domcontentloaded",
  })
  await page.locator(".excalidraw").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${SHOT_DIR}/board-dnd-1-initial.png` })
  logStep(PREFIX, "✅ 画板页已加载")

  // 4. 打开素材库抽屉（Excalidraw 0.18 dock 按钮，探测 aria-label/标题）
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button, [role='button']"))
      .map((el) => ({
        label:
          el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent?.trim() || "",
        cls: el.className?.baseval ?? String(el.className ?? ""),
      }))
      .filter((it) => /librar|素材/i.test(it.label) || /librar/i.test(it.cls))
      .slice(0, 8)
  })
  logStep(PREFIX, `素材库入口候选：${JSON.stringify(candidates)}`)

  const toggle = page.locator(".sidebar-trigger.default-sidebar-trigger").first()
  await toggle.click({ timeout: 10_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOT_DIR}/board-dnd-2-library-open.png` })

  // 5. 定位素材项并拖到画布中央（可拖拽本体是 .library-unit__dragger；「浏览素材库」
  //    的 A.library-menu-browse-button 也 draggable，是已知干扰项，必须避开）
  const itemSel = ".library-unit__dragger"
  const itemCount = await page.locator(itemSel).count()
  logStep(PREFIX, `素材库面板条目数：${itemCount}`)
  if (itemCount === 0) throw new Error("素材库面板未找到可拖拽条目")

  const canvasInfo = await page.evaluate(() =>
    Array.from(document.querySelectorAll("canvas")).map((c) => c.className || "(无类名)"),
  )
  logStep(PREFIX, `画布 DOM 类名：${JSON.stringify(canvasInfo)}`)
  const canvas = page
    .locator("canvas.interactive, canvas.interactiveCanvas, canvas.excalidraw__canvas")
    .last()
  await canvas.waitFor({ state: "visible", timeout: 10_000 })

  // Playwright dragTo 的鼠标事件驱动不了 Excalidraw 的 HTML5 DnD 落点（实测），
  // 改为页面内合成 DragEvent：dragstart 让元素自身的处理器把素材写入真实
  // DataTransfer，再对画布派发 dragenter/dragover/drop（带画布内坐标）。
  const dropped = await page.evaluate(() => {
    const source = document.querySelector(".library-unit__dragger")
    const canvasEl = document.querySelector("canvas.excalidraw__canvas.interactive")
    if (!source || !canvasEl) return { ok: false, reason: "source 或 canvas 不存在" }
    const rect = canvasEl.getBoundingClientRect()
    const clientX = Math.round(rect.x + rect.width * 0.4)
    const clientY = Math.round(rect.y + rect.height * 0.5)
    const dt = new DataTransfer()
    const options = { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }
    source.dispatchEvent(new DragEvent("dragstart", options))
    canvasEl.dispatchEvent(new DragEvent("dragenter", options))
    canvasEl.dispatchEvent(new DragEvent("dragover", options))
    canvasEl.dispatchEvent(new DragEvent("drop", options))
    source.dispatchEvent(new DragEvent("dragend", options))
    return { ok: true, clientX, clientY, types: Array.from(dt.types) }
  })
  logStep(PREFIX, `合成拖拽结果：${JSON.stringify(dropped)}`)
  if (!dropped.ok) throw new Error(`合成拖拽失败：${dropped.reason}`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOT_DIR}/board-dnd-3-after-drop.png` })
  logStep(PREFIX, "已执行拖拽，开始轮询自动保存结果…")

  // 6. 轮询文档 content 是否出现矩形元素（拖入画布 → onChange → 自动保存链路）。
  //    注意：Excalidraw 插入素材会重新生成元素 id，不能按播种 id 断言。
  let persisted = false
  let lastRaw = ""
  for (let i = 0; i < 30; i += 1) {
    const detail = await apiRequest(`/knowledge/documents/${doc.id}`, { token })
    lastRaw = JSON.stringify(detail?.content ?? {})
    if (lastRaw.includes('"rectangle"')) {
      persisted = true
      break
    }
    await sleep(1000)
  }
  if (!persisted) throw new Error("拖拽后 30s 内自动保存的画板 content 未包含矩形元素")
  logStep(PREFIX, `✅ 矩形素材已随自动保存持久化（content 长度 ${lastRaw.length}）`)

  // 7. 重载画板，确认渲染链路无错误
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.locator(".excalidraw").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${SHOT_DIR}/board-dnd-4-reload.png` })
  assertNoPageErrors(diagnostics)
  logStep(PREFIX, "✅ 重载后无页面错误")
} finally {
  // 8. 还原用户级素材库 + 清理临时 KB
  try {
    const token = await readAccessToken(page)
    if (originalLibraryItems) {
      await apiRequest("/knowledge/board-library", {
        method: "PUT",
        token,
        body: { items: originalLibraryItems.items ?? [] },
      })
      logStep(PREFIX, "✅ 素材库已还原")
    }
    if (kbId) {
      await apiRequest(`/knowledge/knowledge-bases/${kbId}`, { method: "DELETE", token })
      logStep(PREFIX, "✅ 临时 KB 已删除")
    }
  } catch (error) {
    logStep(PREFIX, `⚠️ 清理阶段异常（不影响断言）：${error.message}`)
  }
  await browser.close()
}

logStep(PREFIX, "🎉 素材库拖拽添加素材全链路复验通过")

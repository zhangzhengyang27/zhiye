// 编辑器插入/上传能力探针：图片（对照）、视频、音频、附件四条链路
// 用法：node scripts/probe-editor-upload.mjs（需后端 3200 + preview 4173 在跑）
/* global document */
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import {
  attachPageDiagnostics,
  createBrowserPage,
  createDiagnostics,
  ensureDocument,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const PREFIX = "[probe:upload]"
const OUT_DIR = decodeURIComponent(
  new globalThis.URL("../output/playwright/probe-editor-upload/", import.meta.url).pathname
)
mkdirSync(OUT_DIR, { recursive: true })

// 1x1 红色 PNG
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)
// 真实音视频样本（/tmp/probe-sample.*，由 ffmpeg/afconvert 生成）；mp4 缺失时退到最小容器——
// 仅验证上传端点切换，播放态不在此断言
const readIfExists = path => {
  try {
    return readFileSync(path)
  } catch {
    return null
  }
}
const MP4_SAMPLE = readIfExists("/tmp/probe-sample.mp4")
const MP4_FALLBACK = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
  Buffer.alloc(64, 0x00),
])
const M4A_SAMPLE = readIfExists("/tmp/probe-sample.m4a")
const TXT_SAMPLE = Buffer.from("附件上传探针样本内容\n", "utf8")

const { browser, page } = await createBrowserPage()
const diagnostics = createDiagnostics()
attachPageDiagnostics(page, diagnostics)

const networkLog = []
page.on("request", request => {
  const url = request.url()
  if (url.includes("/api/")) networkLog.push(`${request.method()} ${new globalThis.URL(url).pathname}`)
})

const shot = async name => {
  const path = `${OUT_DIR}${name}.png`
  await page.screenshot({ path, fullPage: false })
  logStep(PREFIX, `截图 ${path}`)
}

try {
  await loginThroughUi(page, PREFIX)
  const token = await readAccessToken(page)

  // 复用默认知识库（ensureKnowledgeBase 返回第一个可用库），探针文档结束后删除
  const knowledgeBases = await (
    await fetch(`${smokeConfig.apiBaseUrl}/knowledge/knowledge-bases`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  assert.ok(Array.isArray(knowledgeBases) && knowledgeBases.length > 0, "无可用知识库")
  const kb = knowledgeBases[0]

  const doc = await ensureDocument(kb.id, token, {
    title: `上传能力探针 ${Date.now()}`,
    content: "# 上传能力探针\n\n",
  })
  logStep(PREFIX, `探针文档 kb=${kb.id} doc=${doc.id}`)

  const docUrl = new globalThis.URL(`/knowledge/${kb.id}/doc/${doc.id}`, smokeConfig.baseUrl).toString()
  await page.goto(docUrl, { waitUntil: "domcontentloaded" })
  const editorContent = page.locator('.yuque-doc-editor__surface [contenteditable="true"]').first()
  await editorContent.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  await editorContent.click()

  // 在正文末尾起一个新段落再输入 / 唤起 slash 菜单
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End").catch(() => {})
  await page.keyboard.press("Enter").catch(() => {})
  await page.keyboard.type("/")
  await page.waitForTimeout(800)
  await shot("01-slash-menu")

  // 枚举 slash 菜单全部条目（菜单 teleport 到 body，容器类 ne-ui-slash-card-select-menu）
  const menuItems = await page.evaluate(() => {
    const menu = document.querySelector(".ne-ui-slash-card-select-menu") || document.querySelector(".ne-slash-overlay")
    if (!menu) return { found: false, items: [] }
    const results = []
    const seen = new Set()
    for (const el of menu.querySelectorAll("*")) {
      const text = (el.textContent || "").trim()
      if (!text || text.length > 20 || seen.has(text)) continue
      if (el.children.length === 0 || el.className?.includes?.("group-title")) {
        seen.add(text)
        const rect = el.getBoundingClientRect()
        results.push({
          text,
          visible: rect.width > 0 && rect.height > 0,
          cls: String(el.className?.slice?.(0, 50) || ""),
        })
      }
    }
    return { found: true, items: results }
  })
  logStep(PREFIX, `slash 菜单全部条目: ${JSON.stringify(menuItems)}`)

  // 通用插入流程：刷新页面 → 慢速输入拼音检索码 → 点击标题项 → 文件选择 → 观察结果
  const insertViaMenu = async (slashKey, expectText, filePayload, tag) => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await editorContent.waitFor({ state: "visible", timeout: smokeConfig.timeout })
    await page.waitForTimeout(1500)

    // "/" 菜单弹出偶发抖动：整段重试最多 4 次
    let opened = false
    for (let attempt = 1; attempt <= 4 && !opened; attempt++) {
      await editorContent.click()
      await page.keyboard.press("End")
      await page.keyboard.press("Enter")
      await page.keyboard.type("/", { delay: 150 })
      await page.waitForTimeout(1200)
      opened = await page.evaluate(() => Boolean(document.querySelector(".ne-ui-slash-card-select-menu")))
      if (!opened) logStep(PREFIX, `${tag}: 第 ${attempt} 次 "/" 未弹出菜单`)
    }
    if (!opened) {
      logStep(PREFIX, `${tag}: slash 菜单始终未弹出，跳过`)
      return { tag, missing: true }
    }

    for (const ch of slashKey.replace("/", "").split("")) {
      await page.keyboard.type(ch, { delay: 120 })
      await page.waitForTimeout(700)
    }

    const titles = await page.evaluate(() =>
      [...document.querySelectorAll(".ne-ui-slash-card-select-menu .ne-menu-item-container-title")].map(el =>
        el.textContent.trim()
      )
    )
    logStep(PREFIX, `${tag}: 过滤后菜单项 = ${JSON.stringify(titles)}`)

    const item = page
      .locator(".ne-ui-slash-card-select-menu .ne-menu-item-container-title", { hasText: expectText })
      .first()
    if ((await item.count()) === 0) {
      logStep(PREFIX, `${tag}: 菜单无「${expectText}」项，跳过`)
      return { tag, missing: true }
    }

    const chooserRace = page
      .waitForEvent("filechooser", { timeout: 5000 })
      .then(chooser => ({ ok: true, chooser }))
      .catch(() => ({ ok: false }))
    await item.click()
    const race = await chooserRace
    logStep(PREFIX, `${tag}: 点击「${expectText}」后文件选择器 = ${race.ok ? "打开" : "未打开"}`)

    if (!race.ok) {
      // 可能是 URL 输入对话框而非本地文件
      await page.waitForTimeout(800)
      await shot(`2${tag}-no-chooser`)
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000))
      return { tag, chooser: false, bodySnippet: bodyText.replace(/\s+/g, " ").slice(0, 400) }
    }

    await race.chooser.setFiles(filePayload)
    logStep(PREFIX, `${tag}: 已提交文件 ${filePayload.name}`)

    // 观察上传结果 12s：网络请求 + 卡片状态
    const before = networkLog.length
    await page.waitForTimeout(12000)
    const newRequests = networkLog.slice(before)
    await shot(`3${tag}-after-upload`)
    const surfaceText = await page.evaluate(() => {
      const surface = document.querySelector(".yuque-doc-editor__surface")
      return surface ? surface.innerText.replace(/\s+/g, " ").slice(0, 500) : ""
    })
    logStep(PREFIX, `${tag}: 新增网络请求 = ${JSON.stringify(newRequests)}`)
    logStep(PREFIX, `${tag}: 正文快照 = ${surfaceText}`)
    return { tag, chooser: true, newRequests, surfaceText }
  }

  // 落盘探针样本（buffer 直接交给 setFiles，无需落盘；此处仅留存证据副本）
  writeFileSync(`${OUT_DIR}probe.png`, PNG_1PX)
  if (MP4_SAMPLE) writeFileSync(`${OUT_DIR}probe.mp4`, MP4_SAMPLE)
  if (M4A_SAMPLE) writeFileSync(`${OUT_DIR}probe.m4a`, M4A_SAMPLE)
  writeFileSync(`${OUT_DIR}probe.txt`, TXT_SAMPLE)

  const results = []
  results.push(await insertViaMenu("/tp", "图片", { name: "probe.png", mimeType: "image/png", buffer: PNG_1PX }, "img"))
  results.push(
    await insertViaMenu(
      "/sp",
      "视频",
      { name: "probe.mp4", mimeType: "video/mp4", buffer: MP4_SAMPLE || MP4_FALLBACK },
      "video"
    )
  )
  if (M4A_SAMPLE) {
    results.push(
      await insertViaMenu("/yp", "音频", { name: "probe.m4a", mimeType: "audio/mp4", buffer: M4A_SAMPLE }, "audio")
    )
  }
  results.push(
    await insertViaMenu("/fj", "附件", { name: "probe.txt", mimeType: "text/plain", buffer: TXT_SAMPLE }, "file")
  )
  results.push(
    await insertViaMenu(
      "/bdwj",
      "本地文件",
      { name: "probe.txt", mimeType: "text/plain", buffer: TXT_SAMPLE },
      "localfile"
    )
  )

  // 汇总判定：每个通道都应打到 /oss/upload，且正文无 Lake 默认端点的 404 错误文本
  for (const r of results) {
    const oss = r.newRequests?.some(req => req.includes("/oss/upload")) ?? false
    const legacy = r.newRequests?.some(req => req.includes("/api/upload")) ?? false
    const errorText = /Cannot POST|无法播放|上传失败/.test(r.surfaceText || "")
    logStep(PREFIX, `判定 ${r.tag}: OSS 上传=${oss} 旧默认端点=${legacy} 卡片错误文本=${errorText}`)
  }

  // 清理探针文档（硬删）
  await fetch(`${smokeConfig.apiBaseUrl}/knowledge/documents/${doc.id}/trash`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
  const del = await fetch(`${smokeConfig.apiBaseUrl}/knowledge/documents/${doc.id}?hard=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  logStep(PREFIX, `探针文档清理 http=${del.status}`)

  logStep(PREFIX, `控制台错误: ${JSON.stringify(diagnostics.consoleErrors.slice(0, 10))}`)
  logStep(PREFIX, `页面异常: ${JSON.stringify(diagnostics.pageErrors.slice(0, 5))}`)
  logStep(PREFIX, "探针完成")
} finally {
  await browser.close()
}

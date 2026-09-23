/* global window */
/* global window, innerWidth, innerHeight */
/**
 * 全路由几何扫描工具（视觉细节回归，可重复执行）：
 * 用 API 建临时 KB + 五类文档，逐路由渲染后跑三类几何断言——
 * ① 页面横向溢出；② 文本截断且无 title 提示（排除 visually-hidden）；
 * ③ 有边框容器的首/末可见子元素贴边 < 6px（「标题贴卡片边框」类）。
 * 已知误报甄别：侧栏列表行 4px 间距（刻意密度）、divide-y+border-y /
 * 表格圆角容器贴边（标准列表形态）。
 * 用法：node scripts/audit-visual.mjs（前置：后端 3200 + preview 4173）。
 * 结果输出到 stdout；临时 KB 自动清理。
 */
import { chromium } from "playwright"

const API = "http://127.0.0.1:3200"
const BASE = "http://127.0.0.1:4173"

// 准备数据
const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "demo@example.com", password: "123456" }),
}).then((r) => r.json())
const H = { "Content-Type": "application/json", Authorization: `Bearer ${login.accessToken}` }
const kb = await fetch(`${API}/api/knowledge/knowledge-bases`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ name: "视觉审计 KB" }),
}).then((r) => r.json())
const mkDoc = async (title, editorType, content) =>
  fetch(`${API}/api/knowledge/documents`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ kbId: kb.id, title, type: "doc", editorType, status: "draft", content }),
  }).then((r) => r.json())
const doc = await mkDoc("审计-富文本文档", "nuxt-editor", {
  scheme: "text/markdown",
  value:
    "# 审计标题\n\n一段足够长的正文用于撑起编辑器渲染，验证横向溢出与文本截断情况。包括中文、English、数字 1234567890 混排。",
})
const board = await mkDoc("审计-画板", "board", {
  scheme: "application/vnd.kb-board+json",
  value: { elements: [], appState: {} },
})
const datatable = await mkDoc("审计-数据表", "datatable", {
  scheme: "application/vnd.kb-datatable+json",
  value: { fields: [{ id: "f1", name: "名称", type: "text" }], rows: [] },
})
const sheet = await mkDoc("审计-表格", "sheet", {
  scheme: "application/vnd.kb-datatable+json",
  value: { fields: [], rows: [] },
})
const mindmap = await mkDoc("审计-思维导图", "mindmap", {
  scheme: "application/vnd.kb-mindmap+json",
  value: { data: { text: "中心主题", uid: "auditroot1" }, children: [] },
})

const routes = [
  ["/knowledge", "知识库列表"],
  ["/knowledge/start", "开始页"],
  ["/knowledge/notes", "小记"],
  ["/knowledge/boards", "画板库"],
  ["/knowledge/favorites", "收藏"],
  ["/knowledge/trash", "回收站"],
  ["/knowledge/ai-writing", "AI 写作"],
  ["/account", "账号"],
  [`/knowledge/${kb.id}`, "工作台首页"],
  [`/knowledge/${kb.id}/overview`, "概览"],
  [`/knowledge/${kb.id}/search`, "库内搜索"],
  [`/knowledge/${kb.id}/doc/${doc.id}`, "富文本文档"],
  [`/knowledge/${kb.id}/board/${board.id}`, "画板"],
  [`/knowledge/${kb.id}/datatable/${datatable.id}`, "数据表"],
  [`/knowledge/${kb.id}/sheet/${sheet.id}`, "表格"],
  [`/knowledge/${kb.id}/mindmap/${mindmap.id}`, "思维导图"],
  [`/kb-settings/${kb.id}`, "KB 设置独立窗"],
]

// 可参数化：AUDIT_DARK=1 暗色模式、AUDIT_WIDTH/AUDIT_HEIGHT 视口（盲区覆盖：暗色逐页/窄窗）
const AUDIT_DARK = process.env.AUDIT_DARK === "1"
const AUDIT_WIDTH = Number(process.env.AUDIT_WIDTH ?? 1600)
const AUDIT_HEIGHT = Number(process.env.AUDIT_HEIGHT ?? 952)
const MODE_LABEL = `${AUDIT_DARK ? "暗色" : "亮色"}@${AUDIT_WIDTH}x${AUDIT_HEIGHT}`

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })
const page = await browser.newPage({ viewport: { width: AUDIT_WIDTH, height: AUDIT_HEIGHT } })
if (AUDIT_DARK) {
  await page.addInitScript(() => {
    window.localStorage.setItem("vueuse-color-scheme", "dark")
  })
}
await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" })
await page.getByRole("textbox", { name: "账号" }).fill("demo@example.com")
await page.getByRole("textbox", { name: "密码" }).fill("123456")
await Promise.all([
  page.waitForURL((u) => u.pathname === "/knowledge", { timeout: 30000 }),
  page.getByRole("button", { name: "登录并进入" }).click(),
])

const report = []
for (const [path, label] of routes) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {})
  await page.waitForTimeout(2200)

  const issues = await page.evaluate(() => {
    const out = []
    const vw = document.documentElement.clientWidth

    // ① 横向溢出（页面级）
    if (document.documentElement.scrollWidth > vw + 2) {
      out.push(`页面横向溢出 scrollW=${document.documentElement.scrollWidth} vw=${vw}`)
    }

    // ② 文本截断且无 title 提示（非装饰性）
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el)
      if (
        el.scrollWidth > el.clientWidth + 3 &&
        cs.overflowX !== "visible" &&
        cs.overflowX !== "auto" &&
        cs.overflowX !== "scroll" &&
        el.clientHeight > 0 &&
        !el.hasAttribute("title") &&
        (el.textContent ?? "").trim().length > 0 &&
        el.children.length === 0
      ) {
        out.push(
          `文本截断无提示 <${el.tagName.toLowerCase()} class="${(el.className + "").slice(0, 40)}"> "${(el.textContent ?? "").trim().slice(0, 18)}"`,
        )
        if (out.length > 8) break
      }
    }

    // ②b 暗色模式：大面积亮背景（暗色链路漏改的白斑）
    if (document.documentElement.classList.contains("dark")) {
      let brightArea = 0
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        if (r.width < 40 || r.height < 20 || r.width * r.height < 4000) continue
        const m = cs.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/)
        if (!m) continue
        const alpha = m[4] === undefined ? 1 : Number(m[4])
        if (alpha < 0.6) continue
        const luma = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])
        if (luma > 225) {
          brightArea += r.width * r.height
        }
      }
      const viewportArea = innerWidth * innerHeight
      if (brightArea / viewportArea > 0.18) {
        out.push(
          `暗色亮斑：亮背景元素覆盖 ${((100 * brightArea) / viewportArea).toFixed(0)}% 视口（暗色链路疑漏改）`,
        )
      }
    }

    // ②c 窄窗：可见元素超右缘（横向挤压证据）
    if (innerWidth <= 1000) {
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        if (
          r.width > 8 &&
          r.height > 8 &&
          r.right > innerWidth + 2 &&
          cs.position !== "fixed" &&
          cs.visibility !== "hidden" &&
          (el.textContent ?? "").trim().length > 0
        ) {
          out.push(
            `元素超右缘 right=${r.right.toFixed(0)} vw=${innerWidth}：<${el.tagName.toLowerCase()} class="${(el.className + "").slice(0, 40)}"> "${(el.textContent ?? "").trim().slice(0, 16)}"`,
          )
          if (out.filter((o) => o.startsWith("元素超右缘")).length > 4) break
        }
      }
    }

    // ③ 容器内容贴边：有边框容器的首个/末个可见子元素距容器边框 < 6px
    //（「标题贴卡片边框」一类：容器 padding 不足或子元素负 margin 吃掉间距）
    for (const el of document.querySelectorAll("div, article, section")) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const hasBorder = parseFloat(cs.borderTopWidth) > 0
      if (!hasBorder || r.height < 60 || r.width < 120 || r.top < -40 || r.top > innerHeight) {
        continue
      }
      const kids = Array.from(el.children).filter((kid) => {
        const kcs = getComputedStyle(kid)
        const kr = kid.getBoundingClientRect()
        return (
          kcs.display !== "none" && kcs.visibility !== "hidden" && kr.height > 4 && kr.width > 8
        )
      })
      if (kids.length === 0) continue
      const padTop = parseFloat(cs.paddingTop)
      const padBottom = parseFloat(cs.paddingBottom)
      const first = kids[0].getBoundingClientRect()
      const last = kids[kids.length - 1].getBoundingClientRect()
      const topGap = first.top - r.top - parseFloat(cs.borderTopWidth)
      const bottomGap = r.bottom - parseFloat(cs.borderBottomWidth) - last.bottom
      if (topGap >= 0 && topGap < 6 - padTop && padTop < 6) {
        out.push(
          `内容贴顶 ${topGap.toFixed(1)}px：<${el.tagName.toLowerCase()} class="${(el.className + "").slice(0, 44)}"> 首子元素 "${(kids[0].textContent ?? "").trim().slice(0, 14)}"`,
        )
      }
      if (bottomGap >= 0 && bottomGap < 6 - padBottom && padBottom < 6) {
        out.push(
          `内容贴底 ${bottomGap.toFixed(1)}px：<${el.tagName.toLowerCase()} class="${(el.className + "").slice(0, 44)}"> 末子元素 "${(kids[kids.length - 1].textContent ?? "").trim().slice(0, 14)}"`,
        )
      }
      if (out.length > 10) break
    }
    return out
  })

  report.push({ label, path, issues })
}

for (const { label, path, issues } of report) {
  console.log(`\n【${label}】${path}（${MODE_LABEL}）`)
  if (issues.length === 0) {
    console.log("  ✅ 无发现")
  } else {
    for (const issue of issues) console.log("  ⚠️ " + issue)
  }
}

// 清理测试 KB（级联删文档）
await fetch(`${API}/api/knowledge/knowledge-bases/${kb.id}`, { method: "DELETE", headers: H })
await browser.close()

import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const BASE = "http://127.0.0.1:4173"
const OUT = "/tmp/kb-ux"
mkdirSync(OUT, { recursive: true })

// ---- 颜色工具 ----
const parseColor = str => {
  const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
  if (!m) return null
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
}
const lum = ({ r, g, b }) => {
  const f = v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a, b) => {
  const l1 = lum(a), l2 = lum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })

const auditPage = async (page, theme) =>
  page.evaluate(
    ({ theme, parseColorSrc, lumSrc, contrastSrc }) => {
      const parseColor = eval(parseColorSrc)
      const lum = eval(lumSrc)
      const contrast = eval(contrastSrc)
      const out = { theme, lowContrast: [], darkLightBlocks: [], smallFonts: [], tinyTargets: [], radii: {}, overflowX: [] }

      const effBg = el => {
        let node = el
        while (node && node !== document.documentElement) {
          const c = parseColor(getComputedStyle(node).backgroundColor)
          if (c && c.a > 0.85) return c
          if (c && c.a > 0.15) {
            // 半透明：与其父级背景叠算（简化为叠白/叠黑按主题）
            const parent = effBg(node.parentElement)
            if (parent) {
              const w = c.a
              return {
                r: c.r * w + parent.r * (1 - w),
                g: c.g * w + parent.g * (1 - w),
                b: c.b * w + parent.b * (1 - w),
              }
            }
          }
          node = node.parentElement
        }
        return parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 }
      }

      const label = el => {
        const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "")
        return `${el.tagName.toLowerCase()}${cls ? "." + cls.split(/\s+/).slice(0, 3).join(".") : ""}`
      }

      // 1) 文本对比度
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const seen = new Set()
      while (walker.nextNode()) {
        const t = walker.currentNode
        const text = t.textContent.trim()
        if (!text || text.length < 2) continue
        const el = t.parentElement
        if (!el || seen.has(el)) continue
        seen.add(el)
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const st = getComputedStyle(el)
        if (st.visibility === "hidden" || +st.opacity < 0.35) continue
        const fg = parseColor(st.color)
        const bg = effBg(el)
        if (!fg || !bg) continue
        const ratio = contrast(fg, bg)
        const large = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && +st.fontWeight >= 700)
        const need = large ? 3 : 4.5
        if (ratio < need) {
          out.lowContrast.push({ sel: label(el), ratio: +ratio.toFixed(2), size: st.fontSize, text: text.slice(0, 24) })
        }
        // 2) 过小字号
        const fs = parseFloat(st.fontSize)
        if (fs < 11) out.smallFonts.push({ sel: label(el), size: st.fontSize, text: text.slice(0, 20) })
      }

      // 3) 暗色下的亮块残留
      if (theme === "dark") {
        for (const el of document.querySelectorAll("body *")) {
          const st = getComputedStyle(el)
          const c = parseColor(st.backgroundColor)
          if (!c || c.a < 0.9) continue
          const l = lum(c)
          if (l < 0.55) continue
          const rect = el.getBoundingClientRect()
          if (rect.width * rect.height < 3000) continue
          if (el.querySelector("canvas, img, video")) continue
          out.darkLightBlocks.push({ sel: label(el), w: Math.round(rect.width), h: Math.round(rect.height), bg: st.backgroundColor })
          if (out.darkLightBlocks.length > 25) break
        }
      }

      // 4) 点击目标过小（按钮/可点击元素高度 < 22px）
      for (const el of document.querySelectorAll("button, [role='button'], a[href]")) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0) continue
        if (rect.height < 22) out.tinyTargets.push({ sel: label(el), h: Math.round(rect.height) })
      }

      // 5) 圆角普查（button / 卡片类）
      for (const el of document.querySelectorAll("button, [class*='rounded'], [class*='card']")) {
        const r = getComputedStyle(el).borderRadius
        if (r && r !== "0px") out.radii[r] = (out.radii[r] || 0) + 1
      }

      // 6) 横向溢出
      for (const el of document.querySelectorAll("body *")) {
        if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
          const st = getComputedStyle(el)
          if (st.overflowX === "visible") {
            const rect = el.getBoundingClientRect()
            if (rect.width > 100)
              out.overflowX.push({ sel: label(el), sw: el.scrollWidth, cw: el.clientWidth })
          }
        }
        if (out.overflowX.length > 12) break
      }

      // 7) 页面文本量（空页面检测）
      out.textLen = (document.body.innerText || "").replace(/\s+/g, "").length
      return out
    },
    {
      theme,
      parseColorSrc: parseColor.toString(),
      lumSrc: lum.toString(),
      contrastSrc: contrast.toString(),
    }
  )

const sessionRaw = (await (await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "demo@example.com", password: "123456" }),
})).json())
const token = sessionRaw.accessToken

const api = async path => {
  const res = await fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}
const kbList = await api("/knowledge/knowledge-bases")
const kbs = kbList.data || kbList
const kb = Array.isArray(kbs) ? kbs.find(k => k.name === "默认知识库") || kbs[0] : kbs
const tree = await api(`/knowledge/documents/tree?kbId=${kb.id}`)
const nodes = tree.data || tree
const flat = []
const walk = list => (list || []).forEach(n => { flat.push(n); walk(n.children) })
walk(Array.isArray(nodes) ? nodes : nodes.items || nodes.nodes || [])
const doc = flat.find(n => (n.type || n.kind) === "doc") || flat[0]
console.log("审计目标 KB:", kb.name, "DOC:", doc?.title)

const pages = [
  ["login", "/auth/login"],
  ["bases", "/knowledge"],
  ["workspace-home", `/knowledge/${kb.id}`],
  ["search", `/knowledge/${kb.id}/search?query=%E7%9F%A5%E8%AF%86`],
  ["trash", "/knowledge/trash"],
  ["settings", `/knowledge/${kb.id}/settings`],
  ["doc-editor", `/knowledge/${kb.id}/doc/${doc.id}`],
]

const report = {}
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 952 } })
  await ctx.addInitScript(`
    localStorage.setItem("vueuse-color-scheme", "${theme}")
    localStorage.setItem("tools-web-auth-session", ${JSON.stringify(JSON.stringify({ accessToken: token, user: sessionRaw.user }))})
  `)
  const page = await ctx.newPage()
  await page.route("**/*", route => {
    const url = route.request().url()
    if (url.includes("zhangzhengyang.com")) return route.abort()
    return route.continue()
  })
  for (const [name, path] of pages) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 25000 })
      await page.waitForTimeout(name === "doc-editor" ? 3000 : 1200)
      const r = await auditPage(page, theme)
      // 聚合 top 结果
      r.lowContrast.sort((a, b) => a.ratio - b.ratio)
      report[`${name}-${theme}`] = {
        textLen: r.textLen,
        lowContrast: r.lowContrast.slice(0, 6),
        lowContrastTotal: r.lowContrast.length,
        darkLightBlocks: r.darkLightBlocks.slice(0, 10),
        smallFonts: [...new Map(r.smallFonts.map(x => [x.sel, x])).values()].slice(0, 8),
        tinyTargets: [...new Map(r.tinyTargets.map(x => [x.sel, x])).values()].slice(0, 8),
        radiiTop: Object.entries(r.radii).sort((a, b) => b[1] - a[1]).slice(0, 10),
        overflowX: r.overflowX.slice(0, 6),
      }
      console.log("audited:", name, theme)
    } catch (e) {
      console.log("FAIL:", name, theme, e.message.split("\n")[0])
    }
  }
  await ctx.close()
}

// 焦点可见性：登录页与编辑器抽查
const ctx = await browser.newContext({ viewport: { width: 1600, height: 952 } })
await ctx.addInitScript(`
  localStorage.setItem("tools-web-auth-session", ${JSON.stringify(JSON.stringify({ accessToken: token, user: sessionRaw.user }))})
`)
const page = await ctx.newPage()
await page.route("**/*", route => {
  const url = route.request().url()
  if (url.includes("zhangzhengyang.com")) return route.abort()
  return route.continue()
})
await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" })
const focusReport = await page.evaluate(() => {
  const res = []
  for (const el of document.querySelectorAll("input, button, [role='combobox']")) {
    el.focus()
    const st = getComputedStyle(el)
    res.push({
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute("name") || el.placeholder || (el.textContent || "").slice(0, 12),
      outline: `${st.outlineStyle}/${st.outlineWidth}`,
      shadow: st.boxShadow !== "none",
    })
  }
  return res.slice(0, 20)
})
console.log("FOCUS-ON-LOGIN:", JSON.stringify(focusReport))
await browser.close()

import { writeFileSync } from "node:fs"
writeFileSync(`${OUT}/audit-report.json`, JSON.stringify(report, null, 2))
console.log("DONE")

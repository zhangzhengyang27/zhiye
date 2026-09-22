import fs from "node:fs"
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const OUT = process.env.GEOM_OUT || "/tmp/geom.json"
const prefix = "[几何]"
const { browser, context, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await context.addInitScript(() => {
  globalThis.localStorage.setItem("vueuse-color-scheme", "light")
})
const url = path => new URL(path, "http://127.0.0.1:4173").toString()
const result = {}

const snapshot = async name => {
  result[name] = await page.evaluate(() => {
    const pick = el => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        tag: el.tagName,
        cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 90),
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
        fw: cs.fontWeight,
        fs: cs.fontSize,
        lh: cs.lineHeight,
      }
    }
    const out = { buttons: [], points: {} }
    document.querySelectorAll("button").forEach(b => out.buttons.push(pick(b)))
    return out
  })
}

try {
  await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  await snapshot("login")
  await loginThroughUi(page, prefix)
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace 编辑器工具栏验证")
  const doc = await ensureDocument(kb.id, token, { title: "EP 迁移基线验证", content: "# 几何\n" })

  await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  await snapshot("account")
  // 追加指定点位元素链
  result.accountPoints = await page.evaluate(() => {
    const desc = ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const chain = []
      let cur = el
      for (let i = 0; i < 3 && cur && cur !== document.body; i++) {
        const r = cur.getBoundingClientRect()
        chain.push({ tag: cur.tagName, cls: String(cur.className?.baseVal ?? cur.className ?? "").slice(0, 80), x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) })
        cur = cur.parentElement
      }
      return chain
    }
    return { avatarEdge: desc([460, 165]), labelTail: desc([510, 685]) }
  })

  await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1500)
  await snapshot("workspace")
  result.workspacePoints = await page.evaluate(() => {
    const el = document.elementFromPoint(1178, 344)
    if (!el) return null
    const chain = []
    let cur = el
    for (let i = 0; i < 4 && cur && cur !== document.body; i++) {
      const r = cur.getBoundingClientRect()
      chain.push({ tag: cur.tagName, cls: String(cur.className?.baseVal ?? cur.className ?? "").slice(0, 90), x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) })
      cur = cur.parentElement
    }
    return chain
  })

  await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
  await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
  await page.waitForTimeout(1500)
  await snapshot("editor")
  result.editorPoints = await page.evaluate(() => {
    const seen = new Map()
    ;[[680, 20], [760, 20], [900, 20], [1100, 20]].forEach(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return
      const r = el.getBoundingClientRect()
      seen.set(`${x},${y}`, {
        tag: el.tagName,
        cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 90),
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
      })
    })
    return seen
  })
} finally {
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1))
  await browser.close()
}
console.log("written", OUT)

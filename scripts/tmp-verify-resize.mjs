import assert from "node:assert/strict"
import { chromium } from "playwright"

const BASE = "http://127.0.0.1:4173"
const HANDLES = { shell: "调整导航栏宽度", tree: "调整目录栏宽度" }

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()

await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" })
await page.getByRole("textbox", { name: "账号" }).fill("demo@example.com")
await page.getByRole("textbox", { name: "密码" }).fill("123456")
await page.getByRole("button", { name: "登录并进入" }).click()
await page.waitForURL((u) => u.pathname === "/knowledge")
const kb = await page.evaluate(async () => {
  const raw = JSON.parse(localStorage.getItem("tools-web-auth-session") || "{}")
  const r = await fetch("/api/knowledge/knowledge-bases", {
    headers: { Authorization: `Bearer ${raw.accessToken}` },
  })
  const j = await r.json()
  return Array.isArray(j) ? j[0] : j?.data?.[0]
})
await page.goto(`${BASE}/knowledge/${kb.id}/overview`, { waitUntil: "networkidle" })
await page.waitForTimeout(700)

const probe = (label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`button[aria-label="${l}"]`)
    const span = el.querySelector("span")
    const panel = el.previousElementSibling
    const r = el.getBoundingClientRect()
    const sr = span.getBoundingClientRect()
    const cs = getComputedStyle(span)
    return {
      gutter: [r.x, r.width],
      span: [sr.x, sr.width],
      spanBg: cs.backgroundColor,
      panelRight: panel.getBoundingClientRect().right,
      panelBorder: getComputedStyle(panel).borderRightWidth,
      grid: getComputedStyle(el.parentElement).gridTemplateColumns,
    }
  }, label)

const drive = (label, steps, dx = 40) =>
  page.evaluate(
    ({ l, steps, dx }) => {
      const el = document.querySelector(`button[aria-label="${l}"]`)
      const cx = el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2
      const fire = (t, type, x) =>
        t.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: 400,
            button: 0,
            pointerId: 3,
            isPrimary: true,
            pointerType: "mouse",
          }),
        )
      for (const s of steps) {
        if (s === "down") fire(el, "pointerdown", cx)
        else if (s === "move") fire(window, "pointermove", cx + dx)
        else if (s === "cancel") fire(window, "pointercancel", cx + dx)
        else if (s === "up") fire(window, "pointerup", cx + dx)
      }
      return null
    },
    { l: label, steps, dx },
  )

const results = []
const check = (name, fn) =>
  fn().then((value) => results.push([value.ok ? "PASS" : "FAIL", name, value.detail]))

for (const [key, label] of Object.entries(HANDLES)) {
  // 1. pointercancel must end the drag state, and a later move must not keep resizing
  await drive(label, ["down", "move"])
  const mid = await probe(label)
  await drive(label, ["cancel"])
  await page.waitForTimeout(250)
  const afterCancel = await probe(label)
  await drive(label, ["move"], -120)
  await page.waitForTimeout(150)
  const ghost = await probe(label)
  results.push([
    afterCancel.spanBg === "rgba(0, 0, 0, 0)" &&
    ghost.grid === afterCancel.grid &&
    mid.spanBg !== "rgba(0, 0, 0, 0)"
      ? "PASS"
      : "FAIL",
    `${key}: 拖拽中显色 / pointercancel 收尾 / 之后不再跟随鼠标`,
    `mid=${mid.spanBg} cancel=${afterCancel.spanBg} grid ${afterCancel.grid} -> ${ghost.grid}`,
  ])

  // 2. normal drag persists a new width and restores the idle look
  const before = (await probe(label)).grid
  await drive(label, ["down", "move", "up"])
  await page.waitForTimeout(200)
  const done = await probe(label)
  results.push([
    done.grid !== before && done.spanBg === "rgba(0, 0, 0, 0)" ? "PASS" : "FAIL",
    `${key}: 真实拖拽改宽并复位`,
    `${before} -> ${done.grid} idle=${done.spanBg}`,
  ])

  // 3. hit area: every offset within +-6px of the divider must land on the handle
  const hit = await page.evaluate((l) => {
    const el = document.querySelector(`button[aria-label="${l}"]`)
    const r = el.getBoundingClientRect()
    return [-5, -3, -1, 0, 1, 3, 5].map((dx) => {
      const e = document.elementFromPoint(r.x + r.width / 2 + dx, 400)
      return e === el || el.contains(e)
    })
  }, label)
  results.push([
    hit.every(Boolean) ? "PASS" : "FAIL",
    `${key}: 分隔线两侧 ±6px 命中拖拽条`,
    JSON.stringify(hit),
  ])

  // 4. indicator overlays the panel border instead of forming a second line
  await page.mouse.move((await probe(label)).gutter[0] + 2, 400)
  await page.waitForTimeout(300)
  const hov = await probe(label)
  const overlaps = hov.span[0] <= hov.panelRight - 1 && hov.span[0] + hov.span[1] > hov.panelRight
  results.push([
    overlaps ? "PASS" : "FAIL",
    `${key}: hover 指示条压住 border-r（不出现双线）`,
    `span=${hov.span} panelRight=${hov.panelRight} bg=${hov.spanBg}`,
  ])
  await page.mouse.move(900, 800)
  await page.waitForTimeout(250)
}

// 5. neighbours keep their own click targets despite the widened handle
const neighbours = await page.evaluate(() => {
  const pill = document.querySelector('[title="收起目录栏"]')
  const pr = pill.getBoundingClientRect()
  const onPill = document.elementFromPoint(pr.x + pr.width / 2, pr.y + pr.height / 2)
  const row = document.querySelector('[title="更多操作"]')
  if (!row) return { pill: onPill?.getAttribute("title") || onPill?.tagName, more: "no row found" }
  const rr = row.getBoundingClientRect()
  const onMore = document.elementFromPoint(rr.x + rr.width / 2, rr.y + rr.height / 2)
  return {
    pill: onPill?.getAttribute("title") || onPill?.tagName,
    more: onMore?.getAttribute("title") || onMore?.tagName,
  }
})
results.push([
  neighbours.pill === "收起目录栏" && neighbours.more === "更多操作" ? "PASS" : "FAIL",
  "加宽命中面未遮挡「收起目录栏」与树行「更多操作」",
  JSON.stringify(neighbours),
])

// 6. both handles share one visual spec
const a = await probe(HANDLES.shell)
const b = await probe(HANDLES.tree)
results.push([
  a.span[1] === b.span[1] && a.gutter[1] === b.gutter[1] ? "PASS" : "FAIL",
  "两条拖拽条规格一致",
  `span ${a.span[1]}/${b.span[1]} gutter ${a.gutter[1]}/${b.gutter[1]}`,
])

// 7. dark theme: idle indicator must be invisible, active must be a neutral grey
await page.evaluate(() => document.documentElement.classList.add("dark"))
await page.waitForTimeout(250)
const darkIdle = await probe(HANDLES.shell)
await drive(HANDLES.shell, ["down", "move"])
const darkActive = await probe(HANDLES.shell)
await drive(HANDLES.shell, ["up"])
results.push([
  darkIdle.spanBg === "rgba(0, 0, 0, 0)" && darkActive.spanBg !== "rgba(0, 0, 0, 0)"
    ? "PASS"
    : "FAIL",
  "暗色：常态隐形 / 拖拽中显色",
  `idle=${darkIdle.spanBg} active=${darkActive.spanBg}`,
])

for (const [status, name, detail] of results) console.log(`${status}  ${name}\n        ${detail}`)
await browser.close()
assert.ok(
  results.every((r) => r[0] === "PASS"),
  "存在失败项",
)

import { chromium } from "playwright"

const BASE = "http://127.0.0.1:4173"
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })
const context = await browser.newContext({
  viewport: { width: 789, height: 868 },
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
  return Array.isArray(j) ? j[0] : (j?.data?.[0] ?? j?.list?.[0])
})
await page.goto(`${BASE}/knowledge/${kb.id}/overview`, { waitUntil: "networkidle" })
await page.waitForTimeout(800)

const snap = () =>
  page.evaluate(() => {
    const grids = [...document.querySelectorAll(".grid")].map(
      (g) => getComputedStyle(g).gridTemplateColumns,
    )
    const info = (label) => {
      const el = document.querySelector(`button[aria-label="${label}"]`)
      const span = el.querySelector("span")
      const cs = getComputedStyle(span)
      const r = el.getBoundingClientRect()
      return {
        x: +r.x.toFixed(1),
        w: +r.width.toFixed(1),
        cls: span.className,
        bg: cs.backgroundColor,
        col: cs.color,
        grid: getComputedStyle(el.parentElement).gridTemplateColumns,
      }
    }
    return { grids: [], shell: info("调整导航栏宽度"), tree: info("调整目录栏宽度") }
  })
const show = async (tag) => {
  const s = await snap()
  console.log(`\n[${tag}]`)
  console.log(
    "  shell grid=%s x=%s w=%s bg=%s\n        %s",
    s.shell.grid,
    s.shell.x,
    s.shell.w,
    s.shell.bg,
    s.shell.cls,
  )
  console.log(
    "  tree  grid=%s x=%s w=%s bg=%s\n        %s",
    s.tree.grid,
    s.tree.x,
    s.tree.w,
    s.tree.bg,
    s.tree.cls,
  )
}

await show("baseline")

// real mouse drag on the tree panel handle
const t = await page.locator('button[aria-label="调整目录栏宽度"]').boundingBox()
console.log("\ntree handle box", t)
await page.mouse.move(t.x + t.width / 2, 400)
await show("hover tree handle")
await page.mouse.down()
await page.mouse.move(t.x + t.width / 2 + 70, 400, { steps: 10 })
await show("tree mid drag")
await page.mouse.up()
await show("tree after up")
console.log(
  "  persisted:",
  await page.evaluate(() => Object.entries(localStorage).filter(([k]) => /width/i.test(k))),
)

// real mouse drag on the shell handle
const s = await page.locator('button[aria-label="调整导航栏宽度"]').boundingBox()
console.log("\nshell handle box", s)
await page.mouse.move(s.x + s.width / 2, 400)
await page.mouse.down()
await page.mouse.move(s.x + s.width / 2 - 60, 400, { steps: 10 })
await show("shell mid drag")
await page.mouse.up()
await show("shell after up")

// hit-area test: click 6px to the right of the tree handle edge (where a user aims)
const hit = await page.evaluate(() => {
  const el = document.querySelector('button[aria-label="调整目录栏宽度"]')
  const r = el.getBoundingClientRect()
  const probe = (dx) => {
    const e = document.elementFromPoint(r.x + r.width / 2 + dx, 400)
    return e === el || el.contains(e)
      ? e.getAttribute("aria-label") || e.tagName
      : (e.getAttribute("aria-label") || e.className || e.tagName).toString().slice(0, 40)
  }
  return [-8, -4, -2, -1, 0, 1, 2, 4, 8].map((dx) => `${dx}px -> ${probe(dx)}`)
})
console.log("\nhit test around tree handle:", hit)
const hit2 = await page.evaluate(() => {
  const el = document.querySelector('button[aria-label="调整导航栏宽度"]')
  const r = el.getBoundingClientRect()
  const probe = (dx) => {
    const e = document.elementFromPoint(r.x + r.width / 2 + dx, 400)
    return e === el || el.contains(e)
      ? "HANDLE"
      : (e.getAttribute("aria-label") || e.className || e.tagName).toString().slice(0, 40)
  }
  return [-8, -4, -2, -1, 0, 1, 2, 4, 8].map((dx) => `${dx}px -> ${probe(dx)}`)
})
console.log("hit test around shell handle:", hit2)

// synthetic cancel: no pointerup follows in the real world (touch takeover / release outside window)
const cancelOnly = (label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`button[aria-label="${l}"]`)
    const r = el.getBoundingClientRect()
    const fire = (t, type, x) =>
      t.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: 400,
          button: 0,
          pointerId: 7,
          isPrimary: true,
          pointerType: "mouse",
        }),
      )
    fire(el, "pointerdown", r.x + r.width / 2)
    fire(window, "pointermove", r.x + r.width / 2 + 50)
    fire(window, "pointercancel", r.x + r.width / 2 + 50)
  }, label)

for (const label of ["调整目录栏宽度", "调整导航栏宽度"]) {
  await cancelOnly(label)
  await page.waitForTimeout(200)
  await show(`after pointercancel on ${label}`)
  // a plain hover-less mouse move afterwards: does the panel keep following the cursor?
  const before = await snap()
  await page.mouse.move(700, 700)
  await page.waitForTimeout(200)
  const after = await snap()
  console.log(
    "  ghost drag:",
    label,
    before.tree.grid,
    "/",
    before.shell.grid,
    "->",
    after.tree.grid,
    "/",
    after.shell.grid,
  )
  await page.evaluate((l) => {
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 700,
        clientY: 700,
        button: 0,
        pointerId: 7,
      }),
    )
  }, label)
  await page.waitForTimeout(150)
}
await show("final")
await browser.close()

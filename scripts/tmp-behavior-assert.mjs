import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const results = []
const assert = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " —— " + detail : ""}`)
}

const { browser, context, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
await context.addInitScript(() => {
  globalThis.localStorage.setItem("vueuse-color-scheme", "light")
})
const url = path => new URL(path, "http://127.0.0.1:4173").toString()

/* ========== 登录页：submit / block / loading / active / focus ========== */
await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
await page.waitForTimeout(800)

const loginBtnInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => (b.textContent || "").includes("登录并进入"))
  if (!btn) return null
  return {
    type: btn.getAttribute("type"),
    nativeTypeOk: btn.type === "submit",
    cls: btn.className,
    w: btn.getBoundingClientRect().width,
    parentW: btn.parentElement.getBoundingClientRect().width,
    epSizeCls: [...btn.classList].find(c => c.startsWith("el-button--")),
    ariaDisabled: btn.getAttribute("aria-disabled"),
  }
})
assert("submit 按钮 native type=submit（EP native-type 直传）", loginBtnInfo?.nativeTypeOk === true, JSON.stringify(loginBtnInfo?.type))
assert("block 全宽（≈父容器内容宽）", loginBtnInfo && Math.abs(loginBtnInfo.w - loginBtnInfo.parentW) < 2, `w=${loginBtnInfo?.w} parent=${loginBtnInfo?.parentW}`)
assert("EP size=lg → el-button--large 语义档", loginBtnInfo?.epSizeCls === "el-button--large", loginBtnInfo?.epSizeCls)
assert("未禁用（aria-disabled=false，EP 白赚语义）", loginBtnInfo?.ariaDisabled === "false", String(loginBtnInfo?.ariaDisabled))

// active:scale 真实鼠标按住（LoginView 调用方 active:scale-[0.98] 应覆盖基座 0.97）
const lb = page.locator('button[type="submit"]')
const box = await lb.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.waitForTimeout(300)
const pressed = await page.evaluate(() => {
  const btn = document.querySelector('button[type="submit"]')
  return { scale: getComputedStyle(btn).scale, transform: getComputedStyle(btn).transform }
})
await page.mouse.up()
assert("active 按下 scale 生效（调用方覆盖 0.97→0.98，tailwind-merge 契约成立）", pressed.scale.includes("0.98"), JSON.stringify(pressed))

// loading：错误密码触发请求期 loading 窗口（窗口很短，立即采样）
await page.fill('input[placeholder="请输入密码"]', "wrong-password-for-loading")
await page.fill('input[placeholder="请输入账号、邮箱或手机号"]', "demo@example.com")
const loadingProbe = page.waitForSelector("button.el-button.is-loading", { timeout: 8000 }).then(
  () => true,
  () => false
)
await page.click('button[type="submit"]')
const sawLoading = await loadingProbe
assert("loading：出现 is-loading（EP 原生 loading prop）", sawLoading)
if (sawLoading) {
  const loadingState = await page.evaluate(() => {
    const btn = document.querySelector("button.el-button.is-loading")
    if (!btn) return null
    const svg = btn.querySelector("svg")
    return {
      disabled: btn.disabled,
      spinnerSvg: Boolean(svg),
      spinnerCls: svg ? `${svg.getAttribute("class")}|parent:${svg.parentElement.getAttribute("class")}` : "",
      overlayBefore: getComputedStyle(btn, "::before").content,
      pointerEvents: getComputedStyle(btn).pointerEvents,
    }
  })
  assert("loading：原生 disabled 属性（点击被抑制）", loadingState?.disabled === true)
  assert("loading：spinner 为 AppIcon lucide loader-circle（#loading 插槽自绘）", loadingState?.spinnerSvg === true && (loadingState?.spinnerCls || "").includes("lucide-loader-circle"), (loadingState?.spinnerCls || "").slice(0, 110))
  assert("loading：EP 蒙版 ::before 已压掉（content:none）", loadingState?.overlayBefore === "none", loadingState?.overlayBefore)
  await page.waitForSelector("button.el-button.is-loading", { state: "detached", timeout: 15000 }).catch(() => {})
}

// focus-visible 环（真实键盘 Tab：email → password → submit）
await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
await page.waitForTimeout(600)
await page.keyboard.press("Tab")
await page.keyboard.press("Tab")
await page.keyboard.press("Tab")
const focusRing = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => (b.textContent || "").includes("登录并进入"))
  return {
    matches: btn.matches(":focus-visible"),
    focused: btn.matches(":focus"),
    ring: getComputedStyle(btn).boxShadow,
    outline: getComputedStyle(btn).outlineStyle,
  }
})
assert(
  "focus-visible 环（键盘 Tab → ring box-shadow 带 brand 色）",
  focusRing.focused && focusRing.matches && !focusRing.ring.includes("rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0)"),
  JSON.stringify({ focused: focusRing.focused, matches: focusRing.matches, ring: focusRing.ring.slice(0, 100) })
)
assert("EP outline 已 revert（outline-none 生效）", ["none", "hidden"].includes(focusRing.outline), focusRing.outline)

/* ========== 登录工作台 → 各页断言 ========== */
await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
await page.waitForTimeout(600)
await loginThroughUi(page, "[断言]")
const token = await readAccessToken(page)
const kb = await ensureKnowledgeBase(token, "[断言]", "Smoke Workspace 编辑器工具栏验证")
const kbId = kb.id
const doc = await ensureDocument(kbId, token, { title: "EP 迁移基线验证", content: "# 断言\n" })
console.log("[断言] kbId =", kbId, "docId =", doc.id)

/* ---------- 禁用稳态：新建知识库弹层「创建」按钮（空名禁用） ---------- */
await page.goto(url(`/knowledge/${kbId}`), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)
await page.locator(".kb-sidebar button[title='新建']").click()
await page.getByRole("button", { name: "创建知识库" }).click()
await page.locator('[role="dialog"]').filter({ hasText: "新建知识库" }).waitFor({ state: "visible", timeout: 10_000 })
await page.waitForTimeout(300)
const disabledState = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button.el-button')].find(b => (b.textContent || "").trim() === "创建" && b.disabled)
  if (!btn) return null
  const cs = getComputedStyle(btn)
  return { opacity: cs.opacity, pointerEvents: cs.pointerEvents, cursor: cs.cursor, cls: btn.className.includes("is-disabled") }
})
assert(
  "禁用稳态：disabled 属性 + opacity-55 + pointer-events-none + not-allowed",
  disabledState?.opacity === "0.55" && disabledState?.pointerEvents === "none" && disabledState?.cursor === "not-allowed",
  JSON.stringify(disabledState)
)
await page.keyboard.press("Escape")

/* ---------- 编辑页：square 图标按钮 ---------- */
await page.goto(url(`/knowledge/${kbId}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30000 })
await page.waitForTimeout(1000)
const squareInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => b.className.includes("aspect-square"))
  if (!btn) return null
  let clicked = false
  btn.addEventListener("click", () => (clicked = true))
  btn.click()
  const r = btn.getBoundingClientRect()
  return {
    clicked,
    square: Math.abs(r.width - r.height) < 2,
    w: r.width,
    disabled: btn.disabled,
    cls: btn.className.slice(0, 130),
    epSizeCls: [...btn.classList].find(c => c.startsWith("el-button--")),
  }
})
assert("square 图标按钮存在且可点击（EP click emit 链路）", Boolean(squareInfo) && squareInfo.clicked === true, JSON.stringify(squareInfo ?? null))
assert("square 图标按钮宽高相等", squareInfo?.square === true, `w=${squareInfo?.w}`)
assert("EP size=xs → el-button--small 语义档", squareInfo?.epSizeCls === "el-button--small", squareInfo?.epSizeCls)

/* ---------- 回收站页：leading 插槽 ---------- */
await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1200)
const leadingInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => (b.textContent || "").includes("清空文档回收站"))
  if (!btn) return null
  const firstSvg = btn.querySelector("svg")
  const textSpan = [...btn.querySelectorAll("span")].find(s => !s.querySelector("svg") && (s.textContent || "").includes("清空文档回收站"))
  const before = firstSvg && textSpan ? Boolean(firstSvg.compareDocumentPosition(textSpan) & Node.DOCUMENT_POSITION_FOLLOWING) : false
  return { hasSvg: Boolean(firstSvg), svgBeforeText: before, svgCls: firstSvg?.getAttribute("class")?.slice(0, 70) }
})
assert("leading 插槽图标渲染且在文字前", leadingInfo?.hasSvg && leadingInfo?.svgBeforeText, JSON.stringify(leadingInfo))

/* ---------- 搜索页：multiline 卡片按钮 ---------- */
await page.goto(url(`/knowledge/${kbId}/search`), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)
const multilineInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find(b => b.querySelector("span.block"))
  if (!btn) return null
  const inner = btn.querySelector("span.block")
  const cs = getComputedStyle(inner)
  const btnCs = getComputedStyle(btn)
  return {
    innerWhite: cs.whiteSpace,
    justify: btnCs.justifyContent,
    textAlign: btnCs.textAlign,
    innerCls: inner.className,
    display: btnCs.display,
  }
})
assert("multiline 内容 span 不截断（white-space normal + block）", multilineInfo?.innerWhite === "normal", JSON.stringify(multilineInfo))
assert("multiline 调用方 justify-start 覆盖生效", multilineInfo?.justify === "flex-start", multilineInfo?.justify)
assert("multiline 调用方 text-left 覆盖生效", multilineInfo?.textAlign === "left" || multilineInfo?.textAlign === "start", multilineInfo?.textAlign)

console.log(`\n合计 ${results.filter(r => r.ok).length}/${results.length} 通过`)
await browser.close()
if (results.some(r => !r.ok)) process.exitCode = 1

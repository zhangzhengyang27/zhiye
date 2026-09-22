/**
 * Task 3.4 专项：全局状态提示（el-notification 重刻 StatusToast）行为断言。
 *
 * 在迁移后构建（4173 preview + 后端 3200）上运行，对 composables/use-transient-toast.ts
 * 的全局命令式链路做行为级验证（视觉像素对见 visual-capture-task-3.4.mjs）：
 *
 *  1. 出现/类型类名/配色（success/error/info 三型）
 *  2. 几何：fixed、right/top 24px、首条 min-width 240、圆角 22px、阴影、backdrop-blur
 *  3. z：内联 z-index 500（--kb-z-toast）、高于 AppDialog .el-overlay 400、elementFromPoint 命中
 *  4. 进度条：kb-toast-countdown 动画、时长=2200ms、线性、运行中、scaleX 随时间收缩
 *  5. 自动消失：2200ms 档 ± 过渡/轮询粒度；悬停不暂停（pauseOnHover=false）
 *  6. 多实例堆叠：两条并存、第二条 top = 首条 bottom + 16px GAP
 *  7. 无关闭按钮（showClose=false，基线无点击关闭）、点击 toast 本体不关闭
 *  8. 打字续命消除：连续打字期间 toast 仍按 duration 准时关闭（计时收编裸 setTimeout，
 *     EP 内建计时以 duration:0 禁用——键盘免疫回归基线）
 *  9. 进度条与关闭时刻严格同步：动画 finish 与 leave 启动差 ≤100ms（条到 0 即关）
 * 10. 弹窗 + toast 并存按 Esc：对话框关闭（AppDialog 独立 Esc 链路不受损），
 *     可见 toast 一并关闭（EP 内建，与基线的记档差异，保留）
 * 11. 暗色：同链路配色换档（--kb-* 桥接）
 * 12. 全程无 pageerror（Esc 早关后自有计时器不与 EP 实例生命周期打架）
 *
 * 用法：node scripts/verify-task-3.4.mjs（需 4173 preview + 后端 3200 在跑）
 */
/* global document, getComputedStyle, MutationObserver, performance, window */
import { createBrowserPage, logStep, loginThroughUi, smokeConfig } from "./lib/knowledge-smoke-utils.mjs"

const VIEWPORT = { width: 1247, height: 952 }
const results = []
const assert = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[Task3.4:verify]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

const toastLoc = page => page.locator(".el-notification.kb-toast:visible").last()
const toastCount = page => page.locator(".el-notification.kb-toast:visible").count()
const styles = async (page, loc) =>
  page.evaluate(
    el => {
      const cs = getComputedStyle(el)
      const bar = el.querySelector(".kb-toast__bar")
      const barCs = bar ? getComputedStyle(bar) : null
      const rect = el.getBoundingClientRect()
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        zIndex: cs.zIndex,
        inlineZ: el.style.zIndex,
        position: cs.position,
        right: cs.right,
        top: cs.top,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        backdropFilter: cs.backdropFilter,
        background: cs.backgroundColor,
        borderColor: cs.borderColor,
        barBg: barCs?.backgroundColor ?? null,
        barAnim: barCs
          ? `${barCs.animationName}|${barCs.animationDuration}|${barCs.animationTimingFunction}|${barCs.animationPlayState}`
          : null,
        barTransform: bar ? getComputedStyle(bar).transform : null,
        closeBtns: el.querySelectorAll(".el-notification__closeBtn").length,
        classes: el.className,
      }
    },
    await loc.elementHandle()
  )

/** 等可见 toast 清零 */
const waitCleared = async page => {
  for (let i = 0; i < 80; i += 1) {
    if ((await toastCount(page)) === 0) return true
    await page.waitForTimeout(100)
  }
  return false
}

const run = async () => {
  const { browser, page } = await createBrowserPage({ viewport: VIEWPORT })
  const url = path => new URL(path, smokeConfig.baseUrl).toString()
  const pageErrors = []
  page.on("pageerror", err => pageErrors.push(err))
  try {
    await loginThroughUi(page, "[Task3.4:verify]")
    await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
    const nickname = page.locator("input[type='text']").first()
    await nickname.waitFor({ state: "visible", timeout: 15_000 })
    const originalNickname = await nickname.inputValue()
    const saveButton = page.getByRole("button", { name: "保存修改" })
    const resetButton = page.getByRole("button", { name: "恢复", exact: true })

    // --- success 出现 + 几何 + 类名 ---
    await nickname.fill(`${originalNickname}调`)
    const t0 = Date.now()
    await saveButton.click()
    await page.getByText("账号资料已更新。", { exact: true }).first().waitFor({ state: "visible", timeout: 8000 })
    const s1 = await styles(page, toastLoc(page))
    assert("success toast 出现且带 kb-toast--success 类", s1.classes.includes("kb-toast kb-toast--success"), s1.classes)
    assert("position: fixed（与基线一致）", s1.position === "fixed", s1.position)
    assert("right/top = 24px（基线 right-6 top-6）", s1.right === "24px" && s1.top === "24px", `${s1.right}/${s1.top}`)
    assert(
      "z-index 内联钉 500（--kb-z-toast）",
      s1.inlineZ === "500" && s1.zIndex === "500",
      `inline=${s1.inlineZ} computed=${s1.zIndex}`
    )
    assert("min-width 240 生效（短文案 toast 宽=240）", Math.abs(s1.rect.width - 240) < 0.5, `width=${s1.rect.width}`)
    assert("圆角 22px", s1.borderRadius === "22px", s1.borderRadius)
    assert(
      "基线阴影 0 22px 48px rgba(15,23,42,0.16)",
      s1.boxShadow.includes("0px 22px 48px") && s1.boxShadow.includes("rgba(15, 23, 42, 0.16)"),
      s1.boxShadow
    )
    assert("backdrop-blur(8px)", s1.backdropFilter.includes("blur(8px)"), s1.backdropFilter)

    // --- 进度条动画（未冻结，运行中）---
    const [name, duration, timing, state] = s1.barAnim.split("|")
    assert("进度条走 kb-toast-countdown scaleX 动画", name === "kb-toast-countdown", s1.barAnim)
    assert("进度条时长 = 2200ms（与自动关闭同步）", duration === "2.2s" && timing === "linear", `${duration}/${timing}`)
    assert("进度条运行中", state === "running", state)
    const m1 = s1.barTransform.match(/matrix\(([-\d.e]+),/)
    const scaleX1 = m1 ? Number(m1[1]) : null
    await page.waitForTimeout(400)
    const barTransform2 = await page.evaluate(
      el => getComputedStyle(el.querySelector(".kb-toast__bar")).transform,
      await toastLoc(page).elementHandle()
    )
    const scaleX2 = barTransform2.match(/matrix\(([-\d.e]+),/)
      ? Number(barTransform2.match(/matrix\(([-\d.e]+),/)[1])
      : null
    assert(
      "进度条 scaleX 随时间收缩",
      scaleX1 !== null && scaleX2 !== null && scaleX2 < scaleX1,
      `scaleX ${scaleX1} → ${scaleX2}`
    )

    // --- 悬停不暂停 + 自动消失时长 ---
    const box1 = await toastLoc(page).boundingBox()
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    const cleared = await waitCleared(page)
    const elapsed = Date.now() - t0
    assert("悬停中仍按时自动消失（pauseOnHover=false）", cleared && elapsed >= 1900 && elapsed <= 3200, `${elapsed}ms`)
    assert("无关闭按钮（基线无点击关闭）", s1.closeBtns === 0, `closeBtns=${s1.closeBtns}`)

    // --- 点击 toast 本体不关闭（基线无 onClick）---
    // 恢复按钮仅在表单有改动时渲染，先制造一处改动
    await nickname.fill(`${originalNickname}调2`)
    await resetButton.click()
    await page
      .getByText("已恢复为当前保存的账号资料。", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
    const infoBox = await toastLoc(page).boundingBox()
    await page.mouse.click(infoBox.x + infoBox.width / 2, infoBox.y + infoBox.height / 2)
    await page.waitForTimeout(300)
    assert("点击 toast 本体不关闭（与基线一致）", (await toastCount(page)) >= 1)
    const sInfo = await styles(page, toastLoc(page))
    assert(
      "info 型类名与边框（--kb-border）",
      sInfo.classes.includes("kb-toast--info") && sInfo.borderColor === "rgb(239, 240, 240)",
      sInfo.borderColor
    )
    await waitCleared(page)

    // --- error 型 ---
    await nickname.fill("A")
    await saveButton.click()
    await page
      .getByText("昵称长度需在 2 到 30 个字符之间。", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
    const sErr = await styles(page, toastLoc(page))
    assert(
      "error 型类名与边框（--kb-error-light）",
      sErr.classes.includes("kb-toast--error") && sErr.borderColor === "rgb(251, 228, 231)",
      sErr.borderColor
    )
    await waitCleared(page)

    // --- 打字续命消除（计时收编裸 setTimeout，回归基线键盘免疫）---
    // toast 出现后连续往输入框打字覆盖整个 duration 窗口；EP 内建计时若仍在，
    // keydown 会不断续命导致 toast 远超 2200ms 存活、进度条与关闭脱钩。
    // 同时装两组探针：进度条动画 onfinish 时刻 + leave-active 类出现时刻（= close 时刻），
    // 断言动画播完与实际关闭对齐（±100ms）。
    await nickname.fill(`${originalNickname}调4`)
    await saveButton.click()
    await page.getByText("账号资料已更新。", { exact: true }).first().waitFor({ state: "visible", timeout: 8000 })
    await page.evaluate(() => {
      const el = document.querySelector(".el-notification.kb-toast:not([style*='display: none'])")
      const anim = document.getAnimations().find(a => a.animationName === "kb-toast-countdown")
      window.__toastProbe = { barEnd: null, leaveStart: null, t0: performance.now() }
      if (anim) {
        anim.onfinish = () => {
          window.__toastProbe.barEnd = performance.now() - window.__toastProbe.t0
        }
      }
      if (el) {
        const mo = new MutationObserver(muts => {
          for (const m of muts) {
            if (
              typeof m.target.className === "string" &&
              m.target.className.includes("el-notification-fade-leave-active") &&
              window.__toastProbe.leaveStart === null
            ) {
              window.__toastProbe.leaveStart = performance.now() - window.__toastProbe.t0
            }
          }
        })
        mo.observe(el, { attributes: true, attributeFilter: ["class"] })
      }
    })
    await nickname.click()
    // ASCII 逐字符（CDP keydown 真事件），60 字符 × 40ms ≈ 覆盖整个 2200ms 窗口
    await page.keyboard.type("toast".repeat(12), { delay: 40 })
    const typedCleared = await waitCleared(page)
    const probe = await page.evaluate(() => window.__toastProbe)
    assert(
      "连续打字期间 toast 仍准时关闭（键盘免疫，~2200ms 档）",
      typedCleared && probe.barEnd !== null && probe.barEnd >= 2000 && probe.barEnd <= 2800,
      `barEnd=${probe.barEnd}ms（相对探针 t0）`
    )
    assert(
      "toast 关闭时刻与进度条动画结束对齐（±100ms）",
      probe.barEnd !== null && probe.leaveStart !== null && Math.abs(probe.leaveStart - probe.barEnd) <= 100,
      `leaveStart=${probe.leaveStart}ms barEnd=${probe.barEnd}ms`
    )
    await waitCleared(page)

    // --- 多实例堆叠：连续两次触发，第二条 top = 首条 bottom + 16 ---
    await nickname.fill("B")
    await saveButton.click()
    await page
      .getByText("昵称长度需在 2 到 30 个字符之间。", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
    await nickname.fill("C")
    await saveButton.click()
    await page.waitForTimeout(600)
    const count = await toastCount(page)
    assert("多实例堆叠：两条并存", count === 2, `count=${count}`)
    if (count === 2) {
      const boxes = []
      for (const el of await page.locator(".el-notification.kb-toast:visible").all()) {
        boxes.push(await el.boundingBox())
      }
      boxes.sort((p, q) => p.y - q.y)
      const gap = boxes[1].y - (boxes[0].y + boxes[0].height)
      assert("堆叠间距 = 16px GAP（EP 机制）", Math.abs(gap - 16) < 1.5, `gap=${gap}`)
      assert("堆叠右缘对齐（right 24px）", Math.abs(boxes[0].x - boxes[1].x) < 0.5, `x ${boxes[0].x}/${boxes[1].x}`)
    }

    // --- ESC 关闭（EP 内建，与基线的记档差异——保留）：notification 每实例各自在
    //     document 上监听 keydown，ESC 会把当前全部可见 toast 一并关闭 ---
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const escCount = await toastCount(page)
    assert("ESC 关闭全部可见 toast（EP 内建，与基线的记档差异）", escCount === 0, `count=${escCount}`)
    await waitCleared(page)

    // --- 弹窗内触发：z 500 压过 AppDialog overlay 400 ---
    await page.getByRole("button", { name: "修改密码" }).click()
    const passwordInputs = page.locator("input[type='password']")
    await passwordInputs.nth(0).waitFor({ state: "visible", timeout: 5000 })
    await passwordInputs.nth(0).fill("12345")
    await passwordInputs.nth(1).fill("123456")
    await passwordInputs.nth(2).fill("123456")
    await page.getByRole("button", { name: "确认修改" }).click()
    await page
      .getByText("当前密码长度不能少于 6 位。", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
    const zProof = await page.evaluate(() => {
      const toast = document.querySelector(".el-notification.kb-toast:not([style*='display: none'])")
      const overlay = document.querySelector(".el-overlay")
      const rect = toast.getBoundingClientRect()
      const topEl = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return {
        toastZ: getComputedStyle(toast).zIndex,
        overlayZ: overlay ? getComputedStyle(overlay).zIndex : null,
        hit: toast.contains(topEl),
      }
    })
    assert(
      "弹窗内 toast z=500 > AppDialog overlay z=400",
      Number(zProof.toastZ) === 500 && Number(zProof.overlayZ) === 400,
      `toast=${zProof.toastZ} overlay=${zProof.overlayZ}`
    )
    assert("elementFromPoint 命中 toast（真压在弹窗之上）", zProof.hit === true)

    // --- 弹窗 + toast 并存按 Esc：对话框关闭（AppDialog 独立 Esc 链路不受 toast 改造影响），
    //     可见 toast 一并关闭（EP 内建，与基线的记档差异——保留，见文件头）---
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    const overlayGone = (await page.locator(".el-overlay:visible").count()) === 0
    const escWithDialogToast = await toastCount(page)
    assert("弹窗 + toast 并存按 Esc：对话框关闭", overlayGone)
    assert(
      "弹窗 + toast 并存按 Esc：可见 toast 一并关闭（EP 内建，记档差异）",
      escWithDialogToast === 0,
      `count=${escWithDialogToast}`
    )
    await waitCleared(page)

    // --- 暗色换档 ---
    await page.evaluate(() => document.documentElement.classList.add("dark"))
    await page.waitForTimeout(300)
    await nickname.fill(`${originalNickname}调3`)
    await resetButton.click()
    await page
      .getByText("已恢复为当前保存的账号资料。", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
    const darkBg = await page.evaluate(el => getComputedStyle(el).backgroundColor, await toastLoc(page).elementHandle())
    const darkBar = await page.evaluate(
      el => getComputedStyle(el.querySelector(".kb-toast__bar")).backgroundColor,
      await toastLoc(page).elementHandle()
    )
    assert(
      "暗色 toast 底色随 --kb-* 换档（≠亮色）",
      darkBg !== sInfo.background,
      `dark=${darkBg} light=${sInfo.background}`
    )
    assert("暗色进度条色随 --kb-* 换档", darkBar === "rgb(66, 66, 66)", darkBar)
    await page.evaluate(() => document.documentElement.classList.remove("dark"))
    await waitCleared(page)

    // --- 恢复昵称原值（数据清场）---
    await nickname.fill(originalNickname)
    await saveButton.click()
    await page.getByText("账号资料已更新。", { exact: true }).first().waitFor({ state: "visible", timeout: 8000 })
    await waitCleared(page)

    // --- 全程无 pageerror（Esc 早关后自有计时器经 onClose 回收，不得与 EP 实例生命周期打架）---
    assert(
      "全程无未捕获页面异常（计时器/实例生命周期）",
      pageErrors.length === 0,
      pageErrors.map(e => e.message).join(" | ") || "clean"
    )
  } finally {
    await browser.close()
  }

  const failed = results.filter(r => !r.ok)
  logStep(
    "[Task3.4:verify]",
    failed.length === 0
      ? `🎉 ${results.length}/${results.length} 全部通过`
      : `❌ ${failed.length}/${results.length} 失败`
  )
  if (failed.length > 0) process.exit(1)
}

await run()

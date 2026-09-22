/* global document, getComputedStyle */
/**
 * T2（解散 AppCheckbox 试点）行为与契约验证。
 *
 * 三组断言：
 * A. 校准默认观感：直用 el-checkbox 后计算样式与原 AppCheckbox 壳逐属性一致
 *    （根/方块/对勾伪元素/label，明暗各一轮）；
 * B. 调用方覆盖契约探针（三层设计的命门）：给 el-checkbox 根临时挂 utilities
 *    尺寸/字重类，断言计算样式变更为 utility 值——EP 出厂 unlayered 值（32px/
 *    30px/500）被 unlayered 中和段 revert-layer 退回层序后，utilities 能赢；
 * C. 行为：勾选/取消勾选 v-model 链路（login 的 rememberSession、回收站行选择、
 *    版本行选择均落到可见状态变化）。
 *
 * 用法：node scripts/verify-appcheckbox-t2.mjs（需 4173 preview + 后端 3200）
 * 退出码：全过为 0，任一失败为 1。
 */
import {
  apiRequest,
  assertNoPageErrors,
  attachPageDiagnostics,
  createDiagnostics,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
} from "./lib/knowledge-smoke-utils.mjs"

const VIEWPORT = { width: 1247, height: 952 }
const CONTENT = "# T2 行为验证文档\n\n用于解散 AppCheckbox 的行为断言。\n\n- 列表项一\n- 列表项二\n"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  logStep("[T2验证]", `${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}

/** 计算样式便捷读取 */
const computedOf = (locator, props) =>
  locator.evaluate((el, names) => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(names.map(n => [n, cs.getPropertyValue(n)]))
  }, props)

const capturePass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: VIEWPORT })
  const prefix = `[T2验证:${mode}]`
  const diagnostics = createDiagnostics()
  attachPageDiagnostics(page, diagnostics)
  const url = path => new URL(path, "http://127.0.0.1:4173").toString()

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    mode === "dark" ? "dark" : "light"
  )

  try {
    // ---- A+B：登录页 checkbox 校准与覆盖契约 ----
    // 注意：rememberSession/trustedDevice 初始值为 true（记住账号默认勾选），
    // 样式断言前先统一置为未勾选态
    await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
    await page.waitForTimeout(600)
    const rememberRoot = page.locator('.el-checkbox:has-text("记住账号")')
    check(`${prefix} 登录页 checkbox 根（label.el-checkbox）存在`, (await rememberRoot.count()) === 1)
    const rememberInput = rememberRoot.locator("input.el-checkbox__original")
    const ariaOnRoot = await rememberRoot.getAttribute("aria-label")
    check(
      `${prefix} EP 原生 DOM：aria-label 无值（label 文本承担可访问名）、input 在根内`,
      (ariaOnRoot === null || ariaOnRoot === "") && (await rememberInput.count()) === 1,
      `aria-label=${ariaOnRoot}`
    )
    if (await rememberInput.isChecked()) await rememberRoot.click()
    // 等 150ms 选中过渡播完再读样式，避免读到过渡中间值
    await page.waitForTimeout(300)
    check(`${prefix} 预置为未勾选态`, (await rememberInput.isChecked()) === false)

    const root = rememberRoot
    const rootStyles = await computedOf(root, [
      "height",
      "margin-right",
      "font-weight",
      "gap",
      "user-select",
      "color",
      "display",
    ])
    check(`${prefix} 根：高度回退为内容撑高（非 EP 32px）`, rootStyles.height !== "32px", rootStyles.height)
    check(
      `${prefix} 根：margin-right 清零（非 EP 30px）`,
      rootStyles["margin-right"] === "0px",
      rootStyles["margin-right"]
    )
    check(`${prefix} 根：字重 400（非 EP 500）`, rootStyles["font-weight"] === "400", rootStyles["font-weight"])
    check(`${prefix} 根：gap 8px`, rootStyles.gap === "8px", rootStyles.gap)
    check(`${prefix} 根：文本可选中（中和 EP none）`, rootStyles["user-select"] === "text", rootStyles["user-select"])

    const inner = root.locator(".el-checkbox__inner")
    const innerStyles = await computedOf(inner, [
      "width",
      "height",
      "border-radius",
      "border-color",
      "background-color",
    ])
    check(
      `${prefix} 方块：18×18（非 EP 14）`,
      innerStyles.width === "18px" && innerStyles.height === "18px",
      JSON.stringify(innerStyles)
    )
    check(
      `${prefix} 方块：圆角 5px（非 EP 桥接 6px）`,
      innerStyles["border-radius"] === "5px",
      innerStyles["border-radius"]
    )
    // token 文本（#fff）与计算样式（rgb 形式）格式不同，借助临时元素换算成 rgb 口径
    const surfaceBg = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.backgroundColor = "var(--kb-surface-bg)"
      probe.style.display = "none"
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    check(
      `${prefix} 方块：底色 = --kb-surface-bg`,
      innerStyles["background-color"] === surfaceBg,
      `${innerStyles["background-color"]} vs ${surfaceBg}`
    )

    const after_ = root.locator(".el-checkbox__inner")
    const afterStyles = await after_.evaluate(el => {
      const cs = getComputedStyle(el, "::after")
      return {
        width: cs.width,
        height: cs.height,
        opacity: cs.opacity,
        transform: cs.transform,
        mask: cs.maskImage.slice(0, 30) || cs.webkitMaskImage?.slice(0, 30) || "",
      }
    })
    check(
      `${prefix} 对勾：mask 画法 12×12 隐形待勾`,
      afterStyles.width === "12px" &&
        afterStyles.height === "12px" &&
        afterStyles.opacity === "0" &&
        afterStyles.mask.includes("data:image"),
      JSON.stringify(afterStyles)
    )

    const label = root.locator(".el-checkbox__label")
    const labelStyles = await computedOf(label, ["padding-left", "line-height", "font-size"])
    check(
      `${prefix} label：padding 清零 + 行高 20px + 字号 14px`,
      labelStyles["padding-left"] === "0px" &&
        labelStyles["line-height"] === "20px" &&
        labelStyles["font-size"] === "14px",
      JSON.stringify(labelStyles)
    )

    // ---- B：覆盖契约探针（临时挂 utilities 类，验完即摘）。
    // 类必须是源码里真实存在、Tailwind 已生成的 utility（v4 on-demand：未在
    // 源码出现过的类没有 CSS）——h-7/font-bold 均在源码中使用中。
    // 无 revert-layer 时 EP 工厂值（unlayered 32px/500）会压过 utilities，
    // 因此 28px/700 同时证明「中和段生效」与「utilities > components 默认」；
    // margin-right 的 revert 已由上方默认断言（0px ≠ EP 30px）证明。
    await root.evaluate(el => el.classList.add("h-7", "font-bold"))
    const probed = await computedOf(root, ["height", "font-weight"])
    await root.evaluate(el => el.classList.remove("h-7", "font-bold"))
    check(
      `${prefix} 覆盖契约：h-7/font-bold 压过 components 默认与 EP 工厂值`,
      probed.height === "28px" && probed["font-weight"] === "700",
      JSON.stringify(probed)
    )

    // ---- C：v-model 行为（勾选/取消） ----
    await root.click()
    const checkedAfterClick = await rememberInput.isChecked()
    await root.click()
    const checkedAfterSecond = await rememberInput.isChecked()
    check(
      `${prefix} v-model：点击勾选→true，再点→false`,
      checkedAfterClick === true && checkedAfterSecond === false,
      `${checkedAfterClick} → ${checkedAfterSecond}`
    )

    // ---- C：回收站行 checkbox ----
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace T2 校准试点")
    const doc = await ensureDocument(kb.id, token, { title: "T2 行为验证文档", content: CONTENT })
    await apiRequest(`/knowledge/documents/${doc.id}`, {
      method: "PATCH",
      token,
      body: { content: { scheme: "text/markdown", value: `${CONTENT}\n（第二次保存）` } },
      errorMessage: "写入第二次文档内容失败",
    })

    await page.goto(url("/knowledge/trash"), { waitUntil: "domcontentloaded" })
    const trashRowCheck = page.locator('.el-checkbox[aria-label^="选择文档"]').first()
    await trashRowCheck.waitFor({ timeout: 15000 })
    const trashCountText = () => page.locator("text=/已选/").first().textContent()
    const trashBefore = await trashCountText()
    await trashRowCheck.click()
    const trashSelectedText = await trashCountText()
    await trashRowCheck.click()
    const trashAfter = await trashCountText()
    check(
      `${prefix} 回收站行：勾选「已选 0→1→0」`,
      /已选\s*0/.test(trashBefore) && /已选\s*1/.test(trashSelectedText) && /已选\s*0/.test(trashAfter),
      `${trashBefore?.trim()} → ${trashSelectedText?.trim()} → ${trashAfter?.trim()}`
    )

    // ---- C：版本面板行 checkbox ----
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await page.locator('[title="历史版本"]').click()
    await page.getByText("支持回滚与对比").first().waitFor({ timeout: 15000 })
    const versionRowCheck = page.locator('.el-checkbox[aria-label^="选择版本"]').first()
    await versionRowCheck.waitFor({ timeout: 15000 })
    // 模板级覆盖探针：调用方 DocumentVersionRow 传的 mt-1 经 fallthrough 落在
    // el-checkbox 根 label 上且生效（0.25rem=4px）
    const versionRootMarginTop = await versionRowCheck.evaluate(el => getComputedStyle(el).marginTop)
    check(`${prefix} 模板级探针：调用方 mt-1 落根并生效（4px）`, versionRootMarginTop === "4px", versionRootMarginTop)
    const versionCountText = () => page.locator("text=/已选/").first().textContent()
    const versionBefore = await versionCountText()
    await versionRowCheck.click()
    const versionSelectedText = await versionCountText()
    await versionRowCheck.click()
    const versionAfter = await versionCountText()
    check(
      `${prefix} 版本行：勾选「已选 0→1→0 项」`,
      /已选\s*0\s*项/.test(versionBefore) &&
        /已选\s*1\s*项/.test(versionSelectedText) &&
        /已选\s*0\s*项/.test(versionAfter),
      `${versionBefore?.trim()} → ${versionSelectedText?.trim()} → ${versionAfter?.trim()}`
    )

    await browser.close()
    return true
  } catch (error) {
    console.error(`${prefix} 验证异常：`, error)
    await browser.close().catch(() => {})
    return false
  } finally {
    assertNoPageErrors(diagnostics)
  }
}

const light = await capturePass("light")
const dark = await capturePass("dark")
const failed = results.filter(r => !r.ok)
console.log(`\n断言 ${results.length} 项，失败 ${failed.length} 项`)
if (failed.length > 0) {
  for (const f of failed) console.error(`❌ ${f.name} — ${f.detail}`)
}
/**
 * 断言数下限（ratchet，取 2026-09-19 实测值留余量——部分脚本的 check 数会随数据态分支浮动）。脚本中途抛异常会让后续 check 静默不执行，
 * 汇总却只写「失败 0 项」——低于本下限即判为本轮盲跑，按失败退出。
 * 2026-09-19 加护栏后修掉四例陈旧载体（t3 switch 载体、t4 缺自建 published 文档
 * 与「目录」入口、t7「类型」触发器、t9「移动…」省略号错配），各下限按修好后实测值留余量重钉。
 */
const MIN_CHECKS = 30
const passAborted = !light || !dark
if (passAborted || results.length < MIN_CHECKS) {
  console.error(
    `⚠ 本轮仅执行 ${results.length} 条断言（下限 ${MIN_CHECKS}${passAborted ? "，且有 pass 异常中断" : ""}）：后续断言未执行，不得视为通过`
  )
}
if (!light || !dark || failed.length > 0 || passAborted || results.length < MIN_CHECKS) process.exit(1)
console.log("T2 验证全部通过")

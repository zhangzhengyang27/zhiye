/**
 * Task 3.1 行为断言：AppDialog 换底 el-dialog 后的自建语义全量回归。
 *
 * 覆盖：Esc 栈顶关闭 / 双弹窗叠放 Esc 二段式 / Tab 栈顶循环 / 点遮罩关闭 /
 * 滚动锁计数（双实例四阶段）/ 关闭焦点还原 / data-autofocus 命中 /
 * IME 组词 Esc 不关闭 / 开合动画 / 遮罩色明暗两套 / z-index=400 / Tab 兜底循环。
 * 用法：node scripts/verify-appdialog-task-3.1.mjs（需 4173 preview + 后端 3200 在跑）
 */
/* global document, getComputedStyle, KeyboardEvent, MutationObserver */
import {
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  loginThroughUi,
  logStep,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const results = []
const record = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  logStep("[行为]", `${pass ? "✅" : "❌"} ${name}${detail ? ` —— ${detail}` : ""}`)
}

const activeInfo = page =>
  page.evaluate(() => {
    const el = document.activeElement
    return {
      tag: el?.tagName ?? null,
      desc: el
        ? `${el.tagName.toLowerCase()}${el.getAttribute("placeholder") ? `:${el.getAttribute("placeholder")}` : ""}${el.textContent?.trim() ? `:${el.textContent.trim().slice(0, 12)}` : ""}`
        : null,
      dataAutofocus: el?.hasAttribute?.("data-autofocus") ?? false,
      inDialog: !!el?.closest?.(".kb-el-dialog"),
      whichDialog: el?.closest(".kb-el-dialog")?.textContent?.includes("扫码访问")
        ? "qr"
        : el?.closest(".kb-el-dialog")?.textContent?.includes("分享")
          ? "share"
          : el?.closest(".kb-el-dialog")?.textContent?.includes("新建知识库")
            ? "create-kb"
            : el?.closest(".kb-el-dialog")?.textContent?.includes("移动至")
              ? "move"
              : null,
    }
  })

const overlayState = page =>
  page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll(".el-overlay"))
    const visible = overlays.filter(o => getComputedStyle(o).display !== "none")
    const dialogs = visible.map(o => o.querySelector(".el-overlay-dialog"))
    return {
      visibleOverlayCount: visible.length,
      zIndex: visible[0] ? getComputedStyle(visible[0]).zIndex : null,
      maskColor: visible[0] ? getComputedStyle(visible[0]).backgroundColor : null,
      dialogTitles: dialogs.map(d => d?.querySelector("h3")?.textContent?.trim() ?? null),
      bodyOverflow: document.body.style.overflow,
    }
  })

const pressImeEsc = page =>
  page.evaluate(() => {
    const target = document.activeElement
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 229,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, "isComposing", { value: true })
    target.dispatchEvent(event)
  })

const captureEnterAnimation = async page => {
  // 点击后立刻采样：EP dialog-fade 挂在 .el-overlay（modal-fade-in）与
  // .el-overlay-dialog（dialog-fade-in）两条 animation 上
  await page.evaluate(() => {
    globalThis.__task31Anim = null
    const sample = () => {
      const overlay = document.querySelector(".el-overlay")
      const layer = document.querySelector(".el-overlay-dialog")
      if (overlay && layer) {
        globalThis.__task31Anim = {
          overlayAnims: overlay.getAnimations().map(a => a.animationName),
          layerAnims: layer.getAnimations().map(a => a.animationName),
        }
      }
    }
    const observer = new MutationObserver(() => sample())
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["style", "class"] })
    globalThis.__task31AnimObserver = observer
  })
  await page.locator(".kb-sidebar button[title='新建']").click()
  await page.getByRole("button", { name: "创建知识库" }).click()
  await page.locator('[role="dialog"]').filter({ hasText: "新建知识库" }).waitFor({ state: "visible", timeout: 10_000 })
  const anims = await page.evaluate(() => {
    globalThis.__task31AnimObserver?.disconnect()
    return globalThis.__task31Anim
  })
  return anims
}

const runPass = async mode => {
  const { browser, context, page } = await createBrowserPage({ viewport: { width: 1247, height: 952 } })
  const prefix = `[行为:${mode}]`
  const dark = mode === "dark"

  await context.addInitScript(
    scheme => {
      globalThis.localStorage.setItem("vueuse-color-scheme", scheme)
    },
    dark ? "dark" : "light"
  )

  const url = path => new URL(path, smokeConfig.baseUrl).toString()

  try {
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace 编辑器工具栏验证")
    const doc = await ensureDocument(kb.id, token, {
      title: "EP 迁移基线验证",
      content: "# EP 迁移基线文档\n\n用于 Element Plus 迁移前后的像素对比。\n",
    })

    // ---------- 1. 单弹窗（新建知识库）基础语义 ----------
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)

    // 1a. 开合动画（dialog-fade 两条 animation）
    const anims = await captureEnterAnimation(page)
    record(
      "动画开合：打开时有 dialog-fade 过渡",
      !!anims &&
        anims.overlayAnims.some(n => n.includes("modal-fade")) &&
        anims.layerAnims.some(n => n.includes("dialog-fade")),
      JSON.stringify(anims)
    )

    // 1b. data-autofocus 命中（EP 容器聚焦之后由 setTimeout 聚焦接管）
    const focusAfterOpen = await activeInfo(page)
    record(
      "data-autofocus 优先聚焦命中原生 input",
      focusAfterOpen.dataAutofocus && focusAfterOpen.inDialog,
      JSON.stringify(focusAfterOpen)
    )

    // 1c. 遮罩色 / z-index / 滚动锁（实例 1）
    const state1 = await overlayState(page)
    const expectedMask = dark ? "rgba(0, 0, 0, 0.6)" : "rgba(15, 23, 42, 0.24)"
    record(`遮罩色（${mode}）= ${expectedMask}`, state1.maskColor === expectedMask, `实测 ${state1.maskColor}`)
    record("遮罩 z-index=400（基线语义钉住）", state1.zIndex === "400", `实测 ${state1.zIndex}`)
    record("打开后 body 滚动锁生效（实例1）", state1.bodyOverflow === "hidden", state1.bodyOverflow)

    // 1d. Tab 循环（自建兜底 + EP trap 共存，不跳出面板）
    const tabPath = []
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab")
      tabPath.push(await activeInfo(page))
    }
    record(
      "Tab 焦点循环始终在面板内",
      tabPath.every(f => f.inDialog),
      tabPath.map(f => f.desc).join(" → ")
    )

    // 1e. IME 组词 Esc 不关闭；真实 Esc 关闭
    await pressImeEsc(page)
    await page.waitForTimeout(200)
    const stateAfterIme = await overlayState(page)
    record(
      "IME 组词中 Esc 不关闭对话框",
      stateAfterIme.visibleOverlayCount === 1,
      `叠层数 ${stateAfterIme.visibleOverlayCount}`
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const stateAfterEsc = await overlayState(page)
    record(
      "Esc 关闭栈顶（单弹窗）",
      stateAfterEsc.visibleOverlayCount === 0 && stateAfterEsc.bodyOverflow === "",
      `叠层数 ${stateAfterEsc.visibleOverlayCount} / overflow=${stateAfterEsc.bodyOverflow}`
    )

    // 1f. 点遮罩关闭（closeOnOverlay 默认 true）
    await page.locator(".kb-sidebar button[title='新建']").click()
    await page.getByRole("button", { name: "创建知识库" }).click()
    await page.locator('[role="dialog"]').filter({ hasText: "新建知识库" }).waitFor({ state: "visible" })
    await page.waitForTimeout(300)
    await page.mouse.click(30, 30)
    await page.waitForTimeout(400)
    const stateAfterOverlayClick = await overlayState(page)
    record(
      "点遮罩关闭（closeOnOverlay=true）",
      stateAfterOverlayClick.visibleOverlayCount === 0,
      `叠层数 ${stateAfterOverlayClick.visibleOverlayCount}`
    )

    // ---------- 2. 移动弹窗 data-autofocus（原生 input data-autofocus 写法） ----------
    await page.goto(url(`/knowledge/${kb.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    const row = page.locator(`#knowledge-tree-node-${doc.id}`)
    const rowVisible = await row.isVisible().catch(() => false)
    const targetRow = rowVisible ? row : page.locator("[data-knowledge-tree-row]").first()
    await targetRow.click({ button: "right" })
    await page.getByRole("menuitem", { name: "移动..." }).click()
    await page.locator('[role="dialog"]').filter({ hasText: "移动至" }).waitFor({ state: "visible" })
    await page.waitForTimeout(300)
    // data-autofocus 原生 input（KnowledgeMoveNodeDialog 自带 data-autofocus）
    const moveFocus = await activeInfo(page)
    record(
      "移动弹窗 data-autofocus 命中搜索框",
      moveFocus.dataAutofocus && moveFocus.inDialog,
      JSON.stringify(moveFocus)
    )
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)

    // ---------- 3. 双弹窗叠放（分享 → 扫码访问） ----------
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.locator(".ne-ui").first().waitFor({ state: "visible", timeout: 30_000 })
    await page.waitForTimeout(1500)
    const shareBtn = page.getByRole("button", { name: "分享", exact: true }).first()
    await shareBtn.focus()
    await shareBtn.click()
    await page.locator('[role="dialog"]').filter({ hasText: "分享" }).waitFor({ state: "visible", timeout: 10_000 })
    await page.waitForTimeout(500)
    const shareState = await overlayState(page)
    record(
      "分享弹窗打开（实例1）+ 滚动锁",
      shareState.visibleOverlayCount === 1 && shareState.bodyOverflow === "hidden",
      JSON.stringify(shareState)
    )

    // 开启分享（幂等：已开启则跳过）→ 展开更多分享设置 → 点二维码按钮，叠放扫码弹窗
    const shareDialog = page.locator('[role="dialog"]').filter({ hasText: "分享" })
    const switchChecked = await shareDialog.locator(".el-switch__input").first().getAttribute("aria-checked")
    if (switchChecked !== "true") {
      await shareDialog.locator(".el-switch__core").first().click()
      await page.getByText("链接已生成").waitFor({ state: "visible", timeout: 10_000 })
    }
    await shareDialog.getByText("更多分享设置").click()
    const qrBtn = page.locator('button[title="扫码访问"]').first()
    try {
      await qrBtn.waitFor({ state: "visible", timeout: 15_000 })
    } catch (error) {
      const dump = await page.evaluate(() => {
        const dlg = Array.from(document.querySelectorAll(".kb-el-dialog")).find(d => d.textContent.includes("分享"))
        return {
          switchChecked: dlg?.querySelector(".el-switch__input")?.getAttribute("aria-checked") ?? null,
          caretRotated: !!dlg?.querySelector('[class*="rotate-180"]'),
          hasLinkText: dlg?.textContent.includes("链接已生成") ?? null,
          hasAdvText: dlg?.textContent.includes("当前分享链接") ?? null,
          snippet: dlg?.textContent.slice(0, 260) ?? null,
        }
      })
      logStep("[行为]", `QR 按钮未出现现场：${JSON.stringify(dump)}`)
      throw error
    }
    await qrBtn.click()
    await page.locator('[role="dialog"]').filter({ hasText: "扫码访问" }).waitFor({ state: "visible", timeout: 10_000 })
    await page.waitForTimeout(500)
    const stackState = await overlayState(page)
    record(
      "双弹窗叠放（分享 + 扫码访问）",
      stackState.visibleOverlayCount === 2 && stackState.bodyOverflow === "hidden",
      JSON.stringify(stackState.dialogTitles)
    )

    // 叠放时 Tab 只在栈顶循环
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("Tab")
    }
    const tabInTop = await activeInfo(page)
    record(
      "叠放时 Tab 只在栈顶（扫码访问）循环",
      tabInTop.whichDialog === "qr" && tabInTop.inDialog,
      JSON.stringify(tabInTop)
    )

    // 叠放时 Esc 只关栈顶（二段式第一段）
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const afterFirstEsc = await overlayState(page)
    record(
      "Esc 二段式：第一段只关栈顶（扫码访问），分享弹窗仍在 + 滚动锁保持",
      afterFirstEsc.visibleOverlayCount === 1 &&
        afterFirstEsc.dialogTitles.includes("分享") &&
        afterFirstEsc.bodyOverflow === "hidden",
      JSON.stringify(afterFirstEsc)
    )

    // 栈顶点遮罩也只关栈顶
    await page.locator('button[title="扫码访问"]').first().click()
    await page.locator('[role="dialog"]').filter({ hasText: "扫码访问" }).waitFor({ state: "visible" })
    await page.waitForTimeout(300)
    await page.mouse.click(30, 30)
    await page.waitForTimeout(400)
    const afterTopOverlay = await overlayState(page)
    record(
      "叠放时点遮罩只关栈顶",
      afterTopOverlay.visibleOverlayCount === 1 && afterTopOverlay.dialogTitles.includes("分享"),
      JSON.stringify(afterTopOverlay.dialogTitles)
    )

    // 第二段 Esc 关分享弹窗，滚动锁解除（计数归零）
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    const afterSecondEsc = await overlayState(page)
    record(
      "Esc 二段式：第二段关分享弹窗，body 滚动锁解除",
      afterSecondEsc.visibleOverlayCount === 0 && afterSecondEsc.bodyOverflow === "",
      `overflow=${afterSecondEsc.bodyOverflow}`
    )

    // 焦点还原：触发元素（分享按钮，稳定存续）应重新获得焦点
    const focusRestored = await page.evaluate(() => {
      const el = document.activeElement
      return {
        tag: el?.tagName ?? null,
        text: el?.textContent?.trim()?.slice(0, 8) ?? null,
        isShareBtn: el?.textContent?.trim() === "分享",
      }
    })
    record("关闭后焦点还原到触发元素（分享按钮）", focusRestored.isShareBtn, JSON.stringify(focusRestored))
  } finally {
    await browser.close()
  }
}

let failed = 0
for (const mode of ["light", "dark"]) {
  const before = results.length
  await runPass(mode)
  failed += results.slice(before).filter(r => !r.pass).length
}

logStep("[行为]", results.map(r => `${r.pass ? "PASS" : "FAIL"} ${r.name}`).join("\n"))
logStep("[行为]", `共 ${results.length} 项，失败 ${failed} 项`)
process.exit(failed > 0 ? 1 : 0)


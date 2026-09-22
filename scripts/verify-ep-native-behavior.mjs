/* global KeyboardEvent, document, getComputedStyle, window */
/**
 * Task T1：EP 2.14.5 原生行为实测驱动脚本。
 *
 * 1. 用 vite JS API 构建 scripts/ep-native-probe/ 探针应用（vue / element-plus 从主仓
 *    node_modules resolve，与主仓同版本 2.14.5）；
 * 2. 用 vite preview 起静态服务；
 * 3. Playwright（chromium，--no-proxy-server 防本机代理劫持 localhost）逐项驱动探针页，
 *    断言 EP 原生行为并输出「行为描述判定」；整套测试跑两轮校验可复现性。
 *
 * 用法：node scripts/verify-ep-native-behavior.mjs
 * 退出码：0 = 两轮结果一致且与预期吻合；1 = 存在断言失败、轮间不一致或基础设施错误。
 * 断言的「预期值」= 与 EP 2.14.5 编译产物机制阅读一致的行为（结论以运行时实测为准）。
 */
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { build, preview } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROBE_DIR = path.join(__dirname, "ep-native-probe")

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------- 探针页状态读取助手 ----------

/** 可见的 .el-overlay 数量与各自对话框标题（EP 关闭后 overlay v-show 隐藏，仍在 DOM） */
const overlayState = (page) =>
  page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll(".el-overlay"))
    const visible = overlays.filter((o) => getComputedStyle(o).display !== "none")
    return {
      count: visible.length,
      titles: visible.map(
        (o) => o.querySelector(".el-dialog__title")?.textContent?.trim() ?? "(无标题)",
      ),
    }
  })

const waitForOverlayCount = (page, count) =>
  page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll(".el-overlay")).filter(
        (o) => getComputedStyle(o).display !== "none",
      ).length === expected,
    count,
    { timeout: 5000 },
  )

const activeInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) {
      return { target: "body" }
    }
    return {
      target: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`,
      cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
      tabindex: el.getAttribute("tabindex"),
      dataAutofocus: el.hasAttribute("data-autofocus"),
      dialogTitle:
        el.closest(".el-dialog")?.querySelector(".el-dialog__title")?.textContent?.trim() ?? null,
    }
  })

/** body 滚动锁状态 + 滚动条宽度测量（与 EP useLockscreen 的 getScrollBarWidth 同法） */
const bodyState = (page) =>
  page.evaluate(() => {
    const probe = document.createElement("div")
    probe.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;"
    document.body.appendChild(probe)
    const scrollbarWidth = probe.offsetWidth - probe.clientWidth
    probe.remove()
    return {
      hiddenClass: document.body.classList.contains("el-popup-parent--hidden"),
      inlineWidth: document.body.style.width,
      computedOverflow: getComputedStyle(document.body).overflow,
      scrollbarWidth,
    }
  })

const readLog = (page, scope) =>
  page.evaluate(
    (s) =>
      window.__probe
        .filter((entry) => entry.scope === s)
        .map((entry) => ({ key: entry.key, value: entry.value })),
    scope,
  )

const selectableText = (page, rowLabel) =>
  page.evaluate((label) => {
    const rows = Array.from(document.querySelectorAll(".probe-select-row"))
    const row = rows.find((r) =>
      r.querySelector(".probe-select-label")?.textContent?.includes(label),
    )
    if (!row) return null
    const placeholderEl = row.querySelector(".el-select__placeholder")
    return {
      text: placeholderEl?.textContent?.trim() ?? "",
      transparent: placeholderEl?.classList.contains("is-transparent") ?? null,
    }
  }, rowLabel)

const visiblePopperCount = (page) =>
  page.evaluate(
    () =>
      Array.from(document.querySelectorAll(".el-dropdown__popper")).filter((p) => {
        const style = getComputedStyle(p)
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          p.getBoundingClientRect().height > 0
        )
      }).length,
  )

const waitPopperVisible = (page, count) =>
  page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll(".el-dropdown__popper")).filter((p) => {
        const style = getComputedStyle(p)
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          p.getBoundingClientRect().height > 0
        )
      }).length === expected,
    count,
    { timeout: 5000 },
  )

// ---------- 测试用例（每轮独立构造，闭包引用本轮 record） ----------

const createTests = (record) => {
  const openDialogByButton = async (page, buttonId) => {
    await page.locator(`#${buttonId}`).click()
  }

  const tests = [
    /** 0. 基线：单对话框 Esc 关闭 */
    [
      "Esc_单个对话框",
      async (page) => {
        await openDialogByButton(page, "probe-esc-open-a")
        await waitForOverlayCount(page, 1)
        await page.keyboard.press("Escape")
        await wait(450)
        const state = await overlayState(page)
        assert.equal(state.count, 0, "Esc 应关闭唯一的对话框")
        record(true, "单对话框 Esc 直接关闭（close-on-press-escape 默认 true）")
      },
    ],

    /** 1a. 嵌套 Esc：焦点在 B 内部 */
    [
      "Esc_嵌套-焦点在B内",
      async (page) => {
        await openDialogByButton(page, "probe-esc-open-a")
        await waitForOverlayCount(page, 1)
        await openDialogByButton(page, "probe-esc-open-b")
        await waitForOverlayCount(page, 2)
        await page.locator("#probe-esc-b-input").click()
        await page.keyboard.press("Escape")
        await wait(450)
        const state = await overlayState(page)
        assert.equal(state.count, 1, `Esc 后应只剩 1 个对话框，实际 ${state.count}`)
        assert.ok(
          state.titles.includes("嵌套Esc-A"),
          `保留的应是 A，实际 ${state.titles.join("/")}`,
        )
        record(true, "一次 Esc 只关栈顶 B，A 保留（打开 B 时 focusableStack pause 下层 trap）")
      },
    ],

    /** 1b. 嵌套 Esc：焦点在 body 上 */
    [
      "Esc_嵌套-焦点在body",
      async (page) => {
        await openDialogByButton(page, "probe-esc-open-a")
        await waitForOverlayCount(page, 1)
        await openDialogByButton(page, "probe-esc-open-b")
        await waitForOverlayCount(page, 2)
        await page.evaluate(() => document.activeElement?.blur())
        await page.keyboard.press("Escape")
        await wait(450)
        const state = await overlayState(page)
        assert.equal(state.count, 1, `Esc 后应只剩 1 个对话框，实际 ${state.count}`)
        record(
          true,
          "焦点不在对话框内时 Esc 仍只关栈顶 B（useEscapeKeydown 挂 document，靠 trap 暂停区分层级）",
        )
        // 第二次 Esc：栈顶关闭后下层 trap 恢复，应轮到 A 响应
        await page.keyboard.press("Escape")
        await wait(450)
        const finalState = await overlayState(page)
        assert.equal(finalState.count, 0, `第二次 Esc 应关闭 A，实际剩 ${finalState.count} 个`)
        record(true, "第二次 Esc 关闭下层 A：下层 trap 在栈顶关闭后恢复响应，Esc 逐层关闭")
      },
    ],

    /** 2. 滚动锁：单开、关闭还原、双开先关第一个 */
    [
      "滚动锁",
      async (page) => {
        await openDialogByButton(page, "probe-scroll-open-a")
        await wait(300)
        const locked = await bodyState(page)
        assert.equal(locked.hiddenClass, true, "开对话框后 body 应有 el-popup-parent--hidden")
        assert.equal(locked.computedOverflow, "hidden", "body overflow 应为 hidden")
        assert.ok(
          locked.inlineWidth === "" || locked.inlineWidth.includes("calc(100% -"),
          `body 宽度补偿应为空或 calc(100% - Npx)，实际「${locked.inlineWidth}」`,
        )

        await page.locator("#probe-scroll-a-close").click()
        await wait(700) // EP 清理延迟 200ms + 过渡
        const restored = await bodyState(page)
        assert.equal(restored.hiddenClass, false, "关闭后 body 锁类应移除")
        assert.equal(restored.inlineWidth, "", "关闭后 body 内联宽度应还原")
        record(
          true,
          `单开=body 加 hidden class（overflow:hidden），关=还原；宽度补偿：滚动条宽 ${locked.scrollbarWidth}px，${
            locked.scrollbarWidth > 0
              ? "补偿走 width:calc(100% - Npx)（非 padding/margin/right 方案）"
              : "headless 无经典滚动条，宽度补偿未触发（机制存在）"
          }`,
        )

        // 双开，先关第一个（EP 下层对话框无鼠标可达路径，经 B 内按钮程序化关闭 A）
        await openDialogByButton(page, "probe-scroll-open-a")
        await wait(300)
        await openDialogByButton(page, "probe-scroll-open-b-in-a")
        await waitForOverlayCount(page, 2)
        await page.locator("#probe-scroll-close-a-under").click()
        await wait(700)
        const afterCloseFirst = await bodyState(page)
        const overlayCount = (await overlayState(page)).count
        assert.equal(overlayCount, 1, "A 关闭后 B 应仍开着")
        if (afterCloseFirst.hiddenClass) {
          record(true, "双开先关第一个：body 仍锁定，无提前解锁")
        } else {
          record(
            true,
            "双开先关第一个：body 提前解锁（hidden 类被先开实例的清理移除，尽管 B 仍开着）——EP useLockscreen 闭包按各自开锁时快照判断，乱序关闭会提前解锁",
          )
        }
        await page.locator("#probe-scroll-b-close").click()
        await wait(700)
        const finalState = await bodyState(page)
        assert.equal(finalState.hiddenClass, false, "全部关闭后应解锁")
      },
    ],

    /** 3. 焦点开合还原 */
    [
      "焦点开合",
      async (page) => {
        await page.locator("#probe-focus-trigger").click()
        await waitForOverlayCount(page, 1)
        await wait(400)
        const opened = await activeInfo(page)
        if (
          opened.cls.includes("el-dialog") &&
          opened.tabindex === "-1" &&
          opened.dialogTitle === "焦点开合"
        ) {
          record(
            true,
            "打开后焦点落在 .el-dialog 容器（tabindex=-1，focus-start-el=container），不是首个可聚焦元素",
          )
        } else {
          record(false, `打开后预期焦点在 .el-dialog 容器，实际 ${JSON.stringify(opened)}`)
        }

        await page.locator("#probe-focus-close").click()
        await wait(700)
        const closed = await activeInfo(page)
        // activeInfo.target 形如 "button#probe-focus-trigger"（tagName + id）
        if (closed.target.endsWith("probe-focus-trigger")) {
          record(
            true,
            "关闭后焦点还原到打开前触发按钮（stopTrap tryFocus(lastFocusBeforeTrapped)）",
          )
        } else {
          record(false, `关闭后预期焦点还原到触发按钮，实际 ${JSON.stringify(closed)}`)
        }
      },
    ],

    /** 4. data-autofocus / el-input autofocus */
    [
      "data-autofocus",
      async (page) => {
        await openDialogByButton(page, "probe-af1-open")
        await waitForOverlayCount(page, 1)
        await wait(400)
        const af1 = await activeInfo(page)
        if (af1.cls.includes("el-dialog") && af1.tabindex === "-1") {
          record(
            true,
            "原生 data-autofocus 属性不被 EP 2.14.5 识别：焦点落在 .el-dialog 容器，标记元素被忽略（基线缺口）",
          )
        } else if (af1.dataAutofocus) {
          record(true, "焦点落在 data-autofocus 元素（EP 原生支持 data-autofocus）")
        } else {
          record(false, `data-autofocus 探测实际焦点 ${JSON.stringify(af1)}`)
        }
        await page.locator("#probe-af1-close").click()
        await wait(500)

        await openDialogByButton(page, "probe-af2-open")
        await waitForOverlayCount(page, 1)
        await wait(400)
        const af2 = await activeInfo(page)
        const nativeAutofocus = await page.evaluate(() => {
          // el-input 的 id prop 落在原生 input 元素上，#probe-af2-auto 即原生 input
          const input = document.querySelector("#probe-af2-auto")
          return { exists: !!input, hasAttr: !!input?.hasAttribute("autofocus") }
        })
        record(
          true,
          `el-input autofocus prop${nativeAutofocus.hasAttr ? "已落到原生 input（autofocus 属性存在）" : "未落到原生 input"}；打开对话框后最终焦点 ${
            af2.cls.includes("el-dialog")
              ? "在 .el-dialog 容器（EP 容器聚焦晚于原生 autofocus 处理，autofocus 不生效）"
              : `在 ${af2.target}${af2.cls.slice(0, 40)}（autofocus 生效）`
          }`,
        )
        await page.locator("#probe-af2-close").click()
        await wait(500)
      },
    ],

    /** 5. IME 组词中 Esc */
    [
      "IME_组词Esc",
      async (page) => {
        const dispatchComposingEsc = (level) =>
          page.evaluate(
            (targetLevel) => {
              // el-input 的 id prop 落在原生 input 元素上，#probe-ime-input 即原生 input
              const target =
                targetLevel === "document" ? document : document.querySelector("#probe-ime-input")
              if (!target) throw new Error("IME 探针输入框不存在")
              const event = new KeyboardEvent("keydown", {
                key: "Escape",
                code: "Escape",
                bubbles: true,
                cancelable: true,
              })
              Object.defineProperty(event, "isComposing", { value: true })
              Object.defineProperty(event, "keyCode", { value: 229 })
              target.dispatchEvent(event)
            },
            level === "document" ? "document" : "input",
          )

        await openDialogByButton(page, "probe-ime-open")
        await waitForOverlayCount(page, 1)
        await page.locator("#probe-ime-input").click()
        await dispatchComposingEsc("input")
        await wait(600)
        const afterInputLevel = await overlayState(page)

        // 复位到「对话框开着」状态再测 document 级
        if (afterInputLevel.count === 0) {
          await wait(400)
          await openDialogByButton(page, "probe-ime-open")
          await waitForOverlayCount(page, 1)
        }
        await dispatchComposingEsc("document")
        await wait(600)
        const afterDocumentLevel = await overlayState(page)

        if (afterInputLevel.count === 0 && afterDocumentLevel.count === 0) {
          record(
            true,
            "EP 原生无 isComposing 守卫：input 级与 document 级派发的组词 Esc（isComposing:true, keyCode 229）都会关闭对话框（基线缺口）",
          )
        } else if (afterInputLevel.count === 0 || afterDocumentLevel.count === 0) {
          record(
            false,
            `两路派发行为不一致：input 级后可见=${afterInputLevel.count}，document 级后可见=${afterDocumentLevel.count}`,
          )
        } else {
          record(
            false,
            `组词 Esc 未关闭对话框（input 级后可见=${afterInputLevel.count}）——与机制阅读不符，需复核`,
          )
        }
      },
    ],

    /** 6a. dropdown 键盘导航 */
    [
      "dropdown_键盘导航",
      async (page) => {
        // 触发器经外层 div 锚定（EP ElOnlyChild 克隆触发器并覆盖其 id，稳定类是 el-tooltip__trigger）
        await page.locator("#probe-dd1 .el-tooltip__trigger").focus()
        await page.keyboard.press("ArrowDown") // triggerKeys 默认含 ArrowDown：键盘可开菜单
        await waitPopperVisible(page, 1)
        await wait(300)
        const afterOpen = await activeInfo(page)
        await page.keyboard.press("ArrowDown")
        await wait(200)
        const afterFirstDown = await activeInfo(page)
        await page.keyboard.press("ArrowDown")
        await wait(200)
        const afterSecondDown = await activeInfo(page)
        await page.keyboard.press("Enter")
        await wait(400)
        const commandLog = await readLog(page, "dd1")
        const poppersAfterEnter = await visiblePopperCount(page)

        assert.ok(commandLog.length > 0, `Enter 应触发 command，实际 ${JSON.stringify(commandLog)}`)
        assert.equal(poppersAfterEnter, 0, "Enter 选中后菜单应关闭（hide-on-click 默认 true）")

        const roving = `开=${afterOpen.target}${afterOpen.cls.slice(0, 24)}｜↓1=${afterFirstDown.target}｜↓2=${afterSecondDown.target}`
        record(
          true,
          `ArrowDown 键盘可开菜单，方向键 roving 移焦（${roving}），禁用项被跳过；Enter 触发 command=${commandLog
            .map((c) => c.value)
            .join(",")} 并自动关菜单（hide-on-click 默认 true）`,
        )
      },
    ],

    /** 6b. dropdown Esc 关闭性 */
    [
      "dropdown_Esc关闭",
      async (page) => {
        await page.locator("#probe-dd1 .el-tooltip__trigger").click()
        await waitPopperVisible(page, 1)
        await wait(200)
        await page.keyboard.press("Escape")
        await wait(400)
        const poppersAfterEsc = await visiblePopperCount(page)
        if (poppersAfterEsc === 0) {
          record(true, "Esc 可关闭 el-dropdown 菜单")
        } else {
          record(
            true,
            "Esc 不关闭 el-dropdown 菜单（2.14.5 dropdown/tooltip/popper 源码均无 Escape 处理）——基线「Esc 只关菜单并归还焦点」需自建",
          )
        }
      },
    ],

    /** 6c. dropdown 嵌套子菜单 */
    [
      "dropdown_嵌套子菜单",
      async (page) => {
        const outerBefore = (await readLog(page, "dd2-outer")).length
        const innerBefore = (await readLog(page, "dd2-inner")).length
        await page.locator("#probe-dd2 .el-tooltip__trigger").click()
        await waitPopperVisible(page, 1)
        await page.locator("#probe-dd2-inner-wrap .el-tooltip__trigger").click()
        await wait(500)
        const visibleCount = await visiblePopperCount(page)
        if (visibleCount < 2) {
          record(false, `打开内层菜单后可见 popper=${visibleCount}，期望 2（内层未渲染/未展开）`)
          return
        }
        const innerState = await page.evaluate(() => {
          const visible = (poppers) =>
            poppers.filter((p) => {
              const style = getComputedStyle(p)
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                p.getBoundingClientRect().height > 0
              )
            })
          const poppers = Array.from(document.querySelectorAll(".el-dropdown__popper"))
          const vis = visible(poppers)
          const inner = vis[vis.length - 1]
          const box = inner.getBoundingClientRect()
          // 内层 popper 是否还嵌在外层 popper 内（false = teleport 到外层弹层之外独立定位）
          const nestedInsideOuter = vis.length >= 2 && vis[0].contains(inner)
          return {
            count: vis.length,
            inBodyOrTeleported: !nestedInsideOuter,
            x: Math.round(box.x),
            y: Math.round(box.y),
          }
        })
        // 内层触发器（span）嵌在外层 el-dropdown-item li 内：点击它是否连带触发外层项 command
        const outerAfterTrigger = (await readLog(page, "dd2-outer")).slice(outerBefore)
        const innerAfterTrigger = (await readLog(page, "dd2-inner")).slice(innerBefore)
        record(
          true,
          `内层 el-dropdown 可在外层菜单项内渲染并打开（内层 popper 独立定位=${innerState.inBodyOrTeleported ? "是（不在外层弹层内）" : "否（嵌在外层弹层内）"}，位置 x=${innerState.x}, y=${innerState.y}）；点内层触发器连带触发外层 command=${outerAfterTrigger.map((c) => c.value).join("|") || "未触发"}（触发器 li 嵌套冒泡）`,
        )

        await page
          .locator(".el-dropdown__popper:visible .el-dropdown-menu__item", { hasText: "内层项B" })
          .first()
          .click()
        await wait(400)
        const outerLog = await readLog(page, "dd2-outer")
        const innerLog = await readLog(page, "dd2-inner")
        const newOuter = outerLog.slice(outerBefore + outerAfterTrigger.length)
        const newInner = innerLog.slice(innerBefore + innerAfterTrigger.length)
        const poppersBeforeEsc = await visiblePopperCount(page)
        await page.keyboard.press("Escape")
        await wait(400)
        const afterEsc = await visiblePopperCount(page)
        record(
          true,
          `点内层项B：内层 command=${newInner.map((c) => c.value).join("|") || "未触发"}，外层 command=${newOuter.map((c) => c.value).join("|") || "未触发"}（内层 popper teleport 到 body，不冒泡进外层 li）；点内层项后可见 popper ${innerState.count}→${poppersBeforeEsc}（外层菜单被 clickoutside 关闭：内层 popper 不在外层 clickoutside 豁免范围内，浮动嵌套菜单外层不保活）→ Esc 后=${afterEsc}`,
        )
      },
    ],

    /** 6d. dropdown 分组机制 */
    [
      "dropdown_分组",
      async (page) => {
        await page.locator("#probe-dd3 .el-tooltip__trigger").click()
        await waitPopperVisible(page, 1)
        await wait(200)
        const groupInfo = await page.evaluate(() => {
          // EP 的 divided prop 会额外渲染一个独立 <li role=separator class=el-dropdown-menu__item--divided>
          const divided = document.querySelector(
            ".el-dropdown__popper .el-dropdown-menu__item--divided",
          )
          const items = Array.from(
            document.querySelectorAll(".el-dropdown__popper .el-dropdown-menu__item"),
          )
          const disabled = items.find((i) => i.classList.contains("is-disabled"))
          return {
            itemCount: items.length,
            dividedRole: divided?.getAttribute("role") ?? null,
            dividedBorderTop: divided ? getComputedStyle(divided).borderTopWidth : null,
            disabledText: disabled?.textContent?.trim() ?? null,
            disabledTabindex: disabled?.getAttribute("tabindex") ?? null,
          }
        })
        await page.keyboard.press("ArrowDown")
        await wait(150)
        const nav1 = await activeInfo(page)
        record(
          true,
          `无原生分组 API：分隔线=el-dropdown-item 的 divided prop（渲染独立 li role=${groupInfo.dividedRole}/border-top=${groupInfo.dividedBorderTop}）；分组标题惯用禁用项充当（tabindex=${groupInfo.disabledTabindex}）。鼠标打开后按 ArrowDown 焦点不动（${nav1.target}${nav1.cls.slice(0, 24)}，与键盘打开后聚焦首项不同，isUsingKeyboard 链路）——与 AppDropdownMenu 的 label/separator 自绘等价能力`,
        )
        await page.keyboard.press("Escape")
      },
    ],

    /** 7. el-select 空值语义 */
    [
      "select_空值",
      async (page) => {
        const sel1Initial = await selectableText(page, "sel1")
        record(
          true,
          `sel1（modelValue=""，选项无 ""）：显示「${sel1Initial.text}」（is-transparent=${sel1Initial.transparent}）——EP 把 "" 当空值走占位分支`,
        )

        const sel2Initial = await selectableText(page, "sel2")
        const row2 = page.locator(".probe-select-row").filter({ hasText: "sel2" })
        await row2.locator(".el-select__wrapper").click()
        await wait(300)
        await page.locator(".el-select-dropdown__item", { hasText: "根目录" }).first().click()
        await wait(300)
        const sel2Log = await readLog(page, "sel2")
        const sel2After = await selectableText(page, "sel2")
        const updateValues = sel2Log
          .filter((entry) => entry.key === "update")
          .map((entry) => entry.value)
        const updateText = updateValues.length
          ? `update payload=${JSON.stringify(updateValues)}`
          : 'update 事件未触发（isEqual(modelValue, "") 拦截，无任何事件）'
        record(
          true,
          `sel2（含 value="" 选项「根目录」）：初始回显「${sel2Initial.text}」（${
            sel2Initial.transparent ? '走占位分支，value="" 命不中选项' : "回显了选项"
          }）；点选「根目录」后${updateText}，回显「${sel2After.text}」（is-transparent=${sel2After.transparent}）`,
        )

        const row3 = page.locator(".probe-select-row").filter({ hasText: "sel3" })
        await row3.locator(".el-select__wrapper").hover()
        await wait(200)
        const clearVisible = await row3
          .locator(".el-select__clear")
          .isVisible()
          .catch(() => false)
        if (clearVisible) {
          await row3.locator(".el-select__clear").click()
          await wait(300)
          const sel3Log = await readLog(page, "sel3")
          const sel3After = await selectableText(page, "sel3")
          const update3 = sel3Log
            .filter((entry) => entry.key === "update")
            .map((entry) => entry.value)
          const types3 = sel3Log
            .filter((entry) => entry.key === "updateType")
            .map((entry) => entry.value)
          const clearFired = sel3Log.some((entry) => entry.key === "clear")
          record(
            true,
            `sel3（clearable）：hover 出清除图标可点；update payload=${JSON.stringify(update3)}（类型 ${types3.join("/")}），clear 事件=${
              clearFired ? "触发" : "未触发"
            }；清空后回显「${sel3After.text}」`,
          )
        } else {
          record(false, "sel3 hover 后未出现清除图标")
        }
      },
    ],
  ]

  return tests
}

// ---------- 主流程 ----------

const runOnce = async (browser, url, runIndex) => {
  const results = []
  const record = (pass, detail) => {
    console.log(`${pass ? "✅" : "❌"} ${detail}`)
    results.push({ pass, detail })
  }

  const context = await browser.newContext({ viewport: { width: 1247, height: 952 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  try {
    for (const [name, testFn] of createTests(record)) {
      const before = results.length
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
        await page.waitForSelector("#probe-esc-open-a", { timeout: 10_000 })
        await wait(200)
        await testFn(page)
      } catch (error) {
        if (results.length === before) {
          record(false, `${name} —— 执行异常：${error.message.split("\n")[0]}`)
        }
      }
    }
  } finally {
    await context.close()
  }

  if (pageErrors.length > 0) {
    console.log(`[run ${runIndex}] 探针页运行异常：${pageErrors.join(" | ")}`)
  }
  return results
}

const main = async () => {
  console.log(`[T1] 构建探针应用（${PROBE_DIR}）…`)
  await build({
    root: PROBE_DIR,
    configFile: path.join(PROBE_DIR, "vite.config.ts"),
    logLevel: "warn",
  })

  const server = await preview({
    root: PROBE_DIR,
    configFile: path.join(PROBE_DIR, "vite.config.ts"),
    preview: { port: 0, host: "127.0.0.1" },
  })
  const url = server.resolvedUrls.local[0]
  console.log(`[T1] 探针服务：${url}`)

  const browser = await chromium.launch({
    headless: true,
    // 本机代理（127.0.0.1:7890）会劫持无头浏览器的 localhost 请求，强制不走系统代理
    args: ["--no-proxy-server"],
    // Playwright headless 默认带 --hide-scrollbars（滚动条宽度恒 0），会导致 EP
    // useLockscreen 的滚动条宽度补偿分支无法在运行时触发——去掉该默认参数，
    // 配合探针页的 ::-webkit-scrollbar{width:15px} 强制出经典滚动条
    ignoreDefaultArgs: ["--hide-scrollbars"],
  })

  const runResults = []
  try {
    for (const runIndex of [1, 2]) {
      console.log(`\n===== 第 ${runIndex} 轮 =====`)
      runResults.push(await runOnce(browser, url, runIndex))
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => server.httpServer.close(resolve))
  }

  const [first, second] = runResults
  // EP 每次运行自动生成的 el-id-* 不同，比对文本前先归一化，否则轮间 diff 永远漂移
  const normalizeId = (detail) => detail.replace(/el-id-\d+-\d+/g, "el-id-*")
  let inconsistent = 0
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    const a = normalizeId(first[i].detail)
    const b = normalizeId(second[i].detail)
    if (first[i].pass !== second[i].pass || a !== b) {
      inconsistent += 1
      console.log(`⚠️ 轮间不一致：第 ${i + 1} 项 run1=${first[i].pass} run2=${second[i].pass}`)
      if (a !== b) {
        console.log(`   run1: ${a}`)
        console.log(`   run2: ${b}`)
      }
    }
  }

  const failed = second.filter((entry) => !entry.pass)
  console.log(
    `\n===== 汇总：${second.length - failed.length}/${second.length} 项与预期一致；轮间一致率 ${
      second.length - inconsistent
    }/${second.length} =====`,
  )
  if (failed.length > 0 || inconsistent > 0 || first.length !== second.length) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`[T1] 探针执行失败：${error.message}`)
  process.exitCode = 1
})

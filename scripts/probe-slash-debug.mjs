// slash 菜单交互调试：逐字符输入 + 输入框状态转储
import assert from "node:assert/strict"
import {
  createBrowserPage,
  ensureDocument,
  loginThroughUi,
  logStep,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const PREFIX = "[probe:slash]"
const { browser, page } = await createBrowserPage()

const dump = async tag => {
  const state = await page.evaluate(() => {
    const menu = document.querySelector(".ne-ui-slash-card-select-menu")
    const input = document.querySelector(".ne-ui-slash-command-input")
    const titles = [...document.querySelectorAll(".ne-ui-slash-card-select-menu .ne-menu-item-container-title")]
      .map(el => el.textContent.trim())
      .slice(0, 8)
    const active = document.querySelector(".ne-ui-slash-card-select-menu [class*=active], .ne-ui-slash-card-select-menu [class*=selected]")
    return {
      menuExists: Boolean(menu),
      inputValue: input ? input.value : null,
      titles,
      activeText: active ? active.textContent.trim().slice(0, 20) : null,
    }
  })
  logStep(PREFIX, `${tag}: ${JSON.stringify(state)}`)
  return state
}

try {
  await loginThroughUi(page, PREFIX)
  const token = await readAccessToken(page)
  const doc = await ensureDocument("kbDemo000001", token, {
    title: `slash 调试 ${Date.now()}`,
    content: "# slash 调试\n\n",
  })
  await page.goto(new globalThis.URL(`/knowledge/kbDemo000001/doc/${doc.id}`, smokeConfig.baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  })
  const editorContent = page.locator('.yuque-doc-editor__surface [contenteditable="true"]').first()
  await editorContent.waitFor({ state: "visible", timeout: smokeConfig.timeout })

  await editorContent.click()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await page.waitForTimeout(300)

  await page.keyboard.type("/", { delay: 120 })
  await page.waitForTimeout(900)
  await dump("输入 / 后")

  for (const ch of ["t", "p"]) {
    await page.keyboard.type(ch, { delay: 120 })
    await page.waitForTimeout(700)
    await dump(`再输入 ${ch} 后`)
  }

  // 直接点击「图片」标题项
  const imgItem = page.locator(".ne-ui-slash-card-select-menu .ne-menu-item-container-title", { hasText: "图片" }).first()
  const count = await imgItem.count()
  logStep(PREFIX, `「图片」标题项数量 = ${count}`)
  if (count > 0) {
    const chooserRace = page
      .waitForEvent("filechooser", { timeout: 5000 })
      .then(() => "chooser")
      .catch(() => "none")
    await imgItem.click()
    logStep(PREFIX, `点击「图片」→ 文件选择器 = ${await chooserRace}`)
  }
} finally {
  await browser.close()
}

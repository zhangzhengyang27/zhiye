/**
 * Task 3.3 探针：对「更多操作」菜单面板与菜单项做盒模型测量（before/after 各跑一轮）。
 * 用法：node scripts/probe-menu-task-3.3.mjs（需 4173 preview + 后端 3200 在跑）
 */
import {
  apiRequest,
  createBrowserPage,
  ensureDocument,
  ensureKnowledgeBase,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const CONTENT =
  "# EP 迁移基线文档\n\n用于 AppDropdownMenu 换底前后的像素对比。\n\n- 列表项一\n- 列表项二\n\n**加粗文本**与正文。\n"

const probe = async () => {
  const { browser, context, page } = await createBrowserPage({
    viewport: { width: 1247, height: 952 },
  })
  const prefix = "[probe]"
  try {
    await loginThroughUi(page, prefix)
    const token = await readAccessToken(page)
    const kb = await ensureKnowledgeBase(token, prefix, "Smoke Workspace 编辑器工具栏验证")
    const doc = await ensureDocument(kb.id, token, { title: "EP 迁移基线验证", content: CONTENT })
    await apiRequest(`/knowledge/documents/${doc.id}`, {
      method: "PATCH",
      token,
      body: { content: { scheme: "text/markdown", value: CONTENT } },
      errorMessage: "写入基线文档内容失败",
    })
    const url = (path) => new URL(path, smokeConfig.baseUrl).toString()
    await page.goto(url(`/knowledge/${kb.id}/doc/${doc.id}`), { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(2500)
    await page.locator("header").first().getByRole("button", { name: "更多操作" }).click()
    await page.locator("[role='menu']").first().waitFor({ state: "visible", timeout: 5000 })
    await page.waitForTimeout(600)

    const data = await page.evaluate(() => {
      const panel =
        document.querySelector(".kb-el-dropdown-popper") ??
        document.querySelector("div[role='menu']")
      const cs = getComputedStyle(panel)
      const rect = panel.getBoundingClientRect()
      const items = [...panel.querySelectorAll("[role='menuitem']")].map((li) => {
        const r = li.getBoundingClientRect()
        const c = getComputedStyle(li)
        return {
          text: li.textContent.trim().slice(0, 14),
          w: +r.width.toFixed(2),
          scrollW: li.scrollWidth,
          pad: c.padding,
          fs: c.fontSize,
          lh: c.lineHeight,
          gap: c.gap,
        }
      })
      return {
        panel: {
          w: +rect.width.toFixed(2),
          h: +rect.height.toFixed(2),
          offsetMinusClient: panel.offsetWidth - panel.clientWidth,
          scrollH: panel.scrollHeight,
          clientH: panel.clientHeight,
          boxSizing: cs.boxSizing,
          pad: cs.padding,
          border: cs.borderWidth,
          maxH: cs.maxHeight,
          overflow: cs.overflowY,
        },
        items,
      }
    })
    console.log(JSON.stringify(data, null, 1))
  } finally {
    await browser.close()
  }
}

await probe()
logStep("[probe]", "done")

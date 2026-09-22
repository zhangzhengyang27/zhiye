import assert from "node:assert/strict"
import {
  assertNoPageErrors,
  attachPageDiagnostics,
  createBrowserPage,
  createDiagnostics,
  ensureFavoriteDocument,
  ensureKnowledgeBase,
  ensureRecentDocument,
  ensureTrashedDocument,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

const STEP_PREFIX = "[smoke:periphery]"

async function openSidebarPage(page, linkName, pathname, checks) {
  logStep(STEP_PREFIX, `打开「${linkName}」页`)

  await Promise.all([
    page.waitForURL((url) => url.pathname === pathname, { timeout: smokeConfig.timeout }),
    page.getByRole("link", { name: linkName }).click(),
  ])

  for (const check of checks) {
    await check.first().waitFor({
      state: "visible",
      timeout: smokeConfig.timeout,
    })
  }
}

async function openPageDirect(page, pathname, checks) {
  logStep(STEP_PREFIX, `打开页面 ${pathname}`)

  await page.goto(new globalThis.URL(pathname, smokeConfig.baseUrl).toString())
  await page.waitForURL((url) => url.pathname === pathname, { timeout: smokeConfig.timeout })

  for (const check of checks) {
    await check.first().waitFor({
      state: "visible",
      timeout: smokeConfig.timeout,
    })
  }
}

async function main() {
  const diagnostics = createDiagnostics()
  const { browser, page } = await createBrowserPage()
  attachPageDiagnostics(page, diagnostics)

  try {
    const token = await (async () => {
      await loginThroughUi(page, STEP_PREFIX)
      return readAccessToken(page)
    })()

    const knowledgeBase = await ensureKnowledgeBase(token, STEP_PREFIX)
    const recentDocument = await ensureRecentDocument(knowledgeBase.id, token, {
      title: "Smoke 最近更新文档",
      content: "# 最近更新\n\n用于最近更新页 smoke 验证。",
    })
    const favoriteDocument = await ensureFavoriteDocument(knowledgeBase.id, token, {
      title: "Smoke 收藏文档",
      content: "# 收藏\n\n用于收藏页 smoke 验证。",
    })
    const trashedDocument = await ensureTrashedDocument(knowledgeBase.id, token, {
      title: "Smoke 回收站文档",
      content: "# 回收站\n\n用于回收站页 smoke 验证。",
    })

    assert.ok(recentDocument?.id, "未准备好最近更新文档")
    assert.ok(favoriteDocument?.id, "未准备好收藏文档")
    assert.ok(trashedDocument?.id, "未准备好回收站文档")

    // 页面已对齐语雀式布局：标题收敛为「最近」「收藏」，回收站移入「更多」菜单，这里直接导航验证页面内容
    await openPageDirect(page, "/knowledge/recent", [
      page.getByRole("heading", { name: "最近", exact: true }),
      page.getByText("Smoke 最近更新文档", { exact: true }),
    ])

    await openSidebarPage(page, "收藏", "/knowledge/favorites", [
      page.getByRole("heading", { name: "收藏", exact: true }),
      page.getByText("Smoke 收藏文档", { exact: true }),
    ])

    await openPageDirect(page, "/knowledge/trash", [
      page.getByRole("heading", { name: "文档回收站" }),
      page.getByText("Smoke 回收站文档", { exact: true }),
    ])

    assertNoPageErrors(diagnostics)
    logStep(STEP_PREFIX, "外围工作台 smoke 通过")
  } finally {
    await page.close()
    await browser.close()
  }
}

main().catch((error) => {
  globalThis.console.error(`${STEP_PREFIX} 失败`, error)
  globalThis.process.exitCode = 1
})

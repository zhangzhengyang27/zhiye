/* global document */
/**
 * 验证（B3 前端接线四项）：
 *   #10 阅读态点赞区：点赞按钮/计数/已赞高亮/刷新保持/点赞者头像 + 元信息行阅读数
 *   #11 开始页「我点赞的」视角能拉到刚点赞的文档
 *   #21 flat「全部文档」视图卡片含摘要行（tree 接口 summary）
 *   #22 搜索页「站内公开分享」分组（附赠：注册第二账号在其它库造公开搜索分享源，
 *        断言分组渲染 + 点击新窗口打开 /share/:shareKey）
 * 用法：node scripts/verify-b3-frontend.mjs（需 4173 preview + 后端 3200 在跑）
 */
import assert from "node:assert/strict"
import {
  createBrowserPage,
  loginThroughUi,
  readAccessToken,
  ensureKnowledgeBase,
  ensureDocument,
  flattenTree,
  apiRequest,
  logStep,
} from "./lib/knowledge-smoke-utils.mjs"

const CONTENT = [
  "# B3 前端接线验证",
  "",
  "这一段是点赞与摘要验证用的正文内容，用来生成 tree 接口 searchText 摘要的前六十字，需要足够长度。",
  "",
  "第二段正文补充长度。",
].join("\n")

const DOC_TITLE = "B3 前端接线验证"

const { browser, page } = await createBrowserPage()

try {
  // ==================== 数据准备（API） ====================
  await loginThroughUi(page, "[验证]")
  const token = await readAccessToken(page)
  const kb = await ensureKnowledgeBase(token, "[验证]", "Smoke Workspace B3 前端接线")
  const doc = await ensureDocument(kb.id, token, { title: DOC_TITLE, content: CONTENT })
  // 复跑幂等：创建端点不带内容，统一 PATCH 重置为标准内容（摘要随 searchText 重建）
  await apiRequest(`/knowledge/documents/${doc.id}`, {
    method: "PATCH",
    token,
    body: { content: { scheme: "text/markdown", value: CONTENT } },
    errorMessage: "重置文档内容失败",
  })
  // 复跑幂等：清掉历史点赞，保证「0 → 点赞 → 1」的确定性
  await apiRequest(`/knowledge/documents/${doc.id}/like`, { method: "DELETE", token }).catch(
    () => undefined,
  )

  // 后端契约直验：详情返回 viewCount 数字、like 查询返回未赞态
  const detail = await apiRequest(`/knowledge/documents/${doc.id}`, {
    token,
    errorMessage: "读取文档详情失败",
  })
  assert.equal(
    typeof detail.viewCount,
    "number",
    `详情接口应返回数字 viewCount，实际：${JSON.stringify(detail.viewCount)}`,
  )
  const likeBefore = await apiRequest(`/knowledge/documents/${doc.id}/like`, {
    token,
    errorMessage: "读取点赞状态失败",
  })
  assert.equal(likeBefore.liked, false, "重置后应为未赞状态")
  assert.equal(likeBefore.count, 0, "重置后点赞数应为 0")

  // tree 接口 summary（#21 期望值来源）
  const tree = await apiRequest(`/knowledge/documents/tree?kbId=${encodeURIComponent(kb.id)}`, {
    token,
    errorMessage: "读取文档树失败",
  })
  const treeNode = flattenTree(Array.isArray(tree) ? tree : []).find((node) => node.id === doc.id)
  assert.ok(
    treeNode?.summary,
    `tree 接口应返回非空 summary，实际节点：${JSON.stringify(treeNode)?.slice(0, 200)}`,
  )
  logStep(
    "[验证]",
    `✅ 后端契约就绪：viewCount=${detail.viewCount}，summary=「${treeNode.summary}」`,
  )

  // ==================== #10 阅读态点赞区 ====================
  await page.goto(
    new URL(`/knowledge/${kb.id}/doc/${doc.id}?preview=1`, "http://127.0.0.1:4173").toString(),
    {
      waitUntil: "domcontentloaded",
    },
  )

  const likeSection = page.locator('[data-testid="doc-like-section"]')
  await likeSection.waitFor({ state: "visible", timeout: 30_000 })
  logStep("[验证]", "✅ 阅读态（preview=1）文末出现点赞区")

  const viewCountText = (await page.locator('[data-testid="doc-view-count"]').textContent()) ?? ""
  assert.match(
    viewCountText,
    /阅读数\s*\d+/,
    `元信息行应含阅读数，实际：「${viewCountText.trim()}」`,
  )
  logStep("[验证]", `✅ 元信息行展示阅读数：「${viewCountText.trim()}」`)

  const likeCount = page.locator('[data-testid="doc-like-count"]')
  const likeButton = page.locator('[data-testid="doc-like-button"]')
  assert.match(((await likeCount.textContent()) ?? "").trim(), /^0 人点赞$/, "初始应为 0 人点赞")

  await likeButton.click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="doc-like-count"]')?.textContent?.includes("1 人点赞"),
    undefined,
    { timeout: 10_000 },
  )
  const likedClass = (await likeButton.getAttribute("class")) ?? ""
  assert.ok(
    likedClass.includes("bg-brand-faint") && likedClass.includes("text-brand"),
    `点赞后按钮应高亮，实际 class：${likedClass}`,
  )
  // 点赞者头像：本账号无头像时回退首字圆片（liker 容器内出现圆形 chip）
  const likerChipCount = await likeSection
    .locator("span.rounded-full img, span.rounded-full > span")
    .count()
  assert.ok(likerChipCount >= 1, "点赞后应出现点赞者头像/首字圆片")
  logStep("[验证]", "✅ 点赞后 count=1、按钮高亮、点赞者头像出现")

  // 刷新后 liked 状态保持
  await page.reload({ waitUntil: "domcontentloaded" })
  await likeSection.waitFor({ state: "visible", timeout: 30_000 })
  assert.match(
    ((await likeCount.textContent()) ?? "").trim(),
    /^1 人点赞$/,
    "刷新后点赞数应保持为 1",
  )
  const refreshedClass = (await likeButton.getAttribute("class")) ?? ""
  assert.ok(refreshedClass.includes("bg-brand-faint"), "刷新后按钮应保持已赞高亮")
  logStep("[验证]", "✅ 刷新后 liked 状态与计数保持")

  // ==================== #11 开始页「我点赞的」 ====================
  await page.goto(new URL("/knowledge/start", "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.getByRole("button", { name: "我点赞的" }).click()
  await page
    .getByText(DOC_TITLE, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
  logStep("[验证]", "✅ 开始页「我点赞的」视角出现刚点赞的文档")

  // ==================== #21 flat「全部文档」摘要行 ====================
  await page.goto(new URL(`/knowledge/${kb.id}`, "http://127.0.0.1:4173").toString(), {
    waitUntil: "domcontentloaded",
  })
  await page.locator("[data-tree-switcher-trigger]").waitFor({ state: "visible", timeout: 30_000 })
  await page.locator("[data-tree-switcher-trigger]").click()
  await page.locator("[data-tree-switcher]").getByRole("button", { name: "全部文档" }).click()

  const flatCard = page.locator("aside div[role='button']").filter({ hasText: DOC_TITLE }).first()
  await flatCard.waitFor({ state: "visible", timeout: 15_000 })
  const flatCardText = (await flatCard.textContent()) ?? ""
  assert.ok(
    flatCardText.includes(treeNode.summary),
    `flat 卡片应包含摘要行「${treeNode.summary}」，实际卡片文本：「${flatCardText.slice(0, 160)}」`,
  )
  logStep("[验证]", "✅ flat「全部文档」卡片含标题+摘要两行")

  // ==================== #22 搜索页「站内公开分享」（附赠覆盖） ====================
  // 注册第二账号 → 在其名下新建库/文档/公开分享（站内可搜索）→ 回到主账号搜索页断言
  const uniqueMark = `b3share${Date.now().toString(36)}`
  const shareKeyword = `星尘检索词${uniqueMark}`
  const accountB = `${uniqueMark}@example.com`
  // 邮箱账号注册改走邮箱验证码（开发环境 email-code 接口回显明文 devCode）
  const emailCodeSent = await apiRequest("/auth/email-code", {
    method: "POST",
    body: { email: accountB, purpose: "register" },
    errorMessage: "发送邮箱验证码失败",
  })
  const emailCode = emailCodeSent?.devCode
  if (!emailCode) {
    throw new Error(
      "开发环境 email-code 未回显 devCode，无法自动注册第二账号（NODE_ENV=production？）",
    )
  }
  await apiRequest("/auth/register", {
    method: "POST",
    body: {
      account: accountB,
      password: "b3share123456",
      displayName: "B3 分享源用户",
      emailCode,
    },
    errorMessage: "注册第二账号失败",
  })
  const loginB = await apiRequest("/auth/login", {
    method: "POST",
    body: { account: accountB, password: "b3share123456" },
    errorMessage: "登录第二账号失败",
  })
  const tokenB = loginB.accessToken
  assert.ok(tokenB, "第二账号登录应返回 accessToken")
  const kbB = await apiRequest("/knowledge/knowledge-bases", {
    method: "POST",
    token: tokenB,
    body: { name: `Smoke 公开搜索源库 ${uniqueMark}`, description: "B3 #22 探针专用" },
    errorMessage: "第二账号建库失败",
  })
  const docB = await apiRequest("/knowledge/documents", {
    method: "POST",
    token: tokenB,
    body: {
      kbId: kbB.id,
      title: `公开分享源 ${shareKeyword}`,
      status: "published",
      type: "doc",
      content: {
        scheme: "text/markdown",
        value: `# 公开分享源\n\n正文包含 ${shareKeyword} 供跨库检索命中。`,
      },
    },
    errorMessage: "第二账号建文档失败",
  })
  const share = await apiRequest(`/knowledge/documents/${docB.id}/shares`, {
    method: "POST",
    token: tokenB,
    body: { permission: "view" },
    errorMessage: "创建公开分享失败",
  })
  await apiRequest(`/knowledge/documents/shares/${share.id}`, {
    method: "PATCH",
    token: tokenB,
    body: { searchable: true },
    errorMessage: "开启站内公开搜索失败",
  })

  // 接口层：主账号在 KB A 搜索时附带 publicShares
  const searchResult = await apiRequest(
    `/knowledge/documents/search?kbId=${encodeURIComponent(kb.id)}&q=${encodeURIComponent(shareKeyword)}&scope=all&page=1&pageSize=20`,
    { token, errorMessage: "搜索接口请求失败" },
  )
  const matchedShare = (searchResult.publicShares ?? []).find(
    (item) => item.shareKey === share.shareKey,
  )
  assert.ok(
    matchedShare,
    `搜索响应应包含 publicShares 条目，实际：${JSON.stringify(searchResult.publicShares)}`,
  )
  assert.equal(matchedShare.kbName, kbB.name, "publicShares 条目应携带来源库名")
  logStep("[验证]", "✅ 搜索接口返回站内公开分享聚合")

  // UI 层：搜索页渲染分组，点击新窗口打开 /share/:shareKey
  await page.goto(
    new URL(
      `/knowledge/${kb.id}/search?q=${encodeURIComponent(shareKeyword)}`,
      "http://127.0.0.1:4173",
    ).toString(),
    { waitUntil: "domcontentloaded" },
  )
  const shareSection = page.locator('[data-testid="public-shares"]')
  await shareSection.waitFor({ state: "visible", timeout: 20_000 })
  const sectionText = (await shareSection.textContent()) ?? ""
  assert.ok(sectionText.includes(`公开分享源 ${shareKeyword}`), "分组应展示分享文档标题")
  assert.ok(sectionText.includes(kbB.name), "分组应展示来源库名")
  assert.ok(sectionText.includes("来自公开分享"), "分组应展示公开分享徽标")

  const sharePopupPromise = page.waitForEvent("popup")
  await shareSection.getByRole("button").first().click()
  const sharePage = await sharePopupPromise
  await sharePage.waitForURL(/\/share\//, { timeout: 15_000 })
  assert.ok(
    new URL(sharePage.url()).pathname.startsWith(`/share/${share.shareKey}`),
    `新窗口应打开分享页，实际：${sharePage.url()}`,
  )
  await sharePage.close()
  logStep("[验证]", "✅ 搜索页「站内公开分享」分组渲染，点击新窗口打开分享页")

  logStep("[验证]", "🎉 B3 前端接线验证全部通过")
} catch (error) {
  logStep("[验证]", `✗ 验证失败：${error instanceof Error ? error.message : String(error)}`)
  try {
    await page.screenshot({
      path: "output/playwright/verify-b3-frontend-failure.png",
      fullPage: true,
    })
    logStep("[验证]", "失败现场截图：output/playwright/verify-b3-frontend-failure.png")
  } catch {
    // 截图失败不掩盖原始错误
  }
  throw error
} finally {
  await browser.close()
}

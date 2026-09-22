/* global document, window */
import { createBrowserPage } from "./lib/knowledge-smoke-utils.mjs"
const { browser, page } = await createBrowserPage()
await page.goto("https://knowledge-web.zhangzhengyang.com/auth/login", {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
})
await page.waitForTimeout(6000)
const state = await page.evaluate(() => ({
  tracker: !!document.querySelector('script[src*="analytics.zhangzhengyang.com"]'),
  hasUmami: typeof window.umami !== "undefined",
  title: document.title,
}))
console.log("页面状态:", JSON.stringify(state))
await browser.close()

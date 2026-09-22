import { createBrowserPage, loginThroughUi } from "./lib/knowledge-smoke-utils.mjs"

const { browser, context, page } = await createBrowserPage({
  viewport: { width: 1247, height: 952 },
})
await context.addInitScript(() => {
  globalThis.localStorage.setItem("vueuse-color-scheme", "light")
})
const url = (path) => new URL(path, "http://127.0.0.1:4173").toString()

await page.goto(url("/auth/login"), { waitUntil: "networkidle" })
await loginThroughUi(page, "[探针]")
await page.goto(url("/account"), { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)

const exp = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button.el-button")].find((b) =>
    (b.textContent || "").includes("选择图片"),
  )
  const found = []
  const walk = (ruleList, layerPath, sheetName) => {
    for (const rule of ruleList) {
      if (rule instanceof CSSLayerBlockRule) {
        walk(rule.cssRules, [...layerPath, rule.name], sheetName)
      } else if (
        rule instanceof CSSMediaRule ||
        rule instanceof CSSSupportsRule ||
        rule instanceof CSSContainerRule
      ) {
        walk(rule.cssRules, layerPath, sheetName)
      } else if (rule.selectorText && rule.style) {
        const d = rule.style.display
        if (d && d !== "") {
          try {
            if (btn.matches(rule.selectorText)) {
              found.push({
                sel: rule.selectorText,
                display: d,
                layer: layerPath.join(" > ") || "(unlayered)",
                sheet: sheetName,
              })
            }
          } catch {}
        }
      }
    }
  }
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      found.push({ unreachable: sheet.href })
      continue
    }
    walk(rules, [], sheet.href?.split("/").pop() ?? "inline")
  }
  // 顶层 @layer 语句
  const stmts = []
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSLayerStatementRule) stmts.push(rule.nameList.join(","))
      }
    } catch {}
  }
  return { found, layerStatements: stmts }
})
console.log(JSON.stringify(exp, null, 1))
await browser.close()

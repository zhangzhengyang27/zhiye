/**
 * 视觉基线对照报告生成：把语雀真机截图与复刻截图并排生成 HTML 报告（人工审阅用）。
 * 用法：node scripts/visual-baseline-report.mjs
 */
import fs from "node:fs"
import path from "node:path"

const BASE = path.resolve("output/visual-baseline")
const SCREENS = [
  { id: "knowledge-list", label: "知识库列表" },
  { id: "workspace-home", label: "工作台首页（KB 首页）" },
  { id: "editor", label: "文档编辑页" },
  { id: "start", label: "开始页" },
]

const exists = (p) => fs.existsSync(p)
const rows = SCREENS.map(({ id, label }) => {
  const yuque = exists(path.join(BASE, "yuque", `${id}.png`))
  const replica = exists(path.join(BASE, "replica", `${id}.png`))
  return `
  <section class="screen">
    <h2>${label} <small>${id}</small></h2>
    <div class="pair">
      <figure>
        <figcaption>语雀真机${yuque ? "" : "（缺失）"}</figcaption>
        ${yuque ? `<img src="../yuque/${id}.png" loading="lazy">` : "<div class='missing'>缺截图</div>"}
      </figure>
      <figure>
        <figcaption>复刻端${replica ? "" : "（缺失）"}</figcaption>
        ${replica ? `<img src="../replica/${id}.png" loading="lazy">` : "<div class='missing'>缺截图</div>"}
      </figure>
    </div>
  </section>`
})

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>视觉基线对照报告</title>
<style>
  body { font-family: -apple-system, "PingFang SC", sans-serif; margin: 24px; background: #f5f5f5; }
  h1 { font-size: 20px; }
  .meta { color: #888; font-size: 13px; margin-bottom: 24px; }
  .screen { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .screen h2 { font-size: 16px; margin: 0 0 12px; }
  .screen h2 small { color: #aaa; font-weight: normal; margin-left: 8px; }
  .pair { display: flex; gap: 16px; align-items: flex-start; }
  figure { margin: 0; flex: 1; min-width: 0; }
  figcaption { font-size: 12px; color: #666; margin-bottom: 6px; }
  img { width: 100%; height: auto; border: 1px solid #e5e5e5; border-radius: 4px; }
  .missing { padding: 60px; text-align: center; color: #c00; background: #fafafa; border-radius: 4px; }
</style>
</head>
<body>
<h1>视觉基线对照报告</h1>
<p class="meta">生成时间：${new Date().toLocaleString("zh-CN")} ｜ 语雀窗口为真机截屏（Retina 2x），复刻端为 1247×952 视口。逐屏人工核对：布局结构 / 密度 / 组件形态 / 文案。</p>
${rows.join("\n")}
</body>
</html>`

fs.mkdirSync(path.join(BASE, "report"), { recursive: true })
fs.writeFileSync(path.join(BASE, "report", "index.html"), html)
console.log("[基线] 报告已生成:", path.join(BASE, "report", "index.html"))

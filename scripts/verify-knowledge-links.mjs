/**
 * 知识网络（双向链接）探针：A/B 文档互链后，双向命中校验（纯 fetch，无需浏览器）。
 *
 * 前置：后端 :3200 + 种子数据（`pnpm db:seed`，账号 demo@example.com / 123456）。
 * 用法：`node scripts/verify-knowledge-links.mjs`
 *
 * 链路：建探针知识库 → 建 B 文档 → 建 A 文档（正文 markdown 链接指向 B 的编辑页 URL）
 *   → GET /knowledge/documents/:id/knowledge-links
 *   → 断言 A.forwardLinks 含 B、B.backlinks 含 A（弱引用 v1，同库 doc 链接）
 *   → 清理：A/B 文档与知识库移入回收站（与冒烟数据约定一致，批量清理脚本按名删除）。
 */
import assert from "node:assert/strict"

const SERVER_BASE_URL = (process.env.XIAOYE_SERVER_URL ?? "http://127.0.0.1:3200").replace(
  /\/+$/,
  "",
)
const API_BASE = `${SERVER_BASE_URL}/api`
const ACCOUNT = process.env.PROBE_ACCOUNT ?? "demo@example.com"
const PASSWORD = process.env.PROBE_PASSWORD ?? "123456"

const PREFIX = "[knowledge-links]"
let checks = 0

const logStep = (message) => console.log(`${PREFIX} ${message}`)

const pass = (label) => {
  checks += 1
  logStep(`✓ ${label}`)
}

/** 统一请求封装：返回 { status, body }。 */
const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  })

  let body = null
  const text = await response.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  return { status: response.status, body }
}

const login = async () => {
  const result = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  })
  assert.equal(result.status, 201, `登录探针账号失败：${JSON.stringify(result.body)}`)
  const token = result.body?.accessToken
  assert.ok(token, "登录响应缺 accessToken")
  return token
}

const createDocument = (token, kbId, title, markdown) =>
  api("/knowledge/documents", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kbId,
      title,
      type: "doc",
      editorType: "nuxt-editor",
      status: "draft",
      content: { scheme: "text/markdown", value: markdown },
    }),
  })

const getLinks = (token, docId) =>
  api(`/knowledge/documents/${docId}/knowledge-links`, {
    headers: { authorization: `Bearer ${token}` },
  })

const main = async () => {
  logStep(`后端地址：${API_BASE}`)

  const token = await login()
  pass(`登录探针账号 ${ACCOUNT}`)

  // 1. 建探针知识库（命名带 Smoke 前缀，便于既有批量清理脚本回收）
  const kbResult = await api("/knowledge/knowledge-bases", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Smoke Knowledge Links ${Date.now()}`,
      description: "知识网络探针专用库",
    }),
  })
  assert.equal(kbResult.status, 201, `创建知识库失败：${JSON.stringify(kbResult.body)}`)
  const kbId = kbResult.body?.id
  assert.ok(kbId, "知识库响应缺 id")
  pass(`创建探针知识库 ${kbResult.body?.name}`)

  // 2. 先建 B（被引用方），再建 A（引用方，正文含 B 的编辑页链接）
  const docB = await createDocument(token, kbId, "知识网络探针 B", "B 文档正文。")
  assert.equal(docB.status, 201, `创建文档 B 失败：${JSON.stringify(docB.body)}`)
  const docBId = docB.body?.id
  assert.ok(docBId, "文档 B 响应缺 id")

  const linkUrl = `${SERVER_BASE_URL}/knowledge/${kbId}/doc/${docBId}`
  const docA = await createDocument(
    token,
    kbId,
    "知识网络探针 A",
    `A 文档正文，引用 [知识网络探针 B](${linkUrl})。`,
  )
  assert.equal(docA.status, 201, `创建文档 A 失败：${JSON.stringify(docA.body)}`)
  const docAId = docA.body?.id
  assert.ok(docAId, "文档 A 响应缺 id")
  pass("创建 A/B 文档，A 正文链接到 B")

  // 3. 双向命中断言
  const linksFromA = await getLinks(token, docAId)
  assert.equal(linksFromA.status, 200, `读取 A 知识网络失败：${JSON.stringify(linksFromA.body)}`)
  const forwardIds = (linksFromA.body?.forwardLinks ?? []).map((item) => item.id)
  assert.ok(
    forwardIds.includes(docBId),
    `A.forwardLinks 未命中 B（实际：${JSON.stringify(linksFromA.body?.forwardLinks)}）`,
  )
  pass("A 的「引用了」命中 B")

  const linksFromB = await getLinks(token, docBId)
  assert.equal(linksFromB.status, 200, `读取 B 知识网络失败：${JSON.stringify(linksFromB.body)}`)
  const backIds = (linksFromB.body?.backlinks ?? []).map((item) => item.id)
  assert.ok(
    backIds.includes(docAId),
    `B.backlinks 未命中 A（实际：${JSON.stringify(linksFromB.body?.backlinks)}）`,
  )
  pass("B 的「被引用」命中 A（双向）")

  // 4. 清理：A/B 移入回收站，知识库删除（级联回收站）
  const trashA = await api(`/knowledge/documents/${docAId}/trash`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  })
  const trashB = await api(`/knowledge/documents/${docBId}/trash`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  })
  const deleteKb = await api(`/knowledge/knowledge-bases/${kbId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  })
  const cleanupOk = trashA.status === 201 && trashB.status === 201 && deleteKb.status === 200
  if (cleanupOk) {
    pass("清理：探针文档与知识库已移入回收站")
  } else {
    logStep(
      `清理未完全成功（A:${trashA.status} B:${trashB.status} KB:${deleteKb.status}），可按「Smoke Knowledge Links」名称批量清理`,
    )
  }

  console.log(`\n${PREFIX} 全部通过，共 ${checks} 项断言。`)
}

main().catch((error) => {
  console.error(`\n${PREFIX} ✗ 验收失败：${error?.message ?? error}`)
  process.exit(1)
})

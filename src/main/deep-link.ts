/**
 * knowledge:// 深链解析（#31）——纯函数层，不 import electron。
 *
 * ⚠️ 现状：本模块「未接线」——主进程没有 setAsDefaultProtocolClient /
 * open-url / second-instance argv 解析（2026-09-23 决策暂缓：编辑器刚需追平
 * 优先于分发能力）。接线前 OS 不会把 knowledge:// 链接路由到应用，单测通过
 * 不代表功能可用；接线时以本模块为解析层 + index.ts bootstrap 注册。
 *
 * 只承接自家唤起形态 `knowledge://kb/:kbId/doc/:docId`（对齐站内文档路由
 * /knowledge/:kbId/doc/:docId）；分享复制链接保持 http(s)，不走本协议。
 * 单独成模块同样是为了 `scripts/verify-desktop-b6.mjs` 能单测级断言。
 */

/** 对外深链协议名（app.setAsDefaultProtocolClient 用同值）。 */
export const DEEP_LINK_PROTOCOL = "knowledge"

/** 路由段 id 的合法字符（cuid/uuid/slug 都落在内）。 */
const ID_SEGMENT_PATTERN = "[A-Za-z0-9_-]+"

/** `knowledge://kb/:kbId/doc/:docId` 的 pathname 形态。 */
const DEEP_LINK_PATH_PATTERN = new RegExp(`^/(${ID_SEGMENT_PATTERN})/doc/(${ID_SEGMENT_PATTERN})$`)

/**
 * 解析深链为 SPA 内部路由（/knowledge/:kbId/doc/:docId）。
 *
 * 协议/host/path 任一不合式返回 null（大小写协议按 URL 解析结果比对），
 * 防止把任意字符串拼进 app:// 造成越权加载。
 */
export const parseKnowledgeDeepLink = (rawUrl: string): string | null => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:` || parsed.hostname !== "kb") {
    return null
  }

  const match = DEEP_LINK_PATH_PATTERN.exec(parsed.pathname)
  if (!match?.[1] || !match?.[2]) {
    return null
  }

  const targetPath = `/knowledge/${match[1]}/doc/${match[2]}`
  // 双保险：与主进程 INTERNAL_PATH_PATTERN 同口径（字母数字 / : _ -）。
  return /^\/[A-Za-z0-9/:_-]*$/.test(targetPath) ? targetPath : null
}

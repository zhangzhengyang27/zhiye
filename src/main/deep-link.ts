/**
 * knowledge:// 深链解析（#31）——纯函数层，不 import electron。
 *
 * 已接线（2026-09-23）：index.ts 顶部注册协议（setAsDefaultProtocolClient，
 * dev 态经 process.defaultApp 绑 electron 可执行文件）、open-url（macOS）与
 * second-instance argv（Windows）共同入口 handleDeepLinkUrl → 解析为站内路径
 * → focusMainWindow + IPC 推给渲染层（App.vue onDeepLink 订阅 router.push）；
 * 冷启动深链先于主窗到达时暂存 pendingDeepLinkPath，did-finish-load 后冲刷。
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

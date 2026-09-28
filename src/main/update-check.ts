/**
 * 桌面端检查更新（GitHub Releases 最新版比对）。
 *
 * 私测期形态：只做「检查 + 引导下载」，不接 electron-updater 静默安装——
 * macOS 自动更新要求 Developer ID 签名（见 docs/发布链路-2026-09-28.md
 * 未完成事项第 2 条），签名接入后再换 electron-updater 走全量更新链路。
 * net.fetch 走 Chromium 网络栈，随系统代理（Clash 等）可达 GitHub；
 * /releases/latest 只含已发布版本，draft/prerelease 天然不参与比对。
 */
import { app, net } from "electron"

const RELEASES_LATEST_API = "https://api.github.com/repos/zhangzhengyang27/zhiye/releases/latest"

export interface DesktopUpdateCheckResult {
  status: "up-to-date" | "available" | "error"
  /** 当前版本（app.getVersion()）。 */
  currentVersion: string
  /** 最新版本号（去 v 前缀），status=error 时缺省。 */
  latestVersion?: string
  /** Release 页地址（引导下载用）。 */
  releaseUrl?: string
  /** release notes 原文（截断到 500 字）。 */
  releaseNotes?: string
  /** status=error 时的用户可读原因。 */
  message?: string
}

/** 三段数字版本比较：a>b 返回 1，a<b 返回 -1，相等 0；缺段按 0 处理。 */
export const compareVersions = (a: string, b: string): number => {
  const pa = a
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0)
  const pb = b
    .replace(/^v/, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) {
      return da > db ? 1 : -1
    }
  }
  return 0
}

export const checkForDesktopUpdate = async (): Promise<DesktopUpdateCheckResult> => {
  const currentVersion = app.getVersion()
  try {
    const response = await net.fetch(RELEASES_LATEST_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "zhiye-desktop" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return {
        status: "error",
        currentVersion,
        message: `更新服务器返回 ${response.status}，请稍后重试`,
      }
    }
    const data = (await response.json()) as {
      tag_name?: unknown
      html_url?: unknown
      body?: unknown
      assets?: unknown
    }
    // tag_name 优先；draft 发布时若与 git tag 关联断裂，GitHub 会生成
    // untagged-* 伪 tag（解析不出 semver），此时从资产名 zhiye-x.y.z-* 兜底提取
    const semverPattern = /^v?(\d+\.\d+\.\d+)/
    let latestVersion =
      typeof data.tag_name === "string" ? (semverPattern.exec(data.tag_name)?.[1] ?? "") : ""
    if (!latestVersion && Array.isArray(data.assets)) {
      for (const asset of data.assets) {
        const name = (asset as { name?: unknown })?.name
        const match = typeof name === "string" ? /(\d+\.\d+\.\d+)/.exec(name) : null
        if (match) {
          latestVersion = match[1]
          break
        }
      }
    }
    if (!latestVersion) {
      return { status: "error", currentVersion, message: "更新服务器返回了无法解析的版本信息" }
    }
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
    return {
      status: hasUpdate ? "available" : "up-to-date",
      currentVersion,
      latestVersion,
      releaseUrl: typeof data.html_url === "string" ? data.html_url : undefined,
      releaseNotes:
        typeof data.body === "string" && data.body.trim()
          ? data.body.trim().slice(0, 500)
          : undefined,
    }
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message:
        error instanceof Error && error.name === "TimeoutError"
          ? "网络超时，请检查网络或代理设置后重试"
          : "网络请求失败，请检查网络或代理设置后重试",
    }
  }
}

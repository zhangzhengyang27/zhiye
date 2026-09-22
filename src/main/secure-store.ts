/**
 * 主进程安全存储（G4 画板 AI Key 等敏感小文本）。
 *
 * 职责边界：
 * - 渲染层经 IPC 传入「存储键 + 明文载荷」，本模块用 safeStorage 借操作系统
 *   能力加密（macOS Keychain / Windows DPAPI / Linux libsecret）后 base64 落
 *   `userData/secure-store.json`，结构 `{ [storageKey: string]: ciphertext }`。
 * - 本模块不解释载荷内容：画板 AI 的槽位划分（按 userId + 明文摘要）由渲染层
 *   `utils/knowledge-board-ai-secret.ts` 构造，主进程只是一张通用的加密 KV 表。
 * - 文件损坏 / 缺失一律视作空表并重建（下次写盘即覆盖），不让单条坏数据卡死功能。
 * - 写盘先落临时文件再 rename（desktop-settings 同款约定），主进程崩在中途也
 *   不会留下半截 JSON。
 */
import { app, ipcMain, safeStorage } from "electron"
import fs from "node:fs"
import path from "node:path"

/** 密文落盘文件名（相对 userData，与 config.json / desktop-settings.json 同目录）。 */
const SECURE_STORE_FILENAME = "secure-store.json"

/** 存储键上限：渲染层构造的键是 `kb-board-ai:{userId}:{digest}` 量级，256 足够。 */
const MAX_STORAGE_KEY_LENGTH = 256
/** 明文载荷上限：API Key 级别的小文本，64KB 已远超需要，防误用成通用文件存储。 */
const MAX_PLAINTEXT_LENGTH = 64 * 1024

/** 安全存储操作结果：ok=false 时 reason 说明原因（与渲染层桥接类型同名同构）。 */
export interface SecureStoreResult {
  ok: boolean
  /** 仅 get：ok=true 时命中返回明文载荷，无记录为 null。 */
  value?: string | null
  reason?: "unavailable" | "invalid" | "io-error"
}

/** secure-store.json 的磁盘形状：存储键 → safeStorage 密文的 base64。 */
type SecureStoreRecords = Record<string, string>

const getSecureStoreFilePath = () => path.join(app.getPath("userData"), SECURE_STORE_FILENAME)

/**
 * 读取整张记录表。文件缺失、JSON 损坏或结构不对（非对象 / 值混入非字符串）
 * 一律视作空表——读取侧不抛错，损坏的条目直接丢弃，下次写盘即重建。
 */
const readRecords = (): SecureStoreRecords => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(getSecureStoreFilePath(), "utf-8"))
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const records: SecureStoreRecords = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        records[key] = value
      }
    }
    return records
  } catch {
    return {}
  }
}

/**
 * 原子写盘：先写同目录临时文件再 rename 覆盖。临时文件名带 pid + 时间戳，
 * 避免多实例残留 / 并发写时互相踩踏；rename 失败时清掉临时文件不留垃圾。
 */
const writeRecords = (records: SecureStoreRecords) => {
  const target = getSecureStoreFilePath()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    // 密文虽经 OS 级加密，落盘权限仍收紧到当前用户（0o600）
    fs.writeFileSync(tmp, JSON.stringify(records), { encoding: "utf-8", mode: 0o600 })
    fs.renameSync(tmp, target)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // 临时文件可能尚未创建成功，忽略
    }
    throw error
  }
}

/** IPC 入参校验：存储键非空且无控制字符，明文在长度上限内。 */
const isValidStorageKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_STORAGE_KEY_LENGTH &&
  // eslint-disable-next-line no-control-regex -- 刻意匹配控制字符：存储键禁止 \x00-\x1f
  !/[\u0000-\u001f\u007f]/.test(value)

const isValidPlaintext = (value: unknown): value is string =>
  typeof value === "string" && value.length <= MAX_PLAINTEXT_LENGTH

/**
 * 注册安全存储 IPC（`xiaoye:secure-store:set/get/delete`）。
 *
 * 三个 handler 内部全同步（readFileSync/writeFileSync 无 await 间隙），
 * 主进程单线程下天然互斥，不会出现读改写交叠。safeStorage 在 Linux 缺
 * keyring 等场景 isEncryptionAvailable() 为 false：一律拒绝并回报
 * unavailable，由渲染层回退到本地混淆实现。
 */
export const registerSecureStoreIpc = () => {
  ipcMain.handle(
    "xiaoye:secure-store:set",
    (_event, storageKey: unknown, plaintext: unknown): SecureStoreResult => {
      if (!isValidStorageKey(storageKey) || !isValidPlaintext(plaintext)) {
        return { ok: false, reason: "invalid" }
      }
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, reason: "unavailable" }
      }
      try {
        const records = readRecords()
        records[storageKey] = safeStorage.encryptString(plaintext).toString("base64")
        writeRecords(records)
        return { ok: true }
      } catch (error) {
        console.warn(`[xiaoye] 安全存储写入失败（${storageKey}）：`, error)
        return { ok: false, reason: "io-error" }
      }
    },
  )

  ipcMain.handle("xiaoye:secure-store:get", (_event, storageKey: unknown): SecureStoreResult => {
    if (!isValidStorageKey(storageKey)) {
      return { ok: false, reason: "invalid" }
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "unavailable" }
    }
    try {
      const ciphertext = readRecords()[storageKey]
      if (ciphertext === undefined) {
        return { ok: true, value: null }
      }
      return { ok: true, value: safeStorage.decryptString(Buffer.from(ciphertext, "base64")) }
    } catch (error) {
      console.warn(`[xiaoye] 安全存储读取失败（${storageKey}）：`, error)
      return { ok: false, reason: "io-error" }
    }
  })

  ipcMain.handle("xiaoye:secure-store:delete", (_event, storageKey: unknown): SecureStoreResult => {
    if (!isValidStorageKey(storageKey)) {
      return { ok: false, reason: "invalid" }
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "unavailable" }
    }
    try {
      const records = readRecords()
      if (records[storageKey] === undefined) {
        return { ok: true }
      }
      delete records[storageKey]
      writeRecords(records)
      return { ok: true }
    } catch (error) {
      console.warn(`[xiaoye] 安全存储删除失败（${storageKey}）：`, error)
      return { ok: false, reason: "io-error" }
    }
  })
}

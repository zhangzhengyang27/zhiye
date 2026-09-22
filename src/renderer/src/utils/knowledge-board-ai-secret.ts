/**
 * 提供知识画板 AI 密钥的存储能力（G4 存储后端抽象）。
 *
 * - **桌面端**：`window.xiaoyeDesktop` 可用且主进程 safeStorage 加密可用时，明文
 *   apiKey 直接经 IPC 交给主进程，由 OS 级能力（macOS Keychain / Windows DPAPI /
 *   Linux libsecret）加密落 `userData/secure-store.json`，不再需要渲染层 AES-GCM
 *   这层本地混淆。localStorage 的配置记录只保存指向槽位的「句柄」（safe-store: 前缀）。
 * - **Web 端**：维持既有实现——密钥材料存 IndexedDB（xiaoye-secure-storage）、
 *   AES-GCM 密文存 localStorage；缺 IndexedDB / 非安全上下文时回退 XOR 兼容混淆。
 *   可用 `isLocalObfuscatedStorage()` 探测当前是否为本地混淆存储（配置 UI 提示用）。
 * - **存量迁移**：桌面端首读到 Web 格式旧密文时，用旧密钥材料解出明文 → 写入主进程
 *   → 把配置记录改写为句柄 → 配置记录里再无 Web 格式密文时删除旧密钥材料
 *   （一次性、静默；多份配置共享同一份密钥材料，因此以「全部迁移完」为删除时机）。
 *
 * 出口 `encryptKnowledgeBoardAiSecret` / `decryptKnowledgeBoardAiSecret` 签名与
 * 返回形状不变，`utils/knowledge-board-ai-config.ts` 等消费方零改动。
 */

import type { KnowledgeBoardAiEncryptedSecret } from "@/types/knowledge-board-ai"
import { readDesktopSecureStore, writeDesktopSecureStore } from "@/services/desktop-bridge"
import { isRecord } from "@/utils/knowledge-board-shared"

/** IndexedDB 中保存密钥材料时使用的数据库名。 */
const DATABASE_NAME = "xiaoye-secure-storage"
/** 安全存储数据库的结构版本号。 */
const DATABASE_VERSION = 1
/** IndexedDB 中保存密钥材料的对象仓库名称。 */
const STORE_NAME = "knowledge-board-ai-keys"
/** 不支持 IndexedDB 时回退到 localStorage 的存储键前缀。 */
const LOCAL_SECRET_KEY_PREFIX = "kb-board-ai-secret"

interface KnowledgeBoardAiKeyRecord {
  id: string
  keyMaterial?: string
  key?: CryptoKey
  updatedAt?: string
}

const hasWindow = () => typeof window !== "undefined"

const hasIndexedDbSupport = () => hasWindow() && typeof window.indexedDB !== "undefined"

const getStrongCryptoSupport = () => {
  if (!hasWindow()) {
    return null
  }

  if (!window.isSecureContext || !window.crypto?.subtle || !hasIndexedDbSupport()) {
    return null
  }

  return window.crypto
}

const getWeakCryptoSupport = () => {
  if (!hasWindow() || !window.crypto?.getRandomValues) {
    return null
  }

  return window.crypto
}

const getKeyId = (userId?: string | null) => {
  return `kb-board-ai:${userId || "anonymous"}`
}

const getLocalSecretStorageKey = (userId?: string | null) => {
  return `${LOCAL_SECRET_KEY_PREFIX}:${userId || "anonymous"}`
}

/** 返回当前浏览器环境无法安全存储密钥时的原因说明。 */
export const resolveKnowledgeBoardAiSecretSupportIssue = () => {
  if (!hasWindow()) {
    return "当前不在浏览器环境中。"
  }

  if (typeof window.localStorage === "undefined") {
    return "当前页面无法使用本地存储。"
  }

  if (typeof TextEncoder === "undefined" || typeof TextDecoder === "undefined") {
    return "当前浏览器缺少文本编解码能力。"
  }

  return ""
}

const openDatabase = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id",
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("打开安全存储失败"))
  })
}

const runStoreOperation = async <T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void
) => {
  const database = await openDatabase()

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)

    executor(
      store,
      value => resolve(value),
      error => reject(error)
    )

    transaction.oncomplete = () => {
      database.close()
    }

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("安全存储事务失败"))
      database.close()
    }

    transaction.onabort = () => {
      reject(transaction.error ?? new Error("安全存储事务中断"))
      database.close()
    }
  })
}

const arrayBufferToBase64 = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ""

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })

  return window.btoa(binary)
}

const base64ToUint8Array = (value: string) => {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

/** 取安全随机字节：密钥材料与 IV 都不允许弱熵降级，环境不支持时直接失败。 */
const getRandomBytes = (length: number) => {
  const cryptoSupport = getWeakCryptoSupport()

  if (!cryptoSupport) {
    throw new Error("当前环境缺少安全随机数能力，无法保护 API Key。")
  }

  const bytes = new Uint8Array(length)
  return cryptoSupport.getRandomValues(bytes)
}

const getStoredKeyRecord = async (userId?: string | null) => {
  if (!hasWindow()) {
    return null
  }

  if (!hasIndexedDbSupport()) {
    const keyMaterial = window.localStorage.getItem(getLocalSecretStorageKey(userId))

    return keyMaterial
      ? ({
          id: getKeyId(userId),
          keyMaterial,
        } satisfies KnowledgeBoardAiKeyRecord)
      : null
  }

  return runStoreOperation<KnowledgeBoardAiKeyRecord | null>("readonly", (store, resolve, reject) => {
    const request = store.get(getKeyId(userId))

    request.onsuccess = () => {
      const result = request.result as KnowledgeBoardAiKeyRecord | undefined
      resolve(result ?? null)
    }

    request.onerror = () => reject(request.error ?? new Error("读取加密密钥失败"))
  })
}

const persistKeyMaterial = async (userId: string | null | undefined, keyMaterial: string) => {
  if (!hasWindow()) {
    return
  }

  if (!hasIndexedDbSupport()) {
    window.localStorage.setItem(getLocalSecretStorageKey(userId), keyMaterial)
    return
  }

  return runStoreOperation<void>("readwrite", (store, resolve, reject) => {
    const request = store.put({
      id: getKeyId(userId),
      keyMaterial,
      updatedAt: new Date().toISOString(),
    })

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("保存加密密钥失败"))
  })
}

/** 删除 IndexedDB 中的旧密钥材料记录（存量迁移收尾用）。 */
const deleteStoredKeyRecord = async (userId?: string | null) => {
  if (!hasIndexedDbSupport()) {
    return
  }

  return runStoreOperation<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(getKeyId(userId))

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("删除旧加密密钥材料失败"))
  })
}

const importCryptoKey = async (keyMaterial: string) => {
  const cryptoSupport = getStrongCryptoSupport()

  if (!cryptoSupport) {
    return null
  }

  try {
    return await cryptoSupport.subtle.importKey("raw", base64ToUint8Array(keyMaterial), { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ])
  } catch {
    return null
  }
}

const createKeyMaterial = () => {
  return arrayBufferToBase64(getRandomBytes(32))
}

const resolveCryptoKeyForDecrypt = async (userId?: string | null) => {
  const cryptoSupport = getStrongCryptoSupport()

  if (!cryptoSupport) {
    return null
  }

  try {
    const storedRecord = await getStoredKeyRecord(userId)

    if (storedRecord?.keyMaterial) {
      return await importCryptoKey(storedRecord.keyMaterial)
    }

    if (storedRecord?.key) {
      return storedRecord.key
    }
  } catch {
    return null
  }

  return null
}

const resolveCryptoKeyForEncrypt = async (userId?: string | null) => {
  const cryptoSupport = getStrongCryptoSupport()

  if (!cryptoSupport) {
    return null
  }

  try {
    const storedRecord = await getStoredKeyRecord(userId)

    if (storedRecord?.keyMaterial) {
      return await importCryptoKey(storedRecord.keyMaterial)
    }

    const nextKeyMaterial = createKeyMaterial()

    await persistKeyMaterial(userId, nextKeyMaterial)
    return await importCryptoKey(nextKeyMaterial)
  } catch {
    return null
  }
}

const resolveFallbackKeyMaterial = async (userId?: string | null) => {
  const storedRecord = await getStoredKeyRecord(userId)

  if (storedRecord?.keyMaterial) {
    return storedRecord.keyMaterial
  }

  const nextKeyMaterial = createKeyMaterial()
  await persistKeyMaterial(userId, nextKeyMaterial)
  return nextKeyMaterial
}

const xorCipherBytes = (dataBytes: Uint8Array, keyBytes: Uint8Array, ivBytes: Uint8Array) => {
  const output = new Uint8Array(dataBytes.length)

  for (let index = 0; index < dataBytes.length; index += 1) {
    const keyByte = keyBytes[index % keyBytes.length] ?? 0
    const ivByte = ivBytes[index % ivBytes.length] ?? 0
    const saltByte = (index * 31 + ivBytes.length * 17) & 0xff
    output[index] = (dataBytes[index] ?? 0) ^ keyByte ^ ivByte ^ saltByte
  }

  return output
}

const encryptKnowledgeBoardAiSecretFallback = async (value: string, userId?: string | null) => {
  const keyMaterial = await resolveFallbackKeyMaterial(userId)
  const keyBytes = base64ToUint8Array(keyMaterial)
  const ivBytes = getRandomBytes(16)
  const dataBytes = new TextEncoder().encode(value)
  const ciphertext = xorCipherBytes(dataBytes, keyBytes, ivBytes)

  return {
    version: 2,
    algorithm: "XOR-LOCAL",
    iv: arrayBufferToBase64(ivBytes),
    ciphertext: arrayBufferToBase64(ciphertext),
  } satisfies KnowledgeBoardAiEncryptedSecret
}

const decryptKnowledgeBoardAiSecretFallback = async (
  value: KnowledgeBoardAiEncryptedSecret,
  userId?: string | null
) => {
  const storedRecord = await getStoredKeyRecord(userId)

  if (!storedRecord?.keyMaterial) {
    return ""
  }

  try {
    const keyBytes = base64ToUint8Array(storedRecord.keyMaterial)
    const ivBytes = base64ToUint8Array(value.iv)
    const dataBytes = base64ToUint8Array(value.ciphertext)
    const decryptedBytes = xorCipherBytes(dataBytes, keyBytes, ivBytes)
    return new TextDecoder().decode(decryptedBytes)
  } catch {
    return ""
  }
}

/**
 * Web 端本地实现：把 API Key 加密为可写入本地存储的密文。
 * 安全上下文优先 AES-GCM（密钥材料在 IndexedDB），否则退 XOR 兼容混淆。
 */
const encryptSecretLocally = async (value: string, userId?: string | null) => {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return null
  }

  const cryptoSupport = getStrongCryptoSupport()
  const key = await resolveCryptoKeyForEncrypt(userId)

  if (cryptoSupport && key) {
    try {
      const iv = cryptoSupport.getRandomValues(new Uint8Array(12))
      const encoded = new TextEncoder().encode(normalizedValue)
      const encrypted = await cryptoSupport.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        encoded
      )

      return {
        version: 1,
        algorithm: "AES-GCM",
        iv: arrayBufferToBase64(iv),
        ciphertext: arrayBufferToBase64(encrypted),
      } satisfies KnowledgeBoardAiEncryptedSecret
    } catch {
      return null
    }
  }

  return encryptKnowledgeBoardAiSecretFallback(normalizedValue, userId)
}

/** Web 端本地实现：把本地保存的密文还原为可用的 API Key。 */
const decryptSecretLocally = async (value: KnowledgeBoardAiEncryptedSecret, userId?: string | null) => {
  if (value.algorithm === "XOR-LOCAL" || value.version === 2) {
    return decryptKnowledgeBoardAiSecretFallback(value, userId)
  }

  const cryptoSupport = getStrongCryptoSupport()
  const key = await resolveCryptoKeyForDecrypt(userId)

  if (!cryptoSupport || !key) {
    return ""
  }

  try {
    const decrypted = await cryptoSupport.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToUint8Array(value.iv),
      },
      key,
      base64ToUint8Array(value.ciphertext)
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------------------
// 桌面端存储后端（G4）
// ---------------------------------------------------------------------------

/**
 * 桌面端槽位句柄在密文字段里的前缀。句柄伪装成 version 1 / AES-GCM 形状
 * （KnowledgeBoardAiEncryptedSecret 的枚举约束，且配置记录归一化会把
 * version/algorithm 收敛到已知值），真正的标记是 `iv === ""` + 本前缀——
 * 既有 Web 实现的 IV 恒为随机字节的 base64（非空），不会与之混淆。
 */
const DESKTOP_HANDLE_PREFIX = "safe-store:"

/** 明文摘要（槽位后缀）：优先 SHA-256；缺 subtle 的环境退 FNV-1a（仅作去重标识，不承担保密职责）。 */
const digestHex = async (value: string) => {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
    } catch {
      // 落到下方 FNV-1a 兜底
    }
  }

  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** 桌面端槽位存储键沿用 getKeyId 的 `kb-board-ai:{userId}` 命名语义，再拼明文摘要作槽位后缀。 */
const buildDesktopSecretStorageKey = async (userId: string | null | undefined, plaintext: string) => {
  const digest = await digestHex(plaintext)
  return `${getKeyId(userId)}:${digest}`
}

const createDesktopHandleSecret = (storageKey: string): KnowledgeBoardAiEncryptedSecret => ({
  version: 1,
  algorithm: "AES-GCM",
  iv: "",
  ciphertext: `${DESKTOP_HANDLE_PREFIX}${storageKey}`,
})

const isDesktopHandleSecret = (value: KnowledgeBoardAiEncryptedSecret) =>
  value.iv === "" && value.ciphertext.startsWith(DESKTOP_HANDLE_PREFIX)

const resolveDesktopHandleStorageKey = (value: KnowledgeBoardAiEncryptedSecret) =>
  value.ciphertext.slice(DESKTOP_HANDLE_PREFIX.length)

type KnowledgeBoardAiSecretBackendKind = "desktop-safe-store" | "local-obfuscated"

/** 可用性探测键：真实存储键都带 `kb-board-ai:` 前缀，不会与它撞名。 */
const DESKTOP_PROBE_STORAGE_KEY = "__xiaoye-secure-store-probe__"

let secretBackendKindPromise: Promise<KnowledgeBoardAiSecretBackendKind> | null = null

/**
 * 解析当前会话的密钥存储后端（结果缓存，每会话只探测一次）。
 *
 * 桌面端判定口径：`window.xiaoyeDesktop.secureStoreGet` 可用且主进程
 * safeStorage 加密可用。探测用一条无副作用的 get：主进程缺系统能力时回报
 * reason=unavailable，非 Electron 环境回报 no-desktop-bridge——两者都归入
 * 本地混淆实现（Web 端路径）。
 */
const resolveSecretBackendKind = () => {
  if (!secretBackendKindPromise) {
    secretBackendKindPromise = (async () => {
      const probe = await readDesktopSecureStore(DESKTOP_PROBE_STORAGE_KEY)
      return probe.reason === "no-desktop-bridge" || probe.reason === "unavailable"
        ? ("local-obfuscated" as const)
        : ("desktop-safe-store" as const)
    })().catch(() => "local-obfuscated" as const)
  }
  return secretBackendKindPromise
}

/**
 * 当前密钥是否落在本地混淆存储（Web 端，或桌面端系统级加密不可用时的回退）。
 * 画板 AI 配置 UI 据此选择存储方式提示文案。
 */
export const isLocalObfuscatedStorage = async () => {
  return (await resolveSecretBackendKind()) === "local-obfuscated"
}

/** 桌面端写入：明文 apiKey 交给主进程 safeStorage 加密落盘，返回指向槽位的句柄。 */
const encryptSecretViaDesktop = async (normalizedValue: string, userId?: string | null) => {
  const storageKey = await buildDesktopSecretStorageKey(userId, normalizedValue)
  const outcome = await writeDesktopSecureStore(storageKey, normalizedValue)

  // 主进程写失败（IO 异常等罕见场景）：回退 Web 本地实现，宁可降级也不丢保存能力
  if (!outcome.ok) {
    return encryptSecretLocally(normalizedValue, userId)
  }

  return createDesktopHandleSecret(storageKey)
}

/** 桌面端读取：按句柄里的存储键向主进程取回明文。 */
const decryptSecretViaDesktop = async (value: KnowledgeBoardAiEncryptedSecret) => {
  const storageKey = resolveDesktopHandleStorageKey(value)
  if (!storageKey) {
    return ""
  }

  const outcome = await readDesktopSecureStore(storageKey)
  return outcome.value ?? ""
}

/**
 * 配置记录的存储键前缀。与 utils/knowledge-board-ai-config.ts 的
 * getKnowledgeBoardAiStorageKey 同构——那个文件反向依赖本模块，import 会成环，
 * 字面量同源维护，改动须两边同步。
 */
const CONFIG_RECORD_STORAGE_KEY_PREFIX = "kb-board-ai-config:"

const getBoardAiConfigRecordStorageKey = (userId?: string | null) =>
  `${CONFIG_RECORD_STORAGE_KEY_PREFIX}${userId || "anonymous"}`

/** 迁移时要改写的 localStorage 配置记录最小形状（只关心 profiles[].encryptedApiKey）。 */
interface BoardAiConfigRecordShape {
  profiles?: unknown[]
}

/** 读取画板 AI 配置记录（localStorage）；缺失或损坏返回 null（迁移侧不动旧材料）。 */
const readBoardAiConfigRecord = (userId?: string | null): BoardAiConfigRecordShape | null => {
  if (!hasWindow() || typeof window.localStorage === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(getBoardAiConfigRecordStorageKey(userId))
    if (!raw) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.profiles)) {
      return null
    }

    return { profiles: parsed.profiles }
  } catch {
    return null
  }
}

/** 判定配置记录里的密文字段是否为「带 iv/ciphertext 字符串」的可识别形状。 */
const isRecordedSecret = (value: unknown): value is { iv: string; ciphertext: string } =>
  isRecord(value) && typeof value.iv === "string" && typeof value.ciphertext === "string"

const isDesktopHandleRecordSecret = (value: { iv: string; ciphertext: string }) =>
  value.iv === "" && value.ciphertext.startsWith(DESKTOP_HANDLE_PREFIX)

/** 密文指纹：iv + ciphertext 归一化字符串。同一密文在配置记录里的出现位置靠它定位。 */
const getSecretFingerprint = (value: { iv: string; ciphertext: string }) => `${value.iv}|${value.ciphertext}`

/** 配置记录里是否还有 Web 格式密文（未迁移项）。 */
const recordHasLegacySecret = (record: BoardAiConfigRecordShape) =>
  (record.profiles ?? []).some(profile => {
    const secret = isRecord(profile) ? profile.encryptedApiKey : undefined
    return isRecordedSecret(secret) && !isDesktopHandleRecordSecret(secret)
  })

/**
 * 把配置记录中指纹匹配的 Web 格式密文改写为桌面句柄并写回。
 * 只动匹配项，其余字段原样保留；记录缺失 / 未命中 / 写回失败都返回 false
 * （调用方据该值决定是否推进旧材料删除）。
 */
const replaceLegacySecretInConfigRecord = (
  userId: string | null | undefined,
  fingerprint: string,
  handle: KnowledgeBoardAiEncryptedSecret
) => {
  const record = readBoardAiConfigRecord(userId)
  if (!record) {
    return false
  }

  let replaced = false
  for (const profile of record.profiles ?? []) {
    if (!isRecord(profile)) {
      continue
    }
    const secret = profile.encryptedApiKey
    if (
      isRecordedSecret(secret) &&
      !isDesktopHandleRecordSecret(secret) &&
      getSecretFingerprint(secret) === fingerprint
    ) {
      profile.encryptedApiKey = handle
      replaced = true
    }
  }

  if (!replaced) {
    return false
  }

  try {
    window.localStorage.setItem(getBoardAiConfigRecordStorageKey(userId), JSON.stringify(record))
    return true
  } catch {
    return false
  }
}

/** 删除旧密钥材料：localStorage 兜底键 + IndexedDB 密钥记录（各自尽力而为）。 */
const deleteLegacySecretMaterial = async (userId?: string | null) => {
  if (hasWindow()) {
    try {
      window.localStorage.removeItem(getLocalSecretStorageKey(userId))
    } catch {
      // localStorage 不可用时忽略，IndexedDB 路径继续
    }
  }

  try {
    await deleteStoredKeyRecord(userId)
  } catch {
    // 删不掉就留着：配置记录已改写为句柄，旧材料只是无害残留
  }
}

/** 配置记录里已无 Web 格式密文时才删除旧密钥材料（多份配置可能共用同一份材料）。 */
const deleteLegacySecretMaterialWhenDrained = async (userId?: string | null) => {
  const record = readBoardAiConfigRecord(userId)
  if (record && recordHasLegacySecret(record)) {
    return
  }
  await deleteLegacySecretMaterial(userId)
}

/** 已做过「记录已排空」检查的用户（每会话一次，避免每次读取都扫配置记录）。 */
const drainedCheckDoneUsers = new Set<string>()

/**
 * 会话级兜底清理：配置记录已全是桌面句柄（例如上一会话直接保存覆写、没走
 * 逐条迁移）时，旧密钥材料在此补删。记录里仍有 Web 格式密文时不动（等逐条迁移）。
 */
const cleanupLegacySecretMaterialOnce = async (userId?: string | null) => {
  const userKey = userId || "anonymous"
  if (drainedCheckDoneUsers.has(userKey)) {
    return
  }
  drainedCheckDoneUsers.add(userKey)

  const record = readBoardAiConfigRecord(userId)
  if (record && !recordHasLegacySecret(record)) {
    await deleteLegacySecretMaterial(userId)
  }
}

/**
 * 一次性静默迁移（桌面端首读到 Web 格式旧密文时触发）：
 * 旧密钥材料尚未删除 → 解出明文 → 写入主进程槽位 → 配置记录里的该密文
 * 改写为桌面句柄 → 记录排空后删除旧材料。
 */
const migrateLegacySecretViaDesktop = async (value: KnowledgeBoardAiEncryptedSecret, userId?: string | null) => {
  const plaintext = await decryptSecretLocally(value, userId)
  const fingerprint = getSecretFingerprint(value)
  // 明文不可解时用指纹派生一个稳定槽位（句柄指向空槽，读回为空串，与现状一致）
  const storageKey = await buildDesktopSecretStorageKey(userId, plaintext || fingerprint)
  let rewritten = false

  if (plaintext) {
    const outcome = await writeDesktopSecureStore(storageKey, plaintext)
    // 写失败时保留旧格式不动：下次读取还会重试迁移，旧材料也不删
    if (outcome.ok) {
      rewritten = replaceLegacySecretInConfigRecord(userId, fingerprint, createDesktopHandleSecret(storageKey))
    }
  } else {
    // 旧密文已不可解（材料缺失或损坏）：改写为空句柄止住反复解密尝试，损失与现状一致
    rewritten = replaceLegacySecretInConfigRecord(userId, fingerprint, createDesktopHandleSecret(storageKey))
  }

  if (rewritten) {
    await deleteLegacySecretMaterialWhenDrained(userId)
  }

  return plaintext
}

/** 将 API Key 加密为可写入本地存储的密文。桌面端走主进程安全存储（返回槽位句柄），Web 端走本地混淆实现。 */
export const encryptKnowledgeBoardAiSecret = async (value: string, userId?: string | null) => {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return null
  }

  if ((await resolveSecretBackendKind()) === "desktop-safe-store") {
    return encryptSecretViaDesktop(normalizedValue, userId)
  }

  return encryptSecretLocally(normalizedValue, userId)
}

/** 将本地保存的密文还原为可用的 API Key。桌面端句柄向主进程取回明文，旧格式触发一次性迁移。 */
export const decryptKnowledgeBoardAiSecret = async (
  value: KnowledgeBoardAiEncryptedSecret | null | undefined,
  userId?: string | null
) => {
  if (!value) {
    return ""
  }

  if ((await resolveSecretBackendKind()) === "desktop-safe-store") {
    if (isDesktopHandleSecret(value)) {
      await cleanupLegacySecretMaterialOnce(userId)
      return decryptSecretViaDesktop(value)
    }
    return migrateLegacySecretViaDesktop(value, userId)
  }

  return decryptSecretLocally(value, userId)
}

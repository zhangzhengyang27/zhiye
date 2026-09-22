/**
 * 临时单测（跑完即删）：src/main/secure-store.ts 的逻辑自查。
 * mock electron 的 safeStorage / app / ipcMain，验证：
 * 1. set 后 secure-store.json 存在且内容为密文（不含明文），get 可还原；
 * 2. 写盘无 .tmp 残留（原子 rename 完成）；
 * 3. 文件损坏时按空表兜底，set 重建后 get 正常；
 * 4. delete 幂等移除；
 * 5. safeStorage 不可用时全部拒绝并回报 unavailable。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** mock 工厂里回填；测试体在工厂调用（首次 import 被测模块）之后才读它。 */
const state = {
  userDataDir: "",
  handlers: new Map(),
  encryptionAvailable: { value: true },
  encryptCalls: { value: 0 },
}

vi.mock("electron", async () => {
  const fs = await import("node:fs")
  const os = await import("node:os")
  const path = await import("node:path")

  state.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xiaoye-secure-store-test-"))

  return {
    app: {
      getPath: (name) => {
        expect(name).toBe("userData")
        return state.userDataDir
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => state.encryptionAvailable.value,
      encryptString: (plain) => {
        state.encryptCalls.value += 1
        return Buffer.from(`enc::${plain}`, "utf-8")
      },
      decryptString: (buffer) => {
        const text = buffer.toString("utf-8")
        if (!text.startsWith("enc::")) {
          throw new Error("解密失败（模拟密文损坏）")
        }
        return text.slice("enc::".length)
      },
    },
    ipcMain: {
      handle: (channel, handler) => {
        state.handlers.set(channel, handler)
      },
    },
  }
})

const { registerSecureStoreIpc } = await import("../main/secure-store.ts")

const getFilePath = () => `${state.userDataDir}/secure-store.json`
const call = (channel, ...args) => state.handlers.get(channel)({}, ...args)

beforeEach(() => {
  state.handlers.clear()
  state.encryptionAvailable.value = true
  state.encryptCalls.value = 0
  registerSecureStoreIpc()
})

afterEach(async () => {
  const fs = await import("node:fs")
  fs.rmSync(getFilePath(), { force: true })
})

describe("secure-store（主进程安全存储）", () => {
  it("注册 set/get/delete 三个通道", () => {
    expect([...state.handlers.keys()].sort()).toEqual([
      "xiaoye:secure-store:delete",
      "xiaoye:secure-store:get",
      "xiaoye:secure-store:set",
    ])
  })

  it("set 后密文落盘（不含明文），get 还原明文，且无 .tmp 残留", async () => {
    const fs = await import("node:fs")
    const setResult = call("xiaoye:secure-store:set", "kb-board-ai:user-1:abc", "sk-secret-key-123")
    expect(setResult).toEqual({ ok: true })

    // 原子写盘完成：目录里只应有 secure-store.json，没有任何 .tmp 半成品
    const dirEntries = fs.readdirSync(state.userDataDir)
    expect(dirEntries).toContain("secure-store.json")
    expect(dirEntries.some((name) => name.endsWith(".tmp"))).toBe(false)

    const onDisk = JSON.parse(fs.readFileSync(getFilePath(), "utf-8"))
    expect(Object.keys(onDisk)).toEqual(["kb-board-ai:user-1:abc"])
    expect(onDisk["kb-board-ai:user-1:abc"]).not.toContain("sk-secret-key-123")
    expect(onDisk["kb-board-ai:user-1:abc"]).toBe(Buffer.from("enc::sk-secret-key-123", "utf-8").toString("base64"))

    const getResult = call("xiaoye:secure-store:get", "kb-board-ai:user-1:abc")
    expect(getResult).toEqual({ ok: true, value: "sk-secret-key-123" })
  })

  it("get 不存在的键返回 ok + null", () => {
    expect(call("xiaoye:secure-store:get", "missing-key")).toEqual({ ok: true, value: null })
  })

  it("同一存储键重复 set 覆盖旧值", async () => {
    const fs = await import("node:fs")
    call("xiaoye:secure-store:set", "key-a", "first")
    const before = state.encryptCalls.value
    call("xiaoye:secure-store:set", "key-a", "second")
    expect(state.encryptCalls.value).toBe(before + 1)

    const onDisk = JSON.parse(fs.readFileSync(getFilePath(), "utf-8"))
    expect(Object.keys(onDisk)).toEqual(["key-a"])
    expect(call("xiaoye:secure-store:get", "key-a").value).toBe("second")
  })

  it("多键共存，delete 只移除目标键", async () => {
    call("xiaoye:secure-store:set", "key-a", "value-a")
    call("xiaoye:secure-store:set", "key-b", "value-b")
    expect(call("xiaoye:secure-store:get", "key-a").value).toBe("value-a")
    expect(call("xiaoye:secure-store:get", "key-b").value).toBe("value-b")

    call("xiaoye:secure-store:delete", "key-a")
    expect(call("xiaoye:secure-store:get", "key-a").value).toBeNull()
    expect(call("xiaoye:secure-store:get", "key-b").value).toBe("value-b")
  })

  it("delete 幂等：键不存在也返回 ok", () => {
    expect(call("xiaoye:secure-store:delete", "never-existed")).toEqual({ ok: true })
  })

  it("文件损坏时按空表兜底，set 重建后读写恢复正常", async () => {
    const fs = await import("node:fs")
    call("xiaoye:secure-store:set", "key-a", "value-a")
    fs.writeFileSync(getFilePath(), "{ 不是 JSON", "utf-8")

    expect(call("xiaoye:secure-store:get", "key-a")).toEqual({ ok: true, value: null })

    call("xiaoye:secure-store:set", "key-a", "rebuilt")
    expect(call("xiaoye:secure-store:get", "key-a").value).toBe("rebuilt")
  })

  it("结构不对（数组）同样视作空表", async () => {
    const fs = await import("node:fs")
    fs.writeFileSync(getFilePath(), '["array-not-object"]', "utf-8")
    expect(call("xiaoye:secure-store:get", "any")).toEqual({ ok: true, value: null })
  })

  it("非法入参（空键 / 非字符串 / 超长）返回 invalid", () => {
    expect(call("xiaoye:secure-store:set", "", "v").reason).toBe("invalid")
    expect(call("xiaoye:secure-store:set", 123, "v").reason).toBe("invalid")
    expect(call("xiaoye:secure-store:set", "k".repeat(257), "v").reason).toBe("invalid")
    expect(call("xiaoye:secure-store:set", "ok-key", 42).reason).toBe("invalid")
    expect(call("xiaoye:secure-store:get", "").reason).toBe("invalid")
    expect(call("xiaoye:secure-store:delete", 1).reason).toBe("invalid")
  })

  it("safeStorage 不可用时拒绝并回报 unavailable，且不写盘", async () => {
    const fs = await import("node:fs")
    state.encryptionAvailable.value = false
    expect(call("xiaoye:secure-store:set", "key-a", "value-a")).toEqual({ ok: false, reason: "unavailable" })
    expect(call("xiaoye:secure-store:get", "key-a")).toEqual({ ok: false, reason: "unavailable" })
    expect(call("xiaoye:secure-store:delete", "key-a")).toEqual({ ok: false, reason: "unavailable" })
    expect(fs.existsSync(getFilePath())).toBe(false)
  })
})

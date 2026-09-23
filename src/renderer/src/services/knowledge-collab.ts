import { resolveServerOriginUrl } from "./desktop-bridge"
import { getAccessToken } from "./auth-session"

/**
 * P-C1 协作感知 WS 客户端。
 * 打开文档后建立 /collab 长连接，提供：
 * - presence：房间在线成员全量（顶栏头像在线绿点）
 * - doc:changed：他人保存完成通知（触发即时远端冲突检测）
 * - sendDocUpdated：本人保存成功后广播
 */
export interface CollabPresenceMember {
  userId: string
  displayName: string
  avatar: string | null
  joinedAt: number
  lastSeen: number
}

export interface CollabDocActor {
  userId: string
  displayName: string
  avatar: string | null
}

export interface DocCollabChannel {
  /** 关闭连接并停止心跳/重连 */
  close(): void
  /** 广播本人已完成保存 */
  sendDocUpdated(): void
}

interface OpenCollabChannelOptions {
  token: string
  kbId: string
  docId: string
  onPresence(members: CollabPresenceMember[]): void
  onDocChanged(actor: CollabDocActor, at: number): void
}

const HEARTBEAT_INTERVAL_MS = 30_000
const BASE_RECONNECT_DELAY_MS = 3_000
const MAX_RECONNECT_DELAY_MS = 30_000
/** 服务端主动关停 / 鉴权失败：重试无意义，不再重连 */
const NO_RECONNECT_CODES = new Set([4000, 4001])

export const openDocCollabChannel = (options: OpenCollabChannelOptions): DocCollabChannel => {
  const origin = resolveServerOriginUrl().replace(/^http/, "ws")
  let socket: WebSocket | null = null
  let closed = false
  let heartbeatTimer: number | null = null
  let reconnectTimer: number | null = null
  let reconnectDelay = BASE_RECONNECT_DELAY_MS

  const clearTimers = () => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const send = (payload: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
    }
  }

  const join = () => {
    send({ type: "join", kbId: options.kbId, docId: options.docId })
  }

  const startHeartbeat = () => {
    if (heartbeatTimer !== null) return
    heartbeatTimer = window.setInterval(() => {
      send({ type: "heartbeat" })
    }, HEARTBEAT_INTERVAL_MS)
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, reconnectDelay)
    // 指数退避：3s → 6s → 12s → … 封顶 30s；连接成功（open）后重置
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }

  const handleMessage = (event: MessageEvent<string>) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(event.data as string) as Record<string, unknown>
    } catch {
      return
    }
    if (message.type === "presence" && Array.isArray(message.members)) {
      options.onPresence(message.members as CollabPresenceMember[])
      return
    }
    if (message.type === "doc:changed") {
      const actor = (message.actor ?? {}) as CollabDocActor
      const at = typeof message.at === "number" ? message.at : Date.now()
      options.onDocChanged(actor, at)
    }
  }

  const connect = async () => {
    if (closed) return
    // 每次建连都现取令牌：access token 只有 15 分钟，复用打开文档时拼进 URL 的
    // 旧 token 会被服务端以 4001 拒掉并进入永久 closed（presence 与 doc:changed
    // 静默失效，协作只剩轮询兜底）——开文档超 15 分钟后的第一次断线即永久掉线
    let token = options.token
    try {
      token = (await getAccessToken()) ?? options.token
    } catch {
      // 取令牌失败（网络抖动）沿用旧值，让 close/重连链路自然兜底
    }
    if (closed) return
    const url = `${origin}/collab?token=${encodeURIComponent(token)}`
    try {
      socket = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }
    socket.addEventListener("open", () => {
      reconnectDelay = BASE_RECONNECT_DELAY_MS
      join()
      startHeartbeat()
    })
    socket.addEventListener("message", handleMessage)
    socket.addEventListener("close", (event) => {
      socket = null
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      // 4000/4001：服务端关停或 token 失效，重试无意义
      if (NO_RECONNECT_CODES.has(event.code)) {
        closed = true
        return
      }
      scheduleReconnect()
    })
    socket.addEventListener("error", () => {
      // close 事件随后触发，统一走重连
    })
  }

  void connect()

  return {
    close() {
      closed = true
      clearTimers()
      if (socket) {
        socket.close()
        socket = null
      }
    },
    sendDocUpdated() {
      send({ type: "doc:updated" })
    },
  }
}

type LogLevel = "debug" | "info" | "warn" | "error"

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const isDev = import.meta.env.MODE === "development"

/** 解析初始日志档位：环境变量拼错时回落默认档并提示，避免静默吞掉全部日志。 */
const resolveInitialLogLevel = (): LogLevel => {
  const rawLevel = (import.meta.env.VITE_LOG_LEVEL as string | undefined)?.trim()

  if (!rawLevel) {
    return isDev ? "debug" : "error"
  }

  if ((Object.keys(LOG_LEVEL_PRIORITY) as LogLevel[]).includes(rawLevel as LogLevel)) {
    return rawLevel as LogLevel
  }

  console.warn(`[logger] 未知的 VITE_LOG_LEVEL「${rawLevel}」，已回落到默认档位`)
  return isDev ? "debug" : "error"
}

let currentMinLevel: LogLevel = resolveInitialLogLevel()

const shouldLog = (level: LogLevel): boolean => LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentMinLevel]

const formatMessage = (prefix: string, ...args: unknown[]): unknown[] => {
  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false })
  return [`[${timestamp}] [${prefix}]`, ...args]
}

export const logger = {
  setLevel(level: LogLevel) {
    currentMinLevel = level
  },

  debug(prefix: string, ...args: unknown[]) {
    if (!shouldLog("debug")) return
    console.debug(...formatMessage(prefix, ...args))
  },

  info(prefix: string, ...args: unknown[]) {
    if (!shouldLog("info")) return
    console.info(...formatMessage(prefix, ...args))
  },

  warn(prefix: string, ...args: unknown[]) {
    if (!shouldLog("warn")) return
    console.warn(...formatMessage(prefix, ...args))
  },

  error(prefix: string, ...args: unknown[]) {
    if (!shouldLog("error")) return
    console.error(...formatMessage(prefix, ...args))
  },
}

/**
 * 提供知识画板域共用的轻量值判定与克隆工具。
 *
 * 各 knowledge-board* 模块（文档规整、迁移、素材库、AI 配置）原先各自复制
 * 一份同构实现，收敛到这里作单一事实源；返回新对象、无副作用，可安全在
 * 任意渲染路径调用。
 */

/** 判定输入是否为非数组的普通对象（可安全按 record 逐键读取）。 */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** 深克隆可 JSON 序列化的值，失败（循环引用、BigInt 等）时返回兜底值。 */
export const cloneSerializable = <T>(value: T, fallback: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return fallback
  }
}

/** 把任意输入规整为有限数值，非法时返回兜底值。 */
export const toFiniteNumber = (value: unknown, fallback: number) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

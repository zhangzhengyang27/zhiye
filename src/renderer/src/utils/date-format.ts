/**
 * 日期/数字展示格式统一入口。
 *
 * 此前 formatShortDate / formatDateTime 在 12+ 个视图组件里各写一份，
 * 空值与无效日期的回落行为不一致（有的回落 "-"，有的回落原文），统一收敛到这里。
 *
 * 全部为手工拼接的确定性格式：toLocaleString 的分隔符与补零行为随运行环境
 * ICU 版本漂移（同一函数曾同时产出 09/15 与 09-15 两种分隔，以及月日不补零的
 * 2026/9/15），排查见 docs/UI精致度排查-2026-09-15.md P0-4。
 */

const pad = (value: number) => String(value).padStart(2, "0")

const toDate = (input?: string | number | Date | null) => {
  if (input === null || input === undefined || input === "") {
    return null
  }

  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 短时间：MM-DD HH:mm，用于列表行的右侧时间列（对齐语雀真机 09-07 07:28 口径） */
export const formatShortDate = (input?: string | number | Date | null) => {
  const date = toDate(input)

  if (!date) {
    return "-"
  }

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 日期：YYYY/MM/DD，用于「更新于」等只需日期的场景 */
export const formatDate = (input?: string | number | Date | null) => {
  const date = toDate(input)

  if (!date) {
    return "-"
  }

  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

/** 完整时间：YYYY/MM/DD HH:mm:ss，用于详情、版本、设置等需要精确时间的场景 */
export const formatDateTime = (input?: string | number | Date | null) => {
  const date = toDate(input)

  if (!date) {
    return "-"
  }

  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 钟点：HH:mm:ss，用于编辑页「已保存 16:19:05」这类只关心当天时刻的场景 */
export const formatClockTime = (input?: string | number | Date | null) => {
  const date = toDate(input)

  if (!date) {
    return "-"
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 千分位数字：用于文档数、字数等统计展示（Intl 仅在 ≥1000 时插入分隔符） */
export const formatNumber = (input?: number | null) => {
  if (input === null || input === undefined || !Number.isFinite(input)) {
    return "-"
  }

  return new Intl.NumberFormat("zh-CN").format(input)
}

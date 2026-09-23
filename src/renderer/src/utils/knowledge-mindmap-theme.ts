/**
 * 思维导图（simple-mind-map）暗色主题配置。
 *
 * 内核包不含 dark 内置主题（主题表缺 key 会静默回退 default 浅色档），
 * 这里按产品暗色档（底 #141414、品牌绿 #00b96b/#2ed790、墨绿暗面卡）
 * 以 themeConfig 差异字段覆盖 default——合并语义是 deepMerge，只传差异即可。
 * 字段清单来自内核 default 主题定义（root/second/node/generalization +
 * 背景与连线），缺省字段回落 default 浅色值，故与暗色相关的都要显式给出。
 */

/** 暗面卡底（层级略高于页面底 #141414，与暗色 token 的 surface 层级一致） */
const DARK_CARD = "#1f2521"
/** 暗面主文字（灰阶反转档，同 --kb-text 的暗色观感） */
const DARK_TEXT = "#d5dbd6"
/** 暗面弱文字（三级档） */
const DARK_TEXT_FAINT = "#9aa39d"
/** 品牌绿描边（半透明，压暗底不过艳） */
const DARK_BORDER = "rgba(0, 185, 107, 0.45)"
/** 暗底连线（中性灰绿，避免 default 的 #549688 在暗底过亮） */
const DARK_LINE = "rgb(86, 96, 90)"

export const MINDMAP_DARK_THEME_CONFIG = {
  backgroundColor: "#141414",
  lineColor: DARK_LINE,
  generalizationLineColor: DARK_LINE,
  associativeLineColor: "rgb(110, 120, 114)",
  root: {
    fillColor: "#00b96b",
    color: "#ffffff",
    borderColor: "transparent",
  },
  second: {
    fillColor: DARK_CARD,
    color: DARK_TEXT,
    borderColor: DARK_BORDER,
  },
  node: {
    fillColor: "transparent",
    color: DARK_TEXT_FAINT,
    borderColor: "transparent",
  },
  generalization: {
    fillColor: DARK_CARD,
    color: DARK_TEXT,
    borderColor: DARK_BORDER,
  },
} as const

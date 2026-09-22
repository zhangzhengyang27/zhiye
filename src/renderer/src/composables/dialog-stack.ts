/**
 * 对话框打开实例的模块级共享栈（T9 起 use-dialog-behavior 是唯一 push/remove 方）。
 *
 * 抽成独立模块是因为 <script setup> 不支持命名导出，而面板类组件
 * （版本历史、文档信息等）需要感知「是否有对话框压顶」来让位 Esc。
 */

const openDialogIds: symbol[] = []

/** 是否存在打开中的对话框：对话框压顶时，面板的 Esc 关闭应让位给对话框。 */
export const hasOpenDialog = () => openDialogIds.length > 0

/**
 * 是否为当前栈顶对话框（id 不在栈中时恒 false）：Esc / Tab 焦点陷阱只响应栈顶，
 * 否则叠放时会一次关掉全部对话框、两层互相抢焦点（AppDialog 的栈顶判定用）。
 */
export const isDialogTopMost = (id: symbol) =>
  openDialogIds.length > 0 && openDialogIds[openDialogIds.length - 1] === id

/** 当前打开中的对话框数量：useDialogBehavior 打开时据此计算叠放 z（Z_DIALOG + 打开前深度）。 */
export const openDialogCount = () => openDialogIds.length

export const pushDialogId = (id: symbol) => {
  openDialogIds.push(id)
}

export const removeDialogId = (id: symbol) => {
  const stackIndex = openDialogIds.lastIndexOf(id)

  if (stackIndex >= 0) {
    openDialogIds.splice(stackIndex, 1)
  }
}

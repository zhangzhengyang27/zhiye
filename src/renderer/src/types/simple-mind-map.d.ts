/** simple-mind-map 的最小类型声明（库本体无 d.ts，v1 仅按本仓用到的面收敛）。 */
declare module "simple-mind-map" {
  export interface MindMapStaticOptions {
    el: HTMLElement
    data: unknown
    readonly?: boolean
    layout?: string
    theme?: string
    initRootNodePosition?: [string, string]
    maxZoomRatio?: number
    minZoomRatio?: number
    scaleRatio?: number
    [key: string]: unknown
  }

  export interface MindMapInstance {
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void
    getData(): unknown
    setData(data: unknown): void
    execCommand(command: string, ...args: unknown[]): void
    destroy(): void
    renderer?: {
      setRootNodeCenter?: () => void
    }
  }

  export default class MindMap {
    constructor(options: MindMapStaticOptions)
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void
    getData(): unknown
    setData(data: unknown): void
    execCommand(command: string, ...args: unknown[]): void
    destroy(): void
    renderer?: {
      setRootNodeCenter?: () => void
    }
    static readonly version: string
  }
}

declare module "markdown-it" {
  export interface MarkdownItToken {
    info?: string
    content?: string
    attrSet?: (name: string, value: string) => void
  }

  export interface MarkdownItRendererContext {
    renderToken: (tokens: unknown[], idx: number, options: unknown) => string
    rules?: Record<string, MarkdownItRendererRule | undefined>
  }

  export interface MarkdownItRendererRule {
    (tokens: MarkdownItToken[], idx: number, options: unknown, env: unknown, self: MarkdownItRendererContext): string
  }

  export interface MarkdownItRenderer extends MarkdownItRendererContext {
    rules: Record<string, MarkdownItRendererRule | undefined> & {
      image?: MarkdownItRendererRule
      fence?: MarkdownItRendererRule
    }
  }

  export interface MarkdownItOptions {
    html?: boolean
    breaks?: boolean
    /** 围栏/行内代码高亮：返回完整 <pre> 片段时 markdown-it 不再二次包裹 */
    highlight?: (code: string, lang: string) => string
  }

  export interface MarkdownItInstance {
    renderer: MarkdownItRenderer
    render: (content: string) => string
  }

  export interface MarkdownItConstructor {
    new (options?: MarkdownItOptions): MarkdownItInstance
  }

  const MarkdownIt: MarkdownItConstructor

  export default MarkdownIt
}

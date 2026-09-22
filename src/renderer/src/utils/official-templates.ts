/**
 * 官方模板集（B3d 模板中心「推荐（官方）」tab 的前端内置 Markdown 集）。
 *
 * 消费方：components/knowledge/TemplateSelectDialog.vue——按 category 分组展示、
 * 选中后实时预览，「使用此模板」即以 text/markdown scheme 新建文档。
 * 官方模板为前端内置数据（无 updatedAt 语义，不参与 create-from-template 接口）。
 */

/** 描述一个官方内置模板条目。 */
export interface OfficialTemplate {
  /** 唯一标识（对话框用作模板 key） */
  id: string
  /** 模板名（同时作为新文档标题） */
  title: string
  /** 分类名（模板列表按它分组展示） */
  category: string
  /** 一句话用途说明（列表项次行） */
  description: string
  /** Markdown 正文 */
  content: string
}

export const OFFICIAL_TEMPLATES: OfficialTemplate[] = [
  {
    id: "meeting-notes",
    title: "会议记录",
    category: "协作",
    description: "标准化议题、结论与待办，会后跟进不遗漏",
    content: `# 会议记录

## 基本信息

- **时间**：
- **参会人**：
- **记录人**：

## 议题

1.

## 讨论要点

-

## 结论

-

## 待办事项

| 事项 | 负责人 | 截止时间 |
| --- | --- | --- |
|  |  |  |
`,
  },
  {
    id: "project-weekly",
    title: "项目周报",
    category: "协作",
    description: "本周进展、风险与下周计划一页说清",
    content: `# 项目周报

## 本周进展

- **已完成**：
- **进行中**：

## 风险与依赖

-

## 下周计划

-

## 需要支持

-
`,
  },
  {
    id: "brainstorm",
    title: "头脑风暴",
    category: "协作",
    description: "先发散再收敛，点子随手记不丢",
    content: `# 头脑风暴

## 主题

## 点子收集

1.
2.
3.

## 归类

-

## 收敛结论

-
`,
  },
  {
    id: "prd",
    title: "产品需求文档",
    category: "产品",
    description: "背景、目标、方案与验收标准齐备",
    content: `# 产品需求文档（PRD）

## 一、背景与问题

## 二、目标与收益

- **目标**：
- **衡量指标**：

## 三、需求方案

### 功能列表

| 功能 | 优先级 | 说明 |
| --- | --- | --- |
|  | P0 |  |

### 流程说明

## 四、非功能性要求

## 五、验收标准

-
`,
  },
  {
    id: "tech-design",
    title: "技术方案设计",
    category: "研发",
    description: "方案取舍、接口与风险评审留档",
    content: `# 技术方案设计

## 需求背景

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
|  |  |  |  |

## 详细设计

### 架构与模块

### 接口定义

## 上线与回滚计划

## 风险
`,
  },
  {
    id: "retrospective",
    title: "项目复盘",
    category: "研发",
    description: "目标回顾、得失分析到行动项落地",
    content: `# 项目复盘

## 目标回顾

## 亮点

-

## 不足

-

## 根因分析

## 行动项

| 行动 | 负责人 | 时间 |
| --- | --- | --- |
|  |  |  |
`,
  },
]

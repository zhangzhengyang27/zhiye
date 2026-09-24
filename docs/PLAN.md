# 当前专项索引

> **最高优先级依据**：[docs/产品定位与路线决策-2026-09-11.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/产品定位与路线决策-2026-09-11.md)、[docs/平台与运营形态决策-2026-09-24.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/平台与运营形态决策-2026-09-24.md)
> 定位：复刻语雀底座 + AI 差异化的真实产品。历史文档与本索引冲突时，以决策记录为准。

- 进行中专项：`0.1.0 私测交付（2026-09-24 决策定档）`
  - 依据：[docs/平台与运营形态决策-2026-09-24.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/平台与运营形态决策-2026-09-24.md)（平台 = 仅 macOS、后端 = 纯自托管）+ [docs/产品与项目管理评审-2026-09-24.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/产品与项目管理评审-2026-09-24.md) 行动清单 #3
  - 范围：Apple 签名公证 → 自动更新通道 → 桌面端后端地址可配置 + 首次启动引导 → 干净机器安装验证；代码块 CodeMirror 内核缺陷解决或明确降级并行
  - 外部依赖：Apple Developer 账号（$99/年）
- 进行中专项：`编辑器刚需追平（2026-09-11 决策主攻）`
  - 依据：[docs/产品定位与路线决策-2026-09-11.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/产品定位与路线决策-2026-09-11.md) 决策 2
  - 范围：表格/代码块工具栏入口（内核 `/` 菜单已支持，缺工具栏按钮）→ 文档导出（Markdown/HTML）→ 编辑器内搜索替换（需先评估内核能力，可能动 yuque-editor 内核）；版本文本 diff 随导出顺带评估
  - 并行质量基建：视觉回归基线 → 核心逻辑单测 → 性能预算（决策 4）
  - 明确延后：P-C2（Yjs 文档级合并）移出当前队列，保留在需求池
- 进行中专项：`知识库与语雀差距补齐（P-A 桌面端原生层）`
  - 依据：[docs/知识库与语雀差距深度调研-2026-09-06.html](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/知识库与语雀差距深度调研-2026-09-06.html)（飞书版 doc_id `EBn1diCEaoIs7Zx7fb6cJQWc6Ae`）
  - 进度（2026-09-06）：P-A 第一批完成并实测 —— 托盘菜单（打开知识库/开始页/最近访问/退出）、文档右键「在新窗口打开」真实现（IPC 新 BrowserWindow 加载 SPA doc 路由）、系统级通知（轮询未读数增量 → preload 桥接 → 主进程 Notification）。实测证据：AX 树托盘 4 菜单项；新窗口 window_changes 确认加载 `/knowledge/:kbId/doc/:docId`；插入未读通知后 dev 日志出现 `系统通知 ->` 全链路。typecheck/lint/build 通过，commit `bb28449`
  - 进度（2026-09-19）：P-A 第二批——**偏好设置页从零补齐**（此前全仓无 App 级设置入口，暗色模式只有机制没有入口）。9 分组一比一（规格与偏差登记在 `语雀功能需求梳理-2026-09-04.md` 2.9）+ 原生菜单/托盘 ⌘, + 主进程开机自启/代理/状态栏图标/globalShortcut 能力层。验证 `pnpm verify:settings` 30 断言通过；桌面端真机走查待做
- 进行中专项：`知识库与语雀差距补齐（P-B 协作体验收敛）`
  - 依据：[docs/知识库与语雀差距深度调研-2026-09-06.html](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/知识库与语雀差距深度调研-2026-09-06.html)（飞书版 doc_id `EBn1diCEaoIs7Zx7fb6cJQWc6Ae`）
  - 进度（2026-09-06）：**P-B 第一批完成** ——
    - ① 评论锚点批注：主体实现已存在（Lake CommentManager + Comment.position 持久化 + 画布高亮 + 侧栏回复/解决），本轮 GUI 真机验证全链路通过（划词浮动条「评论」→ 撰写 → 发布 → 黄色锚点高亮渲染 → 刷新后 position 恢复重绘 → 标记解决后高亮变色、状态回写）。提交 `eec0548`（注释修正）
    - ② 编辑器内 @ 提及：新增 `MentionMemberPicker.vue` 成员浮层 + 编辑页顶栏「@」按钮 → beforeinput 合成事件插入 `@名字`（Lake 输入通道；insertText/execCommand 在 markdown 方案下不生效）→ 自动保存 → 后端 create/update 时 diff 解析正文 @提及（排除自己、同名去重）→ 生成 mention 通知「XX 在文档《YY》中提到了你」，通知中心点击经 documentId 跳转文档。GUI + API 双验证通过。提交：前端 `071e1a4`、后端 `c808058`（含验证脚本 `scripts/verify-pb-mention.mjs`）
    - ③ 文档 AI 写作面板：编辑页顶栏「✨ AI 助手」按钮 → 右侧 AI 侧栏面板（快捷动作：总结全文/生成大纲/续写/翻译英文/润色 + 自定义指令 + 复制/插入文末）。后端新增 `POST /knowledge/documents/:id/ai/write`（复用画板 AI 的 DeepSeek 通道与限流，读正文按动作构造提示词、文本输出；未配置密钥返回 503 引导文案）。API 三断言通过（503 引导 / 502 脱敏 / 400 校验）+ GUI 实测。**已配 DeepSeek API Key 完成真实生成链路验证**（API 层 summarize/outline/custom 全通 + GUI 端到端：面板生成→展示→插入文末）；插入文末初版用 Lake appendContent 实为光标处插入，已修正为文档模型层 getContent+拼接+setContent（与光标无关），GUI+DB 双确认追加到文末。提交：前端 `25ab9f4`（面板）+ `3632e78`（插入文末修正）、后端 `41b17e1`（含验证脚本 `scripts/verify-pb-doc-ai.mjs` / `verify-pb-doc-ai-live.mjs`）
    - ④ 编辑页顶栏协作者头像：顶栏头像堆叠**常显**（此前 `hidden xl:flex` 在语雀实测窗口 1247px 下会隐藏）并**排除自己**（语雀心智：自己在右上角全局头像体现）→ 点击打开协作者弹层（只读展示知识库成员：头像/姓名/邮箱/角色徽标 创建者·管理员·可编辑·只读 + （我）标记；邀请/权限编辑属文档级协作者管理，另项跟进）。GUI 实测通过（顶栏「查看协作者（1 人）」按钮渲染 → 弹层 2 成员列表与角色徽标正确）。提交 `c51df9a`
  - **P-B 四项全部完成** → **P-C1 协作感知已完成**（2026-09-06，前端 cd5f1b5 + 后端 feat(collaboration)）：后端 /collab WS 网关（JWT 鉴权 + 房间 presence + 引用计数 + 保存广播），前端顶栏头像在线绿点 + 他人保存即时提示/自动拉取；验证 7/7 + GUI 双账号实测。P-C2（Yjs 文档级合并，1–2 周）经 2026-09-11 决策**延后**，主攻切换为「编辑器刚需追平」；P-C3 光标级实时观望。评估报告：`docs/P-C实时协作立项评估-2026-09-06.html`
- 进行中专项：`语雀桌面端一比一复原`
  - 文档路径：[docs/语雀桌面端一比一复原实施计划.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/语雀桌面端一比一复原实施计划.md)
  - 当前阶段：**已实施完成**（2026-09-05）：P0–P5 全部落地（侧栏 250/画板入口、目录列双 tab、KB 首页点线列表、开始页 3+1 卡+筛选、树交互收口、编辑页顶栏重排+16px、⌘J 命令面板、设置弹窗化、KnowledgeHomeReplica 退役），typecheck/build 通过，浏览器逐屏对照审查通过；偏差清单见计划文档第 0 节
- 已完成专项：`AI 画板生成实施计划`
  - 文档路径：[docs/AI画板生成实施计划.md](/Users/xiaoye/Desktop/AI/知识库/zhiye/docs/AI画板生成实施计划.md)
  - 结题状态：2026-09-05 完成完整 UI 冒烟验收（真实登录 + DeepSeek 真实生成：AI 面板、模型配置持久化、白板替换、流程图追加、保存恢复、分享页只读无 AI 入口均通过）。**两项遗留已于 2026-09-24 关账**：① 素材库「画布拖拽添加素材」UI 自动化复验通过（`pnpm` 脚本 `verify-board-library-dnd.mjs`：播种素材 → 素材库抽屉 → 合成 DnD 拖入 → 自动保存持久化 → 重载无错误；注意 Excalidraw 插入素材会重新生成元素 id，Playwright dragTo 驱不动 HTML5 DnD 须用页面内合成 DragEvent）；② board-ai/doc-ai 无密钥错误码经活体验证均返回 503 引导（`verify-board-ai-error-codes.mjs`），「500」遗留记录已过时（期间某批次已修复）

# 完整知识库前端接回与需求文档落地计划

## Summary

目标是把当前仓库从“轻量演示壳”切回“完整知识库前端”，并同步在 `docs` 目录补齐产品需求文档和实施计划文档。  
已确认采用两条主线并行推进：

- 代码侧：以现有 `src/views/knowledge`、`src/components/knowledge`、`src/services/knowledge-*`、`src/services/document-share.ts`、`src/services/comments.ts` 为主，重新接回真实知识库主流程，不再让本地 demo store 作为 `/knowledge` 主入口。
- 文档侧：新增一份 PRD 和一份实施计划，明确范围、优先级、页面清单、接口依赖、验收标准和分期路线。

## Key Changes

### 1. 主入口切回完整知识库路由

- 用现有完整路由结构替换当前简化版知识库入口，保留 `/test` 作为编辑器实验页。
- 路由主干固定为：
  - `/knowledge`：知识库列表页
  - `/knowledge/recent`：最近访问
  - `/knowledge/favorites`：收藏
  - `/knowledge/trash`：回收站
  - `/knowledge/:kbId`：知识库工作台壳
  - `/knowledge/:kbId/search`：知识库内搜索
  - `/knowledge/:kbId/doc/:docId`：文档编辑页
  - `/knowledge/:kbId/settings`：知识库设置
  - `/share/:shareKey`：公共分享页
  - `/auth/login`、`/account`：认证与账号页
- 路由守卫统一依赖现有 `useAuthStore`，`requiresAuth` 页面未登录时跳转登录页并带回跳参数。

### 2. 数据流从 demo store 切换为真实服务层

- `/knowledge` 主流程不再依赖当前本地 `src/legacy/demo-knowledge/stores/document.ts` 的 demo 数据。
- 知识库前端统一通过现有服务层请求数据：
  - 知识库：`knowledge-base.ts`
  - 文档树、搜索、回收站、版本、模板：`knowledge-documents.ts`
  - 收藏：`knowledge-favorites.ts`
  - 权限：`knowledge-permissions.ts`
  - 分享：`document-share.ts`
  - 评论：`comments.ts`
  - 资源上传：`knowledge-oss.ts`
- `src/legacy/demo-knowledge/stores/document.ts` 改为两种处理之一并在实现时固定：
  - 推荐：降级为本地 demo/测试专用 store，仅供 `/test` 或未来 Story/demo 使用，不再参与正式知识库页面。
- 不改现有接口协议，不新增 mock 协议，不新造本地兼容层。

### 3. 现有完整页面按模块重新接回并补齐闭环

- 知识库列表页接回：创建、重命名、删除、筛选、进入知识库、跳转设置。
- 工作台页接回：文档树、展开状态记忆、拖拽排序、右键菜单、新建文档/目录、模板创建、移动、删除。
- 编辑页接回：保存、自动保存、图片上传、文内搜索、分享、评论、版本对比、收藏、模板切换、导出、删除。
- 搜索页接回：知识库内搜索、范围切换、高亮、筛选、打开文档。
- 回收站接回：文档恢复、批量恢复、彻底删除、清空回收站、知识库回收展示。
- 收藏页、最近页、概览页、设置页接回。
- 公共分享页接回并修正权限语义：
  - `view` 只读展示
  - `edit` 才允许编辑并保存
- 设置页必须保留并验证：
  - 成员列表
  - 添加成员
  - 修改知识库可见性
  - 修改成员角色
  - 移除成员
- 评论能力在文档和文案中明确定位为“侧边讨论”，不声称为“文内批注”。

### 4. 处理当前轻量壳与新旧组件冲突

- 当前新增的轻量知识库壳组件不再作为正式 `/knowledge` 入口，包括：
  - 当前简化的 `KnowledgeShellView`
  - 当前简化的 `KnowledgeDocView`
  - 当前本地 `KnowledgeShareDialog` / `DiscussionPanel`
- 实现时遵循：
  - 如果与现有完整页面重名或语义冲突，正式入口只保留完整知识库实现。
  - 轻量演示组件若仍有测试价值，迁到明确的 demo/test 路径；否则从主流程移除。
- 组件命名冲突必须清理，避免 `ShareDialog` 一类自动导入歧义。

### 5. 文档落地到 docs

新增两份文档，文件名固定如下：

- `docs/知识库前端PRD.md`
- `docs/知识库前端实施计划.md`

`知识库前端PRD.md` 必须包含：

- 项目目标与背景
- 当前基线说明
- 用户角色与权限模型
- 页面与路由清单
- 核心功能需求
  - 知识库管理
  - 工作台与文档树
  - 文档编辑
  - 搜索
  - 收藏/最近
  - 回收站
  - 分享
  - 评论/讨论
  - 权限与成员管理
  - 账号与登录依赖
- 非目标
  - 协作编辑/Yjs 本期不接
  - 文内批注本期不做
  - 全局搜索列入后续，移动端适配不纳入本项目范围
- 验收标准
- 后续需求池

`知识库前端实施计划.md` 必须包含：

- 现状与缺口分析
- 模块接回顺序
- 代码改造点
  - 路由
  - 入口
  - store 职责调整
  - 页面接回
  - 冲突组件处理
- 接口依赖清单
- 风险与兼容性说明
- 分期安排
  - P0：主流程接回与闭环
  - P1：搜索与体验优化
  - P2：协作与扩展块能力
- 测试清单

## Public Interfaces / Types

- 保持现有服务接口形状不变，不新增自定义前端协议。
- 正式路由名称以现有完整知识库页为准，避免继续沿用简化壳中的临时命名。
- `src/legacy/demo-knowledge/stores/document.ts` 不再作为正式知识库主数据源。
- 文档中明确权限模型：
  - `owner/admin/editor/reader`
  - `view/edit` 分享权限
  - “侧边讨论”与“文内评论”严格区分

## Test Plan

- 构建验证：`pnpm build` 必须通过。
- 路由验证：
  - 未登录访问受保护页面跳登录
  - 登录后可进入知识库列表、工作台、设置、搜索、回收站、收藏、最近
- 知识库主流程验证：
  - 创建知识库、编辑知识库、删除知识库、进入知识库
  - 文档树创建/重命名/移动/删除/拖拽排序
  - 文档保存、自动保存、刷新后内容保持一致
- 分享验证：
  - 创建 `view` 分享后公共页只读
  - 创建 `edit` 分享后公共页可编辑并可保存
- 权限验证：
  - `reader` 无编辑入口
  - `editor` 可编辑但不可管理成员
  - `admin` 可管理成员但不可改所有者专属操作
  - `owner` 可改可见性与全部成员配置
- 搜索/回收站/收藏/最近页验证：
  - 页面可加载
  - 打开文档跳转正确
  - 批量操作和恢复链路可用
- 文档校验：
  - `docs/知识库前端PRD.md` 与 `docs/知识库前端实施计划.md` 存在
  - 文档内容与实际实现范围一致，不把未做能力写成已完成

## Assumptions

- 后端接口按现有 `src/services/*` 约定可用，环境变量继续使用当前 `kb-drive-http.ts` 的解析规则。
- 本轮目标是“接回完整知识库前端并写清需求/实施文档”，不是继续维护本地 demo 作为正式主流程。
- 协作编辑、Yjs、文内批注、跨知识库全局搜索继续列为后续阶段，不在本轮主交付范围内；移动端适配不纳入本项目目标。

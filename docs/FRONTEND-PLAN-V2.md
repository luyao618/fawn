# Fawn — 前端实施计划

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-04-29 |
| 状态 | draft |
| 依赖 | PRD-V2.md (v2.0), FRONTEND-DESIGN-V2.md (v2.0), DESIGN.md, BACKEND-DESIGN-V2.md (v2.0) |

---

## 概述

本文档是 Fawn 前端的分阶段实施计划，采用 mock-first 策略，前端独立于后端开发。共分 6 个 Phase，每个 Phase 包含若干 Task，Task 之间有明确的依赖关系。

**技术栈：** Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS + Zustand + Recharts + Lucide React + date-fns + Vitest

**开发策略：** 通过 `NEXT_PUBLIC_USE_MOCK=true` 环境变量使用内置 mock API 层，全部功能可在无后端的情况下独立运行和验证。

**关于 UI 基础组件：** `components/ui/`（Button、Card、Avatar）是简单的 Tailwind 样式封装，不设独立 Task，在首次被引用时按需创建。样式参照 DESIGN.md 第 4.4（按钮）、4.5（卡片）、4.6（头像）章。

---

## Phase 0: 项目基础

**目标：** 完成项目脚手架、设计系统配置、核心类型定义、工具函数、mock 数据和 API 客户端，为后续所有 Phase 提供基础设施。

**交付物：** 可运行的 Next.js 项目，Tailwind 主题与 DESIGN.md 对齐，所有 TypeScript 类型就绪，mock API 层可正常调用。

**Task 数量：** 6

---

### P0-T1: 项目初始化

**做什么：** 使用 `create-next-app` 创建 Next.js 15 项目（App Router, TypeScript, Tailwind CSS），安装全部依赖（zustand, recharts, lucide-react, date-fns, clsx, tailwind-merge, vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom），配置 tsconfig（strict mode）、vitest.config.ts（environment: 'jsdom'）、vitest.setup.ts（import '@testing-library/jest-dom'）。

**涉及文件：**
- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/next.config.ts`
- `frontend/vitest.config.ts`
- `frontend/vitest.setup.ts`

**依赖：** 无

**验收标准：**
- `npm run dev` 启动成功，浏览器访问 localhost:3000 显示默认页面
- `npx tsc --noEmit` 无类型错误
- `npm run test` 能执行（即使无测试用例）

---

### P0-T2: Tailwind 主题配置 + CSS 自定义属性

**做什么：** 按 DESIGN.md 的 design tokens 配置 Tailwind 主题扩展（colors、borderRadius、fontFamily、boxShadow、maxWidth），编写 globals.css 中的 CSS 自定义属性（颜色、圆角、safe-area、过渡动画变量）。参照前端 Spec 第 10-11 章。

**涉及文件：**
- `frontend/tailwind.config.ts`
- `frontend/src/app/globals.css`

**依赖：** P0-T1

**验收标准：**
- Tailwind 配置包含 DESIGN.md 中所有颜色 token（fawn-amber、sage-green、soft-charcoal 等全部 16 个颜色）
- globals.css 包含全部 CSS 自定义属性（--color-canvas、--color-brand、--safe-area-bottom 等）
- 在页面中使用 `bg-fawn-amber` 等自定义类名可正常渲染对应颜色

---

### P0-T3: TypeScript 类型定义

**做什么：** 按前端 Spec 第 3 章定义所有共享类型，包括 Auth（User, UserRole, UserPermissions, LoginRequest, LoginResponse）、Baby、Chat（Message, Conversation, SSEEvent）、Tracker（GrowthRecord, FeedingRecord, SleepRecord, HealthRecord, TrackerType）、Dashboard（DashboardSummary, GrowthChartData, WHOReferenceLines, FeedingStatsData, SleepStatsData）、Album（Photo, PhotoTag）、Profile（ProfileItem）、Pagination（PaginatedResponse）。

**涉及文件：**
- `frontend/src/lib/types.ts`

**依赖：** P0-T1

**验收标准：**
- 所有前端 Spec 第 3 章列出的类型均已定义
- 类型字段名和类型与 Spec 完全一致
- `npx tsc --noEmit` 无错误

---

### P0-T4: 工具函数

**做什么：** 实现 `cn()` 函数（clsx + tailwind-merge）、日期格式化工具（使用 date-fns 中文 locale）、月龄计算工具。

**涉及文件：**
- `frontend/src/lib/utils.ts`

**依赖：** P0-T1

**验收标准：**
- `cn('px-2', 'px-4')` 返回合并后的类名字符串
- 日期格式化支持中文显示（如 "4月28日 14:30"）
- 月龄计算给定出生日期可返回 "1个月28天" 格式的文字

---

### P0-T5: Mock 数据

**做什么：** 按后端 API 响应格式编写中文 mock 数据，覆盖所有数据类型：用户列表（admin/parent/family 各一）、宝宝档案、对话列表及消息（包含 text/image/data_card/safety_alert 四种 message_type）、Tracker 四类记录（growth/feeding/sleep/health）、Dashboard 汇总和统计数据（含 WHO 参考线数据）、相册照片及标签、画像条目。参照后端 Spec 第 4 章的 API 响应示例。

**此外，需要包含 PRD 核心验收场景的固定 mock SSE 事件序列：**
- **记录+反馈场景：** 用户发送"宝宝今天体重4.2kg，是不是偏轻了？" → SSE 流包含 tool_call(record_growth) → tool_result(体重+WHO百分位) → token(RAG 知识回答+来源标注) → done(data_card)
- **纠错场景：** 用户发送"不对，是4.6kg" → SSE 流包含 tool_call(update_tracker_record) → tool_result(更新后数据) → token(确认纠错) → done
- **追问补全场景：** 用户发送"宝宝吃了奶" → SSE 流直接返回 token(追问"请问是母乳还是配方奶？大约喝了多少ml？") → done（不调用 tool）
- **多角色场景：** family 角色用户发送"宝宝今天吃了多少" → SSE 流包含 tool_call(query_feeding_data) → tool_result(喂养统计) → token(回答) → done
- **安全提醒场景：** 用户发送"宝宝发烧39度怎么办" → SSE 流返回 token(就医建议+以医生意见为准) → done(safety_alert)

**涉及文件：**
- `frontend/src/lib/mock-data.ts`

**依赖：** P0-T3

**验收标准：**
- mock 数据覆盖全部 TypeScript 类型（types.ts 中每个 interface 至少有对应的 mock 数据）
- 包含至少 3 个用户（admin、parent、family 角色各一）
- 对话消息包含四种 message_type 的示例
- WHO 参考线数据包含 weight/height/head 三个指标的 p3/p15/p50/p85/p97 曲线数据（0-6 月）
- 包含上述 5 个 PRD 核心验收场景的固定 mock SSE 事件序列，可通过特定触发词匹配
- 所有文本内容使用中文

---

### P0-T6: API 客户端（mock 实现）

**做什么：** 按前端 Spec 第 5 章实现 ApiClient 类，包含所有方法签名（Auth、Chat、Tracker、Dashboard、Album、Profile、Baby、Users）。通过 `NEXT_PUBLIC_USE_MOCK` 环境变量切换 mock/真实实现。Mock 实现从 mock-data.ts 返回数据，模拟网络延迟（200-500ms）。实现 ApiError 类和 401 自动 logout 逻辑。同时实现 SSE 消费工具函数 `consumeSSE()`（前端 Spec 第 6 章）。

**字段命名策略决策：** 本版 TypeScript 类型定义和 API 层统一使用 snake_case（与后端一致），不做 camelCase 自动转换。原因：单人项目减少转换层复杂度，前后端对照更直接。如未来需要切换为 camelCase，在 API 客户端 `request()` 方法中补充递归转换即可。

**涉及文件：**
- `frontend/src/lib/api.ts`
- `frontend/src/lib/sse.ts`

**依赖：** P0-T3, P0-T5

**验收标准：**
- ApiClient 包含前端 Spec 5.1 中列出的所有方法
- Mock 模式下调用 `api.login({ username: 'mama', password: '...' })` 返回正确的 LoginResponse
- Mock 模式下调用 `api.getDashboardSummary()` 返回符合 DashboardSummary 类型的数据
- `consumeSSE()` 函数能正确解析模拟的 SSE 事件流（token、tool_call、tool_result、done、error、session_expired）
- **Mock 模式下 `api.sendMessage()` 根据用户输入文本和角色匹配 P0-T5 定义的 5 个触发场景，返回对应的 SSE 事件序列（如输入含"体重"触发记录+反馈场景，输入含"不对"/"不是"触发纠错场景，family 角色输入查询触发多角色场景等）；不匹配时返回通用对话 SSE 流**
- `NEXT_PUBLIC_USE_MOCK=true` 时导出 mock 实现，`false` 时导出真实 HTTP 实现

---

## Phase 1: Auth + Layout Shell

**目标：** 完成认证流程和应用外壳，用户可登录并看到 TopBar + TabBar 的基础布局框架。

**交付物：** 登录页可用，登录后进入带 TopBar + TabBar 的主布局，刷新页面保持登录态，未登录自动跳转登录页。

**Task 数量：** 6

**Phase 依赖：** Phase 0 全部完成

---

### P1-T1: Auth Store

**做什么：** 按前端 Spec 第 4.1 章实现 Zustand auth store，包含 user、token、isAuthenticated 状态和 login、logout、refreshToken、loadFromStorage 四个 action。token 持久化到 localStorage，loadFromStorage 恢复 token 后调用 `api.getMe()` 获取完整 User 对象。getMe 失败时自动 logout。

**涉及文件：**
- `frontend/src/lib/auth-store.ts`

**依赖：** P0-T6

**验收标准：**
- `login('mama', 'password')` 成功后 isAuthenticated 为 true，user 和 token 不为 null
- `logout()` 后 isAuthenticated 为 false，localStorage 中 token 已清除
- `loadFromStorage()` 在 localStorage 有有效 token 时恢复登录态
- `loadFromStorage()` 在 token 无效/过期时自动 logout

---

### P1-T2: 登录页

**做什么：** 实现登录页面，包含用户名和密码输入框、登录按钮、错误提示。已登录用户访问 /login 重定向到 /chat。登录成功后重定向到 /chat。参照前端 Spec 第 9.5 章数据流。视觉样式参照 DESIGN.md 第 4.4 章按钮样式。

**涉及文件：**
- `frontend/src/app/login/page.tsx`

**依赖：** P1-T1, P0-T2

**验收标准：**
- 输入正确用户名密码后跳转到 /chat
- 输入错误凭据显示错误提示信息
- 已登录状态访问 /login 自动重定向到 /chat
- 表单提交中按钮显示 loading 状态

---

### P1-T3: AuthGuard

**做什么：** 按前端 Spec 第 7.3 章实现客户端认证守卫组件，检查 authStore.isAuthenticated，未认证重定向到 /login，认证后渲染子组件。应用启动时调用 loadFromStorage() 恢复登录态，期间显示 loading 状态。

**涉及文件：**
- `frontend/src/components/auth/AuthGuard.tsx`

**依赖：** P1-T1

**验收标准：**
- 未登录用户访问 /chat 被重定向到 /login
- 登录用户正常显示子组件内容
- 页面刷新时先显示 loading 状态，loadFromStorage 完成后再决定渲染内容或重定向

---

### P1-T4: Root Layout

**做什么：** 配置 root layout（html lang="zh-CN"）、应用 DESIGN.md 第 3 章字体栈、引入 globals.css。设置 viewport meta（mobile-first）。

**涉及文件：**
- `frontend/src/app/layout.tsx`

**依赖：** P0-T2

**验收标准：**
- HTML 标签 lang 属性为 "zh-CN"
- 页面使用 DESIGN.md 指定的系统字体栈
- viewport meta 包含 `width=device-width, initial-scale=1, viewport-fit=cover`

---

### P1-T5: TopBar + TabBar

**做什么：** 按前端 Spec 第 8.1 章实现 TopBar（标题 + 可选右侧操作按钮 + 可选返回箭头）和 TabBar（4 个 Tab：对话/数据/相册/我的，含图标和文字，选中态高亮）。视觉样式参照 DESIGN.md 第 4.2-4.3 章。TabBar 使用 Lucide icons（message-circle、bar-chart-2、image、user）。

**涉及文件：**
- `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/components/layout/TabBar.tsx`

**依赖：** P0-T2, P0-T4

**验收标准：**
- TopBar 显示标题文字，传入 rightAction 时显示右侧按钮，传入 onBack 时显示返回箭头
- TabBar 显示 4 个 Tab，点击切换路由，当前路由对应的 Tab 高亮（颜色 #D4956A）
- TabBar 高度 49px + safe-area-inset-bottom
- Tab 图标 24px，标签文字 10px

---

### P1-T6: (main) Layout 路由组

**做什么：** 创建 `(main)/layout.tsx` 路由组布局，集成 AuthGuard、TopBar、TabBar。对话页不显示 TabBar（由对话页自行渲染输入栏），其他页面显示 TabBar。根路由 `/` 重定向到 `/chat`。参照前端 Spec 第 7.1-7.2 章路由结构。

**涉及文件：**
- `frontend/src/app/(main)/layout.tsx`
- `frontend/src/app/page.tsx`

**依赖：** P1-T3, P1-T5

**验收标准：**
- 访问 `/` 重定向到 `/chat`
- 未登录访问任何 (main) 路由被重定向到 /login
- 登录后页面显示 TopBar + 内容区域 + TabBar
- 对话页（/chat）不显示 TabBar

---

## Phase 2: Chat 对话页（核心）

**目标：** 完成对话页面全部功能，包括消息发送、SSE 流式接收、各类消息渲染（文字/图片/数据卡片/安全警告）、图片附件、快捷操作和历史对话检索。

**交付物：** 完整可用的对话页面（mock SSE 流式），历史对话检索页面。

**Task 数量：** 8

**Phase 依赖：** Phase 1 全部完成

---

### P2-T1: Chat Store

**做什么：** 按前端 Spec 第 4.2 章实现 Zustand chat store，包含 currentConversation、messages、isStreaming、streamingContent、pendingToolCalls、conversations 状态和 createConversation、loadConversation、loadConversations、sendMessage、uploadChatImage、handleSSEEvent、searchConversations 七个 action。sendMessage 内部调用 consumeSSE 处理流式响应（Spec 第 6.2 章集成流程）。

**涉及文件：**
- `frontend/src/lib/chat-store.ts`

**依赖：** P0-T6

**验收标准：**
- `sendMessage('测试消息')` 成功后 messages 数组包含用户消息和 agent 回复
- 流式过程中 isStreaming 为 true，streamingContent 逐步累加
- tool_call 事件正确添加到 pendingToolCalls，tool_result 事件正确移除
- done 事件后 isStreaming 为 false，streamingContent 清空，完整消息追加到 messages
- **session_expired 事件后自动创建新对话并用原始消息内容重新调用 sendMessage（透明重发，用户无感知）**
- **error 事件后 isStreaming 恢复为 false，输入栏不会卡死，界面显示错误提示**
- **网络失败（fetch 抛异常）时 isStreaming 恢复为 false，显示网络错误提示**
- **API 返回 401 时触发 authStore.logout()，重定向到 /login**

---

### P2-T2: MessageBubble + TimeSeparator + TypingIndicator + SafetyAlert

**做什么：** 按前端 Spec 第 8.2 章实现四个展示组件：(1) MessageBubble — 根据 role 渲染左侧/右侧气泡，根据 message_type 分支渲染：text 普通气泡、image 图片气泡、safety_alert 委托 SafetyAlert 渲染、**data_card 渲染 message.content 文本 + DataCard 组件**（content 包含 Agent 的文字解释和来源标注，DataCard 从 metadata 提取结构化数据渲染卡片，两者同时展示，不能只显示卡片而丢掉文字），支持 isStreaming 光标动画；(2) TimeSeparator — 居中时间标签；(3) TypingIndicator — 三个点动画；(4) SafetyAlert — 红色边框/浅红背景的安全警告卡片。视觉样式参照 DESIGN.md 第 4.1、4.7、4.8 章。

**注意：** P2-T2 依赖 P2-T3（DataCard），需先完成 P2-T3 再实现 MessageBubble 的 data_card 分支。

**涉及文件：**
- `frontend/src/components/chat/MessageBubble.tsx`
- `frontend/src/components/chat/TimeSeparator.tsx`
- `frontend/src/components/chat/TypingIndicator.tsx`
- `frontend/src/components/chat/SafetyAlert.tsx`

**依赖：** P0-T2, P0-T3, P2-T3

**验收标准：**
- 用户消息显示在右侧，背景色 #D4956A，白色文字
- Agent 消息显示在左侧，背景色 #F2EDE8
- message_type 为 text 时渲染普通文字气泡
- message_type 为 image 时渲染图片气泡（点击可预览）
- message_type 为 safety_alert 时渲染红色边框 + #FDEEEB 背景
- message_type 为 data_card 时渲染 message.content 文字 + DataCard 组件（两者同时展示，文字在上、卡片在下）
- TimeSeparator 居中显示格式化后的中文时间
- TypingIndicator 显示三个圆点渐变动画

---

### P2-T3: DataCard

**做什么：** 按前端 Spec 第 8.2 章实现 DataCard 组件，根据 type（growth/feeding/sleep/health）渲染不同布局的数据卡片。growth 类型显示体重/身高/头围值及 WHO 百分位；feeding 显示喂养汇总；sleep 显示睡眠汇总；health 显示健康事件。视觉样式参照 DESIGN.md 第 4.1 章 Data Card 部分。

**涉及文件：**
- `frontend/src/components/chat/DataCard.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 四种 type 各渲染正确的卡片布局
- 卡片白色背景、1px #E5DED5 边框、12px 圆角
- 数据数值使用 mono 字体（DESIGN.md 第 3 章 Data Value 规则）
- 最大宽度 85vw

---

### P2-T4: ChatInput

**做什么：** 按前端 Spec 第 8.2 章实现底部输入栏组件，包含附加按钮（[+]，触发图片选择）、文本输入框、发送按钮。支持图片预览缩略图和移除。流式生成中禁用输入。视觉样式参照 DESIGN.md 第 4.2 章。

**涉及文件：**
- `frontend/src/components/chat/ChatInput.tsx`

**依赖：** P0-T2

**验收标准：**
- 输入文字后点击发送按钮触发 onSend 回调
- 空输入时发送按钮为禁用态（背景色 #E5DED5）
- 点击附加按钮可选择图片，选中后显示缩略图预览和移除按钮
- `disabled=true` 时输入框和按钮均不可操作
- 输入栏固定在底部，有 safe-area-inset-bottom 适配

---

### P2-T5: QuickActionChips

**做什么：** 按前端 Spec 第 8.2 章实现快捷操作标签组件，横向可滚动。根据 canWriteTracker 控制写入类 chip 的显示/隐藏。查询类 chip（"睡眠情况"、"查看生长曲线"）始终显示。写入类 chip（"记录喂奶"、"今天体重"）仅 canWriteTracker=true 时显示。视觉样式参照 DESIGN.md 第 4.9 章。

**涉及文件：**
- `frontend/src/components/chat/QuickActionChips.tsx`

**依赖：** P0-T2

**验收标准：**
- 渲染横向可滚动的 chip 列表
- `canWriteTracker=false` 时仅显示查询类 chip
- `canWriteTracker=true` 时显示全部 chip
- 点击 chip 触发 onSelect 回调并传入对应文本

---

### P2-T6: MessageList

**做什么：** 按前端 Spec 第 8.2 章实现消息列表容器组件，负责渲染 messages 数组（使用 MessageBubble），插入 TimeSeparator（超过 5 分钟间隔时），显示流式内容（streamingContent），显示 TypingIndicator（pendingToolCalls 非空时），自动滚动到底部。

**涉及文件：**
- `frontend/src/components/chat/MessageList.tsx`

**依赖：** P2-T2, P2-T3

**验收标准：**
- 正确渲染消息列表，用户和 Agent 消息按时间排序显示
- 超过 5 分钟的消息间隔自动插入 TimeSeparator
- isStreaming 时在列表底部显示正在生成的 Agent 回复（streamingContent）
- pendingToolCalls 非空时显示 TypingIndicator
- 新消息到达时自动滚动到底部

---

### P2-T7: Chat 页面组装

**做什么：** 按前端 Spec 第 9.1 章组装对话页面。Server Component 包裹 ChatClient 客户端组件。ChatClient 内集成 chat-store，处理页面加载逻辑（URL 有 id 参数则加载指定对话，否则检查活跃对话或等待首条消息），组装 TopBar（标题 "Fawn"、右侧 "历史" 入口链接到 /history）+ MessageList + QuickActionChips + ChatInput。图片附件通过 ChatInput.onAttach 调用 chat-store.uploadChatImage。

**涉及文件：**
- `frontend/src/app/(main)/chat/page.tsx`
- `frontend/src/app/(main)/chat/ChatClient.tsx`

**依赖：** P2-T1, P2-T4, P2-T5, P2-T6, P1-T6

**验收标准：**
- 页面加载后可发送消息并看到流式 Agent 回复
- 消息中包含 data_card 类型时渲染 DataCard 组件
- 消息中包含 safety_alert 类型时渲染 SafetyAlert 样式
- 点击 QuickActionChip 自动发送对应文本
- TopBar 右侧 "历史" 按钮点击跳转到 /history
- 图片附件流程：选择图片 → 预览 → 发送（或移除）

---

### P2-T8: History 历史对话检索页

**做什么：** 实现历史对话检索页面，包含搜索框（关键词搜索调用 chat-store.searchConversations）和对话列表（按日期分组显示，显示摘要和消息数量）。点击对话条目跳转到 `/chat?id=xxx` 查看历史对话。参照前端 Spec 第 7.1 章路由和第 4.2 章 searchConversations action。

**涉及文件：**
- `frontend/src/app/(main)/history/page.tsx`

**依赖：** P2-T1, P1-T6

**验收标准：**
- 页面加载时显示对话列表（调用 loadConversations）
- 搜索框输入关键词后显示匹配的消息结果
- 点击对话条目跳转到 `/chat?id=xxx`
- 列表按日期分组，每条显示时间、摘要和消息数量

---

## Phase 3: Dashboard 数据看板

**目标：** 完成数据看板页面，包括宝宝信息、生长曲线（含 WHO 参考线）、喂养统计、睡眠统计、健康时间线、Tracker 记录列表（支持编辑/删除）。

**交付物：** 完整的数据看板页面，数据来自 mock API。

**Task 数量：** 7

**Phase 依赖：** Phase 1 全部完成

---

### P3-T1: BabyInfoCard

**做什么：** 按前端 Spec 第 8.3 章实现宝宝信息卡片，显示宝宝头像、姓名、月龄（age_display）、最新体重/身高及百分位。接收 DashboardSummary 类型数据。

**涉及文件：**
- `frontend/src/components/dashboard/BabyInfoCard.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 显示宝宝姓名和月龄文本
- 显示最新体重、身高及对应的 WHO 百分位
- latest_growth 为 null 时显示 "暂无数据" 占位
- 卡片样式符合 DESIGN.md 第 4.5 章 Standard Card 规范

---

### P3-T2: GrowthChart

**做什么：** 按前端 Spec 第 8.3 章实现生长曲线图，使用 Recharts ResponsiveContainer + LineChart。显示宝宝实际数据点和 WHO p3/p15/p50/p85/p97 五条参考线。支持 weight/height/head 三个指标切换（通过 Tab 按钮）。参考线使用 DESIGN.md 第 2 章 Chart Reference 颜色 (#C8C0B8)。

**涉及文件：**
- `frontend/src/components/dashboard/GrowthChart.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 图表显示宝宝实际数据点（带品牌色连线）
- 显示 WHO p3/p15/p50/p85/p97 五条参考线（灰色虚线）
- 切换 weight/height/head 指标时图表数据更新
- 图表在 375px 宽度下正常显示（ResponsiveContainer）

---

### P3-T3: FeedingStats

**做什么：** 按前端 Spec 第 8.3 章实现喂养统计卡片，显示统计天数内的日均奶量、日均次数，以及每日柱状图。接收 FeedingStatsData 类型数据。

**涉及文件：**
- `frontend/src/components/dashboard/FeedingStats.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 显示日均奶量（ml）和日均次数
- 数值使用 mono 字体、28px 大小
- 卡片样式符合 DESIGN.md Data Summary Card 规范

---

### P3-T4: SleepStats

**做什么：** 按前端 Spec 第 8.3 章实现睡眠统计卡片，显示日均睡眠时长和平均夜醒次数。接收 SleepStatsData 类型数据。

**涉及文件：**
- `frontend/src/components/dashboard/SleepStats.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 显示日均睡眠时长（小时）和平均夜醒次数
- 数值使用 mono 字体、28px 大小
- 卡片样式符合 DESIGN.md Data Summary Card 规范

---

### P3-T5: HealthTimeline

**做什么：** 按前端 Spec 第 8.3 章实现健康时间线组件，纵向时间线展示 HealthRecord 列表。按日期倒序排列，每条显示 record_type 图标（疫苗/生病/就医）、标题、日期和描述。

**涉及文件：**
- `frontend/src/components/dashboard/HealthTimeline.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 健康记录按日期倒序显示
- 三种 record_type（vaccination/illness/checkup）使用不同图标区分
- 每条记录显示标题、日期和可选描述

---

### P3-T6: TrackerRecordList

**做什么：** 按前端 Spec 第 8.3 章实现 Tracker 记录列表组件，支持按数据域切换（growth/feeding/sleep/health Tab）。每条记录显示摘要信息。canWrite=true 时显示编辑和删除按钮。编辑弹出内联表单，删除需二次确认对话框。调用 onEdit 和 onDelete 回调。

**涉及文件：**
- `frontend/src/components/dashboard/TrackerRecordList.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 四种数据域 Tab 切换正常
- 每条记录显示关键字段摘要
- `canWrite=true` 时显示编辑/删除操作，`canWrite=false` 时隐藏
- 点击编辑弹出内联表单，可修改字段并提交
- 点击删除显示二次确认对话框，确认后触发 onDelete

---

### P3-T7: Dashboard 页面组装

**做什么：** 按前端 Spec 第 9.2 章组装数据看板页面。页面加载时并行请求所有数据（getDashboardSummary、getGrowthChart、getFeedingStats、getSleepStats、getHealthRecords），各组件独立加载态（skeleton）。底部包含 TrackerRecordList，切换 Tab 按需加载记录。编辑/删除操作调用 api.updateTrackerRecord / api.deleteTrackerRecord，成功后刷新数据。支持下拉刷新。

**涉及文件：**
- `frontend/src/app/(main)/dashboard/page.tsx`

**依赖：** P3-T1, P3-T2, P3-T3, P3-T4, P3-T5, P3-T6, P1-T6

**验收标准：**
- 页面加载时所有卡片独立显示 skeleton，数据加载完成后渲染内容
- 生长曲线图可切换 weight/height/head
- TrackerRecordList 四种 Tab 切换正常，记录可编辑/删除
- 权限控制：family 用户（can_write_tracker=false）看不到编辑/删除按钮

---

## Phase 4: Album 相册 + Profile 我的

**目标：** 完成相册浏览/上传/预览和个人中心页面（画像管理、宝宝档案编辑、家庭成员权限管理）。

**交付物：** 完整的相册页面和我的页面。

**Task 数量：** 6

**Phase 依赖：** Phase 1 全部完成

---

### P4-T1: PhotoGrid

**做什么：** 按前端 Spec 第 8.4 章实现照片网格组件，支持三种浏览模式（timeline/scene/milestone）。timeline 模式按日期分组；scene 模式按场景分类；milestone 模式按里程碑分类。点击照片触发 onPhotoClick 回调。视觉样式参照 DESIGN.md 第 4.5 章 Photo Card。

**涉及文件：**
- `frontend/src/components/album/PhotoGrid.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 三种浏览模式渲染不同的分组布局
- 照片卡片圆角 12px，底部 gradient overlay 显示日期/标签
- 点击照片触发 onPhotoClick

---

### P4-T2: PhotoViewer + UploadButton

**做什么：** 按前端 Spec 第 8.4 章实现全屏照片预览（PhotoViewer）和上传按钮（UploadButton）。PhotoViewer 全屏显示照片、展示 AI 标签列表、里程碑标签可确认（仅 admin/parent 传入 onConfirmTag）。UploadButton 仅在有上传权限时渲染。视觉样式参照 DESIGN.md 第 6 章 Level 3 elevation。

**涉及文件：**
- `frontend/src/components/album/PhotoViewer.tsx`
- `frontend/src/components/album/UploadButton.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- PhotoViewer 全屏显示照片，点击关闭按钮退出
- 显示照片的所有标签（tag_type + tag_value + confidence）
- 里程碑标签旁显示确认按钮（仅传入 onConfirmTag 时）
- UploadButton 在 isUploading 时显示加载状态

---

### P4-T3: Album 页面组装

**做什么：** 按前端 Spec 第 9.3 章组装相册页面。顶部三种浏览模式切换按钮，PhotoGrid 展示照片，点击照片打开 PhotoViewer。底部 UploadButton（权限控制：admin/parent 始终显示，family 检查 can_upload_photos）。上传后调用 api.uploadPhoto 并刷新列表。

**涉及文件：**
- `frontend/src/app/(main)/album/page.tsx`

**依赖：** P4-T1, P4-T2, P1-T6

**验收标准：**
- 三种浏览模式切换正常，PhotoGrid 内容随模式变化
- 点击照片打开全屏 PhotoViewer，可查看标签和确认里程碑
- 上传照片后列表自动刷新（mock 模式下模拟上传成功）
- family 用户（can_upload_photos=false）看不到上传按钮

---

### P4-T4: ProfileItemList

**做什么：** 按前端 Spec 第 8 章 profile 部分实现画像条目列表组件，显示用户画像条目，支持编辑和删除操作。编辑为内联编辑，删除需二次确认。

**涉及文件：**
- `frontend/src/components/profile/ProfileItemList.tsx`

**依赖：** P0-T2, P0-T3

**验收标准：**
- 列表渲染画像条目，每条显示 content 和更新时间
- 点击编辑可修改 content 并提交
- 点击删除弹出二次确认，确认后触发删除回调

---

### P4-T5: FamilyMemberManager + BabyProfile 编辑

**做什么：** 实现 Admin 家庭成员权限管理组件（FamilyMemberManager），显示家庭成员列表，Admin 可修改 Family 成员的 can_upload_photos 和 can_write_tracker 权限（参照后端 Spec 第 10.3 章 API）。实现宝宝档案编辑表单（可编辑姓名、出生日期、体重/身高/头围等字段）。

**涉及文件：**
- `frontend/src/components/profile/FamilyMemberManager.tsx`

**依赖：** P0-T2, P0-T3, P0-T6

**验收标准：**
- 显示家庭成员列表（姓名、角色、权限状态）
- Admin 可通过开关修改 Family 成员的两个权限字段
- 修改后调用 api.updateUserPermissions 并更新本地显示
- 宝宝档案表单可编辑各字段，提交后调用 api.updateBaby

---

### P4-T6: Profile 页面组装

**做什么：** 按前端 Spec 第 9.4 章组装我的页面。并行加载画像条目（api.getMyProfile）、宝宝档案（api.getBaby）和家庭成员列表（仅 Admin 调用 api.getUsers）。非 Admin 用户不渲染 FamilyMemberManager。角色判断来自 authStore.user.role。

**涉及文件：**
- `frontend/src/app/(main)/profile/page.tsx`

**依赖：** P4-T4, P4-T5, P1-T6

**验收标准：**
- 页面显示个人信息、画像条目列表、宝宝档案卡片
- Admin 用户额外显示家庭成员管理区域
- 非 Admin 用户不显示家庭成员管理，不发起 getUsers 请求
- 画像条目可编辑/删除，宝宝档案可编辑保存

---

## Phase 5: 测试 + 打磨

**目标：** 补充单元测试和集成测试，验证移动端适配，完成全流程走查。

**交付物：** 测试覆盖核心组件和 store，移动端布局验证通过，所有已知问题修复。

**Task 数量：** 6

**Phase 依赖：** Phase 2、Phase 3、Phase 4 全部完成

---

### P5-T1: 组件测试

**做什么：** 按前端 Spec 第 12 章测试策略，为核心组件编写测试。重点覆盖：MessageBubble（四种 message_type 渲染、isStreaming 状态）、ChatInput（发送回调、disabled 状态、图片附件）、DataCard（四种 type 数据渲染）、SafetyAlert（红色样式渲染）、QuickActionChips（权限控制显示/隐藏）。使用 Vitest + React Testing Library。

**涉及文件：**
- `frontend/src/__tests__/components/MessageBubble.test.tsx`
- `frontend/src/__tests__/components/ChatInput.test.tsx`
- `frontend/src/__tests__/components/DataCard.test.tsx`
- `frontend/src/__tests__/components/SafetyAlert.test.tsx`
- `frontend/src/__tests__/components/QuickActionChips.test.tsx`

**依赖：** P2-T2, P2-T3, P2-T4, P2-T5

**验收标准：**
- MessageBubble 测试覆盖 text、image、data_card、safety_alert 四种类型
- ChatInput 测试覆盖发送、禁用、图片附件三个场景
- DataCard 测试覆盖四种 tracker type
- 所有测试通过 `npm run test`

---

### P5-T2: Store 测试

**做什么：** 为 auth-store 和 chat-store 编写状态管理测试。auth-store 测试：login 成功/失败、logout 清理、loadFromStorage 恢复/失败。chat-store 测试：sendMessage 流程（mock SSE 事件序列）、handleSSEEvent 状态变更、createConversation。

**涉及文件：**
- `frontend/src/__tests__/stores/auth-store.test.ts`
- `frontend/src/__tests__/stores/chat-store.test.ts`

**依赖：** P1-T1, P2-T1

**验收标准：**
- auth-store 测试覆盖 login 成功→isAuthenticated=true、logout→isAuthenticated=false、loadFromStorage 恢复和失败场景
- chat-store 测试覆盖 sendMessage 完整流程（user message 添加 → streaming → done → 完成）
- **chat-store 测试覆盖 session_expired 事件后的自动重发流程（创建新对话 → 用原始内容重新 sendMessage）**
- **chat-store 测试覆盖 error 事件和网络失败后 isStreaming 恢复为 false**
- **auth-store 测试覆盖 API 返回 401 时自动 logout 并清除 token**
- 所有测试通过 `npm run test`

---

### P5-T3: API 层测试

**做什么：** 按前端 Spec 第 12.2 章，为 mock API 层编写接口正确性测试。验证 ApiClient 所有方法的请求参数和响应格式是否与 types.ts 定义一致。测试 NEXT_PUBLIC_USE_MOCK 切换行为（true 时导出 mock 实现，false 时导出真实 HTTP 实现）。测试 ApiError 异常抛出和 401 自动 logout 联动。

**涉及文件：**
- `frontend/src/__tests__/lib/api.test.ts`

**依赖：** P0-T6

**验收标准：**
- 测试覆盖 ApiClient 核心方法（login、getMe、sendMessage、getDashboardSummary、getPhotos）的返回值类型正确性
- 测试 mock 模式下 API 响应结构与 TypeScript 类型定义一致（字段名、类型）
- 测试非 401 错误抛出 ApiError（含 status 和 message）
- 测试 401 响应触发 authStore.logout()
- **测试 mock sendMessage() 的 5 个触发场景返回正确的 SSE 事件序列（关键词匹配 → 对应场景流）**
- 所有测试通过 `npm run test`

---

### P5-T4: 页面级集成测试

**做什么：** 按前端 Spec 第 12.2 章，为核心页面编写集成测试。对话页完整流程测试（发送消息 → SSE 流式响应 → 消息列表更新）。登录页重定向测试（未登录→/login、已登录→/chat）。Dashboard 数据加载测试。使用 Vitest + React Testing Library。

**涉及文件：**
- `frontend/src/__tests__/pages/chat.test.tsx`
- `frontend/src/__tests__/pages/login.test.tsx`
- `frontend/src/__tests__/pages/dashboard.test.tsx`

**依赖：** P2-T7, P1-T2, P3-T7

**验收标准：**
- 对话页测试：渲染页面 → 输入消息 → 点击发送 → 验证消息出现在列表中
- 登录页测试：未登录访问 /chat 重定向到 /login；登录成功后重定向到 /chat
- Dashboard 测试：页面加载后各数据卡片正确渲染 mock 数据
- 所有测试通过 `npm run test`

---

### P5-T5: 移动端适配验证

**做什么：** 在 375px 和 428px 两个宽度下验证所有页面布局。检查项：气泡 max-width 正确（75vw，<375px 时 85vw）、触控区域 ≥ 44px、TabBar/InputBar safe-area 适配、内容不溢出、文字不小于 12px。修复发现的适配问题。

**涉及文件：**
- 可能涉及多个组件文件的样式调整

**依赖：** Phase 2, Phase 3, Phase 4

**验收标准：**
- 375px 宽度下所有页面布局正确，无内容溢出
- 428px 宽度下所有页面布局正确
- 所有可交互元素触控区域 ≥ 44×44px
- 无小于 12px 的文字

---

### P5-T6: 全流程走查

**做什么：** 按 PRD-V2.md 第 10 章和前端 Spec 第 14 章验收标准，执行完整功能走查。**必须覆盖 PRD 核心验收场景（使用 P0-T5 的 mock SSE 场景）：** 记录体重+WHO反馈、纠错更新、追问补全、多角色共享查询、安全提醒。以及通用流程：登录→对话→流式回复→数据卡片→历史检索→数据看板→生长曲线→编辑/删除记录→相册上传→浏览→标签确认→个人中心→画像管理→宝宝档案编辑→家庭成员权限管理。记录并修复发现的问题。

**涉及文件：**
- 视发现的问题修复对应文件

**依赖：** P5-T1, P5-T2, P5-T3, P5-T4, P5-T5

**验收标准：**
- PRD-V2.md 第 10 章 5 个核心验收场景在 mock 模式下可完整走通
- 前端 Spec 第 14 章所有验收标准勾选通过
- `npm run test` 全部测试通过
- `npx tsc --noEmit` 无类型错误
- Mock 模式下全部功能可独立使用

---

## 依赖关系总览

```
Phase 0 (项目基础)
  P0-T1 ──→ P0-T2, P0-T3, P0-T4
  P0-T3 ──→ P0-T5
  P0-T3 + P0-T5 ──→ P0-T6

Phase 1 (Auth + Layout) ← 依赖 Phase 0
  P0-T6 ──→ P1-T1
  P1-T1 ──→ P1-T2, P1-T3
  P0-T2 ──→ P1-T4
  P0-T2 + P0-T4 ──→ P1-T5
  P1-T3 + P1-T5 ──→ P1-T6

Phase 2 (Chat) ← 依赖 Phase 1
  P0-T6 ──→ P2-T1
  P0-T2 + P0-T3 + P2-T3 ──→ P2-T2
  P0-T2 + P0-T3 ──→ P2-T3, P2-T4, P2-T5
  P2-T2 + P2-T3 ──→ P2-T6
  P2-T1 + P2-T4 + P2-T5 + P2-T6 + P1-T6 ──→ P2-T7
  P2-T1 + P1-T6 ──→ P2-T8

Phase 3 (Dashboard) ← 依赖 Phase 1
  P0-T2 + P0-T3 ──→ P3-T1 ~ P3-T6（可并行）
  P3-T1 ~ P3-T6 + P1-T6 ──→ P3-T7

Phase 4 (Album + Profile) ← 依赖 Phase 1
  P0-T2 + P0-T3 ──→ P4-T1, P4-T2, P4-T4
  P4-T1 + P4-T2 + P1-T6 ──→ P4-T3
  P0-T2 + P0-T3 + P0-T6 ──→ P4-T5
  P4-T4 + P4-T5 + P1-T6 ──→ P4-T6

Phase 5 (测试 + 打磨) ← 依赖 Phase 2, 3, 4
  P2 组件 ──→ P5-T1
  P1-T1 + P2-T1 ──→ P5-T2
  P0-T6 ──→ P5-T3
  P2-T7 + P1-T2 + P3-T7 ──→ P5-T4
  Phase 2 + 3 + 4 ──→ P5-T5
  P5-T1 + P5-T2 + P5-T3 + P5-T4 + P5-T5 ──→ P5-T6
```

**注意：** Phase 2、Phase 3、Phase 4 的组件开发部分可以并行推进（它们共同依赖 Phase 0 和 Phase 1），仅页面组装需要各自组件就绪。Phase 5 需要前三个 Phase 全部完成。

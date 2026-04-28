# Fawn — 前端设计 Spec

| 字段 | 值 |
|------|-----|
| 版本 | v2.0 |
| 日期 | 2026-04-29 |
| 状态 | review |
| 依赖 | PRD-V2.md, DESIGN.md (视觉设计系统), BACKEND-DESIGN-V2.md |

---

## 1. 概述

本文档是 Fawn 前端的实现级设计 spec，覆盖 TypeScript 类型定义、状态管理设计、API 客户端契约、SSE 消费协议、组件接口、路由结构和认证流程。

**本 spec 与 `docs/DESIGN.md` 共同构成完整的前端设计：**

| 文档 | 覆盖范围 |
|------|---------|
| **本文档** (前端设计 Spec) | 架构、类型、状态管理、API 契约、SSE 协议、组件接口、路由、认证、测试 |
| **DESIGN.md** (视觉设计系统) | 配色、字体、间距、组件样式、布局规则、动效、图标、响应式行为 |

实现时两份文档需同时参考。本文档定义组件"做什么"和"接收什么数据"，DESIGN.md 定义组件"长什么样"。

### 1.1 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 框架 | Next.js 15 (App Router) | React 生态，SSR/SSG 支持，流式渲染 |
| 语言 | TypeScript (strict mode) | 类型安全 |
| 样式 | Tailwind CSS | 实用优先，与 DESIGN.md token 系统配合 |
| 状态管理 | Zustand | 轻量、简单、无 boilerplate |
| 图表 | Recharts | React 原生图表库，支持响应式 |
| 图标 | Lucide React | 线性风格，与 DESIGN.md 一致 |
| 日期 | date-fns | 轻量日期工具，支持中文 locale |
| 工具 | clsx + tailwind-merge | className 合并 |
| 测试 | Vitest + React Testing Library | 快速、与 Next.js 兼容 |
| Mock | 内置 mock API 层 | 前后端独立开发 |

---

## 2. 项目结构

```
frontend/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout (html lang="zh-CN", 字体)
│   │   ├── page.tsx                # / → 重定向到 /chat
│   │   ├── globals.css             # CSS 自定义属性 (design tokens)
│   │   ├── login/
│   │   │   └── page.tsx            # 登录页
│   │   └── (main)/                 # 认证后的主布局（Route Group）
│   │       ├── layout.tsx          # 共享布局：TopBar + TabBar
│   │       ├── chat/
│   │       │   ├── page.tsx        # 对话页（Server Component + Suspense）
│   │       │   └── ChatClient.tsx  # 对话页客户端组件
│   │       ├── history/
│   │       │   └── page.tsx        # 历史对话检索页
│   │       ├── dashboard/
│   │       │   └── page.tsx        # 数据看板页
│   │       ├── album/
│   │       │   └── page.tsx        # 相册页
│   │       └── profile/
│   │           └── page.tsx        # 我的页面
│   │
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthGuard.tsx       # 客户端认证守卫
│   │   ├── layout/
│   │   │   ├── TabBar.tsx          # 底部 Tab 导航
│   │   │   └── TopBar.tsx          # 顶部导航栏
│   │   ├── ui/                     # 通用 UI 组件
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── Avatar.tsx
│   │   ├── chat/                   # 对话相关组件
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── SafetyAlert.tsx
│   │   │   ├── DataCard.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── TimeSeparator.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   ├── QuickActionChips.tsx
│   │   │   └── MessageList.tsx
│   │   ├── dashboard/              # 数据看板组件
│   │   │   ├── BabyInfoCard.tsx
│   │   │   ├── GrowthChart.tsx
│   │   │   ├── FeedingStats.tsx
│   │   │   ├── SleepStats.tsx
│   │   │   ├── HealthTimeline.tsx
│   │   │   └── TrackerRecordList.tsx
│   │   ├── album/                  # 相册组件
│   │   │   ├── PhotoGrid.tsx
│   │   │   ├── PhotoViewer.tsx
│   │   │   └── UploadButton.tsx
│   │   └── profile/               # 我的页面组件
│   │       ├── ProfileItemList.tsx
│   │       └── FamilyMemberManager.tsx  # Admin: 家庭成员权限管理
│   │
│   └── lib/
│       ├── types.ts                # 共享 TypeScript 类型定义
│       ├── utils.ts                # cn() 工具函数
│       ├── api.ts                  # API 客户端（开发阶段为 mock）
│       ├── sse.ts                  # SSE 流式消费工具
│       ├── auth-store.ts           # Zustand 认证状态
│       ├── chat-store.ts           # Zustand 对话状态
│       └── mock-data.ts            # Mock 数据（中文内容）
│
├── public/                         # 静态资源
├── tailwind.config.ts              # Tailwind 主题扩展（DESIGN.md tokens）
├── vitest.config.ts
├── vitest.setup.ts
├── tsconfig.json
├── next.config.ts
└── package.json
```

---

## 3. TypeScript 类型定义

与后端 API 契约对齐的核心类型：

```typescript
// === Auth ===
type UserRole = 'admin' | 'parent' | 'family';

interface UserPermissions {
  can_upload_photos: boolean;
  can_write_tracker: boolean;
}

interface User {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  permissions: UserPermissions;  // 仅对 family 角色生效，admin/parent 始终全权限
}

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

// === Baby ===
interface Baby {
  id: string;
  name: string;
  gender: 'male' | 'female';
  birth_date: string;          // ISO date
  birth_weight_g: number | null;
  birth_height_cm: number | null;
  birth_head_cm: number | null;
  is_premature: boolean;
  gestational_weeks: number | null;
}

// === Chat ===
type MessageType = 'text' | 'image' | 'data_card' | 'safety_alert';

interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  message_type: MessageType;
  metadata: Record<string, unknown> | null;
  created_at: string;          // ISO datetime
}

interface Conversation {
  id: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  summary: string | null;
  message_count: number;
}

// === SSE Events ===
type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: Record<string, unknown> }
  | { type: 'done'; message_id: string; message_type: MessageType }  // message_type 由后端判定
  | { type: 'error'; message: string };

// === Tracker ===
type TrackerType = 'growth' | 'feeding' | 'sleep' | 'health';

interface GrowthRecord {
  id: string;
  measurement_date: string;
  weight_g: number | null;
  height_cm: number | null;
  head_cm: number | null;
  weight_percentile: number | null;
  height_percentile: number | null;
  head_percentile: number | null;
}

interface FeedingRecord {
  id: string;
  feed_time: string;
  feed_type: 'breast' | 'formula' | 'solid';
  amount_ml: number | null;
  duration_min: number | null;
  notes: string | null;
}

interface SleepRecord {
  id: string;
  sleep_start: string;
  sleep_end: string | null;
  night_wakings: number;
  sleep_type: 'nap' | 'night';
  notes: string | null;
}

interface HealthRecord {
  id: string;
  record_date: string;
  record_type: 'vaccination' | 'illness' | 'checkup';
  title: string;
  description: string | null;
}

// === Dashboard ===
interface DashboardSummary {
  baby: {
    name: string;
    gender: 'male' | 'female';
    birth_date: string;
    age_days: number;
    age_display: string;       // "1个月28天"
  };
  latest_growth: {
    date: string;
    weight_g: number;
    weight_percentile: number;
    height_cm: number;
    height_percentile: number;
  } | null;
  today_feeding: {
    total_ml: number;
    count: number;
    last_feed_time: string | null;
  };
  today_sleep: {
    total_hours: number;
    night_wakings: number;
  };
}

interface GrowthChartData {
  records: Array<{
    date: string;
    weight_g: number | null;
    height_cm: number | null;
    head_cm: number | null;
  }>;
  who_reference: {
    weight: WHOReferenceLines;
    height: WHOReferenceLines;
    head: WHOReferenceLines;
  };
}

interface WHOReferenceLines {
  p3: Array<{ age_months: number; value: number }>;
  p15: Array<{ age_months: number; value: number }>;
  p50: Array<{ age_months: number; value: number }>;
  p85: Array<{ age_months: number; value: number }>;
  p97: Array<{ age_months: number; value: number }>;
}

// === Album ===
type PhotoTagType = 'scene' | 'expression' | 'milestone';

interface Photo {
  id: string;
  storage_url: string;         // 前端可访问的 URL
  original_filename: string;
  taken_at: string | null;
  uploaded_at: string;
  tags: PhotoTag[];
}

interface PhotoTag {
  id: string;
  tag_type: PhotoTagType;
  tag_value: string;
  confidence: number;
  is_confirmed: boolean;
}

// === Profile ===
interface ProfileItem {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// === Pagination ===
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// === Stats (Dashboard) ===
interface FeedingStatsData {
  days: number;                // 统计天数
  daily: Array<{
    date: string;
    total_ml: number;
    count: number;
  }>;
  average_daily_ml: number;
  average_daily_count: number;
}

interface SleepStatsData {
  days: number;
  daily: Array<{
    date: string;
    total_hours: number;
    night_wakings: number;
  }>;
  average_daily_hours: number;
  average_night_wakings: number;
}
```

---

## 4. 状态管理（Zustand）

### 4.1 Auth Store

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  loadFromStorage: () => Promise<void>;  // 从 localStorage 恢复 token，然后调用 getMe() 获取完整 user（含 permissions）
}
```

Token 持久化：`localStorage` 存储 `access_token`。应用启动时 `loadFromStorage()` 恢复 token 后，**必须调用 `GET /api/auth/me` 获取完整的 User 对象**（含 permissions），否则权限 UI 无法正确渲染。如果 getMe() 失败（token 过期），自动 logout 并重定向到 /login。

### 4.2 Chat Store

```typescript
interface ChatState {
  // 当前对话
  currentConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;     // 正在流式生成的 Agent 回复文本
  pendingToolCalls: string[];   // 正在执行的 Tool 名称列表

  // 对话列表
  conversations: Conversation[];

  // Actions
  createConversation: () => Promise<Conversation>;
  loadConversation: (id: string) => Promise<void>;
  loadConversations: (page?: number) => Promise<void>;
  sendMessage: (content: string, imageUrl?: string) => Promise<void>;
  uploadChatImage: (conversationId: string, file: File) => Promise<string>;  // 返回 image_url
  handleSSEEvent: (event: SSEEvent) => void;
  searchConversations: (query: string) => Promise<Message[]>;
}
```

**SSE 流式更新流程：**

1. `sendMessage()` 添加用户消息到 `messages`，设 `isStreaming=true`
2. 发起 POST 请求，逐行读取 SSE
3. 每个 `token` 事件追加到 `streamingContent`
4. `tool_call` 事件添加到 `pendingToolCalls`
5. `tool_result` 事件从 `pendingToolCalls` 移除，将结果作为 data_card 类型的消息片段暂存
6. `done` 事件将 `streamingContent` + 数据卡片合并为完整的 assistant Message，追加到 `messages`，清空 `streamingContent`，设 `isStreaming=false`

### 4.3 不使用全局 Store 的数据

以下数据通过页面组件内 `useEffect` + API 调用获取，不放入全局 store：

- Dashboard 数据（仅看板页使用）
- Album 照片列表（仅相册页使用）
- Profile 画像条目（仅个人页使用）
- Baby 档案（仅需要时按需加载）
- Tracker 详细记录（仅看板页使用）

---

## 5. API 客户端

### 5.1 设计

```typescript
// lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

class ApiClient {
  private getHeaders(isMultipart?: boolean): HeadersInit {
    const headers: HeadersInit = {};
    if (!isMultipart) headers['Content-Type'] = 'application/json';
    // multipart 请求不设置 Content-Type，让浏览器自动添加 boundary
    const token = useAuthStore.getState().token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  // 通用请求方法，自动处理 401 → logout
  private async request<T>(path: string, options?: RequestInit): Promise<T>;

  // Auth
  async login(data: LoginRequest): Promise<LoginResponse>;
  async refreshToken(): Promise<{ access_token: string }>;
  async getMe(): Promise<User>;

  // Chat
  async createConversation(): Promise<Conversation>;
  async getConversations(page?: number): Promise<PaginatedResponse<Conversation>>;
  async getConversation(id: string): Promise<{ conversation: Conversation; messages: Message[] }>;
  async sendMessage(conversationId: string, content: string, imageUrl?: string): Promise<Response>;  // 返回原始 Response 用于 SSE 读取
  async uploadChatImage(conversationId: string, file: File): Promise<{ image_url: string; mime_type: string }>;
  async searchMessages(query: string): Promise<PaginatedResponse<Message & { conversation_started_at: string }>>;

  // Tracker
  async getGrowthRecords(): Promise<GrowthRecord[]>;
  async getFeedingRecords(date?: string): Promise<FeedingRecord[]>;
  async getSleepRecords(date?: string): Promise<SleepRecord[]>;
  async getHealthRecords(): Promise<HealthRecord[]>;
  async updateTrackerRecord(type: TrackerType, id: string, updates: Record<string, unknown>): Promise<Record<string, unknown>>;
  async deleteTrackerRecord(type: TrackerType, id: string): Promise<void>;

  // Dashboard
  async getDashboardSummary(): Promise<DashboardSummary>;
  async getGrowthChart(): Promise<GrowthChartData>;
  async getFeedingStats(days?: number): Promise<FeedingStatsData>;
  async getSleepStats(days?: number): Promise<SleepStatsData>;

  // Album
  async uploadPhoto(file: File): Promise<Photo>;
  async getPhotos(params?: { view?: string; scene?: string; month?: string }): Promise<PaginatedResponse<Photo>>;
  async getPhoto(id: string): Promise<Photo>;
  async confirmTag(photoId: string, tagId: string): Promise<PhotoTag>;

  // Profile
  async getMyProfile(): Promise<ProfileItem[]>;
  async updateProfileItem(id: string, content: string): Promise<ProfileItem>;
  async deleteProfileItem(id: string): Promise<void>;

  // Baby
  async getBaby(): Promise<Baby>;
  async updateBaby(data: Partial<Baby>): Promise<Baby>;

  // Users (Admin only)
  async getUsers(): Promise<User[]>;
  async updateUserPermissions(id: string, permissions: UserPermissions): Promise<User>;
}

export const api = new ApiClient();
```

### 5.2 命名约定转换

后端 API 使用 snake_case（Python 惯例），前端 TypeScript 使用 camelCase。API 客户端在请求/响应边界统一处理转换：

- **请求体：** 前端传入 camelCase（如 `imageUrl`），`request()` 方法内部递归转换为 snake_case（`image_url`）再发送
- **响应体：** 后端返回 snake_case，`request()` 方法内部递归转换为 camelCase 再返回给调用方
- **URL 路径参数和 query 参数：** 保持 snake_case（直接拼入 URL，不做转换）

本 spec 中的 TypeScript 类型定义使用 snake_case 字段名（如 `birth_date`、`feed_time`），这是为了与后端 API 文档对齐便于对照。实现时可选择：(a) 类型定义保持 snake_case，不做自动转换；或 (b) 类型定义改为 camelCase，API 层做自动转换。两种方案均可，选择后保持一致即可。

### 5.3 Mock API 层

开发阶段使用 mock 实现，与真实 API 接口签名完全一致。通过环境变量切换：

```typescript
// 当 NEXT_PUBLIC_USE_MOCK=true 时，api.ts 导出 mock 实现
// 当连接真实后端时，导出真实 HTTP 实现
```

Mock 数据使用中文内容（`lib/mock-data.ts`），覆盖所有数据类型。

### 5.4 错误处理

```typescript
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// 在 request() 方法中：
// - 401 → 调用 authStore.logout()，重定向到 /login
// - 其他错误 → 抛出 ApiError，由调用方处理
```

---

## 6. SSE 流式消费

### 6.1 实现

```typescript
// lib/sse.ts

interface SSEOptions {
  onToken: (content: string) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => void;
  onToolResult: (name: string, result: Record<string, unknown>) => void;
  onDone: (messageId: string) => void;
  onError: (message: string) => void;
}

async function consumeSSE(response: Response, options: SSEOptions): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';    // 保留未完成的行

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6)) as SSEEvent;

      switch (data.type) {
        case 'token':      options.onToken(data.content); break;
        case 'tool_call':  options.onToolCall(data.name, data.args); break;
        case 'tool_result': options.onToolResult(data.name, data.result); break;
        case 'done':       options.onDone(data.message_id); break;
        case 'error':      options.onError(data.message); break;
      }
    }
  }
}
```

不使用 `EventSource`，因为需要 POST 方法 + Authorization header。

### 6.2 与 Chat Store 集成

```typescript
// chat-store.ts 中 sendMessage 的核心流程：

async sendMessage(content: string) {
  // 1. 添加用户消息到 messages
  // 2. 设置 isStreaming = true, streamingContent = ''
  // 3. 调用 api.sendMessage() 获取 Response
  // 4. consumeSSE(response, {
  //      onToken: (t) => set({ streamingContent: get().streamingContent + t }),
  //      onToolCall: (name) => set({ pendingToolCalls: [...get().pendingToolCalls, name] }),
  //      onToolResult: (name, result) => { /* 移除 pending, 暂存卡片数据 */ },
  //      onDone: (msgId) => { /* 合并为完整 Message, isStreaming = false */ },
  //      onError: (msg) => { /* 显示错误, isStreaming = false */ },
  //    })
}
```

---

## 7. 路由与导航

### 7.1 路由结构

| 路径 | 页面 | 认证 | TabBar |
|------|------|------|--------|
| `/login` | 登录页 | 否 | 不显示 |
| `/` | 重定向到 `/chat` | — | — |
| `/chat` | 对话页 | 是 | 显示输入栏（替代 TabBar） |
| `/chat?id=xxx` | 查看指定对话 | 是 | 显示输入栏 |
| `/history` | 历史对话检索 | 是 | 显示 TabBar |
| `/dashboard` | 数据看板 | 是 | 显示 TabBar |
| `/album` | 相册 | 是 | 显示 TabBar |
| `/profile` | 我的 | 是 | 显示 TabBar |

### 7.2 导航行为

**底部 Tab 导航（4 个 Tab）：**

| Tab | 路径 | 图标 |
|-----|------|------|
| 对话 | `/chat` | message-circle |
| 数据 | `/dashboard` | bar-chart-2 |
| 相册 | `/album` | image |
| 我的 | `/profile` | user |

**对话页特殊处理：**
- 对话页不显示底部 TabBar，显示底部输入栏（这是对 PRD "底部 Tab 导航"的例外，因为对话页的输入栏占据了底部位置，两者不能共存）
- 顶部栏右侧有"历史"入口，点击进入 `/history`
- `/history` 页面显示 TabBar（对话 Tab 选中态）

### 7.3 认证守卫

```typescript
// components/auth/AuthGuard.tsx

// 包裹 (main)/layout.tsx
// 检查 authStore.isAuthenticated
// 未认证 → 重定向到 /login
// 认证后渲染子组件
// 应用启动时调用 loadFromStorage() 恢复登录态
```

---

## 8. 核心组件接口

### 8.1 Layout 组件

```typescript
// TabBar
interface TabBarProps {
  currentPath: string;         // 当前路由路径，用于高亮选中 Tab
}

// TopBar
interface TopBarProps {
  title: string;
  rightAction?: React.ReactNode;  // 如"历史"按钮
  onBack?: () => void;            // 有则显示返回箭头
}
```

### 8.2 Chat 组件

```typescript
// MessageBubble — 单条消息气泡
interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;        // true 时显示光标动画
}
// RAG 来源和未命中提示由 Agent 直接嵌入回复文本中（如"——来源：《育儿百科》第3章"
// 或"未检索到权威来源，以下为一般性建议"），前端作为普通文本渲染，不需要单独的
// Citation 组件。Agent 的 System Prompt 已规定标注格式。

// MessageList — 消息列表容器
interface MessageListProps {
  messages: Message[];
  streamingContent: string;    // 正在生成的文本
  isStreaming: boolean;
  pendingToolCalls: string[];  // 显示"正在查询..."指示器
}
// 职责：自动滚动到底部、时间分隔符插入、下拉加载历史

// SafetyAlert — 安全提醒样式（嵌入对话流）
// 不依赖单独的 SSE 事件。后端保存 assistant 消息时，如果内容包含就医提醒，
// message_type 标记为 'safety_alert'。前端 MessageBubble 根据 message_type
// 渲染红色边框/背景样式。Agent 的安全提醒通过 System Prompt 指引生成，
// 是普通文本回复的一部分，不需要前端做结构化解析。
interface SafetyAlertProps {
  content: string;             // 完整的 assistant 回复文案
}

// DataCard — 数据卡片（嵌入对话流）
interface DataCardProps {
  type: 'growth' | 'feeding' | 'sleep' | 'health';
  data: Record<string, unknown>;
}

// ChatInput — 底部输入栏
interface ChatInputProps {
  onSend: (content: string, imageUrl?: string) => void;
  onAttach: (file: File) => Promise<string>;  // 选择图片 → 上传 → 返回 image_url
  disabled?: boolean;          // 流式生成中禁用
  attachedImage: string | null; // 已选图片的预览 URL，显示缩略图 + 移除按钮
  onRemoveImage: () => void;
}

// TimeSeparator — 时间分隔符
interface TimeSeparatorProps {
  timestamp: string;           // ISO datetime
}

// TypingIndicator — Agent 输入中指示器
// 无 props，纯展示组件（三个点动画）

// QuickActionChips — 快捷操作标签
interface QuickActionChipsProps {
  onSelect: (action: string) => void;
  canWriteTracker: boolean;    // 基于用户权限，false 时隐藏写入类 chip
}
// 所有用户可见："睡眠情况", "查看生长曲线"（查询类）
// 仅 canWriteTracker=true 时显示："记录喂奶", "今天体重"（写入类）
// admin/parent 始终 canWriteTracker=true，family 取决于 permissions.can_write_tracker
```

### 8.3 Dashboard 组件

```typescript
// BabyInfoCard — 宝宝信息卡片
interface BabyInfoCardProps {
  summary: DashboardSummary;
}

// GrowthChart — 生长曲线图
interface GrowthChartProps {
  data: GrowthChartData;
  activeIndicator: 'weight' | 'height' | 'head';  // 当前选中的指标
  onIndicatorChange: (indicator: 'weight' | 'height' | 'head') => void;
}
// Recharts ResponsiveContainer，显示宝宝数据点 + WHO p3/p15/p50/p85/p97 参考线

// FeedingStats — 喂养统计卡片
interface FeedingStatsProps {
  data: FeedingStatsData;
}

// SleepStats — 睡眠统计卡片
interface SleepStatsProps {
  data: SleepStatsData;
}

// HealthTimeline — 健康时间线
interface HealthTimelineProps {
  records: HealthRecord[];
}

// TrackerRecordList — Tracker 记录列表（支持编辑/删除）
interface TrackerRecordListProps {
  type: TrackerType;
  records: Array<GrowthRecord | FeedingRecord | SleepRecord | HealthRecord>;
  onEdit: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canWrite: boolean;           // 基于用户权限控制编辑/删除按钮显示
}
// 每条记录显示摘要信息 + 侧滑/长按出现编辑和删除操作
// 编辑弹出内联表单，删除需二次确认
```

### 8.4 Album 组件

```typescript
// PhotoGrid — 照片网格
interface PhotoGridProps {
  photos: Photo[];
  view: 'timeline' | 'scene' | 'milestone';
  onPhotoClick: (photo: Photo) => void;
}

// PhotoViewer — 全屏照片预览
interface PhotoViewerProps {
  photo: Photo;
  onClose: () => void;
  onConfirmTag?: (tagId: string) => void;  // 仅 admin/parent 传入，family 不传（隐藏确认按钮）
}

// UploadButton — 上传按钮
interface UploadButtonProps {
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}
// 仅在用户有上传权限时渲染（admin/parent 始终显示，family 检查 permissions.can_upload_photos）
```

---

## 9. 页面数据流

### 9.1 对话页 (`/chat`)

```
页面加载
    │
    ├── authStore.isAuthenticated? → 否 → /login
    │
    ├── URL 有 ?id=xxx → loadConversation(id) → 显示历史消息
    │
    └── URL 无 id → 检查是否有活跃对话
        ├── 有 → 加载活跃对话
        └── 无 → 等待用户发第一条消息 → createConversation() → sendMessage()

用户发送消息
    │
    ├── chatStore.sendMessage(content)
    │   ├── 添加 user message 到 messages
    │   ├── POST /api/chat/conversations/:id/messages
    │   └── consumeSSE → 逐 token 更新 streamingContent
    │
    └── UI 更新
        ├── MessageList 自动滚动到底部
        ├── streamingContent 实时渲染到 Agent 气泡
        ├── tool_call → 显示 TypingIndicator + "正在记录..."
        ├── tool_result → 渲染 DataCard
        └── done → 完成，输入栏恢复可用
```

### 9.2 数据看板页 (`/dashboard`)

```
页面加载
    │
    ├── 并行请求：
    │   ├── api.getDashboardSummary()   → BabyInfoCard
    │   ├── api.getGrowthChart()        → GrowthChart
    │   ├── api.getFeedingStats(7)      → FeedingStats
    │   ├── api.getSleepStats(7)        → SleepStats
    │   └── api.getHealthRecords()      → HealthTimeline
    │
    └── 各组件独立加载态（skeleton），互不阻塞

Tracker 记录列表（按数据域 Tab 切换）：
    │
    ├── 用户切换 Tab（生长/喂养/睡眠/健康）
    │   → api.getGrowthRecords() / getFeedingRecords() / getSleepRecords() / getHealthRecords()
    │   → TrackerRecordList
    │
    ├── 编辑记录 → api.updateTrackerRecord(type, id, updates)
    │   → 成功后刷新当前 Tab 的记录列表 + 相关统计组件
    │
    └── 删除记录 → 二次确认 → api.deleteTrackerRecord(type, id)
        → 成功后刷新当前 Tab 的记录列表 + 相关统计组件

下拉刷新 → 重新请求所有数据
```

### 9.3 相册页 (`/album`)

```
页面加载
    │
    ├── 默认 view=timeline
    ├── api.getPhotos({ view: 'timeline' }) → PhotoGrid
    │
    ├── 用户切换浏览模式（timeline/scene/milestone）
    │   → api.getPhotos({ view: selected }) → 更新 PhotoGrid
    │
    ├── 用户点击照片 → PhotoViewer（全屏预览 + 标签展示）
    │   └── 里程碑标签可确认 → api.confirmTag()
    │
    └── 用户上传照片 → UploadButton
        → api.uploadPhoto(file)
        → 返回 Photo（含 AI 标签）
        → 更新照片列表
```

### 9.4 我的页面 (`/profile`)

```
页面加载
    │
    ├── 并行请求：
    │   ├── api.getMyProfile()     → ProfileItemList（画像条目列表）
    │   ├── api.getBaby()          → 宝宝档案卡片（可编辑）
    │   └── (Admin) api.getUsers() → FamilyMemberManager（家庭成员列表）
    │
    └── 非 Admin 用户不渲染 FamilyMemberManager，不发 getUsers() 请求
        角色判断来自 authStore.user.role

画像管理：
    │
    ├── 编辑条目 → api.updateProfileItem(id, content) → 成功后更新本地列表
    └── 删除条目 → 二次确认 → api.deleteProfileItem(id) → 成功后更新本地列表

宝宝档案编辑：
    │
    └── 修改字段 → api.updateBaby(data) → 成功后更新本地显示

家庭成员权限管理（Admin only）：
    │
    ├── 修改 Family 成员权限（can_upload_photos / can_write_tracker）
    │   → api.updateUserPermissions(id, permissions)
    │   → 成功后更新本地成员列表
    │
    └── 如果修改的是当前登录用户自身的权限（Admin 修改自己不会发生，
        但 Admin 修改了另一个已登录的 family 用户的权限），
        被修改用户需下次 loadFromStorage() / getMe() 时才会刷新权限
```

### 9.5 登录页 (`/login`)

```
页面加载
    │
    ├── authStore.isAuthenticated? → 是 → 重定向到 /chat
    │
    └── 显示登录表单（用户名 + 密码）
        │
        └── 提交 → authStore.login(username, password)
            ├── 成功 → token 存入 localStorage → 重定向到 /chat
            └── 失败 → 显示错误提示
```

---

## 10. Tailwind 主题配置

将 DESIGN.md 的 design tokens 映射为 Tailwind 配置：

```typescript
// tailwind.config.ts — 核心扩展部分

{
  theme: {
    extend: {
      colors: {
        // Brand
        'fawn-amber': '#D4956A',
        'fawn-amber-light': '#F2DFD0',
        'sage-green': '#7FB685',
        'sage-green-light': '#DFF0E2',
        // Neutral
        'soft-charcoal': '#2C2C2E',
        'dark-gray': '#636366',
        'mid-gray': '#8E8E93',
        'oat-border': '#E5DED5',
        'warm-gray': '#F2EDE8',
        'warm-cream': '#FFF9F4',
        // Semantic
        'safety-red': '#E25B45',
        'safety-red-light': '#FDEEEB',
        'warning-amber': '#F0A030',
        'warning-amber-light': '#FFF3E0',
        'info-blue': '#5B9BD5',
        'info-blue-light': '#EBF3FB',
      },
      borderRadius: {
        'card': '16px',
        'bubble': '20px',
        'input': '20px',
        'chip': '16px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC',
               'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue',
               'Helvetica', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04)',
        'float': '0 4px 12px rgba(0,0,0,0.08)',
        'modal': '0 8px 24px rgba(0,0,0,0.12)',
      },
      maxWidth: {
        'mobile': '428px',
      },
    },
  },
}
```

---

## 11. CSS 自定义属性

```css
/* globals.css — design tokens */

:root {
  --color-canvas: #FFF9F4;
  --color-card: #FFFFFF;
  --color-brand: #D4956A;
  --color-brand-light: #F2DFD0;
  --color-text-primary: #2C2C2E;
  --color-text-secondary: #636366;
  --color-text-placeholder: #8E8E93;
  --color-border: #E5DED5;
  --color-bubble-agent: #F2EDE8;
  --color-bubble-user: #D4956A;
  --color-safety: #E25B45;
  --color-safety-bg: #FDEEEB;
  --color-success: #7FB685;

  --radius-card: 16px;
  --radius-bubble: 20px;
  --radius-input: 20px;

  --safe-area-bottom: env(safe-area-inset-bottom, 0px);

  --transition-fast: 150ms ease-out;
  --transition-page: 250ms ease-in-out;
  --transition-bubble: 200ms ease-out;
}
```

---

## 12. 测试策略

### 12.1 工具

| 工具 | 用途 |
|------|------|
| Vitest | 测试框架（兼容 Jest API，更快） |
| React Testing Library | 组件渲染 + 交互测试 |
| MSW (Mock Service Worker) | 后期 API 集成测试可选 |

### 12.2 测试范围

| 层级 | 范围 | 重点 |
|------|------|------|
| 组件测试 | UI 组件渲染、交互、props 变体 | MessageBubble（不同类型）、ChatInput（发送/禁用）、DataCard（数据渲染） |
| Store 测试 | Zustand store 状态变更逻辑 | auth-store（login/logout/restore）、chat-store（sendMessage/SSE 流程） |
| API 测试 | mock API 层的接口正确性 | 请求参数、响应格式 |
| 页面测试 | 页面级集成（路由、数据加载） | 对话页完整流程、登录→重定向 |

### 12.3 不测什么

- 不测 Tailwind 样式是否正确渲染（视觉验证通过浏览器手动检查）
- 不测 Next.js 框架行为（SSR、路由等）
- 不测 Recharts 图表渲染细节（只测数据是否传入）

---

## 13. 前后端对接契约

### 13.1 开发阶段

前端使用 mock API 层独立开发，mock 数据结构与后端 spec 的 API 响应格式严格一致。

### 13.2 对接切换

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_USE_MOCK=false
```

Mock → 真实后端的切换通过环境变量，不需要修改任何组件代码。

### 13.3 照片 URL

前端不直接访问 MinIO。后端提供照片访问端点（或预签名 URL），前端通过 `photo.storage_url` 字段获取可访问的图片地址。

### 13.4 CORS

后端 FastAPI 需配置 CORS 允许前端域名（开发阶段 `localhost:3000`）。

---

## 14. 验收标准

### 核心交互

- [ ] 登录：输入用户名密码登录，JWT 存储到 localStorage，刷新页面保持登录态
- [ ] 对话（文字）：发送文字消息，SSE 流式接收 Agent 回复，逐字显示
- [ ] 对话（图片）：选择图片 → 预览缩略图 → 可移除 → 发送后 Agent 能理解图片内容
- [ ] 数据卡片：Agent 回复中的 tool_result 渲染为对应类型的数据卡片
- [ ] 安全提醒：message_type 为 safety_alert 的消息渲染为红色边框/背景样式
- [ ] 历史对话：进入历史页面，按日期浏览和关键词搜索

### 数据管理

- [ ] 数据看板：展示宝宝概要、生长曲线（含 WHO 参考线）、喂养/睡眠统计、健康时间线
- [ ] Tracker 记录列表：各数据域可查看历史记录列表
- [ ] Tracker 编辑：点击记录可编辑字段，提交后更新
- [ ] Tracker 删除：可删除错误记录，删除前二次确认

### 相册

- [ ] 照片上传、三种浏览模式切换、点击预览、里程碑标签确认

### 权限

- [ ] Family 权限控制：can_upload_photos=false 时隐藏上传按钮，can_write_tracker=false 时隐藏编辑/删除操作
- [ ] Admin 成员管理：Admin 可在"我的"页面查看家庭成员列表、修改 Family 成员权限

### 个人中心

- [ ] 查看/编辑/删除画像条目、查看/编辑宝宝档案

### 工程

- [ ] Mobile-First：在 375px-428px 宽度下所有页面布局正确，触控区域 ≥ 44px
- [ ] 导航：底部 Tab 切换正确，对话页显示输入栏替代 Tab
- [ ] Mock 独立：`NEXT_PUBLIC_USE_MOCK=true` 时全部功能可用，无需后端
- [ ] 全部测试通过：`npm run test` 通过

# Fawn — 后端设计 Spec

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-04-28 |
| 状态 | draft |
| 依赖 | PRD-v1.md (approved) |

---

## 1. 概述

本文档是 Fawn 后端的实现级设计 spec，基于已批准的 PRD-v1.md，补充 PRD 未覆盖的实现细节：API 端点设计、数据库完整 schema、LangGraph Agent 实现方案、流式协议、模块接口契约和测试策略。

### 1.1 与 PRD 的差异

| 主题 | PRD 设计 | 本 Spec 调整 | 原因 |
|------|---------|-------------|------|
| 红旗规则引擎 | 独立确定性安全层，不依赖 LLM | 移除独立模块，安全指引放入 System Prompt | 家庭自用产品，可容忍 LLM 少量误判，大幅简化架构 |
| Agent 架构 | 确定性管道（红旗→意图→路由→模块→安全约束→记忆） | 纯 ReAct Agent（LLM 自主决定 Tool 调用） | 去掉确定性安全层后，不再需要多阶段管道 |
| Auth 认证 | 完整 JWT + 自助注册 + Admin 管理界面 | 简化 JWT，家庭成员通过配置/脚本预设 | 家庭自用无需自助注册，降低实现复杂度 |

### 1.2 技术选型总览

| 组件 | 选型 |
|------|------|
| 后端框架 | FastAPI (async) |
| Agent 编排 | LangGraph (ReAct Agent) |
| ORM | SQLAlchemy 2.0 (async) + Alembic |
| 依赖管理 | uv |
| LLM 接入 | LangChain ChatModel (ChatAnthropic / ChatOpenAI) + 配置驱动工厂函数 |
| 流式输出 | SSE (Server-Sent Events) |
| 数据库 | PostgreSQL + pgvector |
| 缓存 | Redis（可选，初期可不部署，见第 12.3 节说明） |
| 对象存储 | MinIO |
| 测试 | pytest + pytest-asyncio + httpx |

---

## 2. 项目结构

```
backend/
├── pyproject.toml              # uv 项目配置
├── alembic.ini
├── alembic/                    # 数据库迁移
│
├── src/fawn/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app 入口
│   ├── config.py               # pydantic-settings 配置
│   ├── dependencies.py         # FastAPI 依赖注入（DB session, 当前用户等）
│   │
│   ├── api/                    # API 路由层
│   │   ├── __init__.py
│   │   ├── router.py           # 汇总所有路由
│   │   ├── auth.py             # 登录、刷新、当前用户
│   │   ├── chat.py             # 对话 + SSE 流式
│   │   ├── tracker.py          # 数据看板 CRUD
│   │   ├── dashboard.py        # 聚合统计数据
│   │   ├── album.py            # 照片上传/浏览
│   │   ├── profile.py          # 用户画像
│   │   ├── baby.py             # 宝宝档案
│   │   └── schemas.py          # Pydantic request/response 模型
│   │
│   ├── agent/                  # LangGraph Agent
│   │   ├── __init__.py
│   │   ├── graph.py            # ReAct 图定义
│   │   ├── state.py            # AgentState 类型定义
│   │   ├── prompts.py          # System Prompt 模板
│   │   └── tools/              # Agent 可调用的 Tools
│   │       ├── __init__.py
│   │       ├── tracker.py      # 数据记录 + 查询
│   │       ├── advisor.py      # RAG 知识库检索
│   │       ├── album.py        # 照片浏览
│   │       ├── memory.py       # 记忆检索
│   │       └── profile.py      # 画像管理
│   │
│   ├── models/                 # SQLAlchemy ORM 模型
│   │   ├── __init__.py
│   │   ├── base.py             # Base class + 通用 mixins（id, timestamps）
│   │   ├── user.py
│   │   ├── baby.py
│   │   ├── conversation.py     # conversations + messages + summaries
│   │   ├── tracker.py          # growth/feeding/sleep/health records
│   │   ├── album.py            # photos + photo_tags
│   │   ├── profile.py          # profile_items
│   │   └── knowledge.py        # knowledge_documents + knowledge_chunks
│   │
│   ├── services/               # 业务逻辑层
│   │   ├── __init__.py
│   │   ├── auth.py             # JWT 签发/验证、密码哈希
│   │   ├── memory.py           # 三层记忆管理（摘要生成、画像更新）
│   │   ├── tracker.py          # 数据记录 + WHO 百分位计算
│   │   ├── advisor.py          # RAG 检索编排
│   │   ├── album.py            # 照片存储（MinIO）+ Vision API 分析
│   │   └── profile.py          # 画像 CRUD
│   │
│   ├── llm/
│   │   ├── __init__.py
│   │   └── factory.py          # ChatModel 工厂函数
│   │
│   ├── knowledge/
│   │   ├── __init__.py
│   │   ├── ingest.py           # 离线：文档解析 → 切片 → Embedding → 入库
│   │   └── retriever.py        # 在线：向量相似度检索
│   │
│   └── db/
│       ├── __init__.py
│       └── session.py          # async engine + session factory
│
├── tests/
│   ├── conftest.py             # fixtures（test DB, test client, mock LLM）
│   ├── test_api/               # API 端点测试
│   ├── test_agent/             # Agent tool 调用测试
│   └── test_services/          # 业务逻辑测试
│
├── scripts/
│   ├── seed_users.py           # 初始化家庭成员（读取配置）
│   ├── seed_who_data.py        # 导入 WHO 生长参考数据
│   └── ingest_knowledge.py     # 知识库文档导入
│
└── docker/
    └── Dockerfile
```

**分层职责：**

| 层 | 职责 | 依赖方向 |
|---|---|---|
| `api/` | HTTP 路由、请求校验、认证、SSE 响应 | → services, agent |
| `agent/` | LangGraph 图定义、Tool 声明、Prompt 管理 | → services |
| `services/` | 业务逻辑、数据访问、外部 API 调用 | → models, llm, knowledge |
| `models/` | SQLAlchemy 模型定义 | 无依赖 |
| `llm/` | LLM 实例化 | 无依赖 |
| `knowledge/` | RAG 切片与检索 | → models |

依赖规则：上层可调用下层，下层不可反向依赖上层。`api/` 不直接访问 `models/`，通过 `services/` 间接访问。

---

## 3. 数据库 Schema

所有表使用 UUID 主键（`id`）和时间戳（`created_at`, `updated_at`），通过 SQLAlchemy mixin 统一提供。

### 3.1 用户与认证

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'parent', 'family')),
    avatar_url  VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

初始家庭成员通过 `scripts/seed_users.py` 从配置创建，密码使用 bcrypt 哈希。

### 3.2 宝宝档案

```sql
CREATE TABLE babies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    gender          VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    birth_date      DATE NOT NULL,
    birth_weight_g  INTEGER,
    birth_height_cm DECIMAL(5,2),
    birth_head_cm   DECIMAL(5,2),
    is_premature    BOOLEAN NOT NULL DEFAULT FALSE,
    gestational_weeks INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

单家庭场景下通常只有一条记录。`gestational_weeks` 仅在 `is_premature=true` 时有意义，用于校正月龄计算。

### 3.3 对话与记忆

```sql
CREATE TABLE conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text', 'image', 'data_card', 'safety_alert')),
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE conversation_summaries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id),
    summary         TEXT NOT NULL,
    key_topics      JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `messages` 是全量存档，永久保存
- `conversation_summaries` 是长期记忆，每次对话结束后由 LLM 生成
- `metadata` JSONB 存放数据卡片内容、图片引用等结构化附加信息

### 3.4 用户画像

```sql
CREATE TABLE profile_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id),
    content                 TEXT NOT NULL,
    source_conversation_id  UUID REFERENCES conversations(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_items_user ON profile_items(user_id);
```

### 3.5 Tracker 数据

```sql
-- 生长记录
CREATE TABLE growth_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id                 UUID NOT NULL REFERENCES babies(id),
    recorded_by             UUID NOT NULL REFERENCES users(id),
    measurement_date        DATE NOT NULL,
    weight_g                INTEGER,
    height_cm               DECIMAL(5,2),
    head_cm                 DECIMAL(5,2),
    weight_percentile       DECIMAL(5,2),
    height_percentile       DECIMAL(5,2),
    head_percentile         DECIMAL(5,2),
    source_conversation_id  UUID REFERENCES conversations(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 喂养记录
CREATE TABLE feeding_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id                 UUID NOT NULL REFERENCES babies(id),
    recorded_by             UUID NOT NULL REFERENCES users(id),
    feed_time               TIMESTAMPTZ NOT NULL,
    feed_type               VARCHAR(20) NOT NULL CHECK (feed_type IN ('breast', 'formula', 'solid')),
    amount_ml               INTEGER,
    duration_min            INTEGER,
    notes                   TEXT,
    source_conversation_id  UUID REFERENCES conversations(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feeding_records_time ON feeding_records(baby_id, feed_time);

-- 睡眠记录
CREATE TABLE sleep_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id                 UUID NOT NULL REFERENCES babies(id),
    recorded_by             UUID NOT NULL REFERENCES users(id),
    sleep_start             TIMESTAMPTZ NOT NULL,
    sleep_end               TIMESTAMPTZ,
    night_wakings           INTEGER NOT NULL DEFAULT 0,
    sleep_type              VARCHAR(10) NOT NULL CHECK (sleep_type IN ('nap', 'night')),
    notes                   TEXT,
    source_conversation_id  UUID REFERENCES conversations(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sleep_records_time ON sleep_records(baby_id, sleep_start);

-- 健康记录
CREATE TABLE health_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id                 UUID NOT NULL REFERENCES babies(id),
    recorded_by             UUID NOT NULL REFERENCES users(id),
    record_date             DATE NOT NULL,
    record_type             VARCHAR(20) NOT NULL CHECK (record_type IN ('vaccination', 'illness', 'checkup')),
    title                   VARCHAR(200) NOT NULL,
    description             TEXT,
    source_conversation_id  UUID REFERENCES conversations(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_records_date ON health_records(baby_id, record_date);
```

所有 Tracker 表都有 `source_conversation_id`：通过对话记录的数据会关联来源对话，支持追溯。

### 3.6 WHO 生长参考

```sql
CREATE TABLE who_growth_reference (
    id          SERIAL PRIMARY KEY,
    gender      VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    indicator   VARCHAR(10) NOT NULL CHECK (indicator IN ('weight', 'height', 'head')),
    age_months  DECIMAL(5,2) NOT NULL,
    l_value     DECIMAL(10,6) NOT NULL,
    m_value     DECIMAL(10,6) NOT NULL,
    s_value     DECIMAL(10,6) NOT NULL
);

CREATE UNIQUE INDEX idx_who_ref_lookup
    ON who_growth_reference(gender, indicator, age_months);
```

WHO LMS 数据通过 `scripts/seed_who_data.py` 导入。百分位计算公式（确定性，不走 LLM）：

```
Z = ((value / M) ^ L - 1) / (L * S)    当 L ≠ 0
Z = ln(value / M) / S                  当 L = 0
百分位 = Φ(Z) × 100                     Φ 为标准正态分布 CDF
```

### 3.7 相册

```sql
CREATE TABLE photos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baby_id           UUID NOT NULL REFERENCES babies(id),
    uploaded_by       UUID NOT NULL REFERENCES users(id),
    storage_key       VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    mime_type         VARCHAR(100) NOT NULL,
    file_size_bytes   INTEGER NOT NULL,
    taken_at          TIMESTAMPTZ,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photos_time ON photos(baby_id, taken_at);

CREATE TABLE photo_tags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    photo_id     UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    tag_type     VARCHAR(20) NOT NULL CHECK (tag_type IN ('scene', 'expression', 'milestone')),
    tag_value    VARCHAR(200) NOT NULL,
    confidence   DECIMAL(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_photo_tags_photo ON photo_tags(photo_id);
CREATE INDEX idx_photo_tags_type ON photo_tags(tag_type, tag_value);
```

- `storage_key` 格式：`/{baby_id}/{year}/{month}/{uuid}.{ext}`
- `taken_at` 优先从 EXIF 提取，无 EXIF 则用上传时间
- `is_confirmed` 仅对 `milestone` 类型的 tag 有意义

### 3.8 知识库

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        VARCHAR(500) NOT NULL,
    author       VARCHAR(200),
    source       VARCHAR(500) NOT NULL,
    publish_date DATE,
    file_key     VARCHAR(500) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_chunks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content       TEXT NOT NULL,
    chapter_title VARCHAR(500),
    chunk_index   INTEGER NOT NULL,
    embedding     vector(1536) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_document ON knowledge_chunks(document_id, chunk_index);
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

- Embedding 维度 1536 对应 `text-embedding-3-small`；如使用 `bge-m3` 则改为 1024
- IVFFlat 索引在数据量小时（< 10 万条）性能足够，无需 HNSW

---

## 4. API 端点设计

所有端点前缀 `/api`。需要认证的端点通过 `Authorization: Bearer <token>` header 传递 JWT。

### 4.1 Auth

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录，返回 JWT token | 否 |
| POST | `/api/auth/refresh` | 刷新 token | 是 |
| GET | `/api/auth/me` | 获取当前用户信息 | 是 |

**POST /api/auth/login**

```json
// Request
{ "username": "mama", "password": "..." }

// Response 200
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "username": "mama",
    "display_name": "妈妈",
    "role": "parent",
    "avatar_url": null
  }
}
```

### 4.2 Chat

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/chat/conversations` | 创建新对话 | 是 |
| GET | `/api/chat/conversations` | 对话列表（分页） | 是 |
| GET | `/api/chat/conversations/:id` | 对话详情 + 消息 | 是 |
| POST | `/api/chat/conversations/:id/messages` | 发消息 → SSE 流式响应 | 是 |
| GET | `/api/chat/search` | 搜索历史对话 | 是 |

**POST /api/chat/conversations/:id/messages**

这是核心端点。请求为普通 JSON，响应为 SSE 流：

```json
// Request
{ "content": "宝宝今天体重4.2kg，是不是偏轻了？" }
```

```
// Response: text/event-stream

data: {"type": "token", "content": "已"}
data: {"type": "token", "content": "记录"}
data: {"type": "tool_call", "name": "record_growth", "args": {"weight_g": 4200, "measurement_date": "2026-04-28"}}
data: {"type": "tool_result", "name": "record_growth", "result": {"weight_percentile": 35.2, "message": "已记录体重 4.2kg"}}
data: {"type": "token", "content": "根据"}
data: {"type": "token", "content": "WHO"}
...
data: {"type": "done", "message_id": "uuid"}
```

SSE 事件类型：

| type | 说明 | 前端处理 |
|------|------|---------|
| `token` | LLM 输出的文本 token | 逐字追加到 Agent 气泡 |
| `tool_call` | Agent 决定调用 Tool | 显示"正在查询..."指示 |
| `tool_result` | Tool 执行结果 | 渲染为数据卡片（生长数据、统计等） |
| `done` | 流结束 | 结束加载态，保存 message_id |
| `error` | 错误 | 显示错误提示 |

**GET /api/chat/conversations**

```json
// Response 200
{
  "items": [
    {
      "id": "uuid",
      "started_at": "2026-04-28T10:00:00Z",
      "ended_at": "2026-04-28T10:30:00Z",
      "is_active": false,
      "summary": "讨论了宝宝体重和喂养量",
      "message_count": 12
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```

**GET /api/chat/search?q=体重**

```json
// Response 200
{
  "items": [
    {
      "conversation_id": "uuid",
      "message_id": "uuid",
      "content": "宝宝今天体重4.2kg...",
      "role": "user",
      "created_at": "2026-04-28T10:05:00Z",
      "conversation_started_at": "2026-04-28T10:00:00Z"
    }
  ],
  "total": 5
}
```

搜索实现：PostgreSQL `ILIKE '%keyword%'` 对 `messages.content` 做模糊匹配。家庭级数据量足够。

### 4.3 Tracker

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/tracker/growth` | 生长记录列表（含百分位） | 是 |
| GET | `/api/tracker/feeding` | 喂养记录（可按日期筛选） | 是 |
| GET | `/api/tracker/sleep` | 睡眠记录（可按日期筛选） | 是 |
| GET | `/api/tracker/health` | 健康时间线 | 是 |

查询参数：`?date=2026-04-28`（单日）、`?from=2026-04-21&to=2026-04-28`（范围）、`?limit=20&offset=0`（分页）。

数据录入主要通过对话（Agent Tool 写入），这些端点供前端数据看板直接读取。

### 4.4 Dashboard

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/dashboard/summary` | 宝宝概要 + 最新数据 | 是 |
| GET | `/api/dashboard/growth-chart` | 生长曲线数据（含 WHO 参考线） | 是 |
| GET | `/api/dashboard/feeding-stats` | 喂养统计（可指定天数） | 是 |
| GET | `/api/dashboard/sleep-stats` | 睡眠统计（可指定天数） | 是 |

**GET /api/dashboard/summary**

```json
{
  "baby": {
    "name": "小宝",
    "gender": "male",
    "birth_date": "2026-03-01",
    "age_days": 58,
    "age_display": "1个月28天"
  },
  "latest_growth": {
    "date": "2026-04-28",
    "weight_g": 4200,
    "weight_percentile": 35.2,
    "height_cm": 55.0,
    "height_percentile": 42.1
  },
  "today_feeding": {
    "total_ml": 480,
    "count": 6,
    "last_feed_time": "2026-04-28T14:30:00Z"
  },
  "today_sleep": {
    "total_hours": 14.5,
    "night_wakings": 2
  }
}
```

**GET /api/dashboard/growth-chart**

```json
{
  "records": [
    {"date": "2026-03-15", "weight_g": 3500, "height_cm": 51.0, "head_cm": 35.0}
  ],
  "who_reference": {
    "weight": {
      "p3": [{"age_months": 0, "value": 2500}, ...],
      "p15": [...],
      "p50": [...],
      "p85": [...],
      "p97": [...]
    }
  }
}
```

### 4.5 Album

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/album/photos` | 上传照片（multipart/form-data） | 是 |
| GET | `/api/album/photos` | 浏览照片 | 是 |
| GET | `/api/album/photos/:id` | 照片详情 + 标签 | 是 |
| PATCH | `/api/album/photos/:id/tags/:tagId` | 确认/编辑标签 | 是 |

**GET /api/album/photos** 查询参数：

- `view=timeline|scene|milestone` — 浏览模式
- `scene=eating|sleeping|outdoor|bathing` — 按场景筛选
- `month=2026-04` — 按月筛选
- `limit=20&offset=0` — 分页

**POST /api/album/photos** 处理流程：

1. 接收 multipart 文件
2. 提取 EXIF 时间信息
3. 存入 MinIO（路径：`/{baby_id}/{year}/{month}/{uuid}.{ext}`）
4. 调用 Vision API 分析照片（同步 await，家庭场景无并发压力，无需后台任务队列）
5. 生成标签写入 `photo_tags`
6. 返回照片 ID + 标签

### 4.6 Profile & Baby

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/profile/me` | 获取我的画像条目列表 | 是 |
| PUT | `/api/profile/items/:id` | 编辑画像条目 | 是 |
| DELETE | `/api/profile/items/:id` | 删除画像条目 | 是 |
| GET | `/api/baby` | 获取宝宝档案 | 是 |
| PUT | `/api/baby` | 更新宝宝档案 | 是（Parent+） |

---

## 5. LangGraph Agent 设计

### 5.1 State 定义

```python
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    user_id: str
    user_role: str
    user_name: str
    conversation_id: str
```

`messages` 由 LangGraph 的 `add_messages` reducer 自动管理追加。其余字段在图调用时注入，Tool 函数通过 state 访问用户上下文。

### 5.2 图结构

标准 ReAct 循环：

```
          ┌──────────────────┐
          │                  │
START ──→ agent_node ──→ tool_node ──→ agent_node ──→ ... ──→ END
          │                                                    ↑
          └── (无 tool_call 时直接结束) ───────────────────────┘
```

- **agent_node**：将 messages + system prompt 发给 LLM，LLM 决定是否调用 Tool
  - 有 tool_call → 转到 tool_node
  - 无 tool_call → 直接输出回复，转到 END
- **tool_node**：执行 Tool 函数，将结果作为 ToolMessage 追加到 messages，返回 agent_node

单次对话可能触发多轮 Tool 调用（如"记录体重 + 查询 WHO 百分位 + 检索知识库"）。

### 5.3 Checkpointing

使用 `langgraph-checkpoint-postgres`：

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

checkpointer = AsyncPostgresSaver.from_conn_string(DATABASE_URL)
graph = graph_builder.compile(checkpointer=checkpointer)

# 每次调用时指定 thread_id = conversation_id
config = {"configurable": {"thread_id": conversation_id}}
```

每个 `conversation_id` 对应一个 thread，LangGraph 自动持久化对话状态（短期记忆）。

### 5.4 Tools 定义

共 12 个 Tool，分为记录类和查询类：

**记录类 Tools（写入数据）：**

| Tool | 参数 | 说明 |
|------|------|------|
| `record_growth` | weight_g?, height_cm?, head_cm?, measurement_date | 记录生长数据，自动计算 WHO 百分位 |
| `record_feeding` | feed_time, feed_type, amount_ml?, duration_min?, notes? | 记录喂养事件 |
| `record_sleep` | sleep_start, sleep_end?, night_wakings?, sleep_type, notes? | 记录睡眠事件 |
| `record_health` | record_date, record_type, title, description? | 记录健康事件 |

**查询类 Tools（读取数据）：**

| Tool | 参数 | 说明 |
|------|------|------|
| `query_growth_data` | days? (默认 90) | 返回生长记录 + 百分位趋势 |
| `query_feeding_data` | date? (默认今天) | 返回指定日期的喂养记录和统计 |
| `query_sleep_data` | date? (默认今天) | 返回指定日期的睡眠记录和统计 |
| `query_health_timeline` | limit? (默认 20) | 返回健康事件时间线 |
| `search_knowledge` | query | RAG 检索，返回 Top-K 相关段落 + 来源标注 |
| `get_baby_profile` | 无 | 返回宝宝基本档案（姓名、性别、出生日期、月龄等） |
| `browse_photos` | view?, scene?, limit? | 浏览照片列表 |
| `update_user_profile` | action (add/update/delete), content?, item_id? | 管理用户画像条目 |

Tool 函数通过 `RunnableConfig` 获取 state 中的 `user_id`、`conversation_id` 等上下文。

### 5.5 System Prompt

```
你是 Fawn，一个温暖、专业的家庭育儿助手，专注于 0-6 个月婴儿的成长陪伴。

## 安全原则
- 遇到疾病症状（发热、咳嗽、腹泻、呕吐、皮疹、黄疸等）或异常体征（呼吸异常、拒食、嗜睡、抽搐等），
  提醒家长尽快咨询医生或就医。不做任何诊断、用药或治疗建议。
- 所有健康相关回答附带"以医生意见为准"。

## 当前对话者
- 姓名：{user_name}
- 角色：{user_role}
- 画像：
{profile_summary}

## 宝宝档案
{baby_summary}

## 历史上下文
{recent_summaries}

## 行为规范
- 记录数据后明确反馈确认内容（"已记录体重 4.2kg"）
- 引用知识库内容时标注来源（书名、章节）
- 回答中使用中文
- 根据对话者的角色和画像调整语气和侧重点
- 当知识库中未找到相关信息时，坦诚告知，建议咨询专业人士
```

**动态注入流程：** 每次对话请求进入时，从数据库加载当前用户画像、宝宝档案、最近 N 条对话摘要，拼接进 System Prompt。

---

## 6. 记忆系统

### 6.1 三层架构

| 层级 | 存储 | 实现 | 生命周期 |
|------|------|------|---------|
| 短期记忆 | LangGraph checkpoint (PostgreSQL) | 自动管理，每个 conversation 一个 thread | 会话期间 |
| 长期记忆 | `conversation_summaries` 表 | 对话结束时 LLM 生成摘要 | 永久 |
| 全量存档 | `messages` 表 | 所有消息实时写入 | 永久 |

### 6.2 会话生命周期

```
用户发送消息（无活跃会话）
    │
    ▼
前端调用 POST /api/chat/conversations → 创建新会话
    │
    ▼
加载上下文 → 注入 System Prompt：
  ├── 用户画像（profile_items → profile_summary）
  ├── 宝宝档案（babies 表）
  └── 最近 10 条对话摘要（conversation_summaries）
    │
    ▼
对话进行中：
  ├── 消息实时写入 messages 表
  └── LangGraph checkpoint 自动持久化对话状态
    │
    ▼
对话结束（用户新建对话 或 30 分钟超时）
    │
    ▼
触发结束流程（异步）：
  ├── 1. 调用 LLM 生成对话摘要 → 写入 conversation_summaries
  ├── 2. 调用 LLM 判断是否有新的用户认知 → 更新 profile_items
  └── 3. 标记 conversations.is_active = false, ended_at = now()
```

### 6.3 超时检测

不需要后台定时任务。在以下时机检查：

- 用户发送新消息时，检查当前活跃会话的最后一条消息时间
- 如果距上次消息 > 30 分钟，先触发旧会话的结束流程，再创建新会话
- 前端也可在本地判断超时，主动调用创建新会话接口

---

## 7. LLM 工厂函数

### 7.1 配置

```python
class LLMConfig(BaseSettings):
    # 默认 LLM
    default_provider: str = "anthropic"          # anthropic | openai
    default_model: str = "claude-sonnet-4-20250514"

    # 可选：按用途覆盖（不设置则用默认）
    summary_provider: str | None = None          # 摘要生成（可用更便宜的模型）
    summary_model: str | None = None
    vision_provider: str | None = None           # 照片分析
    vision_model: str | None = None
    embedding_model: str = "text-embedding-3-small"

    # API Keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
```

### 7.2 工厂函数

```python
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.language_models import BaseChatModel

def create_chat_model(purpose: str = "default") -> BaseChatModel:
    """根据用途返回对应的 ChatModel 实例。

    purpose: "default" | "summary" | "vision"
    """
    config = get_settings().llm

    # 确定 provider 和 model
    provider = getattr(config, f"{purpose}_provider", None) or config.default_provider
    model = getattr(config, f"{purpose}_model", None) or config.default_model

    if provider == "anthropic":
        return ChatAnthropic(model=model, api_key=config.anthropic_api_key)
    elif provider == "openai":
        return ChatOpenAI(model=model, api_key=config.openai_api_key)
    else:
        raise ValueError(f"Unknown provider: {provider}")
```

---

## 8. RAG 知识库

### 8.1 离线导入流程

```
PDF 文件 → 文档解析（PyMuPDF / pdfplumber）
    → 按段落切片（保留章节标题作为元数据）
    → Embedding（text-embedding-3-small / bge-m3）
    → 写入 knowledge_chunks 表（含 vector）
```

通过 `scripts/ingest_knowledge.py` 脚本执行。支持增量导入（按 document_id 去重）。

切片策略：
- 按段落分割，单个 chunk 目标 300-500 字
- 每个 chunk 保留所属章节标题作为 `chapter_title` 字段
- 相邻 chunk 之间有 50 字重叠，减少语义断裂

### 8.2 在线检索

```python
async def search_knowledge(query: str, top_k: int = 5) -> list[KnowledgeResult]:
    query_embedding = await embed(query)
    results = await db.execute(
        select(KnowledgeChunk)
        .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    )
    return [
        KnowledgeResult(
            content=chunk.content,
            source=chunk.document.title,
            chapter=chunk.chapter_title,
            score=1 - distance
        )
        for chunk in results
    ]
```

### 8.3 低置信度处理

- 检索结果的 cosine similarity 全部低于 0.7 时，Tool 返回结果中标记 `low_confidence=true`
- System Prompt 指导 Agent 在这种情况下坦诚告知："知识库中未找到相关信息，建议咨询医生或查阅专业资料"

---

## 9. SSE 流式实现

### 9.1 FastAPI 端点

```python
from fastapi.responses import StreamingResponse

@router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: SendMessageRequest, user: User = Depends(get_current_user)):
    # 1. 保存用户消息到 messages 表
    # 2. 构建 agent input 和 config
    # 3. 流式执行 agent 并逐事件返回

    async def event_stream():
        config = {"configurable": {"thread_id": conv_id}}
        input_message = HumanMessage(content=body.content)

        async for event in graph.astream_events(
            {"messages": [input_message], "user_id": user.id, ...},
            config=config,
            version="v2"
        ):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                token = event["data"]["chunk"].content
                if token:
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            elif kind == "on_tool_start":
                yield f"data: {json.dumps({'type': 'tool_call', 'name': event['name'], 'args': event['data'].get('input', {})})}\n\n"

            elif kind == "on_tool_end":
                yield f"data: {json.dumps({'type': 'tool_result', 'name': event['name'], 'result': event['data'].get('output', '')})}\n\n"

        # 4. 保存 assistant 完整回复到 messages 表
        yield f"data: {json.dumps({'type': 'done', 'message_id': str(msg_id)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### 9.2 前端消费协议

前端使用 `fetch` + `ReadableStream` 读取 SSE（不使用 `EventSource`，因为需要 POST + 自定义 headers）：

```
1. POST 请求发出
2. 逐行读取 SSE 事件
3. type=token → 追加到 Agent 气泡文本
4. type=tool_call → 显示"正在记录..."或"正在查询..."
5. type=tool_result → 渲染为数据卡片组件
6. type=done → 结束加载态
7. type=error → 显示错误提示
```

---

## 10. 认证实现

### 10.1 JWT 方案

- **库：** PyJWT (pyjwt)
- **密码哈希：** bcrypt (passlib[bcrypt])
- **Token 有效期：** 24 小时（`JWT_EXPIRE_MINUTES=1440`）
- **刷新策略：** 前端在 token 过期前调用 refresh 端点获取新 token

**JWT Payload：**
```json
{
  "sub": "user_uuid",
  "role": "parent",
  "exp": 1234567890
}
```

### 10.2 FastAPI 依赖

```python
async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=401)
    return user
```

### 10.3 家庭成员初始化

不做自助注册。通过 `scripts/seed_users.py` 读取配置创建初始用户：

```yaml
# config/family.yaml
family:
  - username: mama
    display_name: 妈妈
    role: admin
    password: "..."
  - username: baba
    display_name: 爸爸
    role: parent
    password: "..."
  - username: nainai
    display_name: 奶奶
    role: family
    password: "..."
```

Admin 用户可通过 API 添加/修改/删除家庭成员（未来需要时实现，初期不需要）。

---

## 11. 测试策略

### 11.1 工具与框架

| 工具 | 用途 |
|------|------|
| pytest | 测试框架 |
| pytest-asyncio | 异步测试支持 |
| httpx.AsyncClient | FastAPI 端点测试 |
| factory_boy | 测试数据工厂 |

### 11.2 测试分层

| 层级 | 范围 | 隔离方式 |
|------|------|---------|
| Services 测试 | 业务逻辑（WHO 计算、记忆管理等） | 真实 test DB，事务回滚 |
| API 测试 | 端点功能、认证、响应格式 | httpx.AsyncClient + test DB |
| Agent 测试 | Tool 调用逻辑、Prompt 行为 | Mock LLM 响应，真实 test DB |

### 11.3 数据库测试隔离

每个测试函数运行在独立事务中，测试结束后回滚：

```python
@pytest.fixture
async def db_session(engine):
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn)
        yield session
        await trans.rollback()
```

### 11.4 重点覆盖

- WHO 百分位计算的正确性（已知输入 → 已知输出，确定性验证）
- Tracker 数据记录和查询
- 认证流程（登录、JWT 验证、角色权限）
- SSE 流式响应格式
- 记忆系统（摘要生成触发、画像更新）

---

## 12. 配置管理

### 12.1 pydantic-settings

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    # Database
    database_url: str = "postgresql+asyncpg://fawn:fawn@localhost:5432/fawn"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "fawn"
    minio_use_ssl: bool = False

    # LLM
    llm: LLMConfig = LLMConfig()

    # Auth
    jwt_secret: str
    jwt_expire_minutes: int = 1440

    # Memory
    summary_max_recent: int = 10          # 注入 System Prompt 的最近摘要条数
    session_timeout_minutes: int = 30     # 会话超时时间

    # RAG
    rag_top_k: int = 5
    rag_similarity_threshold: float = 0.7
```

### 12.2 Redis 说明

PRD 中 Redis 用于会话状态缓存、JWT 缓存和宝宝概要缓存。本 spec 调整后：

- **会话状态** → LangGraph 的 AsyncPostgresSaver 直接持久化到 PostgreSQL，不需要 Redis
- **JWT** → 无状态验证（仅解码 token），不需要服务端缓存
- **宝宝概要缓存** → 单家庭场景下 PostgreSQL 查询延迟可忽略，不需要缓存层

因此 **初期可以不部署 Redis**，docker-compose 中保留 Redis 服务定义但标记为 optional profile。如果后续出现性能需求（如频繁加载用户画像/宝宝档案），再引入 Redis 作为缓存层。

### 12.3 环境文件

```env
DATABASE_URL=postgresql+asyncpg://fawn:fawn@postgres:5432/fawn
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key-here
```

---

## 13. Docker 部署

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend/docker
    ports: ["8000:8000"]
    depends_on:
      postgres: { condition: service_healthy }
      minio: { condition: service_healthy }
    env_file: .env
    command: >
      sh -c "alembic upgrade head &&
             python -m scripts.seed_users &&
             python -m scripts.seed_who_data &&
             uvicorn fawn.main:app --host 0.0.0.0 --port 8000"

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]

  postgres:
    image: pgvector/pgvector:pg16
    volumes: [postgres_data:/var/lib/postgresql/data]
    environment:
      POSTGRES_USER: fawn
      POSTGRES_PASSWORD: fawn
      POSTGRES_DB: fawn
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fawn"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    profiles: ["with-cache"]     # 可选，初期不需要部署
    volumes: [redis_data:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio
    volumes: [minio_data:/data]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 5
    ports: ["9000:9000", "9001:9001"]

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

首次启动自动完成：Alembic migration → 家庭成员初始化 → WHO 数据导入。

---

## 14. 验收标准

- [ ] 对话核心链路：用户发送消息 → SSE 流式返回 Agent 回复，支持多轮对话
- [ ] Tool 调用：Agent 能正确调用 Tracker/Advisor/Album 等 Tools，单次对话可调用多个 Tool
- [ ] 数据记录：通过对话自然语言输入的数据正确写入对应 Tracker 表
- [ ] WHO 百分位：生长数据记录时自动计算百分位，结果与 WHO 标准一致
- [ ] RAG 检索：知识库导入后，相关问题能检索到正确段落并标注来源
- [ ] 记忆系统：对话结束后生成摘要，新对话加载历史上下文
- [ ] 用户画像：Agent 自动维护画像条目，用户可查看/编辑/删除
- [ ] 多角色识别：不同用户登录后 Agent 回复语气和内容有差异
- [ ] 照片上传：照片存入 MinIO，Vision API 自动生成标签
- [ ] 认证：JWT 登录/刷新正常，未认证请求返回 401
- [ ] LLM 可切换：修改配置即可切换 Claude ↔ GPT
- [ ] Docker 部署：`docker compose up` 一键启动，首次自动完成初始化
- [ ] 测试通过：Services 层和 API 层核心测试全部通过

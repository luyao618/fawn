# Fawn — 后端实施计划

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-04-29 |
| 状态 | draft |
| 依赖 | PRD-V2.md (review), BACKEND-DESIGN-V2.md (review), FRONTEND-DESIGN-V2.md (review) |

---

## 目录

- [Phase 0: 项目基础](#phase-0-项目基础)
- [Phase 1: 数据模型 + 迁移](#phase-1-数据模型--迁移)
- [Phase 2: Auth + 核心依赖注入](#phase-2-auth--核心依赖注入)
- [Phase 3: Tracker + Dashboard](#phase-3-tracker--dashboard)
- [Phase 4: LangGraph Agent](#phase-4-langgraph-agent)
- [Phase 5: Chat API + SSE + 记忆系统](#phase-5-chat-api--sse--记忆系统)
- [Phase 6: Album + Profile + RAG](#phase-6-album--profile--rag)
- [Phase 7: 测试 + Docker 部署](#phase-7-测试--docker-部署)
- [依赖关系总览](#依赖关系总览)

---

## Phase 0: 项目基础

**目标：** 搭建后端项目骨架，完成依赖管理、配置系统、数据库连接和 ORM 基础设施。

**交付物：** 可运行的 FastAPI 空壳应用，能连接 PostgreSQL 并执行 Alembic 迁移。

**Task 数量：** 5

---

### P0-T1: uv 项目初始化 + 依赖安装

**做什么：** 使用 uv 初始化 Python 项目，配置 `pyproject.toml`，安装全部后端依赖。参考 Spec 第 1.2 节技术选型和第 2 章项目结构。

**涉及文件：**
- `backend/pyproject.toml`

**依赖：** 无

**验收标准：**
- `uv sync` 成功安装所有依赖，无报错
- `pyproject.toml` 包含以下核心依赖：fastapi、uvicorn、sqlalchemy[asyncio]、asyncpg、alembic、pydantic-settings、langchain-core、langchain-anthropic、langchain-openai、langgraph、langgraph-checkpoint-postgres、pyjwt、passlib[bcrypt]、python-multipart、minio、pgvector、httpx、pymupdf/pdfplumber
- `pyproject.toml` 包含以下开发依赖：pytest、pytest-asyncio、httpx、factory-boy
- 项目 Python 版本 >= 3.12

---

### P0-T2: pydantic-settings 配置

**做什么：** 实现应用配置管理，使用 pydantic-settings 从环境变量 / `.env` 文件加载配置。参考 Spec 第 12 章配置管理。

**涉及文件：**
- `backend/src/fawn/__init__.py`
- `backend/src/fawn/config.py`
- `backend/.env.example`

**依赖：** P0-T1

**验收标准：**
- `Settings` 类包含 Spec 12.1 节定义的全部字段：database_url、minio_*、jwt_secret、jwt_expire_minutes、summary_max_recent、session_timeout_minutes、rag_top_k、rag_similarity_threshold
- `LLMConfig` 嵌套类包含 Spec 7.1 节定义的全部字段：default_provider、default_model、summary_provider/model、vision_provider/model、embedding_model、API keys
- `get_settings()` 函数使用 `lru_cache` 单例模式
- `.env.example` 包含所有配置项的示例值（不含真实密钥）

---

### P0-T3: 数据库连接

**做什么：** 配置 SQLAlchemy 2.0 async engine 和 session factory。参考 Spec 第 2 章项目结构 `db/session.py`。

**涉及文件：**
- `backend/src/fawn/db/__init__.py`
- `backend/src/fawn/db/session.py`

**依赖：** P0-T2

**验收标准：**
- 使用 `create_async_engine` 创建异步引擎，连接字符串从 `Settings.database_url` 读取
- 提供 `async_session_factory`（`async_sessionmaker`）
- 提供 `get_db` 异步生成器（供 FastAPI 依赖注入使用）
- engine 配置 `pool_pre_ping=True`

---

### P0-T4: SQLAlchemy Base class + 通用 mixins

**做什么：** 定义 ORM 模型基类，包含 UUID 主键和时间戳 mixin。参考 Spec 第 3 章"所有表使用 UUID 主键和时间戳"。

**涉及文件：**
- `backend/src/fawn/models/__init__.py`
- `backend/src/fawn/models/base.py`

**依赖：** P0-T3

**验收标准：**
- `Base` 继承自 `DeclarativeBase`
- `TimestampMixin` 提供 `created_at`（TIMESTAMPTZ, server_default=now()）和 `updated_at`（TIMESTAMPTZ, server_default=now(), onupdate=now()）
- `UUIDMixin` 提供 `id`（UUID, server_default=gen_random_uuid()）
- mixin 可被后续 ORM 模型直接继承使用

---

### P0-T5: Alembic 初始化 + FastAPI 入口

**做什么：** 初始化 Alembic 迁移框架，配置异步 PostgreSQL 连接；创建 FastAPI 应用入口。参考 Spec 第 2 章项目结构。

**涉及文件：**
- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/script.py.mako`
- `backend/src/fawn/main.py`

**依赖：** P0-T4

**验收标准：**
- `alembic.ini` 的 `sqlalchemy.url` 从环境变量读取
- `alembic/env.py` 配置异步迁移（使用 `run_async_migrations`），target_metadata 指向 `Base.metadata`
- `main.py` 创建 FastAPI app 实例，配置 CORS（允许 `localhost:3000`），挂载空路由
- `uvicorn fawn.main:app` 能启动（连接数据库前也不报导入错误）

---

## Phase 1: 数据模型 + 迁移

**目标：** 定义全部 SQLAlchemy ORM 模型，生成并执行初始数据库迁移，启用 pgvector 扩展。

**交付物：** 完整的数据库 schema，可通过 `alembic upgrade head` 创建全部表。

**Task 数量：** 4

**Phase 依赖：** Phase 0 全部完成

---

### P1-T1: 用户 + 宝宝模型

**做什么：** 定义 User 和 Baby ORM 模型。参考 Spec 第 3.1 节（users 表）和第 3.2 节（babies 表）。

**涉及文件：**
- `backend/src/fawn/models/user.py`
- `backend/src/fawn/models/baby.py`

**依赖：** P0-T4

**验收标准：**
- `User` 模型字段与 Spec 3.1 节 DDL 完全一致：username (unique)、display_name、password_hash、role (CHECK admin/parent/family)、permissions (JSONB, default)、avatar_url
- `Baby` 模型字段与 Spec 3.2 节 DDL 完全一致：name、gender (CHECK male/female)、birth_date、birth_weight_g、birth_height_cm、birth_head_cm、is_premature、gestational_weeks
- `User.permissions` 默认值为 `{"can_upload_photos": true, "can_write_tracker": false}`，与前端 `UserPermissions` 类型对齐

---

### P1-T2: 对话 + 记忆 + 画像模型

**做什么：** 定义 Conversation、Message、ConversationSummary、ProfileItem ORM 模型。参考 Spec 第 3.3 节和第 3.4 节。

**涉及文件：**
- `backend/src/fawn/models/conversation.py`
- `backend/src/fawn/models/profile.py`

**依赖：** P1-T1

**验收标准：**
- `Conversation` 模型包含 user_id (FK)、started_at、ended_at、is_active 字段
- `Message` 模型包含 conversation_id (FK)、role (CHECK user/assistant)、content、message_type (CHECK text/image/data_card/safety_alert)、metadata (JSONB)；message_type 与前端 `MessageType` 类型对齐
- `ConversationSummary` 模型包含 conversation_id (UNIQUE FK)、summary、key_topics (JSONB)
- `ProfileItem` 模型包含 user_id (FK)、content、source_conversation_id (FK)
- 索引：`idx_messages_conversation` (conversation_id, created_at)、`idx_profile_items_user` (user_id)

---

### P1-T3: Tracker + WHO + Album + 知识库模型

**做什么：** 定义 GrowthRecord、FeedingRecord、SleepRecord、HealthRecord、WhoGrowthReference、Photo、PhotoTag、KnowledgeDocument、KnowledgeChunk ORM 模型。参考 Spec 第 3.5-3.8 节。

**涉及文件：**
- `backend/src/fawn/models/tracker.py`
- `backend/src/fawn/models/album.py`
- `backend/src/fawn/models/knowledge.py`

**依赖：** P1-T1

**验收标准：**
- 四个 Tracker 模型字段与 Spec 3.5 节 DDL 完全一致，均包含 baby_id (FK)、recorded_by (FK)、source_conversation_id (FK)
- `GrowthRecord` 包含 weight_percentile / height_percentile / head_percentile 字段（DECIMAL(5,2), nullable），与前端 `GrowthRecord` 类型对齐
- `FeedingRecord.feed_type` CHECK 约束 (breast/formula/solid)，与前端 `FeedingRecord.feed_type` 对齐
- `SleepRecord.sleep_type` CHECK 约束 (nap/night)，与前端 `SleepRecord.sleep_type` 对齐
- `HealthRecord.record_type` CHECK 约束 (vaccination/illness/checkup)，与前端 `HealthRecord.record_type` 对齐
- `WhoGrowthReference` 使用 SERIAL 主键（非 UUID），包含 gender、indicator、age_months、l_value、m_value、s_value，唯一索引 (gender, indicator, age_months)
- `Photo` 和 `PhotoTag` 字段与 Spec 3.7 节一致，PhotoTag.tag_type CHECK (scene/expression/milestone)，与前端 `PhotoTagType` 对齐
- `KnowledgeChunk.embedding` 使用 `Vector(1536)` 类型，IVFFlat 索引
- 所有索引与 Spec DDL 中的 CREATE INDEX 语句一致

---

### P1-T4: Alembic 初始迁移

**做什么：** 生成包含全部模型的初始迁移文件，迁移中启用 pgvector 扩展。参考 Spec 第 3.8 节 `CREATE EXTENSION IF NOT EXISTS vector`。

**涉及文件：**
- `backend/alembic/versions/001_initial.py`（自动生成）

**依赖：** P1-T1, P1-T2, P1-T3

**验收标准：**
- 迁移文件包含 `CREATE EXTENSION IF NOT EXISTS vector` 语句（在创建表之前）
- `alembic upgrade head` 在空数据库上成功执行，创建全部表
- `alembic downgrade base` 能完整回滚
- 所有表的字段、约束、索引与 Spec 第 3 章 DDL 一致

---

## Phase 2: Auth + 核心依赖注入

**目标：** 实现 JWT 认证系统、用户管理 API 和 FastAPI 依赖注入体系。

**交付物：** 可工作的登录/认证流程，家庭成员初始化脚本。

**Task 数量：** 4

**Phase 依赖：** Phase 1 全部完成

---

### P2-T1: Auth 服务

**做什么：** 实现 JWT 签发/验证和 bcrypt 密码哈希。参考 Spec 第 10 章认证实现。

**涉及文件：**
- `backend/src/fawn/services/__init__.py`
- `backend/src/fawn/services/auth.py`

**依赖：** P1-T1

**验收标准：**
- `hash_password(plain)` 使用 bcrypt 哈希
- `verify_password(plain, hashed)` 验证密码
- `create_access_token(user_id, role)` 生成 JWT，payload 包含 sub (user_uuid)、role、exp；有效期从 `Settings.jwt_expire_minutes` 读取
- `decode_token(token)` 解码并验证 JWT，过期/无效时抛出异常
- 使用 HS256 算法，密钥从 `Settings.jwt_secret` 读取

---

### P2-T2: FastAPI 依赖注入 + Auth API 端点

**做什么：** 实现 `get_current_user` 依赖和 Auth API 端点（login、refresh、me）。参考 Spec 第 4.1 节和第 10.2 节。

**涉及文件：**
- `backend/src/fawn/dependencies.py`
- `backend/src/fawn/api/__init__.py`
- `backend/src/fawn/api/auth.py`
- `backend/src/fawn/api/schemas.py`（Auth 相关 schema）
- `backend/src/fawn/api/router.py`

**依赖：** P2-T1, P0-T3

**验收标准：**
- `get_current_user` 从 Bearer token 解析用户，用户不存在返回 401
- `POST /api/auth/login` 接受 username + password，返回 `{ access_token, token_type, user }`；响应中 user 对象包含 id、username、display_name、role、avatar_url，与前端 `LoginResponse` 类型对齐
- `POST /api/auth/refresh` 验证当前 token 后签发新 token
- `GET /api/auth/me` 返回当前用户完整信息（含 permissions），与前端 `User` 类型对齐
- 错误情况：用户名不存在返回 401、密码错误返回 401、token 过期返回 401

---

### P2-T3: 用户管理 API

**做什么：** 实现 Admin 家庭成员列表和权限修改 API。参考 Spec 第 10.3 节。

**涉及文件：**
- `backend/src/fawn/api/auth.py`（追加端点）

**依赖：** P2-T2

**验收标准：**
- `GET /api/users` 仅 Admin 可访问，返回全部家庭成员列表，与前端 `User[]` 类型对齐
- `PATCH /api/users/:id/permissions` 仅 Admin 可访问，修改指定用户的 permissions JSONB 字段
- 非 Admin 访问返回 403
- 修改 admin/parent 角色的权限时忽略（这两个角色始终全权限）

---

### P2-T4: seed_users.py 脚本

**做什么：** 实现家庭成员初始化脚本，从 YAML 配置文件创建用户。参考 Spec 第 10.3 节。

**涉及文件：**
- `backend/scripts/seed_users.py`
- `backend/config/family.yaml.example`

**依赖：** P2-T1, P1-T1

**验收标准：**
- 读取 `config/family.yaml` 中的家庭成员定义
- 使用 bcrypt 哈希密码后写入 users 表
- `--idempotent` 标志：已存在的用户（按 username 判断）跳过，不重复创建
- 脚本可通过 `python -m scripts.seed_users --idempotent` 执行

---

## Phase 3: Tracker + Dashboard

**目标：** 实现 Tracker 数据 CRUD 服务（含 WHO 百分位计算）和 Dashboard 聚合统计 API。

**交付物：** 完整的 Tracker GET/PATCH/DELETE API 和 Dashboard 4 个统计端点。

**Task 数量：** 4

**Phase 依赖：** Phase 2 全部完成

---

### P3-T1: WHO 百分位计算 + seed 脚本

**做什么：** 实现 WHO LMS 百分位确定性计算逻辑（含早产校正月龄和线性插值），编写 WHO 数据导入脚本。参考 Spec 第 3.6 节。

**涉及文件：**
- `backend/src/fawn/services/tracker.py`（WHO 计算部分）
- `backend/scripts/seed_who_data.py`

**依赖：** P1-T3

**验收标准：**
- 月龄计算：`age_months = (measurement_date - birth_date).days / 30.4375`
- 早产校正：`is_premature=true` 且 `gestational_weeks < 37` 时，校正月龄 = `age_months - (40 - gestational_weeks) / 4.345`
- 线性插值：实际月龄介于两个 WHO 数据点之间时，对 L/M/S 值做线性插值
- 范围边界：月龄超出 0-6 月范围时返回 `null`（不报错），与前端 `GrowthRecord` 中百分位字段 `number | null` 对齐
- LMS 公式：`Z = ((value/M)^L - 1) / (L*S)` (L!=0) 或 `Z = ln(value/M) / S` (L==0)；百分位 = `Φ(Z) × 100`
- `seed_who_data.py` 从 WHO 标准 CSV 文件导入 LMS 数据到 `who_growth_reference` 表
- `--idempotent` 标志：表中已有数据时跳过导入

---

### P3-T2: Tracker 服务（CRUD）

**做什么：** 实现 Tracker 四个数据域的 CRUD 服务，写入时自动调用 WHO 百分位计算（生长记录）。参考 Spec 第 4.3 节和第 5.4 节。

**涉及文件：**
- `backend/src/fawn/services/tracker.py`（CRUD 部分）

**依赖：** P3-T1, P1-T1

**验收标准：**
- 提供 `create_growth_record` / `create_feeding_record` / `create_sleep_record` / `create_health_record` 方法
- 创建生长记录时自动计算 weight_percentile / height_percentile / head_percentile
- 提供 `update_tracker_record(record_type, record_id, updates)` 方法，更新生长记录时自动重新计算百分位
- 提供 `delete_tracker_record(record_type, record_id)` 方法
- 提供 `query_growth` / `query_feeding` / `query_sleep` / `query_health` 方法，支持日期筛选和分页
- 权限校验：写入/更新/删除操作检查用户角色，family 角色需 `permissions.can_write_tracker=true`，权限不足时抛出业务异常

---

### P3-T3: Tracker API 端点

**做什么：** 实现 Tracker GET/PATCH/DELETE API 端点。参考 Spec 第 4.3 节。

**涉及文件：**
- `backend/src/fawn/api/tracker.py`
- `backend/src/fawn/api/schemas.py`（Tracker 相关 schema）

**依赖：** P3-T2, P2-T2

**验收标准：**
- `GET /api/tracker/growth` 返回生长记录列表（含百分位），支持 `?date`、`?from&to`、`?limit&offset` 查询参数
- `GET /api/tracker/feeding` / `sleep` / `health` 同上
- `PATCH /api/tracker/{type}/{id}` 更新单条记录，生长记录更新后重新计算百分位，响应包含更新后的完整记录
- `DELETE /api/tracker/{type}/{id}` 删除单条记录
- `{type}` 仅接受 growth/feeding/sleep/health，其他值返回 422
- 所有端点需认证；PATCH/DELETE 需 Admin/Parent 或 Family(can_write_tracker)，权限不足返回 403
- 响应字段与前端 `GrowthRecord` / `FeedingRecord` / `SleepRecord` / `HealthRecord` 类型完全对齐

---

### P3-T4: Dashboard API 端点

**做什么：** 实现 Dashboard 4 个聚合统计端点。参考 Spec 第 4.4 节。

**涉及文件：**
- `backend/src/fawn/api/dashboard.py`
- `backend/src/fawn/api/schemas.py`（Dashboard 相关 schema）

**依赖：** P3-T2, P2-T2

**验收标准：**
- `GET /api/dashboard/summary` 返回宝宝概要 + 最新生长数据 + 今日喂养/睡眠统计，响应结构与前端 `DashboardSummary` 类型完全对齐（含 `age_days`、`age_display` 字段）
- `GET /api/dashboard/growth-chart` 返回生长记录 + WHO 参考线（p3/p15/p50/p85/p97），响应结构与前端 `GrowthChartData` 类型完全对齐
- `GET /api/dashboard/feeding-stats?days=7` 返回每日喂养统计 + 平均值，响应结构与前端 `FeedingStatsData` 类型对齐
- `GET /api/dashboard/sleep-stats?days=7` 返回每日睡眠统计 + 平均值，响应结构与前端 `SleepStatsData` 类型对齐
- 无宝宝记录时 `latest_growth` 返回 `null`（非 500 错误）

---

## Phase 4: LangGraph Agent

**目标：** 实现 LangGraph ReAct Agent，包括 LLM 工厂函数、AgentState、System Prompt、全部 14 个 Tools 和图定义。

**交付物：** 可独立测试的 Agent 图，能正确调用 Tools 并返回结果。

**Task 数量：** 6

**Phase 依赖：** Phase 3 全部完成

---

### P4-T1: LLM 工厂函数

**做什么：** 实现 ChatModel 工厂函数，支持按用途（default/summary/vision）返回不同模型实例。参考 Spec 第 7 章。

**涉及文件：**
- `backend/src/fawn/llm/__init__.py`
- `backend/src/fawn/llm/factory.py`

**依赖：** P0-T2

**验收标准：**
- `create_chat_model(purpose="default")` 根据 LLMConfig 返回 ChatAnthropic 或 ChatOpenAI 实例
- 支持 `purpose` 参数：default、summary、vision；按用途查找对应的 provider/model 覆盖配置，未设置时 fallback 到 default
- 未知 provider 抛出 `ValueError`
- 切换 provider 只需修改环境变量，无需改代码（PRD 验收：LLM 可切换）

---

### P4-T2: AgentState + System Prompt

**做什么：** 定义 AgentState 类型和 System Prompt 模板（含动态注入逻辑）。参考 Spec 第 5.1 节和第 5.5 节。

**涉及文件：**
- `backend/src/fawn/agent/__init__.py`
- `backend/src/fawn/agent/state.py`
- `backend/src/fawn/agent/prompts.py`

**依赖：** P0-T4

**验收标准：**
- `AgentState` 包含 messages（Annotated[list[BaseMessage], add_messages]）、user_id、user_role、user_name、conversation_id
- System Prompt 模板包含 Spec 5.5 节全部内容：安全原则、知识来源规则、数据记录规则（含重复检测和纠错规则）、动态占位符（{user_name}、{user_role}、{profile_summary}、{baby_summary}、{recent_summaries}）
- 提供 `build_system_prompt(user, baby, profile_items, summaries)` 函数，将动态数据注入模板
- 安全原则覆盖 PRD 验收场景：疾病症状提醒就医、附带"以医生意见为准"

---

### P4-T3: 记录类 + 修改类 Tools

**做什么：** 实现 6 个写入/修改类 Tools：record_growth、record_feeding、record_sleep、record_health、update_tracker_record、delete_tracker_record。参考 Spec 第 5.4 节。

**涉及文件：**
- `backend/src/fawn/agent/tools/__init__.py`
- `backend/src/fawn/agent/tools/tracker.py`

**依赖：** P3-T2, P4-T2

**验收标准：**
- 4 个 `record_*` Tools 通过 `@tool` 装饰器定义，参数与 Spec 5.4 节表格一致
- `record_growth` 返回 record_id + percentiles（百分位可为 null）
- 其他 `record_*` 返回 record_id
- `update_tracker_record` 接受 record_type、record_id、updates dict，生长记录更新后重新计算百分位
- `delete_tracker_record` 接受 record_type、record_id
- 所有 Tool 通过 `RunnableConfig` 获取 user_id、conversation_id 上下文
- 权限校验：family 角色写入前检查 can_write_tracker，权限不足返回错误信息字符串（非异常），Agent 转述给用户

---

### P4-T4: 查询类 Tools（Tracker + Baby + Album）

**做什么：** 实现 query_growth_data、query_feeding_data、query_sleep_data、query_health_timeline、get_baby_profile、browse_photos Tools。参考 Spec 第 5.4 节。

**涉及文件：**
- `backend/src/fawn/agent/tools/tracker.py`（查询部分追加）
- `backend/src/fawn/agent/tools/album.py`

**依赖：** P3-T2, P4-T2

**验收标准：**
- `query_growth_data(days=90)` 返回指定天数内的生长记录 + 百分位趋势
- `query_feeding_data(date=today)` 返回指定日期的喂养记录和统计（总量、次数）
- `query_sleep_data(date=today)` 返回指定日期的睡眠记录和统计
- `query_health_timeline(limit=20)` 返回最近的健康事件
- `get_baby_profile()` 返回宝宝基本档案（姓名、性别、出生日期、月龄等）
- `browse_photos(view?, scene?, limit?)` 返回照片列表摘要

---

### P4-T5: 知识检索 + 画像管理 Tools

**做什么：** 实现 search_knowledge 和 update_user_profile Tools。参考 Spec 第 5.4 节。

**涉及文件：**
- `backend/src/fawn/agent/tools/advisor.py`
- `backend/src/fawn/agent/tools/profile.py`

**依赖：** P4-T2

**验收标准：**
- `search_knowledge(query)` 定义 Tool 接口（参数：query string），初始实现为 stub：返回空结果列表 + `low_confidence=true`，后续由 P6-T5 替换为真实 retriever 调用
- Tool 返回结构包含 results（content、source、chapter、score 列表）和 `low_confidence` 布尔标记，确保接口与 P6-T5 集成时无需修改调用方
- `update_user_profile(action, content?, item_id?)` 支持 add/update/delete 三种操作
- add 操作关联 source_conversation_id（可追溯来源对话）

---

### P4-T6: ReAct 图定义 + Checkpointing

**做什么：** 组装 LangGraph ReAct 图，配置 AsyncPostgresSaver checkpointing。参考 Spec 第 5.2 节和第 5.3 节。

**涉及文件：**
- `backend/src/fawn/agent/graph.py`

**依赖：** P4-T1, P4-T3, P4-T4, P4-T5

**验收标准：**
- 图结构：agent_node → (有 tool_call) → tool_node → agent_node → ... → (无 tool_call) → END
- agent_node 使用 `create_chat_model("default")` 的实例，绑定全部 14 个 Tools
- 使用 `AsyncPostgresSaver.from_conn_string(DATABASE_URL)` 作为 checkpointer
- 每次调用使用 `thread_id = conversation_id` 配置
- 支持 `astream_events(version="v2")` 流式输出
- 单次对话支持多轮 Tool 调用（如记录体重 + 查询百分位 + 检索知识库）

---

## Phase 5: Chat API + SSE + 记忆系统

**目标：** 实现聊天核心链路（对话 CRUD + 消息发送 + SSE 流式响应）和记忆系统（摘要生成 + 画像更新 + 会话超时）。

**交付物：** 完整的对话功能，用户可通过 API 发消息并实时收到 Agent 流式回复。

**Task 数量：** 4

**Phase 依赖：** Phase 4 全部完成

---

### P5-T1: Chat API 端点（对话 CRUD + 搜索）

**做什么：** 实现对话创建、列表、详情和历史搜索端点。参考 Spec 第 4.2 节。

**涉及文件：**
- `backend/src/fawn/api/chat.py`
- `backend/src/fawn/api/schemas.py`（Chat 相关 schema）

**依赖：** P2-T2, P1-T2

**验收标准：**
- `POST /api/chat/conversations` 创建新对话，返回 Conversation 对象
- `GET /api/chat/conversations` 返回分页对话列表（含 summary 和 message_count），响应结构与前端 `PaginatedResponse<Conversation>` 对齐
- `GET /api/chat/conversations/:id` 返回对话详情 + 全部消息
- `GET /api/chat/search?q=keyword` 使用 PostgreSQL `ILIKE '%keyword%'` 搜索 messages.content，返回匹配消息列表（含 conversation_id、conversation_started_at），与前端 `searchMessages` 返回类型对齐
- 用户只能访问自己的对话（通过 user_id 过滤）

---

### P5-T2: 消息发送 + SSE 流式响应

**做什么：** 实现消息发送端点，集成 LangGraph Agent 的 `astream_events` 实现 SSE 流式输出。参考 Spec 第 4.2 节和第 9 章。

**涉及文件：**
- `backend/src/fawn/api/chat.py`（追加消息端点）

**依赖：** P5-T1, P4-T6, P5-T3, P5-T4

**验收标准：**
- `POST /api/chat/conversations/:id/messages` 接受 `{ content, image_url? }`，响应为 `text/event-stream`
- 处理顺序：①先调用 `check_session_timeout(user_id)` ②若会话已超时：调用 `finalize_conversation` 完成摘要生成 + 画像更新 + 标记结束，然后返回 `session_expired` 事件（包含 `expired_conversation_id`）并关闭流，**不保存本次用户消息** ③若未超时：保存用户消息到 messages 表，触发 Agent
- SSE 事件类型：token、tool_call、tool_result、done、error、session_expired，格式与 Spec 4.2 节和前端 `SSEEvent` 类型对齐（session_expired 为新增事件，需同步更新 Spec）
- `session_expired` 事件格式：`{ type: "session_expired", expired_conversation_id: string }`；前端收到后创建新对话并重新发送消息
- `done` 事件包含 message_id 和 message_type（内容包含就医提醒时标记为 safety_alert）
- Agent 完整回复保存到 messages 表
- `image_url` 不为空时，从 MinIO 读取图片转 base64 编码后组装为多模态消息发给 LLM（image_url 来自 P5-T3 上传端点返回的路径）
- System Prompt 在每次请求时动态注入用户画像、宝宝档案、最近 N 条摘要（N = Settings.summary_max_recent，摘要由 P5-T4 记忆服务生成）

---

### P5-T3: 图片上传端点

**做什么：** 实现对话中图片上传端点。参考 Spec 第 4.2 节 `POST /api/chat/conversations/:id/images`。

**涉及文件：**
- `backend/src/fawn/api/chat.py`（追加图片端点）

**依赖：** P5-T1

**验收标准：**
- `POST /api/chat/conversations/:id/images` 接受 multipart/form-data，field 名为 "file"
- 图片存入 MinIO（路径：`/chat-images/{conversation_id}/{uuid}.{ext}`）
- 返回 `{ image_url, mime_type }`，image_url 格式为 `/api/chat/conversations/{id}/images/{uuid}.{ext}`
- 图片不进入相册系统

---

### P5-T4: 记忆服务（摘要生成 + 画像更新 + 超时检测）

**做什么：** 实现对话结束时的异步处理：摘要生成、画像更新、会话超时检测。参考 Spec 第 6 章。

**涉及文件：**
- `backend/src/fawn/services/memory.py`

**依赖：** P4-T1, P1-T2

**验收标准：**
- `finalize_conversation(conversation_id)` 执行三步：①调用 LLM（summary 用途）生成对话摘要写入 conversation_summaries ②调用 LLM 判断是否有新的用户认知并更新 profile_items ③标记 conversations.is_active=false, ended_at=now()
- 摘要包含 summary 文本和 key_topics JSON 数组
- `check_session_timeout(user_id)` 检查用户活跃会话的最后消息时间，距今 > `session_timeout_minutes`（默认 30 分钟）时返回超时会话的 conversation_id；未超时或无活跃会话时返回 None。**此函数只做检测，不触发 finalize**（finalize 由调用方 P5-T2 负责）
- 超时检测在用户发送新消息时调用（不需要后台定时任务）
- 记忆覆盖 PRD 验收场景：对话结束后自动生成摘要，新对话加载历史上下文

---

## Phase 6: Album + Profile + RAG

**目标：** 实现相册管理（MinIO 存储 + Vision API 分析）、用户画像 API、宝宝档案 API 和知识库 RAG 检索。

**交付物：** 完整的照片上传/浏览、画像管理、宝宝档案编辑功能和知识库离线导入/在线检索。

**Task 数量：** 5

**Phase 依赖：** Phase 2 完成（Auth 依赖）；P6-T5 依赖 P6-T4（retriever）+ P4-T5（stub Tool）以替换为真实实现

---

### P6-T1: Album 服务（MinIO + Vision API）

**做什么：** 实现照片存储（MinIO）、EXIF 提取、Vision API 分析和标签生成。参考 Spec 第 4.5 节。

**涉及文件：**
- `backend/src/fawn/services/album.py`

**依赖：** P0-T2, P1-T3

**验收标准：**
- `upload_photo(file, baby_id, user_id)` 完成：①提取 EXIF 时间 ②存入 MinIO（路径 `/{baby_id}/{year}/{month}/{uuid}.{ext}`）③调用 Vision API 分析 ④生成标签写入 photo_tags ⑤返回 Photo + tags
- `taken_at` 优先从 EXIF 提取，无 EXIF 用上传时间
- 标签包含 tag_type (scene/expression/milestone)、tag_value、confidence
- milestone 类型标签 `is_confirmed` 默认 false（需用户确认）
- `get_photos(view, scene?, month?, limit, offset)` 支持三种浏览模式（timeline/scene/milestone）
- `confirm_tag(tag_id)` 更新 `is_confirmed=true`

---

### P6-T2: Album API 端点

**做什么：** 实现相册 API 端点。参考 Spec 第 4.5 节。

**涉及文件：**
- `backend/src/fawn/api/album.py`
- `backend/src/fawn/api/schemas.py`（Album 相关 schema）

**依赖：** P6-T1, P2-T2

**验收标准：**
- `POST /api/album/photos` 接受 multipart/form-data 上传，返回 Photo + tags；权限检查：Admin/Parent 始终允许，Family 检查 can_upload_photos
- `GET /api/album/photos` 支持 view、scene、month、limit、offset 查询参数；响应与前端 `PaginatedResponse<Photo>` 对齐
- `GET /api/album/photos/:id` 返回单张照片详情 + 标签
- `PATCH /api/album/photos/:id/tags/:tagId` 确认/编辑标签，仅 Admin/Parent 可操作
- Photo 响应包含 `storage_url` 字段（后端生成预签名 URL 或代理访问路径），前端不直接访问 MinIO

---

### P6-T3: Profile + Baby API 端点

**做什么：** 实现用户画像 CRUD API 和宝宝档案查看/编辑 API。参考 Spec 第 4.6 节。

**涉及文件：**
- `backend/src/fawn/api/profile.py`
- `backend/src/fawn/api/baby.py`
- `backend/src/fawn/services/profile.py`
- `backend/src/fawn/api/schemas.py`（Profile + Baby 相关 schema）

**依赖：** P2-T2, P1-T2, P1-T1

**验收标准：**
- `GET /api/profile/me` 返回当前用户的画像条目列表，与前端 `ProfileItem[]` 类型对齐
- `PUT /api/profile/items/:id` 编辑画像条目（仅本人或 Admin 可操作）
- `DELETE /api/profile/items/:id` 删除画像条目（仅本人或 Admin 可操作）
- `GET /api/baby` 返回宝宝档案，与前端 `Baby` 类型对齐
- `PUT /api/baby` 更新宝宝档案，仅 Parent+ 可操作（Admin/Parent），Family 返回 403
- 画像仅本人和 Admin 可见（PRD 7.5 节要求）

---

### P6-T4: 知识库离线导入 + 在线检索

**做什么：** 实现知识库文档导入脚本（PDF 解析 → 切片 → Embedding → 入库）和在线向量检索。参考 Spec 第 8 章。

**涉及文件：**
- `backend/src/fawn/knowledge/__init__.py`
- `backend/src/fawn/knowledge/ingest.py`
- `backend/src/fawn/knowledge/retriever.py`
- `backend/scripts/ingest_knowledge.py`

**依赖：** P1-T3, P0-T2

**验收标准：**
- `ingest.py` 实现：PDF 解析（PyMuPDF/pdfplumber）→ 按段落切片（300-500 字/chunk，50 字重叠）→ 保留章节标题 → Embedding（text-embedding-3-small, 1536 维）→ 写入 knowledge_chunks
- 支持增量导入（按 document_id 去重），记录来源名称、作者/机构、出版日期
- `retriever.py` 的 `search_knowledge(query, top_k)` 使用 pgvector cosine 距离检索，返回 content、source、chapter、score
- 相似度全部低于 `rag_similarity_threshold` 时标记 `low_confidence=true`
- `scripts/ingest_knowledge.py` 提供命令行接口，接受 PDF 文件路径和元数据参数

---

### P6-T5: 知识库检索 Tool 集成

**做什么：** 将 P4-T5 中的 search_knowledge stub 替换为真实 retriever 实现，确保 Agent 能在对话中调用 RAG 检索。参考 Spec 第 5.4 节和第 8.2 节。

**涉及文件：**
- `backend/src/fawn/agent/tools/advisor.py`（更新，集成真实 retriever）

**依赖：** P6-T4, P4-T5

**验收标准：**
- 替换 P4-T5 中的 stub 实现：`search_knowledge` Tool 改为调用 `retriever.search_knowledge()` 获取真实检索结果
- 相似度全部低于 `rag_similarity_threshold`（默认 0.7）时，`low_confidence=true`
- 返回结果包含 content、source（书名）、chapter（章节标题）、score、low_confidence
- Agent 根据 System Prompt 规则处理：命中时标注来源；未命中的非医疗问题基于常识回答并说明；未命中的医疗问题建议咨询医生
- 覆盖 PRD 验收场景：RAG 来源标注、RAG 未命中处理、安全提醒

---

## Phase 7: 测试 + Docker 部署

**目标：** 建立测试体系，编写核心测试用例，配置 Docker 部署。

**交付物：** 通过率 100% 的测试套件和可一键部署的 Docker Compose 配置。

**Task 数量：** 5

**Phase 依赖：** Phase 1-6 全部完成

---

### P7-T1: 测试 fixtures

**做什么：** 配置测试基础设施：test DB、test client、mock LLM。参考 Spec 第 11 章。

**涉及文件：**
- `backend/tests/__init__.py`
- `backend/tests/conftest.py`

**依赖：** P0-T5, P1-T4

**验收标准：**
- `db_session` fixture：每个测试函数独立事务，测试后回滚
- `test_client` fixture：httpx.AsyncClient 实例，注入 test DB session 和 mock 用户
- `mock_llm` fixture：mock LLM 响应，不调用真实 API
- `test_user` / `test_admin` / `test_family` fixtures：创建不同角色的测试用户
- `test_baby` fixture：创建测试宝宝档案
- 使用独立的测试数据库（自动创建/清理）

---

### P7-T2: Services 层测试

**做什么：** 编写 Services 层核心测试：WHO 计算、Tracker CRUD、记忆管理。参考 Spec 第 11.4 节。

**涉及文件：**
- `backend/tests/test_services/__init__.py`
- `backend/tests/test_services/test_tracker.py`
- `backend/tests/test_services/test_memory.py`
- `backend/tests/test_services/test_auth.py`

**依赖：** P7-T1, P3-T2, P5-T4, P2-T1

**验收标准：**
- WHO 百分位计算测试：已知体重 → 已知百分位（确定性验证，至少 3 组测试数据）
- WHO 早产校正测试：早产宝宝的校正月龄计算正确
- WHO 边界测试：月龄超出 0-6 月范围时返回 null
- WHO 插值测试：月龄介于两个数据点之间时插值结果合理
- Tracker CRUD 测试：创建/查询/更新/删除各数据域
- Tracker 权限测试：family 角色 can_write_tracker=false 时写入被拒绝
- 记忆管理测试：摘要生成和画像更新流程（mock LLM）
- Auth 测试：密码哈希/验证、JWT 签发/解码、过期 token 拒绝

---

### P7-T3: API 层测试

**做什么：** 编写 API 端点测试：认证、Tracker、Dashboard、Chat。参考 Spec 第 11.2 节。

**涉及文件：**
- `backend/tests/test_api/__init__.py`
- `backend/tests/test_api/test_auth.py`
- `backend/tests/test_api/test_tracker.py`
- `backend/tests/test_api/test_dashboard.py`
- `backend/tests/test_api/test_chat.py`

**依赖：** P7-T1, P2-T2, P3-T3, P3-T4, P5-T2

**验收标准：**
- Auth 测试：登录成功/失败、refresh token、未认证返回 401、非 Admin 访问 users 返回 403
- Tracker 测试：GET 查询（日期筛选、分页）、PATCH 更新（生长记录重新计算百分位）、DELETE 删除、权限校验
- Dashboard 测试：summary 响应结构正确、无数据时 latest_growth 为 null、growth-chart 包含 WHO 参考线
- Chat 测试：创建对话、获取对话列表（分页）、获取对话详情、搜索（ILIKE）
- Chat SSE 流式测试：`POST /api/chat/conversations/:id/messages` 返回 `text/event-stream`；验证事件顺序（token* → done）、done 事件包含 message_id 和 message_type、error 事件格式正确、Agent 回复持久化到 messages 表
- Chat 超时测试：会话超时后发送消息返回 `session_expired` 事件（包含 expired_conversation_id），不保存本次用户消息到旧会话，旧会话已被 finalize（is_active=false, ended_at 已设置, 摘要已生成）
- 所有响应 schema 与前端 TypeScript 类型定义字段一一对应

---

### P7-T4: Agent 测试

**做什么：** 编写 Agent Tool 调用逻辑测试。参考 Spec 第 11.2 节。

**涉及文件：**
- `backend/tests/test_agent/__init__.py`
- `backend/tests/test_agent/test_tools.py`

**依赖：** P7-T1, P4-T3, P4-T4, P4-T5, P6-T5

**验收标准：**
- record_growth Tool 测试：写入数据并返回 record_id + percentiles
- update_tracker_record Tool 测试：更新后重新计算百分位
- 权限校验测试：family 角色无 can_write_tracker 权限时返回错误信息
- search_knowledge Tool 测试（mock embedding）：stub 阶段返回格式正确，low_confidence 标记正确
- RAG 集成测试：预置测试 knowledge_chunks 到数据库，调用真实 retriever 验证检索结果包含 content、source、chapter、score，命中时 low_confidence=false，全部低于阈值时 low_confidence=true
- update_user_profile Tool 测试：add/update/delete 操作正确
- 追问补全测试：mock LLM 收到缺少关键字段的输入（如"宝宝吃了奶"缺少量和方式）时返回追问响应而不调用 record Tool，验证不写入数据
- 安全提醒测试：mock LLM 对发烧等异常症状场景返回 safety_alert 类型消息，验证 message_type 正确标记为 safety_alert
- 不确定性说明测试：mock search_knowledge 返回 low_confidence=true 时，验证 Agent 回复内容包含"未检索到权威来源"或等效不确定性提示（由 System Prompt 规则驱动）
- 覆盖 PRD 核心验收场景：记录体重+WHO 反馈、纠错更新、多角色共享查询、追问补全、安全提醒、不确定性说明

---

### P7-T5: Docker 部署

**做什么：** 编写 Dockerfile 和 docker-compose.yml，实现一键部署。参考 Spec 第 13 章。

**涉及文件：**
- `backend/docker/Dockerfile`
- `docker-compose.yml`
- `.env.example`

**依赖：** 所有 Phase 完成

**验收标准：**
- `docker compose up` 启动 backend、frontend、postgres (pgvector/pgvector:pg16)、minio 四个服务
- redis 服务标记为 optional profile（`profiles: ["with-cache"]`）
- postgres 和 minio 配置 healthcheck，backend depends_on 使用 `condition: service_healthy`
- backend 启动命令顺序执行：`alembic upgrade head` → `seed_users --idempotent` → `seed_who_data --idempotent` → `uvicorn`
- 首次启动自动完成数据库初始化、用户创建、WHO 数据导入
- 重复启动不会重复创建数据（脚本幂等）
- `.env.example` 包含所有环境变量模板
- 数据持久化通过 Docker volumes（postgres_data、minio_data）

---

## 依赖关系总览

```
Phase 0: 项目基础
  P0-T1 (uv 初始化)
    └→ P0-T2 (配置)
         └→ P0-T3 (数据库连接)
              └→ P0-T4 (ORM Base)
                   └→ P0-T5 (Alembic + FastAPI 入口)

Phase 1: 数据模型
  P0-T4 ──→ P1-T1 (User + Baby 模型)
  P1-T1 ──→ P1-T2 (对话 + 记忆 + 画像模型)
  P1-T1 ──→ P1-T3 (Tracker + WHO + Album + 知识库模型)
  P1-T1 + P1-T2 + P1-T3 ──→ P1-T4 (初始迁移)

Phase 2: Auth
  P1-T1 ──→ P2-T1 (Auth 服务)
  P2-T1 + P0-T3 ──→ P2-T2 (依赖注入 + Auth API)
  P2-T2 ──→ P2-T3 (用户管理 API)
  P2-T1 + P1-T1 ──→ P2-T4 (seed_users 脚本)

Phase 3: Tracker + Dashboard
  P1-T3 ──→ P3-T1 (WHO 计算 + seed 脚本)
  P3-T1 + P1-T1 ──→ P3-T2 (Tracker CRUD 服务)
  P3-T2 + P2-T2 ──→ P3-T3 (Tracker API)
  P3-T2 + P2-T2 ──→ P3-T4 (Dashboard API)

Phase 4: LangGraph Agent
  P0-T2 ──→ P4-T1 (LLM 工厂)
  P0-T4 ──→ P4-T2 (AgentState + Prompt)
  P3-T2 + P4-T2 ──→ P4-T3 (记录/修改类 Tools)
  P3-T2 + P4-T2 ──→ P4-T4 (查询类 Tools)
  P4-T2 ──→ P4-T5 (知识检索 + 画像 Tools)
  P4-T1 + P4-T3 + P4-T4 + P4-T5 ──→ P4-T6 (ReAct 图)

Phase 5: Chat + SSE + 记忆
  P2-T2 + P1-T2 ──→ P5-T1 (对话 CRUD API)
  P5-T1 ──→ P5-T3 (图片上传)
  P4-T1 + P1-T2 ──→ P5-T4 (记忆服务)
  P5-T1 + P4-T6 + P5-T3 + P5-T4 ──→ P5-T2 (消息 + SSE)

Phase 6: Album + Profile + RAG
  P0-T2 + P1-T3 ──→ P6-T1 (Album 服务)
  P6-T1 + P2-T2 ──→ P6-T2 (Album API)
  P2-T2 + P1-T2 + P1-T1 ──→ P6-T3 (Profile + Baby API)
  P1-T3 + P0-T2 ──→ P6-T4 (知识库导入 + 检索)
  P6-T4 + P4-T5 ──→ P6-T5 (RAG Tool 集成)

Phase 7: 测试 + Docker
  P0-T5 + P1-T4 ──→ P7-T1 (测试 fixtures)
  P7-T1 ──→ P7-T2 (Services 测试)
  P7-T1 + P5-T2 ──→ P7-T3 (API 测试)
  P7-T1 + P6-T5 ──→ P7-T4 (Agent 测试)
  All Phases ──→ P7-T5 (Docker 部署)
```

**PRD 核心验收场景覆盖：**

| PRD 验收场景 | 实现 Task | 测试 Task |
|-------------|-----------|-----------|
| 记录体重 + WHO 百分位反馈 | P3-T1, P3-T2, P4-T3 | P7-T2, P7-T4 |
| Tracker 纠错更新 | P4-T3 (update_tracker_record) | P7-T4 |
| 追问补全 | P4-T2 (System Prompt 规则) | P7-T4（mock LLM 验证缺字段时不写入） |
| 多角色共享查询 | P2-T2 (角色识别), P4-T4 (查询 Tools) | P7-T4 |
| 安全提醒（发烧就医） | P4-T2 (System Prompt 安全原则) | P7-T4（mock LLM 验证 safety_alert 标记） |
| RAG 来源标注 | P6-T4, P6-T5 | P7-T4 |
| 不确定性说明（RAG 未命中） | P4-T2 (System Prompt 规则), P6-T5 | P7-T4（mock low_confidence 验证提示文案） |
| WHO 超出 0-6 月返回 null | P3-T1 | P7-T2 |
| Tracker 重复检测 | P4-T2 (System Prompt 规则), P4-T3 | P7-T4 |
| 权限校验 | P3-T2 (服务层), P4-T3 (Tool 层) | P7-T2, P7-T3, P7-T4 |
| SSE 流式响应 | P5-T2 | P7-T3（SSE 事件顺序 + 持久化） |
| 记忆系统（摘要 + 超时） | P5-T4, P5-T2 (集成) | P7-T2（记忆服务）, P7-T3（session_expired 事件） |

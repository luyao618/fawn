# Fawn

Fawn is a private, self-hosted baby-care agent for families. It combines structured baby-care records, an AI parenting assistant, family memory, and an evidence-grounded knowledge base in one mobile-first web app.

中文 | [English](#english)

## 中文

### 项目定位

Fawn 是一个面向个人或家庭自部署的育儿管家系统。它不是公开 SaaS，也不是单纯的聊天机器人，而是一个围绕“宝宝、家庭成员、日常记录、照片、长期记忆和育儿知识库”组织起来的私有应用。

核心目标：

- 把喂养、睡眠、身高体重、健康事件等日常数据结构化保存下来。
- 让 AI 管家在回答问题时能理解当前家庭、宝宝档案、近期记录和历史偏好。
- 用本地数据库和对象存储承载家庭数据，避免把家庭运营依赖在第三方产品里。
- 支持一套部署里存在多个家庭，并通过 `family_id` 隔离账号、聊天、记录、相册和长期记忆。

### 核心功能

- **邀请码注册**：登录页提供注册入口，通过 `REGISTRATION_INVITE_CODE` 创建新家庭。注册时创建家庭、首个父母账号和管理员权限；家庭名和账号名保持唯一。
- **家庭与账号管理**：父母账号可以添加家庭成员或朋友账号，管理昵称、角色、权限和密码。昵称可以重复，账号名必须唯一。
- **AI 管家对话**：移动端聊天界面支持流式回复、历史对话、消息搜索和图片输入。每个家庭拥有独立会话，跨家庭不可见。
- **结构化育儿记录**：支持成长、喂养、睡眠、健康四类 tracker 数据。记录既可以在“记录”页手动维护，也可以由管家通过工具调用写入或查询。
- **成长看板**：展示宝宝档案、最新成长数据、今日喂养、今日睡眠、健康时间线、成长曲线和 WHO 参考线。
- **相册**：照片上传到 MinIO，对象信息保存在数据库中，支持标签、软删除和下载链接。
- **长期记忆**：按家庭维护 Markdown 记忆文件，包括 `Soul.md`、`Memory.md`、`Baby.md` 和用户画像。每轮回复后会异步整理可记忆信息。
- **知识库问答**：内置 RAG 知识库 seed，覆盖 WHO、CDC、AAP、疫苗、喂养、新生儿护理等资料。管家回答育儿问题时可以检索知识库，并在医疗、安全类场景保留谨慎边界。
- **宝宝档案可渐进补全**：新家庭可以先没有宝宝档案；宝宝未出生或资料不完整时，系统以空档案运行，之后在家庭页补充。

### 系统架构

```text
Next.js mobile web app
  ├─ Login / Register
  ├─ Chat / Dashboard / Record / Album / History / Profile
  └─ /api proxy
        │
        ▼
FastAPI backend
  ├─ Auth, family, user and permission APIs
  ├─ Baby profile, tracker, dashboard and album APIs
  ├─ Chat API with SSE streaming and image upload
  ├─ LangGraph agent runtime, tool layer and background agent tasks
  ├─ RAG retrieval over pgvector
  └─ Long-term memory service
        │
        ├─ PostgreSQL + pgvector
        │    ├─ families, users, babies
        │    ├─ conversations, messages, summaries
        │    ├─ growth, feeding, sleep, health records
        │    ├─ photos and tags
        │    ├─ knowledge documents/chunks/seed metadata
        │    ├─ agent tasks
        │    └─ WHO growth reference data
        ├─ MinIO object storage
        │    ├─ album photos
        │    └─ chat images
        └─ Markdown memory volume
             └─ families/<family_id>/*.md
```

主要技术栈：

- **Frontend**：Next.js 15, React 19, TypeScript, Zustand, Tailwind CSS, lucide-react, Recharts, Vitest。
- **Backend**：FastAPI, SQLAlchemy asyncio, Alembic, Pydantic Settings, LangGraph, LangChain (OpenAI / Anthropic), PyJWT, MinIO SDK, pgvector, PyMuPDF / pdfplumber。
- **Data**：PostgreSQL 16 + pgvector, MinIO, Docker volumes。
- **Seeds**：知识库 seed、WHO 生长参考数据 seed、可选家庭用户 seed。
- **质量评估**：`scripts/eval_knowledge.py` 与 `knowledge_eval.yaml` 提供知识库召回与回答质量评估。

### 功能实现要点

**家庭隔离与注册**

后端使用 JWT 鉴权，token 中携带用户身份。核心业务查询都以当前用户的 `family_id` 为边界。注册流程会在同一个事务中创建 `Family` 和首个 `User`，并检查账号名、家庭名唯一性。新注册家庭默认不创建宝宝档案，避免“宝宝还没出生或资料暂缺”导致初始化失败。

**聊天管家**

聊天接口按家庭获取或创建活跃会话，并通过 Server-Sent Events 返回流式 token、工具调用和完成事件。发送消息后，系统先构造短期上下文，包括最近消息和近期结构化记录；如果消息可以被确定性解析成 tracker 操作，会优先走确定性写入路径；否则进入 LangGraph agent。

Agent 可以调用记录、查询、知识检索、相册浏览和用户画像更新等工具。图片消息会先进入 MinIO，再以可访问的图片内容交给模型处理。回复落库后，后台记忆整理器会判断是否需要更新长期记忆。

**结构化记录与看板**

成长、喂养、睡眠、健康记录分别建模，并统一提供列表、新增、编辑和删除 API。Dashboard 层把这些记录聚合成前端需要的摘要、趋势和统计数据。WHO 参考线通过 seed 导入数据库，成长曲线接口按宝宝性别、月龄和时间窗口返回参考点。

**RAG 知识库**

知识库由预构建 seed 导入 PostgreSQL + pgvector。运行时检索会把用户问题转换成 embedding，再结合向量相似度、资料来源提示和关键词加权选出候选片段。知识库 seed 带 provenance 和 hash metadata，部署更新时可以判断是否需要重建知识库相关表，而不影响家庭业务数据。

**长期记忆**

长期记忆不是只存在模型上下文里，而是落在 backend 的 memory volume。每个家庭拥有独立目录，包含家庭记忆、宝宝记忆、管家设定和每个用户的画像文件。宝宝档案更新时会同步进 `Baby.md` 的结构化区块；聊天后的记忆整理只写入明确、稳定、有价值的信息。

**对象存储**

相册照片和聊天图片都存储在 MinIO。数据库保存照片元数据、标签和软删除状态；相册下载使用短期预签名 URL。这样可以让数据库负责关系和检索，MinIO 负责二进制文件。

### 部署文档

完整的新机器部署、生产配置、备份、无损更新和知识库 seed 说明见 [docs/deployment.md](docs/deployment.md)。

线上更新的推荐流程是先把代码合并到远程 `main`，再在部署机器从 `origin/main` 快进拉取并重建服务。具体命令和数据保留注意事项以部署文档为准。

## English

### Product Positioning

Fawn is a private, self-hosted parenting assistant for baby care. It is not a public SaaS product and not just a chat UI. The app is built around a family's real operating data: baby profile, caregivers, daily records, photos, long-term memory, and an evidence-grounded parenting knowledge base.

The goal is to make the assistant useful because it understands the current family context, not because every answer starts from a blank prompt. A single deployment can host multiple families, but accounts, chats, tracker records, photos, and memory files are isolated by `family_id`.

### Core Features

- **Invite-code registration**: create a new family from the login page with `REGISTRATION_INVITE_CODE`. Registration creates the family and first parent admin account. Family names and usernames must be unique.
- **Family and account management**: parent accounts can create and manage family or friend accounts, permissions, roles, display names, and passwords.
- **AI chat assistant**: mobile-first chat with streaming responses, conversation history, message search, and image input. Conversations are scoped to the current family.
- **Structured baby-care tracking**: growth, feeding, sleep, and health records can be edited manually or written/queryable through agent tools.
- **Dashboard**: baby profile, latest growth data, today's feeding and sleep summaries, health timeline, growth charts, and WHO reference lines.
- **Album**: photos are stored in MinIO with database metadata, tags, soft delete, and download links.
- **Long-term memory**: per-family Markdown memory files store assistant identity, family memory, baby memory, and user profiles.
- **RAG knowledge base**: bundled seed artifacts provide retrieval over parenting references such as WHO, CDC, AAP, immunization, feeding, and newborn-care material.
- **Gradual baby profile setup**: a newly registered family can start without a baby profile and fill in birth date, gender, and birth measurements later.

### Architecture

```text
Next.js mobile web app
  ├─ Login / Register
  ├─ Chat / Dashboard / Record / Album / History / Profile
  └─ /api proxy
        │
        ▼
FastAPI backend
  ├─ Auth, family, user and permission APIs
  ├─ Baby profile, tracker, dashboard and album APIs
  ├─ Chat API with SSE streaming and image upload
  ├─ LangGraph agent runtime, tool layer and background agent tasks
  ├─ RAG retrieval over pgvector
  └─ Long-term memory service
        │
        ├─ PostgreSQL + pgvector
        │    ├─ families, users, babies
        │    ├─ conversations, messages, summaries
        │    ├─ growth, feeding, sleep, health records
        │    ├─ photos and tags
        │    ├─ knowledge documents/chunks/seed metadata
        │    ├─ agent tasks
        │    └─ WHO growth reference data
        ├─ MinIO object storage
        │    ├─ album photos
        │    └─ chat images
        └─ Markdown memory volume
             └─ families/<family_id>/*.md
```

Main stack:

- **Frontend**: Next.js 15, React 19, TypeScript, Zustand, Tailwind CSS, lucide-react, Recharts, Vitest.
- **Backend**: FastAPI, SQLAlchemy asyncio, Alembic, Pydantic Settings, LangGraph, LangChain (OpenAI / Anthropic), PyJWT, MinIO SDK, pgvector, PyMuPDF / pdfplumber.
- **Data**: PostgreSQL 16 + pgvector, MinIO, Docker volumes.
- **Seeds**: knowledge base seed, WHO growth reference seed, optional family user seed.
- **Evaluation**: `scripts/eval_knowledge.py` + `knowledge_eval.yaml` exercise knowledge retrieval and answer quality.

### Implementation Notes

**Family isolation and registration**

The backend uses JWT authentication and derives all business access from the current user. Core queries are scoped by `family_id`. Registration creates a `Family` and the first `User` in one transaction, while checking username and family-name uniqueness. A new family does not need an initial baby profile, which keeps onboarding usable before the baby is born or before profile details are known.

**Chat assistant**

The chat API creates or loads the active family conversation and streams model output through Server-Sent Events. Before invoking the model, it builds short-term context from recent messages and recent structured records. Deterministic tracker operations are routed before the general LLM path when possible; other messages go through the LangGraph agent.

The agent can call tools for recording and querying tracker data, searching the knowledge base, browsing photos, and updating user profile memory. Chat images are stored in MinIO and then passed to the model as image content. After a response is saved, a background memory curator decides whether the turn should update long-term memory.

**Tracker and dashboard**

Growth, feeding, sleep, and health records are represented as structured database tables with list/create/update/delete APIs. Dashboard endpoints aggregate those records into summaries and chart-ready data. WHO growth references are seeded into PostgreSQL and returned according to baby sex, age, and requested chart range.

**RAG knowledge base**

The knowledge base is imported from prebuilt seed artifacts into PostgreSQL + pgvector. Retrieval combines embedding similarity with source hints and lexical boosts so common parenting questions can land on stronger reference chunks. Seed provenance and hash metadata allow deployment updates to rebuild knowledge tables when the seed changes without touching family business data.

**Long-term memory**

Long-term memory is stored as Markdown files in the backend memory volume, separated by family. The memory set includes assistant identity, family memory, baby memory, and per-user profiles. Baby profile updates are synchronized into the structured section of `Baby.md`; chat-based memory curation writes only explicit, stable, useful information.

**Object storage**

Album photos and chat images are stored in MinIO. PostgreSQL keeps metadata, tags, ownership, and soft-delete state; MinIO stores the binary files, and album downloads use short-lived pre-signed URLs.

### Deployment

For new-machine setup, production configuration, backup, data-preserving updates, and knowledge-base seed operations, see [docs/deployment.md](docs/deployment.md).

The recommended update flow is to merge changes into the remote `main` branch first, then fast-forward the deployment machine from `origin/main` and rebuild the services. The deployment guide is the source of truth for commands and data-preservation notes.

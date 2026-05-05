# Fawn 部署与 RAG 构建文档

本文档覆盖三条常用路径：

- Docker 部署：推荐用于服务器部署。
- 本地部署：推荐用于开发、调试和验收。
- 重新构建 RAG：仅在语料、manifest、切片逻辑或 embedding 配置变化后执行。

## 1. 部署模型

Fawn 由四个主要服务组成：

- `backend`：FastAPI 服务，负责聊天、工具调用、RAG 检索、相册和 tracker API。
- `frontend`：Next.js 服务。
- `postgres`：PostgreSQL + pgvector，用于业务数据和 RAG 向量检索。
- `minio`：对象存储，用于照片等文件。

RAG 知识库采用 seed 快照部署：

- 语料入口：`backend/knowledge_manifest.yaml`
- 预构建 seed：`backend/seeds/knowledge_seed.sql.gz`
- seed provenance：`backend/seeds/knowledge_seed.provenance.json`
- readiness 检查：`backend/scripts/check_knowledge_readiness.py`
- eval 检查：`backend/scripts/eval_knowledge.py`

服务器部署时不应该在容器启动阶段重新生成 embeddings。容器启动只加载已经构建好的 `knowledge_seed.sql.gz`。

## 2. Docker 部署

### 2.1 前置条件

服务器需要：

- Docker 和 Docker Compose。
- 可从 backend 容器访问的 LLM / embedding API。
- 仓库中存在 RAG seed 文件：
  - `backend/seeds/knowledge_seed.sql.gz`
  - `backend/seeds/knowledge_seed.provenance.json`

当前 seed 使用的 embedding 配置是：

```bash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
```

线上查询 RAG 时仍然需要 embedding API，因为每个用户问题都要实时生成 query embedding。

### 2.2 准备配置

在仓库根目录执行：

```bash
cp backend/.env.example backend/.env
cp backend/config/family.yaml.example backend/config/family.yaml
```

编辑 `backend/.env`，生产部署至少要替换：

```bash
JWT_SECRET=replace-with-a-long-random-production-secret
OPENAI_API_KEY=...
OPENAI_API_BASE=...
DEFAULT_PROVIDER=openai
DEFAULT_MODEL=...
SUMMARY_PROVIDER=openai
SUMMARY_MODEL=...
VISION_PROVIDER=openai
VISION_MODEL=...
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
TOOL_CALLING_ENABLED=true
```

注意：

- 如果默认对话模型使用 Anthropic 或其他 provider，按实际 provider 设置 `DEFAULT_PROVIDER`、`DEFAULT_MODEL` 和对应 API key；RAG embedding 仍需要 `OPENAI_API_KEY` / `OPENAI_API_BASE` 这组 OpenAI-compatible embedding 配置。
- 使用官方 OpenAI 时，`OPENAI_API_BASE` 可以留空或设为官方兼容地址；使用代理时必须填代理地址。
- `OPENAI_API_BASE` 必须是 backend 容器内部可以访问的地址。
- 如果 API 代理跑在同一台 Linux 宿主机上，`host.docker.internal` 不一定默认可用，建议改成容器可达的内网地址或反向代理地址。
- `docker-compose.yml` 会覆盖容器内的 `DATABASE_URL`、MinIO 地址和 `TOOL_CALLING_ENABLED=true`。
- `backend/config/family.yaml` 用于初始化家庭用户，真实部署不要直接使用示例密码。
- 如果通过域名和 HTTPS 访问照片资源，设置 `MINIO_PUBLIC_ENDPOINT` 和 `MINIO_PUBLIC_USE_SSL=true`。
- 生产服务器建议只通过反向代理暴露 frontend/API，数据库 `5432`、MinIO API `9000`、MinIO console `9001` 至少要受防火墙或内网限制。

### 2.3 启动服务

```bash
docker compose up --build -d
```

backend 容器启动时会自动执行：

```bash
alembic upgrade head
python -m scripts.seed_users --config config/family.yaml --idempotent
python -m scripts.seed_knowledge --idempotent
python -m scripts.seed_who_data --csv seeds/who_growth_reference.csv --idempotent
uvicorn fawn.main:app --host 0.0.0.0 --port 8000
```

默认端口：

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Backend API docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`

### 2.4 验证部署

```bash
curl -fsS http://localhost:8000/api/health
docker compose exec -T backend python -m scripts.check_knowledge_readiness
docker compose exec -T backend python -m scripts.eval_knowledge
```

期望结果：

- health 返回 `{"status":"ok"}`。
- readiness 输出 `Knowledge readiness passed.`。
- eval 的各项指标均为 `[PASS]`。

如果需要看启动日志：

```bash
docker compose logs -f backend
```

### 2.5 更新部署

普通代码更新：

```bash
git pull
docker compose up --build -d
docker compose exec -T backend python -m scripts.check_knowledge_readiness
docker compose exec -T backend python -m scripts.eval_knowledge
```

不要在常规升级中执行：

```bash
docker compose down -v
```

`-v` 会删除 Postgres、MinIO 和 memory volume。只有确认要清空环境时才使用。

## 3. 本地部署

本地推荐使用 Docker 只启动依赖服务，backend/frontend 在宿主机运行，方便调试。

### 3.1 准备配置

```bash
cp backend/.env.example backend/.env
cp backend/config/family.yaml.example backend/config/family.yaml
```

本地运行 backend 时，建议把 `backend/.env` 调整为：

```bash
DATABASE_URL=postgresql+asyncpg://fawn:fawn@localhost:5432/fawn
MINIO_ENDPOINT=localhost:9000
MINIO_PUBLIC_ENDPOINT=127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=fawn
MINIO_USE_SSL=false
MINIO_PUBLIC_USE_SSL=false
JWT_SECRET=replace-with-local-secret
OPENAI_API_KEY=...
OPENAI_API_BASE=http://localhost:7024/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
TOOL_CALLING_ENABLED=true
```

如果你不使用本地 OpenAI-compatible 代理，把 `OPENAI_API_BASE` 改成实际 provider 地址。

### 3.2 启动 Postgres 和 MinIO

在仓库根目录执行：

```bash
docker compose up -d postgres minio minio-init
```

### 3.3 启动 backend

`scripts.seed_knowledge` 会调用 `psql` 导入 gzip SQL，因此本机需要能执行 `psql` 命令。

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed_users --config config/family.yaml --idempotent
uv run python -m scripts.seed_knowledge --idempotent
uv run python -m scripts.seed_who_data --csv seeds/who_growth_reference.csv --idempotent
uv run uvicorn fawn.main:app --reload
```

backend 默认运行在：

```bash
http://localhost:8000
```

### 3.4 启动 frontend

另开一个终端：

```bash
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8000 npm run dev
```

frontend 默认运行在：

```bash
http://localhost:3000
```

`frontend/next.config.ts` 会把 `/api/*` 代理到 `INTERNAL_API_URL`，所以本地运行时必须让它指向本地 backend。

### 3.5 本地验证

```bash
curl -fsS http://localhost:8000/api/health

cd backend
uv run python -m scripts.check_knowledge_readiness
uv run python -m scripts.eval_knowledge
uv run pytest

cd ../frontend
npm run typecheck
npm run test
npm run build
```

## 4. 重新构建 RAG

只有以下情况需要重新构建 RAG seed：

- 修改了 `backend/knowledge_manifest.yaml`。
- 修改了 manifest 指向的 `docs/books/...` 语料文件。
- 修改了切片、清洗或质量过滤逻辑，例如：
  - `backend/src/fawn/knowledge/ingest.py`
  - `backend/src/fawn/knowledge/chunk_quality.py`
- 修改了 embedding 模型或维度。
- 修改了 RAG 表结构中影响 seed 数据或 pgvector 维度的部分。

普通后端或前端代码改动不需要重建 RAG seed。只修改 `backend/knowledge_eval.yaml` 时通常只需要重新运行 eval，不需要重建 seed。

### 4.1 重建前检查

确认环境变量与目标 seed 一致：

```bash
DATABASE_URL=postgresql+asyncpg://fawn:fawn@localhost:5432/fawn
OPENAI_API_KEY=...
OPENAI_API_BASE=...
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
TOOL_CALLING_ENABLED=true
```

建议在本地或专用 seed-builder 数据库中重建，不要直接在生产库上执行 `--force`。

重建必须在能访问 `docs/books/...` 原始语料的环境里执行。生产 backend Docker 镜像只复制 manifest、eval 和 seeds，不复制完整 `docs/books/` 目录，因此不适合作为 seed 生成环境。

如果修改 `EMBEDDING_DIMENSIONS`，需要先用 Alembic 修改 `knowledge_chunks.embedding` 的 pgvector 维度，再重新 ingest 和 build seed。

### 4.2 重建命令

在仓库根目录启动本地 Postgres：

```bash
docker compose up -d postgres
```

然后执行：

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python -m scripts.ingest_knowledge --manifest knowledge_manifest.yaml --force
uv run python -m scripts.build_knowledge_seed
uv run python -m scripts.seed_knowledge --force
uv run python -m scripts.check_knowledge_readiness
uv run python -m scripts.eval_knowledge
```

重建成功后会更新：

```bash
backend/seeds/knowledge_seed.sql.gz
backend/seeds/knowledge_seed.provenance.json
```

把这两个文件随代码一起提交或上传到服务器，然后重新 Docker 部署：

```bash
docker compose up --build -d
docker compose exec -T backend python -m scripts.check_knowledge_readiness
docker compose exec -T backend python -m scripts.eval_knowledge
```

### 4.3 seed provenance 的作用

`knowledge_seed.provenance.json` 记录：

- manifest hash。
- 每个源文档的 hash。
- ingest/chunk quality 代码 hash。
- embedding 模型和维度。
- seed 文件自身 hash。

部署时 `scripts.seed_knowledge` 会校验 seed 文件 hash。`scripts.check_knowledge_readiness` 还会检查数据库中的 `seed_metadata` 是否与当前 seed artifact 匹配。

## 5. 常见问题

### RAG readiness 提示 `RAG tool calling is disabled`

确认环境变量：

```bash
TOOL_CALLING_ENABLED=true
```

Docker 部署中 `docker-compose.yml` 已经显式设置该值。本地运行 backend 时需要在 `backend/.env` 中设置。

### seed hash 不匹配

通常是 `knowledge_seed.sql.gz` 和 `knowledge_seed.provenance.json` 不是同一次生成的。重新执行：

```bash
cd backend
uv run python -m scripts.build_knowledge_seed
```

然后重新部署或重新 seed：

```bash
uv run python -m scripts.seed_knowledge --force
```

### eval 低分或失败

先确认 embedding API、模型和维度与 seed 一致：

```bash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
```

如果刚修改了语料或切片逻辑，需要重新 ingest、build seed，并检查 `backend/knowledge_eval.yaml` 中的期望来源和关键词是否仍然合理。

### 本地 frontend 请求 backend 失败

本地 frontend 需要设置：

```bash
INTERNAL_API_URL=http://localhost:8000
```

否则 Next.js rewrite 会默认代理到 Docker 网络里的 `http://backend:8000`。

### 本地 seed 失败并提示找不到 `psql`

安装 PostgreSQL client，并确认 `psql` 在 `PATH` 中。Docker backend 镜像已经内置 `postgresql-client`，本地宿主机运行脚本时需要自行安装。

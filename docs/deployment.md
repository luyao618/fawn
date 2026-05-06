# Fawn 新机器部署与无损更新指南

本文档面向一台全新的服务器或 NAS，说明如何部署 Fawn，以及代码更新后如何升级服务而不影响已有家庭数据。

推荐生产部署方式是 Docker Compose。除非明确要清空环境，日常部署和更新都不要删除 Docker volumes。

## 1. 系统组成和数据边界

Fawn 由 4 个主要服务组成：

- `frontend`: Next.js 前端，默认监听 `3000`。
- `backend`: FastAPI 后端，默认监听 `8000`。
- `postgres`: PostgreSQL + pgvector，保存业务数据、账号、家庭、宝宝档案、聊天、tracker 记录、知识库向量。
- `minio`: 对象存储，保存照片等文件。

Docker Compose 中有 3 个持久化 volume：

- `pgdata`: PostgreSQL 数据。账号、家庭、聊天、记录、RAG 向量都在这里。
- `miniodata`: MinIO 文件数据。相册照片在这里。
- `memorydata`: backend 生成的长期记忆 markdown 文件。

常规更新命令 `docker compose up -d --build` 只重建镜像和容器，不会删除这些 volumes。

危险命令：

```bash
docker compose down -v
```

`-v` 会删除 `pgdata`、`miniodata`、`memorydata`，等同于清空数据库、照片和记忆文件。只有确认要重置整套环境时才使用。

## 2. 新机器首次部署

### 2.1 前置条件

服务器需要：

- Linux / NAS shell 环境。
- Docker 和 Docker Compose v2。本文的生产 override 示例使用 Compose `!override`，建议使用较新的 Compose 插件。
- Git。
- 能被 backend 容器访问的 LLM / embedding API。
- 如果公网访问，建议准备 Nginx/Caddy/Traefik 等反向代理和 HTTPS 证书工具。
- 仓库里带有知识库 seed 文件：
  - `backend/seeds/knowledge_seed.sql.gz`
  - `backend/seeds/knowledge_seed.provenance.json`

RAG 查询运行时仍需要 embedding API。预构建 seed 只避免在服务器启动时重新为整套知识库生成 embeddings。

当前 seed 对应的 embedding 配置是：

```bash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
```

### 2.2 拉取代码

```bash
git clone <repo-url> fawn
cd fawn
git checkout main
```

如果服务器上已经有仓库，确认当前在 `main`：

```bash
git status
git branch --show-current
```

生产机器上会有本地环境文件和 override 文件。它们通常不提交到仓库：

```bash
.env
backend/.env
docker-compose.override.yml
```

这些文件应加入 `.gitignore`，避免把密钥、邀请码、对象存储密码或 Raven/OpenAI key 推到 GitHub。

### 2.3 配置 Compose 变量

仓库根目录的 `.env` 会被 Docker Compose 用来做变量插值。生产部署建议创建：

```bash
cat > .env <<'EOF'
COMPOSE_PROJECT_NAME=fawn
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_USE_MOCK=false
INTERNAL_API_URL=http://backend:8000
JWT_SECRET=replace-with-a-long-random-production-secret
POSTGRES_PASSWORD=replace-with-a-long-random-db-password
MINIO_ROOT_USER=fawnminio
MINIO_ROOT_PASSWORD=replace-with-a-long-random-minio-password
MINIO_PUBLIC_ENDPOINT=your-domain.com
MINIO_PUBLIC_USE_SSL=true
MINIO_REGION=us-east-1
EOF
```

必须修改：

- `JWT_SECRET`: 生产环境必须是长随机字符串。不要使用默认值。
- `POSTGRES_PASSWORD`: 首次初始化数据库前设置。数据库 volume 创建后不要随意更改，否则容器环境变量和数据库内已有密码会不一致。
- `MINIO_ROOT_PASSWORD`: 首次初始化 MinIO 前设置。不要使用默认 `minioadmin`。
- `MINIO_PUBLIC_ENDPOINT`: 浏览器访问照片时使用的地址。如果走单域名 HTTPS 反向代理，填域名，不带协议，例如 `your-domain.com`。

如果前端、后端都走同一个域名和反向代理，保留：

```bash
NEXT_PUBLIC_API_URL=/api
INTERNAL_API_URL=http://backend:8000
```

注意：`NEXT_PUBLIC_*` 会在 frontend 镜像构建时写入前端产物。修改这些值后，需要重新执行 `docker compose up -d --build`。

如果只在局域网裸端口访问 MinIO，可以改成：

```bash
MINIO_PUBLIC_ENDPOINT=192.168.1.20:9000
MINIO_PUBLIC_USE_SSL=false
```

如果公网页面是 HTTPS，照片 URL 也必须是 HTTPS，否则浏览器会拦截混合内容。

### 2.4 配置 backend 环境变量

复制 backend 环境文件：

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`。生产部署至少确认：

```bash
DEFAULT_PROVIDER=openai
DEFAULT_MODEL=claude-sonnet-4.6
SUMMARY_PROVIDER=openai
SUMMARY_MODEL=claude-sonnet-4.6
VISION_PROVIDER=openai
VISION_MODEL=claude-sonnet-4.6

OPENAI_API_KEY=replace-with-your-key
OPENAI_API_BASE=http://host.docker.internal:7024/v1

EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
TOOL_CALLING_ENABLED=true

REGISTRATION_INVITE_CODE=2026
```

`REGISTRATION_INVITE_CODE` 是注册家庭的邀请码。不设置时后端默认是 `2026`。个人部署可以先用默认值，但只要服务可能被别人访问，就建议改成你自己的值。

Docker Compose 会覆盖 backend 容器内的这些变量：

- `DATABASE_URL`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MINIO_USE_SSL`
- `JWT_SECRET`
- `MEMORY_ROOT`
- `TOOL_CALLING_ENABLED`

其中 `JWT_SECRET` 在 Docker 部署中以仓库根目录 `.env` 为准，不要只改 `backend/.env`。

如果你的 OpenAI-compatible API 代理运行在同一台 Linux 宿主机上，backend 容器需要能访问宿主机端口。常见做法是在 backend 服务里加入：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

同时让宿主机上的代理监听 Docker 可达地址，例如 Docker bridge 网关 `172.17.0.1`，而不是只监听 `127.0.0.1`。如果代理只监听 `127.0.0.1`，容器访问 `host.docker.internal:7024` 通常仍会失败。

如果启用了 UFW/firewalld，还要允许 Docker bridge 到宿主机代理端口，例如允许 Fawn Docker 网络访问 `172.17.0.1:7024`。

### 2.5 收口 Docker 端口

仓库默认 `docker-compose.yml` 适合快速启动，会把 `3000`、`8000`、`5432`、`9000`、`9001` 映射到宿主机。生产环境建议使用本地 `docker-compose.override.yml` 收口端口，只让 Nginx/Caddy 暴露 `80/443`。

示例 override：

```yaml
services:
  postgres:
    restart: unless-stopped
    ports: !override []
    environment:
      POSTGRES_USER: fawn
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
      POSTGRES_DB: fawn

  minio:
    restart: unless-stopped
    ports: !override
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}

  minio-init:
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 ${MINIO_ROOT_USER:?MINIO_ROOT_USER is required} ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required};
      mc mb local/fawn --ignore-existing;
      exit 0;
      "

  backend:
    restart: unless-stopped
    ports: !override
      - "127.0.0.1:8000:8000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      DATABASE_URL: postgresql+asyncpg://fawn:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}@postgres:5432/fawn
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}

  frontend:
    restart: unless-stopped
    ports: !override
      - "127.0.0.1:${FRONTEND_PORT:-3000}:3000"
```

不要把 `docker-compose.override.yml` 提交到仓库，除非它不含任何本机部署假设或密钥。

`docker compose config` 会展开并打印 `.env` 中的密钥。可以在本机排查时使用，但不要把输出粘贴到 issue、PR 或聊天记录里。

### 2.6 配置初始 seed 用户

backend 启动时会检查是否存在真实的家庭 seed 配置：

```bash
FAMILY_CONFIG="${FAWN_FAMILY_CONFIG:-config/family.yaml}"
if [ -f "$FAMILY_CONFIG" ]; then
  python -m scripts.seed_users --config "$FAMILY_CONFIG" --idempotent
fi
```

如果 `config/family.yaml` 不存在，Docker 部署会跳过用户 seed，不会回退执行 `family.yaml.example`。这是为了避免在生产环境自动创建示例账号。

默认 Docker 部署推荐直接用登录页的邀请码注册创建第一个家庭。如果你想继续用 seed 方式创建第一个家庭和成员，先复制并编辑：

```bash
cp backend/config/family.yaml.example backend/config/family.yaml
```

`backend/config/family.yaml` 不会被默认镜像打包进去。Docker 部署要使用它时，需要通过 Compose override 或额外 volume 把真实配置挂载进 backend 容器，并把 `FAWN_FAMILY_CONFIG` 指向容器内路径。

`family.yaml` 的作用是保留旧的 seed_users 部署流程。现在系统也支持登录页邀请码注册新家庭，两种方式可以并存，但生产部署不要使用示例配置：

- 如果你想用 seed 方式创建第一个家庭和成员，就把 `family.yaml` 改成真实家庭、真实账号、强密码。
- 如果你主要使用邀请码注册，可以不提供 `family.yaml`，让系统跳过用户 seed。

不要在生产环境保留 `change-me` 这样的示例密码。

### 2.7 启动

在仓库根目录执行：

```bash
docker compose up -d --build
```

backend 容器启动时会自动执行：

```bash
alembic upgrade head
# 如果存在真实家庭 seed 配置，才执行 seed_users
python -m scripts.seed_knowledge --idempotent
python -m scripts.seed_who_data --csv seeds/who_growth_reference.csv --idempotent
uvicorn fawn.main:app --host 0.0.0.0 --port 8000
```

这些脚本的预期行为：

- Alembic 迁移会把数据库结构升级到当前代码需要的版本。
- `seed_users --idempotent` 会跳过已经存在的用户名，不会覆盖已有用户密码。
- `seed_knowledge --idempotent` 会比较 seed hash。hash 一致就跳过；hash 变化时只重建知识库相关表。
- `seed_who_data --idempotent` 已有 WHO 数据时会跳过。

### 2.8 验证

```bash
docker compose ps
curl -fsS http://localhost:8000/api/health
docker compose exec -T backend python -m scripts.check_knowledge_readiness
docker compose exec -T backend python -m scripts.eval_knowledge
```

期望结果：

- `docker compose ps` 中 `backend`、`frontend`、`postgres`、`minio` 都是 `Up`。
- health 返回 `{"status":"ok"}`。
- readiness 输出 `Knowledge readiness passed.`。
- eval 输出的核心检查为 `[PASS]`。

如果 backend 通过同机 Raven/OpenAI-compatible 代理访问模型，可以额外验证容器内是否能访问 embeddings 和聊天模型：

```bash
docker compose exec -T backend python - <<'PY'
from fawn.config import get_settings
from langchain_openai import OpenAIEmbeddings

s = get_settings()
emb = OpenAIEmbeddings(
    model=s.llm.embedding_model,
    dimensions=s.llm.embedding_dimensions,
    api_key=s.llm.openai_api_key,
    base_url=s.llm.openai_api_base,
    check_embedding_ctx_length=False,
)
print("embedding_dimensions", len(emb.embed_query("hello")))
PY
```

查看日志：

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### 2.9 首次使用

默认地址：

- Frontend: `http://localhost:3000`
- Backend API docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`

如果使用邀请码注册：

1. 打开前端登录页。
2. 点击注册入口。
3. 输入 `REGISTRATION_INVITE_CODE`。
4. 创建家庭、账号名、昵称、角色和密码。
5. 注册完成后回到登录页手动登录。

新注册家庭默认没有宝宝档案。登录后先到 `/profile` 创建或补充宝宝资料。宝宝未出生或资料不完整时，可以先只填能确定的信息。

## 3. 生产访问和端口建议

局域网个人部署可以先只开放前端端口：

- 允许访问 `3000`。
- 限制 `5432`、`9000`、`9001`、`8000` 到内网或本机。

如果用 Nginx、Caddy、Traefik 等反向代理，推荐：

- `https://your-domain/` 代理到 frontend `3000`。
- `https://your-domain/api/*` 代理到 backend `8000`。
- `https://your-domain/fawn/*` 代理到 MinIO `9000`，用于私有 bucket 的 presigned 照片 URL。
- 前端保持 `NEXT_PUBLIC_API_URL=/api`。

照片访问依赖 `MINIO_PUBLIC_ENDPOINT`。如果照片需要通过 HTTPS 域名访问，设置：

```bash
MINIO_PUBLIC_ENDPOINT=your-domain-or-minio-domain
MINIO_PUBLIC_USE_SSL=true
```

如果 MinIO 只在局域网裸端口访问，设置：

```bash
MINIO_PUBLIC_ENDPOINT=192.168.1.20:9000
MINIO_PUBLIC_USE_SSL=false
```

### 3.1 单域名 Nginx 示例

下面示例使用单域名：

- `/` 转发到 frontend。
- `/api/` 转发到 backend，并关闭 buffering，保证聊天 SSE 流式输出正常。
- `/fawn/` 转发到 MinIO。bucket 仍是 private，只有后端生成的 presigned URL 能访问照片。

先安装 Nginx 并配置 HTTP：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    client_max_body_size 100m;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /fawn/ {
        access_log off;
        proxy_pass http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

然后申请 HTTPS 证书：

```bash
certbot --nginx -d your-domain.com
```

Certbot 会把 443 证书配置写入对应 Nginx site，并配置自动续期。部署后验证：

```bash
curl -fsS https://your-domain.com/api/health
curl -I http://your-domain.com
```

`/fawn/` 不带 presigned query 时返回 `403` 是正常的，说明 MinIO bucket 没有公开。

### 3.2 只开放 80/443 时的防火墙建议

应用端口建议只绑定 `127.0.0.1`，公网入站只放行：

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

如果 backend 需要访问宿主机上的 Raven/OpenAI-compatible 代理，还需要允许 Docker bridge 访问该代理端口。示例：

```bash
ufw allow in on br-xxxxxxxxxxxx to 172.17.0.1 port 7024 proto tcp
```

实际 bridge 名称和网段用下面命令确认：

```bash
ip -4 addr show type bridge
docker network inspect fawn_default
```

## 4. 更新部署且保留已有数据

### 4.1 更新前检查

进入服务器上的仓库目录：

```bash
cd /path/to/fawn
git status
```

如果服务器上有未提交的本地改动，先确认这些改动是否需要保留。不要在脏工作区里直接升级。

确认当前服务可用：

```bash
docker compose ps
curl -fsS http://localhost:8000/api/health
```

### 4.2 更新前备份

每次升级前建议做一次备份，尤其是包含 Alembic migration 的更新。

创建备份目录：

```bash
BACKUP_DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
```

为了减少写入中的文件变化，先短暂停止前后端：

```bash
docker compose stop frontend backend
```

备份 PostgreSQL：

```bash
docker compose exec -T postgres pg_dump -U fawn -d fawn -Fc > "$BACKUP_DIR/postgres.dump"
```

备份 MinIO 文件 volume：

```bash
docker run --rm \
  --volumes-from fawn-minio-1 \
  -v "$PWD/$BACKUP_DIR:/backup" \
  busybox \
  tar czf /backup/minio-data.tgz -C / data
```

备份 backend memory volume：

```bash
docker run --rm \
  --volumes-from fawn-backend-1 \
  -v "$PWD/$BACKUP_DIR:/backup" \
  busybox \
  tar czf /backup/memorydata.tgz -C /app memory
```

备份完成后可以先启动服务，也可以直接进入升级步骤：

```bash
docker compose start backend frontend
```

如果你的 Compose project name 不是 `fawn`，容器名可能不是 `fawn-minio-1` / `fawn-backend-1`。用下面命令查看真实名称：

```bash
docker compose ps
```

### 4.3 拉取最新代码

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

如果 `git pull --ff-only` 失败，说明服务器本地分支有分叉或本地提交。先处理 Git 状态，不要强行 reset 生产目录。

本地 `.env`、`backend/.env`、`docker-compose.override.yml` 应该被 `.gitignore` 忽略，不会被 `git pull` 覆盖。升级前确认这些文件仍然存在。

### 4.4 重建并启动

```bash
docker compose up -d --build
```

这一步会：

- 用最新代码重建 backend/frontend 镜像。
- 按需重建并替换容器。
- 保留已有 Docker volumes。
- 启动 backend 时自动执行 Alembic migration、知识库 seed、WHO 数据 seed；如果容器内存在真实 `FAWN_FAMILY_CONFIG` / `config/family.yaml`，还会执行幂等用户 seed。

如果本次代码修改了 `NEXT_PUBLIC_*`、Nginx 代理路径或 Dockerfile，必须保留 `--build`。如果只改环境变量，也建议重建 frontend，避免前端构建产物仍使用旧值。

不要执行：

```bash
docker compose down -v
```

### 4.5 更新后验证

```bash
docker compose ps
curl -fsS http://localhost:8000/api/health
docker compose exec -T backend python -m scripts.check_knowledge_readiness
docker compose exec -T backend python -m scripts.eval_knowledge
docker compose logs --tail=200 backend
```

然后在浏览器检查：

- 登录页可打开。
- 旧账号可以登录。
- 旧家庭的宝宝档案、聊天、tracker、相册还在。
- 新注册家庭只能看到自己的聊天和数据。
- `/profile` 可以编辑宝宝资料。

### 4.6 为什么常规更新不会影响已有数据

常规更新只替换容器和镜像，数据在 Docker volumes 中：

- Postgres volume 不会因为 `up -d --build` 被删除。
- MinIO volume 不会因为容器重建被删除。
- memory volume 不会因为 backend 容器重建被删除。
- `seed_users --idempotent` 不会覆盖已有用户。
- `seed_who_data --idempotent` 不会重复导入已有 WHO 参考数据。
- `seed_knowledge --idempotent` 只处理知识库 seed。seed hash 变化时会重建知识库相关表，不会删除家庭、账号、聊天、tracker 或照片数据。

真正会删除数据的是 `docker compose down -v`、手动删 Docker volumes、手动删数据库表或手动清空 MinIO。

还要避免随意修改 `COMPOSE_PROJECT_NAME`。Compose project name 会影响 volume 名称；如果从 `fawn` 改成别的名字，服务可能会创建一套新的空 volume，看起来像数据丢失。

已初始化数据库后，不要直接改 `.env` 里的 `POSTGRES_PASSWORD` 并重启。Postgres 初始化密码只在空数据目录首次创建时生效，后续改环境变量不会自动修改数据库内用户密码。

## 5. 恢复备份

恢复前确认你真的要回滚数据。恢复会覆盖当前数据库和文件。

停止前后端：

```bash
docker compose stop frontend backend
```

恢复 PostgreSQL：

```bash
docker compose exec -T postgres dropdb -U fawn --force fawn
docker compose exec -T postgres createdb -U fawn fawn
docker compose exec -T postgres pg_restore -U fawn -d fawn --clean --if-exists < backups/YYYYMMDD-HHMMSS/postgres.dump
```

恢复 MinIO：

```bash
docker run --rm \
  --volumes-from fawn-minio-1 \
  -v "$PWD/backups/YYYYMMDD-HHMMSS:/backup" \
  busybox \
  sh -c 'rm -rf /data/* && tar xzf /backup/minio-data.tgz -C /'
```

恢复 memory：

```bash
docker run --rm \
  --volumes-from fawn-backend-1 \
  -v "$PWD/backups/YYYYMMDD-HHMMSS:/backup" \
  busybox \
  sh -c 'rm -rf /app/memory/* && tar xzf /backup/memorydata.tgz -C /app'
```

启动服务并验证：

```bash
docker compose up -d
curl -fsS http://localhost:8000/api/health
```

## 6. 本地开发部署

本地开发推荐 Docker 只启动依赖服务，backend/frontend 在宿主机运行，方便调试。

### 6.1 准备配置

```bash
cp backend/.env.example backend/.env
cp backend/config/family.yaml.example backend/config/family.yaml
```

本地运行 backend 时，`backend/.env` 建议使用本机地址：

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
REGISTRATION_INVITE_CODE=2026
OPENAI_API_KEY=...
OPENAI_API_BASE=http://localhost:7024/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1024
TOOL_CALLING_ENABLED=true
```

### 6.2 启动依赖

```bash
docker compose up -d postgres minio minio-init
```

### 6.3 启动 backend

`scripts.seed_knowledge` 会调用 `psql` 导入 gzip SQL，因此宿主机需要能执行 `psql`。

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python -m scripts.seed_users --config config/family.yaml --idempotent
uv run python -m scripts.seed_knowledge --idempotent
uv run python -m scripts.seed_who_data --csv seeds/who_growth_reference.csv --idempotent
uv run uvicorn fawn.main:app --reload
```

### 6.4 启动 frontend

另开终端：

```bash
cd frontend
npm install
INTERNAL_API_URL=http://localhost:8000 npm run dev
```

frontend 默认在 `http://localhost:3000`。`frontend/next.config.ts` 会把 `/api/*` 代理到 `INTERNAL_API_URL`。

### 6.5 本地验证

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

## 7. 重新构建 RAG seed

只有以下情况需要重新构建 RAG seed：

- 修改了 `backend/knowledge_manifest.yaml`。
- 修改了 manifest 指向的 `docs/books/...` 原始语料。
- 修改了知识库切片、清洗或质量过滤逻辑，例如：
  - `backend/src/fawn/knowledge/ingest.py`
  - `backend/src/fawn/knowledge/chunk_quality.py`
- 修改了 embedding 模型或维度。
- 修改了知识库表结构或 pgvector 维度。

普通后端或前端代码改动不需要重建 RAG seed。只修改 `backend/knowledge_eval.yaml` 时通常只需要重新运行 eval。

### 7.1 重建前检查

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

生产 backend Docker 镜像只复制 manifest、eval 和 seeds，不复制完整 `docs/books/` 目录，因此不适合作为 seed 生成环境。

如果修改 `EMBEDDING_DIMENSIONS`，需要先用 Alembic 修改 `knowledge_chunks.embedding` 的 pgvector 维度，再重新 ingest 和 build seed。

### 7.2 重建命令

在仓库根目录启动本地 Postgres：

```bash
docker compose up -d postgres
```

执行：

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

把这两个文件随代码一起提交或上传到服务器，然后按第 4 节执行更新部署。

### 7.3 seed provenance

`knowledge_seed.provenance.json` 记录：

- manifest hash。
- 每个源文档的 hash。
- ingest/chunk quality 代码 hash。
- embedding 模型和维度。
- seed 文件自身 hash。

部署时 `scripts.seed_knowledge` 会校验 seed 文件 hash。`scripts.check_knowledge_readiness` 会检查数据库中的 `seed_metadata` 是否与当前 seed artifact 匹配。

## 8. 常见问题

### Docker 启动后仍然使用默认 JWT secret

Docker 部署中 `docker-compose.yml` 显式设置 `JWT_SECRET`，它来自仓库根目录 `.env` 或 shell 环境，不来自 `backend/.env`。

确认：

```bash
docker compose exec -T backend python - <<'PY'
from fawn.config import get_settings

secret = get_settings().jwt_secret
print("jwt_secret_configured", bool(secret and "change-me" not in secret and "replace-with" not in secret))
PY
```

避免把 `docker compose config` 的完整输出粘贴到外部渠道，因为它会展开 `.env` 中的密钥。

### 注册邀请码没有生效

邀请码由 backend 设置读取：

```bash
REGISTRATION_INVITE_CODE=your-code
```

这个值应写在 `backend/.env` 中。修改后重启 backend：

```bash
docker compose up -d --build backend
```

### 新部署出现示例账号或示例宝宝

说明 backend 启动时使用了 `backend/config/family.yaml.example` 或你复制后没有改内容。

处理方式：

1. 编辑 `backend/config/family.yaml`，改成真实账号和强密码。
2. 如果示例数据已经进入数据库，使用 UI/API 删除或修改，不要直接删表。

### Migration 失败，提示重复家庭名

注册功能引入了家庭名唯一约束。迁移会按 trim、空白折叠和 casefold 生成 `families.name_key`。如果已有数据库里存在规范化后相同的家庭名，迁移会中止，避免错误合并数据。

处理方式：

1. 先备份数据库。
2. 在旧版本或数据库中把重复家庭名改成不同名称。
3. 重新执行更新部署。

### RAG readiness 提示 tool calling disabled

确认：

```bash
TOOL_CALLING_ENABLED=true
```

Docker 部署中 Compose 已经设置该值。本地运行 backend 时需要在 `backend/.env` 中设置。

### seed hash 不匹配

通常是 `knowledge_seed.sql.gz` 和 `knowledge_seed.provenance.json` 不是同一次生成的。重新构建 seed：

```bash
cd backend
uv run python -m scripts.build_knowledge_seed
```

然后重新部署，或在确认环境正确后重新 seed：

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

### 本地 seed 失败并提示找不到 psql

安装 PostgreSQL client，并确认 `psql` 在 `PATH` 中。Docker backend 镜像已经内置 `postgresql-client`，本地宿主机运行脚本时需要自行安装。

### backend 容器访问不到宿主机 Raven / OpenAI-compatible 代理

先确认 backend 容器里能解析 host gateway：

```bash
docker compose exec -T backend getent hosts host.docker.internal
```

如果没有结果，在 backend 服务中加入：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

再确认宿主机代理不是只监听 `127.0.0.1`。在 Linux 上，容器访问 `host.docker.internal` 命中的通常是宿主机网关地址，不是宿主机 loopback。代理应监听 Docker 可达地址，例如 `172.17.0.1:7024`，或监听 `0.0.0.0` 并用防火墙限制公网访问。

### `/fawn/` 返回 403

直接打开 `/fawn/` 返回 `403` 是正常的。MinIO bucket 应保持 private，照片只能通过后端生成的 presigned URL 访问。只要登录后相册里的照片能显示，就不需要把 bucket 设为 public。

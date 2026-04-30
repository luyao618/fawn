# Fawn

Private, self-hosted baby-care agent for one family. The app is split into a FastAPI backend, a Next.js frontend, PostgreSQL with pgvector, and MinIO object storage.

## Quick Start

Prerequisites:

- Docker Compose
- Node.js 22 for frontend local development
- Python 3.12+ and `uv` for backend local development

Run everything with Docker:

```bash
cp backend/.env.example backend/.env
cp backend/config/family.yaml.example backend/config/family.yaml
docker compose up --build
```

Then open:

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs
- MinIO console: http://localhost:9001

`backend/config/family.yaml` defines the seeded family users. If it is missing, Docker falls back to `family.yaml.example` so the stack can still start, but real deployments should copy and edit it first.

Knowledge seeding is optional. Put `knowledge_seed.sql.gz` in `backend/seeds/` when a prebuilt RAG seed dump is available; otherwise startup skips it.

## Local Development

Backend:

```bash
cd backend
uv sync
uv run pytest
uv run uvicorn fawn.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
npm run typecheck
npm run test
```

For frontend-only work, set `NEXT_PUBLIC_USE_MOCK=true` to use the built-in mock API layer.

## Verification

Useful checks before handing off changes:

```bash
cd backend && uv run pytest
cd frontend && npm run typecheck && npm run test && npm run build
docker compose config
```

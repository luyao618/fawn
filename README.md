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
docker compose up --build -d
```

Then open:

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs
- MinIO console: http://localhost:9001

`backend/config/family.yaml` defines the seeded family users. If it is missing, Docker falls back to `family.yaml.example` so the stack can still start, but real deployments should copy and edit it first.

RAG knowledge is deployed from the prebuilt seed files in `backend/seeds/`. Keep `knowledge_seed.sql.gz` and `knowledge_seed.provenance.json` together, and rebuild them only when the corpus, manifest, chunking logic, or embedding configuration changes.

Full deployment instructions, including Docker deployment, local deployment, and RAG seed rebuild steps, are in [docs/deployment.md](docs/deployment.md).

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

FROM python:3.12-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
COPY src/ src/

# Keep the install paths used by the runtime stage below.
RUN UV_PROJECT_ENVIRONMENT=/usr/local uv sync --frozen --no-dev --no-editable --no-cache --no-python-downloads

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.12/site-packages/ /usr/local/lib/python3.12/site-packages/
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /usr/local/bin/alembic /usr/local/bin/alembic
COPY --from=builder /app/src/ src/
COPY alembic/ alembic/
COPY alembic.ini .
COPY scripts/ scripts/
COPY config/ config/
COPY knowledge_eval.yaml .
COPY knowledge_manifest.yaml .
COPY seeds/ seeds/
COPY docker/entrypoint.sh .

ENV PYTHONPATH=/app/src
EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]

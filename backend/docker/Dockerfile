FROM python:3.12-slim AS builder

WORKDIR /app

RUN pip install --no-cache-dir hatchling

COPY pyproject.toml .
COPY src/ src/

RUN pip install --no-cache-dir .

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

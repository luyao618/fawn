#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding users..."
FAMILY_CONFIG="${FAWN_FAMILY_CONFIG:-config/family.yaml}"
if [ ! -f "$FAMILY_CONFIG" ]; then
  echo "WARNING: $FAMILY_CONFIG not found; using config/family.yaml.example."
  FAMILY_CONFIG="config/family.yaml.example"
fi
python -m scripts.seed_users --config "$FAMILY_CONFIG" --idempotent

echo "Seeding knowledge base..."
python -m scripts.seed_knowledge --idempotent

echo "Seeding WHO growth reference..."
WHO_SEED_CSV="${FAWN_WHO_SEED_CSV:-seeds/who_growth_reference.csv}"
if [ -f "$WHO_SEED_CSV" ]; then
  python -m scripts.seed_who_data --csv "$WHO_SEED_CSV" --idempotent
else
  echo "WARNING: $WHO_SEED_CSV not found; WHO growth reference lines will be unavailable."
fi

echo "Starting server..."
exec uvicorn fawn.main:app --host 0.0.0.0 --port 8000

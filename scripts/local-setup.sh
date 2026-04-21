#!/usr/bin/env bash
# One-shot local dev setup: start Postgres, run migrations, seed test workspace.
# Run from the repo root: bash scripts/local-setup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Load .env
if [ -f .env ]; then
  set -a; source .env; set +a
fi

DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/dachat}"
DB_NAME="dachat"

echo "==> Checking Postgres..."

if nc -z 127.0.0.1 5432 2>/dev/null; then
  echo "    Postgres already running on :5432"
else
  echo "    No Postgres on :5432. Trying to start via Docker..."
  if command -v docker &>/dev/null; then
    if docker ps --format '{{.Names}}' | grep -q '^dachat-pg$'; then
      docker start dachat-pg
    else
      docker run -d --name dachat-pg \
        -e POSTGRES_DB="$DB_NAME" \
        -e POSTGRES_PASSWORD=postgres \
        -p 5432:5432 \
        postgres:16-alpine
    fi
    echo "    Waiting for Postgres to be ready..."
    for i in $(seq 1 20); do
      nc -z 127.0.0.1 5432 2>/dev/null && break
      sleep 1
    done
    nc -z 127.0.0.1 5432 || { echo "ERROR: Postgres did not start. Install Docker Desktop or start Postgres manually."; exit 1; }
  else
    echo ""
    echo "ERROR: Docker not found and no Postgres on :5432."
    echo ""
    echo "Choose one of:"
    echo "  A) Install Docker Desktop (https://www.docker.com/products/docker-desktop/)"
    echo "     then re-run this script."
    echo ""
    echo "  B) Install Postgres via Homebrew:"
    echo "     brew install postgresql@16"
    echo "     brew services start postgresql@16"
    echo "     createdb dachat"
    echo "     then re-run this script."
    echo ""
    echo "  C) Use Neon free tier (https://neon.tech) — set DATABASE_URL in .env then:"
    echo "     pnpm db:migrate && pnpm db:seed"
    exit 1
  fi
fi

echo "==> Running migrations..."
DATABASE_URL="$DB_URL" pnpm db:migrate

echo "==> Seeding test workspace..."
DATABASE_URL="$DB_URL" pnpm db:seed

echo ""
echo "==> Done! API is ready to start:"
echo "    pnpm --filter @dachat/api dev"
echo "    → http://localhost:3000/health"
echo ""
echo "    Widget smoke test API key: dachat_test_key_smoke_abc123"

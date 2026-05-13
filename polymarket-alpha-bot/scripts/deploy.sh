#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[deploy] type-checking & building bot..."
pnpm install --frozen-lockfile || pnpm install
pnpm build

echo "[deploy] building dashboard..."
pnpm dashboard:build

echo "[deploy] bringing services up via docker-compose..."
docker compose up -d --build

echo "[deploy] tailing logs (Ctrl-C to detach)..."
docker compose logs -f --tail=200

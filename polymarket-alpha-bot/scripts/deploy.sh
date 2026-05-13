#!/usr/bin/env bash
set -euo pipefail

pnpm build
pnpm dashboard:build
docker compose up --build -d
docker compose logs -f --tail=100

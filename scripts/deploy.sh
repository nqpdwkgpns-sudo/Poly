#!/usr/bin/env sh
set -eu
pnpm build
pnpm dashboard:build
docker compose up -d --build
docker compose logs -f --tail=100

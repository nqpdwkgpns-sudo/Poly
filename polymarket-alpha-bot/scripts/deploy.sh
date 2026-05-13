#!/usr/bin/env bash
set -euo pipefail

echo "════════════════════════════════════════"
echo "     Polymarket Alpha Bot Deployment"
echo "════════════════════════════════════════"

# Check .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in your keys."
  exit 1
fi

# Build TypeScript
echo ""
echo "→ Building TypeScript..."
pnpm run build

# Build dashboard
echo ""
echo "→ Building dashboard..."
cd src/dashboard
pnpm install --frozen-lockfile
pnpm run build
cd ../..

# Build and start docker-compose
echo ""
echo "→ Starting services..."
docker-compose down --remove-orphans
docker-compose build --no-cache
docker-compose up -d

echo ""
echo "→ Services started:"
docker-compose ps

echo ""
echo "→ Tailing logs (Ctrl+C to stop watching)..."
docker-compose logs -f --tail=50

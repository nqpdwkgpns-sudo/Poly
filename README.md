# Polymarket Alpha Bot

Production-oriented TypeScript scaffold for a Polymarket algorithmic trading bot. It includes market data ingestion, strategy analysis, wallet/order signing, execution lifecycle tracking, risk management, monitoring APIs, a React dashboard, tests, backtesting, and deployment assets.

## Architecture

- `src/config`: zod-validated environment config and Polygon/Polymarket constants.
- `src/market`: Gamma REST client, CLOB REST client, websocket order book cache, and market filters.
- `src/wallet`: Phantom-compatible EVM private-key adapter and EIP-712 order signer.
- `src/execution`: order manager and persistent position tracker.
- `src/strategy`: probability helpers, Kelly sizing, signal aggregation, and strategy modules.
- `src/risk`: synchronous risk limits, circuit breaker, drawdown tracking, and persisted bot state.
- `src/monitoring`: pino logger, Telegram alerts, and Express API for the dashboard.
- `src/dashboard`: Vite + React command-center UI.
- `src/backtest`: CSV replay harness and performance metrics.

## Setup

```sh
cp .env.example .env
pnpm install
pnpm test
pnpm build
```

By default `PAPER_TRADING=true`, so the bot can boot without a funded key and uses an ephemeral wallet with a paper USDC balance. Set `PAPER_TRADING=false` and provide `PHANTOM_PRIVATE_KEY` only when you are ready for live signing.

## Commands

- `pnpm dev`: run the bot with tsx.
- `pnpm test`: run Vitest unit tests.
- `pnpm build`: compile TypeScript.
- `pnpm dashboard`: run the dashboard on port 5173.
- `pnpm dashboard:build`: build dashboard assets.
- `pnpm backtest <csv>`: replay CSV data with columns `timestamp,conditionId,midPrice,volume`.

## Monitoring API

The Express server listens on `API_PORT` (default 3001):

- `GET /api/state`
- `GET /api/positions`
- `GET /api/signals`
- `GET /api/pnl`
- `POST /api/emergency-close`

## Deployment

`scripts/deploy.sh` builds TypeScript, builds the dashboard, starts Docker Compose, and tails logs. The compose file mounts `./data` for `state.json` and `positions.json` persistence.

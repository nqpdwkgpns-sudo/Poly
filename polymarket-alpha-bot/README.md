# Polymarket Alpha Bot

A production-grade algorithmic trading bot for [Polymarket](https://polymarket.com) prediction markets, built in TypeScript/Node.js.

## Architecture Overview

```
polymarket-alpha-bot/
├── src/
│   ├── config/          # Environment config (zod-validated) + constants
│   ├── market/          # Market data fetching (Gamma API, CLOB API, WebSocket)
│   ├── strategy/        # Alpha generation strategies + Kelly sizing
│   ├── execution/       # Order manager + position tracker
│   ├── wallet/          # Phantom/EVM wallet adapter + EIP-712 order signing
│   ├── risk/            # Risk engine, limits, circuit breaker, drawdown tracker
│   ├── monitoring/      # Pino logger, Telegram alerts, Express API server
│   ├── backtest/        # Backtesting harness + performance metrics
│   ├── dashboard/       # Vite + React real-time dashboard
│   └── index.ts         # Bot entrypoint
├── tests/               # Vitest unit tests
├── scripts/             # Deployment scripts
└── data/                # Runtime state (state.json, positions.json)
```

## Trading Strategies

| Strategy | Description | Confidence |
|---|---|---|
| **SpreadArbitrage** | Buys both YES+NO when they sum to < 0.97 | 0.85 |
| **LiquidityFade** | Posts limit orders at mid on thin books to earn spread | 0.40 |
| **MomentumReversal** | Fades sharp price moves > 8% in 10 minutes | 0.50 |
| **NewsCalibration** | Compares market price to Metaculus community forecasts | 0.60 |

All strategies implement the `Strategy` interface and run in parallel via `signalAggregator`.

## Risk Management

- **Daily loss limit** — halts all trading when daily realized loss exceeds `DAILY_LOSS_LIMIT_USDC`
- **Max open positions** — caps concurrent positions at `MAX_OPEN_POSITIONS`
- **Max position size** — no single position exceeds `MAX_POSITION_USDC`
- **Concentration limit** — no category > 40% of total exposure
- **Minimum liquidity** — requires $500 depth on desired side of book
- **Market expiry** — rejects markets expiring in < 12 hours
- **Circuit breaker** — OPEN/HALF_OPEN/CLOSED pattern, triggers on 3 consecutive failures, 20% drawdown, or 10+ RPC errors/min
- **Kelly criterion** — fractional Kelly position sizing (default: 25% of full Kelly)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- A Polygon wallet with USDC
- Polymarket API key (optional, improves rate limits)

### Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your wallet key and API credentials

# Run in development (paper trading first!)
pnpm dev
```

### Dashboard

```bash
cd src/dashboard
pnpm install
pnpm dev
# Open http://localhost:5173
```

### Tests

```bash
pnpm test
```

### Backtest

```bash
# Place historical data CSV at ./data/historical.csv
# Format: timestamp,conditionId,midPrice,volume
pnpm backtest
```

### Deploy with Docker

```bash
# Configure .env first
./scripts/deploy.sh
# Dashboard at http://localhost:80
# API at http://localhost:3001
```

## Environment Variables

See `.env.example` for all required configuration. Key variables:

| Variable | Description | Default |
|---|---|---|
| `PHANTOM_PRIVATE_KEY` | Base58 or hex Polygon private key | required |
| `POLYGON_RPC_URL` | Polygon JSON-RPC endpoint | `https://polygon-rpc.com` |
| `MAX_POSITION_USDC` | Max USDC per position | `500` |
| `KELLY_FRACTION` | Fraction of Kelly bet to use | `0.25` |
| `MIN_EDGE_THRESHOLD` | Minimum edge to trade | `0.03` |
| `DAILY_LOSS_LIMIT_USDC` | Daily loss halt threshold | `200` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for alerts (optional) | — |

## API Server

The bot exposes a REST API on port 3001:

| Endpoint | Description |
|---|---|
| `GET /api/state` | Full bot state |
| `GET /api/positions` | Open positions |
| `GET /api/signals` | Last 50 signals |
| `GET /api/pnl` | 7-day P&L history |
| `POST /api/emergency-close` | Cancel all orders + close positions |
| `GET /health` | Health check |

## Important Warning

**This software is for educational purposes. Algorithmic trading carries significant risk of loss. Never risk more capital than you can afford to lose entirely.**

Read [TRADING_NOTES.md](./TRADING_NOTES.md) before deploying with real capital.

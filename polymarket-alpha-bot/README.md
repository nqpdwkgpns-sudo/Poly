# polymarket-alpha-bot

Production-grade Polymarket algorithmic trading bot written in TypeScript.

> **Risk warning:** prediction-market trading is a zero-sum, fee-paying game with
> illiquid order books and binary outcomes. Read `TRADING_NOTES.md`, paper trade
> with tiny sizes for at least two weeks, and never deploy capital you cannot
> afford to lose entirely.

## Architecture

```
polymarket-alpha-bot/
├── src/
│   ├── config/        # env config (zod) + constants (contract addresses, limits)
│   ├── market/        # Gamma + CLOB REST clients, WebSocket order book, filters
│   ├── strategy/      # edge-detection strategies + Kelly sizing + aggregator
│   ├── execution/     # order manager + position tracker (persisted)
│   ├── wallet/        # Phantom-compatible EVM adapter + EIP-712 order signer
│   ├── risk/          # risk engine, hard limits, circuit breaker, drawdown
│   ├── monitoring/    # pino logger, Telegram alerts, REST API for dashboard
│   ├── dashboard/     # Vite + React real-time monitoring UI
│   ├── backtest/      # historical CSV replay + Sharpe/win-rate metrics
│   ├── runtime.ts     # main bot orchestration (cron loops, lifecycle)
│   └── index.ts       # process entrypoint (graceful shutdown)
├── tests/             # vitest unit tests
├── scripts/           # build & deploy helpers
├── data/              # runtime state (positions.json, state.json) — gitignored
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

### Data flow

```
                  ┌────────────────────────────────────────────────┐
                  │   Gamma API (markets)      CLOB API (books)    │
                  └──────┬────────────────────────┬────────────────┘
                         │                        │
                         ▼                        ▼
                    marketFilter ──► signalAggregator (strategies + Kelly)
                                           │
                                           ▼
                                       riskEngine
                                           │
                                           ▼
                                    orderSigner (EIP-712)
                                           │
                                           ▼
                                    orderManager (CLOB)
                                           │
                                           ▼
                                   positionTracker (state.json)
                                           │
                          ┌────────────────┼──────────────────────┐
                          ▼                ▼                      ▼
                     P&L tracker     Telegram alerts        REST API ──► Dashboard
```

## Quick start

```bash
pnpm install         # or npm install
cp .env.example .env # fill in keys
pnpm test            # run unit tests
pnpm dev             # run bot in watch mode
pnpm dashboard       # start the React dashboard (port 5173)
```

Run all checks before shipping:

```bash
pnpm lint && pnpm test && pnpm build
```

## Configuration

All configuration is loaded via `dotenv` and validated by `zod` in
`src/config/env.ts`. See `.env.example` for the full list of variables. Anything
missing or malformed will crash startup with a descriptive error.

Key knobs:

| Variable                | Default | Meaning                                            |
| ----------------------- | ------- | -------------------------------------------------- |
| `MAX_POSITION_USDC`     | 500     | Hard ceiling per position (USDC notional)          |
| `KELLY_FRACTION`        | 0.25    | Fractional-Kelly multiplier                        |
| `MIN_EDGE_THRESHOLD`    | 0.03    | Skip any signal with edge < 3%                     |
| `MAX_OPEN_POSITIONS`    | 10      | Refuses new entries past this count                |
| `DAILY_LOSS_LIMIT_USDC` | 200     | Trips the circuit breaker on daily realized PnL    |
| `PROFIT_TARGET_PCT`     | 0.15    | Close winners at +15% (per `runtime.ts`)           |
| `STOP_LOSS_PCT`         | 0.08    | Close losers at -8%                                |
| `MAX_DRAWDOWN_PCT`      | 0.20    | Circuit breaker fires above this peak-to-trough    |

## Deployment

`docker-compose up -d --build` runs the bot and serves the dashboard from
`nginx`. See `scripts/deploy.sh` and `Dockerfile` for details.

## Tests

```bash
pnpm test
```

Covers Kelly math, probability engine, order signer, and the risk engine.

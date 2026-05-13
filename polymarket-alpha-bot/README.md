# polymarket-alpha-bot

Production-oriented TypeScript scaffold for a Polymarket algorithmic trading system with:

- Market data ingestion (Gamma, CLOB, websocket cache)
- Strategy engine (spread arb, liquidity fade, momentum reversal, news calibration)
- Wallet + EIP-712 signing + execution pipeline
- Risk gates + circuit breaker + drawdown tracker
- Monitoring API + Telegram alerts + React dashboard
- Vitest coverage for core math/signing/risk behavior
- Backtesting harness and deployment assets

## Architecture

```text
src/
  config/        env validation + network constants
  market/        gamma/clob/ws data clients + filters + shared types
  strategy/      probability + strategy implementations + Kelly sizing
  execution/     order lifecycle + position persistence
  wallet/        Phantom-compatible signer and USDC approvals
  risk/          limits + risk gate + circuit breaker + state persistence
  monitoring/    logger + telegram + REST API server
  backtest/      CSV replay + metrics
  dashboard/     Vite React monitoring interface
  index.ts       orchestrates startup, loops, and shutdown
```

## Quick start

1. Copy environment template:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

3. Run the bot:

```bash
pnpm dev
```

4. Run tests:

```bash
pnpm test
```

5. Run dashboard:

```bash
pnpm dashboard
```

## Bot loops

- **Scan loop (30s):** market fetch -> tradeable filter -> order books -> strategy signals -> risk approval -> Kelly size -> sign + submit.
- **Position loop (60s):** refresh marks, manage take profit/stop loss, persist positions.
- **Risk loop (10s):** daily limit checks, drawdown tracking, circuit breaker metrics, state persistence.
- **Daily summary (23:50 UTC):** Telegram P&L summary.

## API endpoints

- `GET /api/state`
- `GET /api/positions`
- `GET /api/signals`
- `GET /api/pnl`
- `POST /api/emergency-close`

Server runs from `src/monitoring/apiServer.ts` on `:3001`.

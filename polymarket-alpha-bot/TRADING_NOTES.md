# Trading notes

This document is required reading before pointing real money at the bot.

## Paper-trade first

1. Set `MAX_POSITION_USDC=10` and `DAILY_LOSS_LIMIT_USDC=20` in `.env`.
2. Run the bot in `NODE_ENV=development` for **at least two weeks**.
3. Watch the dashboard signal feed, not just the P&L line. A profitable run with
   a tiny sample is mostly noise.

## Reading the signal logs

Every strategy emits structured logs. To evaluate strategy quality:

- Filter by `component:strategy.*` and `event:signal_emitted` /
  `event:signal_rejected`.
- For each `conditionId`, compare `impliedProbability` (our model) vs.
  `marketProbability` (top-of-book mid). Persistent over-confidence in either
  direction is a tell: your prior is mis-calibrated.
- For approved signals, compare the `edge` at entry to the realized P&L at
  close. Track `avgEdgeCapture` — anything below 30% means slippage is eating
  you alive.
- Rejected signals carry a `reason` string from `riskEngine`. If most rejections
  are `min_liquidity`, you are scanning markets that are not actually tradeable.

## Risk philosophy

- **Never risk more than you can afford to lose entirely.** Polymarket markets
  resolve binary; mis-priced ones often stay mis-priced until the deadline.
- **Fractional Kelly only.** Full Kelly maximizes growth assuming your edge
  estimate is exact. It never is. The default fraction is 0.25.
- **Hard limits live in `src/risk/limits.ts`.** Edit those numbers, not the
  strategy logic, when you want to be more conservative.
- **Circuit breaker is non-negotiable.** Three consecutive failed orders or a
  daily loss breach trips it. Do not auto-bypass it — let it cool down.
- **Walk-away mentality.** If you are watching the dashboard every minute, your
  size is wrong. Tighten limits until you can ignore it for an hour.

## Going live

1. Backtest each strategy on at least six months of historical data
   (`pnpm backtest`).
2. Verify Sharpe > 1, win rate > 50%, profit factor > 1.5 *after* slippage.
3. Deploy to a server with a static IP; flaky home connections will lose money
   on missed cancels.
4. Fund the wallet with the minimum capital the strategies need.
5. Send the daily PnL summary to a chat you actually read.

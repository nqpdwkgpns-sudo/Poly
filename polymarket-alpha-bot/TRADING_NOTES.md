# Trading Notes

## Start in paper-trade mode

Before risking meaningful capital, reduce:

- `MAX_POSITION_USDC=10`
- `MAX_OPEN_POSITIONS=2`
- `DAILY_LOSS_LIMIT_USDC=20`

Run the bot continuously with these limits and verify behavior from logs + dashboard.

## Reading signal logs

Every signal is recorded with:

- strategy name
- edge estimate
- approval or rejection
- rejection reason (risk gate, sizing, circuit breaker)

Review `signalAudit` in `/api/state` and compare approved signals against realized position outcomes. If a strategy emits frequent low-quality signals (high rejection or negative realized outcomes), disable or retune it.

## Risk philosophy

Treat this as high-risk speculative automation. Assume total loss is possible.

- never deploy funds you cannot lose entirely
- keep strict hard limits enabled at all times
- monitor drawdown, order failures, and circuit breaker state daily
- prioritize capital preservation over maximizing fill frequency

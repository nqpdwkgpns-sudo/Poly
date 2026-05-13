# Trading Notes

## Paper trade first

Start with `PAPER_TRADING=true` and keep `MAX_POSITION_USDC=10` while validating logs, fills, and dashboard state. Do not connect a funded wallet until strategy behavior, risk gates, and emergency shutdown have been exercised in a safe environment.

## Reading signal logs

Every signal considered is written with strategy name, edge, confidence, sizing, approval state, and rejection reason. Review rejected signals as closely as accepted signals; a healthy bot should reject many weak or illiquid opportunities before any order reaches the CLOB.

## Risk philosophy

Prediction markets can gap to zero, liquidity can disappear, and API failures can cluster. Treat every deposited USDC as capital you can afford to lose entirely. The bot enforces daily loss, position count, concentration, liquidity, expiry, duplicate-position, circuit-breaker, and drawdown gates, but these controls reduce risk rather than remove it.

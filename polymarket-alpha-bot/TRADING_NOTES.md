# Trading Notes — Polymarket Alpha Bot

## How to Paper Trade First

**Never risk real money until you've run the bot in paper mode for at least 2 weeks.**

### Step 1: Configure tiny sizes

In your `.env` file, set conservative limits for paper trading:

```
MAX_POSITION_USDC=10         # Maximum $10 per trade
DAILY_LOSS_LIMIT_USDC=50     # Stop trading after $50 daily loss
MAX_OPEN_POSITIONS=5          # Limit concurrent positions
KELLY_FRACTION=0.10           # Use 10% of Kelly for extra safety
MIN_EDGE_THRESHOLD=0.05       # Require 5% edge (higher bar)
```

### Step 2: Fund a test wallet

- Create a separate Polygon wallet for paper trading
- Transfer a small amount ($50–$100) of USDC for testing
- Never use your primary wallet for initial testing

### Step 3: Run the bot with real but tiny trades

The bot places actual orders at tiny sizes. This tests:
- API connectivity and authentication
- Order signing and submission flow
- Position tracking and P&L calculation
- Risk limit behavior under real market conditions

### Step 4: Monitor the dashboard daily

Open the dashboard at `http://localhost:5173` and review:
- Which strategies generate the most signals
- Signal-to-trade conversion rate (how many pass risk checks)
- Actual vs theoretical edge (edge capture ratio)
- Win rate by strategy

---

## How to Read Signal Logs

The bot logs every signal considered with structured JSON. To parse them:

```bash
# Watch live signals
pnpm dev | grep '"signal"'

# Count signals by strategy
cat logs/bot.log | jq '.strategyName' | sort | uniq -c

# Find best-performing signals
cat logs/bot.log | jq 'select(.edge > 0.05)' | head -20
```

Key fields to evaluate:

| Field | Meaning |
|---|---|
| `edge` | Theoretical probability advantage (e.g. 0.08 = 8%) |
| `confidence` | Strategy's confidence in its estimate (0–1) |
| `score` | `edge × confidence` — used for ranking |
| `approved` | Whether risk engine allowed the trade |
| `reasoning` | Human-readable explanation of the signal |

**A strategy is working well if:**
- Edge > 5% consistently
- Confidence > 0.5 on approved signals
- Approved rate > 30% (not blocked by risk limits too often)
- Win rate > 52% over 50+ trades

---

## Risk Management Philosophy

### Core principles

1. **Survival first, profits second.** The circuit breaker exists to save your capital, not to be disabled. Never turn it off.

2. **The Kelly criterion is already conservative.** With `KELLY_FRACTION=0.25`, you're using 25% of the theoretically optimal bet size. This is intentional — prediction markets have high variance.

3. **Diversify across strategies.** No single strategy has permanent edge. Markets adapt.

4. **The daily loss limit is non-negotiable.** When triggered, the bot stops trading for the day. Resist the urge to restart it manually. Tomorrow is a new day.

5. **Size is everything.** A brilliant strategy with oversized positions will blow up. A mediocre strategy with proper sizing survives.

### Sizing guidelines

| Portfolio Size | MAX_POSITION_USDC | DAILY_LOSS_LIMIT_USDC |
|---|---|---|
| $500 | $25 | $50 |
| $1,000 | $50 | $100 |
| $5,000 | $200 | $500 |
| $10,000+ | $500 | $1,000 |

### Warning signs

Stop the bot and review if you see:
- Win rate below 40% over 50+ trades
- Drawdown exceeding 15%
- Circuit breaker opening more than 3 times per week
- Consistent losses on the same strategy

### Never risk more than you can afford to lose entirely

Prediction markets are inherently uncertain. The bot automates a probabilistic strategy — it is not guaranteed to be profitable. The entire capital deployed could be lost.

**Only deploy capital you are fully prepared to lose in its entirety.**

---

## Backtesting

Before going live, run the backtester:

```bash
pnpm backtest
```

You need historical CSV data in `./data/historical.csv` with format:
```
timestamp,conditionId,midPrice,volume
1715000000000,abc123,0.45,25000
...
```

The backtest runs all strategies on historical data and outputs:
- `data/backtest_results.json` — full results
- Console summary table with Sharpe ratio, max drawdown, win rate, profit factor

**Target metrics before going live:**
- Sharpe Ratio > 1.0
- Max Drawdown < 20%
- Win Rate > 50%
- Profit Factor > 1.3
- Edge Capture > 50% (capturing more than half of theoretical edge)

---

## Deployment Checklist

Before going live with real capital:

- [ ] Ran in paper mode for ≥ 2 weeks with no crashes
- [ ] Backtested all strategies on historical data
- [ ] Win rate > 50% in paper trading
- [ ] Reviewed all signal logs and rejection reasons
- [ ] Set appropriate `MAX_POSITION_USDC` for your account size
- [ ] Telegram alerts configured and tested
- [ ] Dashboard accessible and showing live data
- [ ] `.env` backed up securely (not committed to git)
- [ ] Wallet approved for CTF Exchange USDC spending
- [ ] `data/` directory on persistent volume (survives restarts)

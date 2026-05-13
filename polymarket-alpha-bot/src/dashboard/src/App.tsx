import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type BotState = {
  balanceUsdc: number;
  dailyRealizedPnl: number;
  drawdownPct: number;
  circuitBreakerStatus: "CLOSED" | "OPEN" | "HALF_OPEN";
  openPositions: Array<{
    conditionId: string;
    marketQuestion: string;
    side: "BUY" | "SELL";
    entryPrice: number;
    currentPrice: number;
    size: number;
  }>;
  signalAudit: Array<{
    timestamp: number;
    marketQuestion: string;
    strategy: string;
    edge: number;
    approved: boolean;
    reason?: string;
  }>;
  pnlHistory: Array<{ date: string; pnl: number }>;
  lastDailyResetAt: string;
};

const formatMoney = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const utilizationColor = (value: number) => {
  if (value >= 90) {
    return "#ff3b5c";
  }
  if (value >= 70) {
    return "#ffd166";
  }
  return "#00ff88";
};

export default function App() {
  const [state, setState] = useState<BotState | null>(null);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const poll = async () => {
      const response = await fetch("http://localhost:3001/api/state");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as BotState;
      setState(payload);
    };
    void poll();
    const pollInterval = setInterval(() => void poll(), 5_000);
    const uptimeInterval = setInterval(() => setUptime(Math.floor((Date.now() - startedAt) / 1000)), 1_000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(uptimeInterval);
    };
  }, []);

  const riskBars = useMemo(() => {
    if (!state) {
      return [];
    }
    const openPositionUtil = Math.min(100, (state.openPositions.length / 10) * 100);
    const dailyLossUtil = Math.min(100, Math.abs(state.dailyRealizedPnl / 200) * 100);
    const drawdownUtil = Math.min(100, state.drawdownPct * 100);
    const concentration = state.openPositions.reduce<Record<string, number>>((acc, pos) => {
      const category = pos.marketQuestion.split(" ")[0]?.toLowerCase() ?? "other";
      acc[category] = (acc[category] ?? 0) + pos.entryPrice * pos.size;
      return acc;
    }, {});
    const total = Object.values(concentration).reduce((a, b) => a + b, 0);
    const maxConcentration = total > 0 ? Math.max(...Object.values(concentration)) / total : 0;
    return [
      { label: "Daily Loss", pct: dailyLossUtil },
      { label: "Open Positions", pct: openPositionUtil },
      { label: "Concentration", pct: maxConcentration * 100 },
      { label: "Drawdown", pct: drawdownUtil }
    ];
  }, [state]);

  if (!state) {
    return <div className="loading">Loading bot state...</div>;
  }

  const isLive = state.circuitBreakerStatus === "CLOSED";
  const pnlClass = state.dailyRealizedPnl >= 0 ? "profit" : "loss";

  return (
    <div className="app">
      <header className="header">
        <h1>Polymarket Alpha Desk</h1>
      </header>
      <main className="grid">
        <section className="panel">
          <h2>Bot Status</h2>
          <div className="statusRow">
            <span className={`dot ${isLive ? "dotLive" : "dotHalted"}`} />
            <strong>{isLive ? "Live" : "Halted"}</strong>
          </div>
          <p>Circuit: {state.circuitBreakerStatus}</p>
          <p>USDC Balance: {formatMoney(state.balanceUsdc)}</p>
          <p className={pnlClass}>Daily P&L: {formatMoney(state.dailyRealizedPnl)}</p>
          <p>Drawdown: {(state.drawdownPct * 100).toFixed(2)}%</p>
          <p>Uptime: {uptime}s</p>
        </section>

        <section className="panel">
          <h2>Open Positions</h2>
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th>Entry</th>
                <th>Current</th>
                <th>P&L</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {state.openPositions.map((position) => {
                const pnl = (position.currentPrice - position.entryPrice) * position.size * (position.side === "BUY" ? 1 : -1);
                return (
                  <tr key={position.conditionId}>
                    <td>{position.marketQuestion.slice(0, 38)}</td>
                    <td>{position.side}</td>
                    <td>{formatMoney(position.entryPrice)}</td>
                    <td>{formatMoney(position.currentPrice)}</td>
                    <td className={pnl >= 0 ? "profit pulse" : "loss pulse"}>{formatMoney(pnl)}</td>
                    <td>{formatMoney(position.size)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            className="dangerButton"
            onClick={async () => {
              await fetch("http://localhost:3001/api/emergency-close", { method: "POST" });
            }}
          >
            Close All
          </button>
        </section>

        <section className="panel">
          <h2>Signal Feed</h2>
          <div className="feed">
            {state.signalAudit.slice(-20).reverse().map((signal) => (
              <div key={`${signal.timestamp}-${signal.strategy}`} className={`feedItem ${signal.approved ? "" : "dimmed"}`}>
                <div>{signal.marketQuestion.slice(0, 40)}</div>
                <div>{signal.strategy}</div>
                <div>{(signal.edge * 100).toFixed(2)}%</div>
                <div>{signal.approved ? "approved" : `rejected: ${signal.reason ?? "n/a"}`}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <section className="panel chartPanel">
        <h2>P&L (7d)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={state.pnlHistory}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ff88" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#ff3b5c" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#2a2a3a" />
            <XAxis dataKey="date" stroke="#e8e8f0" />
            <YAxis stroke="#e8e8f0" />
            <Tooltip />
            <Area type="monotone" dataKey="pnl" stroke="#00ff88" fill="url(#pnlGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <h2>Risk Limits</h2>
        {riskBars.map((bar) => (
          <div key={bar.label} className="riskBar">
            <span>{bar.label}</span>
            <div className="riskTrack">
              <div
                className="riskFill"
                style={{ width: `${bar.pct}%`, background: utilizationColor(bar.pct) }}
              />
            </div>
            <span>{bar.pct.toFixed(1)}%</span>
          </div>
        ))}
      </section>
    </div>
  );
}

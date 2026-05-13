import React, { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  api,
  BotStatePayload,
  PnlPoint,
  PositionsPayload,
  SignalRow,
} from './api.js';

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function uptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function pctClass(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 0.9) return 'red';
  if (pct >= 0.7) return 'yellow';
  return 'green';
}

interface AnimatedNumberProps { value: number; className?: string; decimals?: number; prefix?: string; }
const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, className, decimals = 2, prefix = '' }) => {
  const [flash, setFlash] = useState<string>('');
  useEffect(() => {
    setFlash('cell-pulse');
    const t = setTimeout(() => setFlash(''), 600);
    return () => clearTimeout(t);
  }, [value]);
  return <span className={`${className ?? ''} ${flash}`}>{prefix}{fmt(value, decimals)}</span>;
};

export const App: React.FC = () => {
  const [state, setState] = useState<BotStatePayload | null>(null);
  const [positions, setPositions] = useState<PositionsPayload | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [pnl, setPnl] = useState<PnlPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [s, p, sg, pn] = await Promise.all([
          api.state(),
          api.positions(),
          api.signals(),
          api.pnl(),
        ]);
        if (cancelled) return;
        setState(s);
        setPositions(p);
        setSignals(sg);
        setPnl(pn);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const dailyPct = useMemo(() => {
    if (!state) return 0;
    const limit = 200; // matches DAILY_LOSS_LIMIT_USDC default
    return Math.min(1, Math.abs(state.realizedPnlToday) / limit);
  }, [state]);
  const openPosPct = useMemo(() => {
    if (!positions) return 0;
    return Math.min(1, positions.positions.length / 10);
  }, [positions]);
  const drawdownPct = useMemo(() => {
    if (!state) return 0;
    const peak = Math.max(state.peakBalanceUsdc, 1);
    const dd = Math.max(0, (peak - state.balanceUsdc) / peak);
    return Math.min(1, dd / 0.2);
  }, [state]);
  const concentrationPct = useMemo(() => {
    if (!state) return 0;
    const exposures = Object.values(state.categoryExposure ?? {});
    const max = exposures.length ? Math.max(...exposures) : 0;
    const total = (state.balanceUsdc ?? 0) + exposures.reduce((a, b) => a + b, 0);
    if (total <= 0) return 0;
    return Math.min(1, max / total / 0.4);
  }, [state]);

  const pnlSeries = pnl.map((p) => ({ ts: new Date(p.ts).toLocaleDateString(), total: p.total }));

  const onEmergency = async () => {
    if (!confirm('Cancel all orders and close all positions?')) return;
    const r = await api.emergencyClose();
    alert(`Closed ${r.closed} positions`);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>polymarket · alpha · terminal</h1>
        <div>
          {state ? (
            state.circuitBreaker === 'CLOSED' ? (
              <span className="badge live"><span className="dot" />LIVE</span>
            ) : state.circuitBreaker === 'HALF_OPEN' ? (
              <span className="badge warn"><span className="dot" />HALF-OPEN</span>
            ) : (
              <span className="badge halted"><span className="dot" />HALTED</span>
            )
          ) : (
            <span className="badge warn">connecting...</span>
          )}
          {error && <span className="muted" style={{ marginLeft: 8 }}>err: {error}</span>}
        </div>
      </header>

      <section className="cols">
        <div className="panel">
          <h2>bot status</h2>
          <div className="statRow">
            <span className="label">USDC balance</span>
            <AnimatedNumber className="big" value={state?.balanceUsdc ?? 0} prefix="$" />
          </div>
          <div className="statRow">
            <span className="label">Daily P&amp;L</span>
            <AnimatedNumber
              className={`val ${state && state.realizedPnlToday < 0 ? 'red' : 'green'}`}
              value={state?.realizedPnlToday ?? 0}
              prefix="$"
            />
          </div>
          <div className="statRow">
            <span className="label">Realized total</span>
            <AnimatedNumber className="val" value={state?.realizedPnlTotal ?? 0} prefix="$" />
          </div>
          <div className="statRow">
            <span className="label">Open positions</span>
            <span className="val">{positions?.positions.length ?? 0}</span>
          </div>
          <div className="statRow">
            <span className="label">Circuit breaker</span>
            <span className={`val ${state?.circuitBreaker === 'OPEN' ? 'red' : 'green'}`}>
              {state?.circuitBreaker ?? '-'}
            </span>
          </div>
          <div className="statRow">
            <span className="label">Drawdown</span>
            <span className={`val ${pctClass(drawdownPct)}`}>{fmt(drawdownPct * 100, 1)}%</span>
          </div>
          <div className={`bar ${pctClass(drawdownPct)}`}>
            <div style={{ width: `${drawdownPct * 100}%` }} />
          </div>
          <div className="statRow" style={{ marginTop: 16 }}>
            <span className="label">Uptime</span>
            <span className="val">{state ? uptime(state.uptimeMs) : '-'}</span>
          </div>
        </div>

        <div className="panel">
          <h2>open positions</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Side</th>
                <th className="right">Entry</th>
                <th className="right">Mark</th>
                <th className="right">P&amp;L</th>
                <th className="right">Size</th>
              </tr>
            </thead>
            <tbody>
              {positions?.positions.length ? (
                positions.positions.map((p) => (
                  <tr key={p.conditionId}>
                    <td title={p.market}>{p.market.length > 38 ? p.market.slice(0, 38) + '…' : p.market}</td>
                    <td className={p.side === 'BUY' ? 'green' : 'red'}>{p.side}</td>
                    <td className="right">{fmt(p.entryPrice, 3)}</td>
                    <td className="right">{fmt(p.currentPrice, 3)}</td>
                    <td className={`right cell-pulse ${p.unrealizedPnl >= 0 ? 'green' : 'red'}`}>
                      {fmt(p.unrealizedPnl)}
                    </td>
                    <td className="right">{fmt(p.size)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="muted">no open positions</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button className="emergency" onClick={onEmergency}>close all</button>
          </div>
        </div>

        <div className="panel">
          <h2>signal feed</h2>
          <div className="feed">
            {signals.length === 0 && <div className="muted">no signals yet</div>}
            {signals.map((s, i) => (
              <div key={`${s.conditionId}-${i}`} className={`row ${s.approved ? 'approved' : 'rejected'}`}>
                <div title={s.rationale}>{s.strategy}</div>
                <div className={s.side === 'BUY' ? 'green' : 'red'}>{s.side}</div>
                <div>{fmt(s.edge * 100, 1)}%</div>
                <div className="muted">{s.approved ? 'OK' : s.reason ?? 'reject'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="footer">
        <div className="panel">
          <h2>7-day cumulative P&amp;L</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={pnlSeries} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="pnlNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff3b5c" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#ff3b5c" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2a2a3a" strokeDasharray="3 3" />
              <XAxis dataKey="ts" stroke="#8c8ca0" fontSize={10} />
              <YAxis stroke="#8c8ca0" fontSize={10} />
              <ReferenceLine y={0} stroke="#2a2a3a" />
              <Tooltip
                contentStyle={{ background: '#12121a', border: '1px solid #2a2a3a', color: '#e8e8f0' }}
                formatter={(v: number) => `$${fmt(v)}`}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#00ff88"
                fill="url(#pnlPos)"
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <h2>risk limits</h2>
          {[
            { label: 'Daily loss', pct: dailyPct },
            { label: 'Open positions', pct: openPosPct },
            { label: 'Concentration', pct: concentrationPct },
            { label: 'Drawdown', pct: drawdownPct },
          ].map((r) => (
            <div key={r.label} style={{ marginBottom: 12 }}>
              <div className="statRow" style={{ marginBottom: 2 }}>
                <span className="label">{r.label}</span>
                <span className={`val ${pctClass(r.pct)}`}>{fmt(r.pct * 100, 0)}%</span>
              </div>
              <div className={`bar ${pctClass(r.pct)}`}>
                <div style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

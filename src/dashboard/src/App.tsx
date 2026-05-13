import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type CircuitStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface Position {
  conditionId: string;
  marketQuestion: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  size: number;
}

interface BotState {
  balanceUsdc: number;
  dailyRealizedPnl: number;
  peakBalanceUsdc: number;
  openPositions: Position[];
  circuitBreakerStatus: CircuitStatus;
  lastSignals: Array<Record<string, unknown>>;
  pnlHistory: Array<{ date: string; pnl: number }>;
  startedAt: string;
}

const emptyState: BotState = {
  balanceUsdc: 0,
  dailyRealizedPnl: 0,
  peakBalanceUsdc: 0,
  openPositions: [],
  circuitBreakerStatus: 'OPEN',
  lastSignals: [],
  pnlHistory: [],
  startedAt: new Date().toISOString()
};

export function App() {
  const [state, setState] = useState<BotState>(emptyState);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchState = async () => {
      const response = await fetch('/api/state');
      if (response.ok) setState(await response.json() as BotState);
    };
    void fetchState();
    const interval = setInterval(() => void fetchState(), 5_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, []);

  const drawdown = useMemo(() => {
    if (state.peakBalanceUsdc <= 0) return 0;
    return Math.max(0, (state.peakBalanceUsdc - state.balanceUsdc) / state.peakBalanceUsdc);
  }, [state.balanceUsdc, state.peakBalanceUsdc]);

  const uptime = Math.floor((now - new Date(state.startedAt).getTime()) / 1000);
  const live = state.circuitBreakerStatus === 'CLOSED';

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Polymarket CLOB</p>
          <h1>Alpha Bot Command Center</h1>
        </div>
        <div className={`live-badge ${live ? 'is-live' : 'is-halted'}`}><span />{live ? 'LIVE' : 'HALTED'}</div>
      </header>

      <section className="grid-three">
        <Panel title="Bot Status">
          <Metric label="Circuit Breaker" value={state.circuitBreakerStatus} danger={!live} />
          <Metric label="USDC Balance" value={money(state.balanceUsdc)} hero />
          <Metric label="Daily P&L" value={money(state.dailyRealizedPnl)} danger={state.dailyRealizedPnl < 0} positive={state.dailyRealizedPnl >= 0} />
          <Meter label="Drawdown" value={drawdown} dangerAt={0.15} />
          <Metric label="Uptime" value={formatUptime(uptime)} />
        </Panel>

        <Panel title="Open Positions" action={<button className="panic" onClick={() => void emergencyClose()}>Close All</button>}>
          <table>
            <thead><tr><th>Market</th><th>Side</th><th>Entry</th><th>Current</th><th>P&L</th><th>Size</th></tr></thead>
            <tbody>
              {state.openPositions.map((position) => (
                <tr key={position.conditionId}>
                  <td>{position.marketQuestion}</td>
                  <td>{position.side}</td>
                  <td>{percent(position.entryPrice)}</td>
                  <td>{percent(position.currentPrice)}</td>
                  <td className={position.unrealizedPnl >= 0 ? 'profit pulse' : 'loss pulse'}>{money(position.unrealizedPnl)}</td>
                  <td>{money(position.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Signal Feed">
          <div className="signal-feed">
            {state.lastSignals.slice(-20).map((signal, index) => (
              <div className={`signal ${signal.approved ? 'approved' : 'rejected'}`} key={`${signal.conditionId}-${index}`}>
                <strong>{String(signal.marketQuestion ?? signal.conditionId ?? 'market')}</strong>
                <span>{String(signal.strategy ?? 'strategy')} | edge {percent(Number(signal.edge ?? 0))}</span>
                <small>{signal.approved ? 'approved' : `rejected: ${String(signal.reason ?? signal.rejectionReason ?? 'risk gate')}`}</small>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="bottom-grid">
        <Panel title="7-Day Cumulative P&L">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={state.pnlHistory.map((point) => ({ ...point, date: new Date(point.date).toLocaleDateString() }))}>
                <defs>
                  <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00ff88" stopOpacity={0.45}/>
                    <stop offset="95%" stopColor="#ff3b5c" stopOpacity={0.08}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2a2a3a" />
                <XAxis dataKey="date" stroke="#8a8a9a" />
                <YAxis stroke="#8a8a9a" />
                <Tooltip contentStyle={{ background: '#12121a', border: '1px solid #2a2a3a' }} />
                <Area type="monotone" dataKey="pnl" stroke="#00ff88" fill="url(#pnlFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Risk Limits">
          <Meter label="Daily Loss" value={Math.min(1, Math.abs(state.dailyRealizedPnl) / 200)} />
          <Meter label="Open Positions" value={Math.min(1, state.openPositions.length / 10)} />
          <Meter label="Concentration" value={categoryConcentration(state.openPositions)} />
          <Meter label="Drawdown" value={drawdown} />
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="panel"><div className="panel-header"><h2>{title}</h2>{action}</div>{children}</section>;
}

function Metric({ label, value, hero, danger, positive }: { label: string; value: string; hero?: boolean; danger?: boolean; positive?: boolean }) {
  return <div className={`metric ${hero ? 'hero' : ''} ${danger ? 'loss' : ''} ${positive ? 'profit' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Meter({ label, value, dangerAt = 0.9 }: { label: string; value: number; dangerAt?: number }) {
  const className = value >= dangerAt ? 'danger' : value >= 0.7 ? 'warn' : '';
  return <div className="meter"><div><span>{label}</span><b>{percent(value)}</b></div><div className="bar"><i className={className} style={{ width: `${Math.min(100, value * 100)}%` }} /></div></div>;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percent(value: number): string {
  return (value * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function categoryConcentration(positions: Position[]): number {
  const exposures = new Map<string, number>();
  let total = 0;
  for (const position of positions) {
    const exposure = position.entryPrice * position.size;
    total += exposure;
    exposures.set(position.marketQuestion, (exposures.get(position.marketQuestion) ?? 0) + exposure);
  }
  return total <= 0 ? 0 : Math.max(...exposures.values()) / total;
}

async function emergencyClose(): Promise<void> {
  await fetch('/api/emergency-close', { method: 'POST' });
}

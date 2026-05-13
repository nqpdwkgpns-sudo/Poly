import React, { useCallback } from 'react';
import { useApi } from './hooks/useApi';
import { BotStatus } from './components/BotStatus';
import { PositionsTable } from './components/PositionsTable';
import { SignalFeed } from './components/SignalFeed';
import { PnlChart } from './components/PnlChart';
import { RiskLimits } from './components/RiskLimits';
import { BotState, Position, Signal, PnlEntry } from './types';

const API_BASE = '/api';

export default function App() {
  const { data: state, error: stateError } = useApi<BotState>(`${API_BASE}/state`, 5000);
  const { data: positions } = useApi<Position[]>(`${API_BASE}/positions`, 5000);
  const { data: signals } = useApi<Signal[]>(`${API_BASE}/signals`, 5000);
  const { data: pnlHistory } = useApi<PnlEntry[]>(`${API_BASE}/pnl`, 30000);

  const handleEmergencyClose = useCallback(async () => {
    if (!confirm('Close ALL open positions and orders? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/emergency-close`, { method: 'POST' });
      const json = await res.json() as { success?: boolean; error?: string };
      if (json.success) {
        alert('Emergency close executed successfully');
      } else {
        alert(`Emergency close failed: ${json.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Request failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  if (stateError && !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-red text-4xl">⚠</div>
          <div className="font-display text-xl text-text-primary">Bot API Unreachable</div>
          <div className="text-text-muted text-sm font-mono">
            Make sure the bot is running on port 3001
          </div>
          <div className="text-text-muted text-xs">{stateError}</div>
        </div>
      </div>
    );
  }

  const defaultState: BotState = {
    balanceUsdc: 0,
    peakBalance: 0,
    openPositionCount: 0,
    dailyRealizedPnl: 0,
    totalRealizedPnl: 0,
    circuitBreakerStatus: 'OPEN',
    circuitBreakerReason: 'Connecting...',
    drawdownPct: 0,
    categoryExposure: {},
    isLive: false,
    uptime: 0,
  };

  const s = state ?? defaultState;

  return (
    <div className="min-h-screen bg-background text-text-primary font-mono">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-display text-xl font-bold tracking-wider">
            POLYMARKET<span className="text-green"> ALPHA</span>
          </span>
          <span className="text-xs text-text-muted px-2 py-0.5 border border-border rounded">
            TRADING BOT v1.0
          </span>
        </div>
        <div className="text-xs text-text-muted font-mono">
          {new Date().toUTCString()}
        </div>
      </header>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-3 gap-0 h-[calc(100vh-48px-200px)] min-h-[500px]">
        {/* Column 1 — Bot Status */}
        <div className="border-r border-border p-5 overflow-y-auto">
          <BotStatus state={s} />
        </div>

        {/* Column 2 — Open Positions */}
        <div className="border-r border-border p-5 overflow-y-auto">
          <PositionsTable
            positions={positions ?? []}
            onEmergencyClose={handleEmergencyClose}
          />
        </div>

        {/* Column 3 — Signal Feed */}
        <div className="p-5 overflow-y-auto">
          <SignalFeed signals={signals ?? []} />
        </div>
      </div>

      {/* Bottom panel */}
      <div className="border-t border-border grid grid-cols-2 gap-0 h-[200px]">
        <div className="border-r border-border p-4 overflow-hidden">
          <PnlChart data={pnlHistory ?? []} />
        </div>
        <div className="p-4">
          <RiskLimits state={s} />
        </div>
      </div>
    </div>
  );
}

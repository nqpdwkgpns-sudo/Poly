import React, { useEffect, useState } from 'react';
import { BotState } from '../types';

interface Props {
  state: BotState;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function BotStatus({ state }: Props) {
  const [uptime, setUptime] = useState(state.uptime);

  useEffect(() => {
    const timer = setInterval(() => setUptime((u) => u + 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  const isLive = state.circuitBreakerStatus === 'CLOSED';
  const dailyPnl = state.dailyRealizedPnl ?? 0;
  const drawdownPct = (state.drawdownPct ?? 0) * 100;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold tracking-widest text-text-muted uppercase">
        Bot Status
      </h2>

      {/* Live/Halted badge */}
      <div className="flex items-center gap-3 p-3 rounded bg-panel border border-border">
        <span
          className={`w-3 h-3 rounded-full ${isLive ? 'bg-green pulse-green' : 'bg-red pulse-red'}`}
        />
        <span className={`font-bold text-lg ${isLive ? 'text-green' : 'text-red'}`}>
          {isLive ? 'LIVE' : state.circuitBreakerStatus}
        </span>
        {state.circuitBreakerReason && (
          <span className="text-xs text-text-muted truncate">{state.circuitBreakerReason}</span>
        )}
      </div>

      {/* USDC Balance */}
      <div className="p-4 rounded bg-panel border border-border">
        <div className="text-xs text-text-muted mb-1 uppercase tracking-widest">USDC Balance</div>
        <div className="text-3xl font-bold text-text-primary font-mono">
          ${fmt(state.balanceUsdc ?? 0)}
        </div>
        <div className="text-xs text-text-muted mt-1">
          Peak: ${fmt(state.peakBalance ?? 0)}
        </div>
      </div>

      {/* Daily P&L */}
      <div className="p-4 rounded bg-panel border border-border">
        <div className="text-xs text-text-muted mb-1 uppercase tracking-widest">Daily P&amp;L</div>
        <div className={`text-2xl font-bold font-mono flex items-center gap-2 ${dailyPnl >= 0 ? 'text-green' : 'text-red'}`}>
          {dailyPnl >= 0 ? '▲' : '▼'} ${fmt(Math.abs(dailyPnl))}
        </div>
        <div className="text-xs text-text-muted mt-1">
          Total: <span className={state.totalRealizedPnl >= 0 ? 'text-green' : 'text-red'}>
            {state.totalRealizedPnl >= 0 ? '+' : ''}${fmt(state.totalRealizedPnl ?? 0)}
          </span>
        </div>
      </div>

      {/* Drawdown meter */}
      <div className="p-4 rounded bg-panel border border-border">
        <div className="text-xs text-text-muted mb-2 uppercase tracking-widest">Drawdown</div>
        <div className="relative h-2 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              drawdownPct > 15 ? 'bg-red' : drawdownPct > 8 ? 'bg-yellow' : 'bg-green'
            }`}
            style={{ width: `${Math.min(100, drawdownPct * 5)}%` }}
          />
        </div>
        <div className={`text-sm font-mono mt-1 ${drawdownPct > 15 ? 'text-red' : 'text-text-primary'}`}>
          {drawdownPct.toFixed(1)}%
        </div>
      </div>

      {/* Uptime */}
      <div className="p-3 rounded bg-panel border border-border">
        <div className="text-xs text-text-muted mb-1 uppercase tracking-widest">Uptime</div>
        <div className="font-mono text-text-primary">{formatUptime(uptime)}</div>
      </div>
    </div>
  );
}

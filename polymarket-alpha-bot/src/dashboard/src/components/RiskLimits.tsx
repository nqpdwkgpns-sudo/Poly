import React from 'react';
import { BotState } from '../types';

interface Props {
  state: BotState;
}

interface BarProps {
  label: string;
  value: number; // 0–1 utilization
  max?: number;
  unit?: string;
}

function RiskBar({ label, value, max, unit = '' }: BarProps) {
  const pct = Math.min(1, Math.max(0, value)) * 100;
  const color = pct >= 90 ? 'bg-red' : pct >= 70 ? 'bg-yellow' : 'bg-green';
  const textColor = pct >= 90 ? 'text-red' : pct >= 70 ? 'text-yellow' : 'text-green';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text-muted uppercase tracking-wide">{label}</span>
        <span className={`font-mono font-bold ${textColor}`}>
          {pct.toFixed(0)}%{max !== undefined ? ` (${unit})` : ''}
        </span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RiskLimits({ state }: Props) {
  const dailyLossLimit = state.dailyLossLimitUsdc ?? 200;
  const maxPositions = state.maxOpenPositions ?? 10;
  const totalExposure = Object.values(state.categoryExposure ?? {}).reduce((a, b) => a + b, 0);
  const maxCategoryExposure = totalExposure > 0
    ? Math.max(...Object.values(state.categoryExposure ?? {})) / totalExposure
    : 0;

  return (
    <div className="space-y-3">
      <h2 className="font-display text-sm font-bold tracking-widest text-text-muted uppercase">
        Risk Limits
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-3 rounded bg-panel border border-border">
        <RiskBar
          label="Daily Loss"
          value={Math.abs(Math.min(0, state.dailyRealizedPnl ?? 0)) / dailyLossLimit}
        />
        <RiskBar
          label="Open Positions"
          value={(state.openPositionCount ?? 0) / maxPositions}
        />
        <RiskBar
          label="Concentration"
          value={maxCategoryExposure / 0.40}
        />
        <RiskBar
          label="Drawdown"
          value={(state.drawdownPct ?? 0) / 0.20}
        />
      </div>
    </div>
  );
}

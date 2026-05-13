import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { PnlEntry } from '../types';

interface Props {
  data: PnlEntry[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="bg-panel border border-border rounded p-2 text-xs font-mono">
      <div className="text-text-muted">{label}</div>
      <div className={value >= 0 ? 'text-green' : 'text-red'}>
        {value >= 0 ? '+' : ''}${value.toFixed(2)}
      </div>
    </div>
  );
}

export function PnlChart({ data }: Props) {
  const hasData = data.length > 0;

  // Fill with mock data if empty for display
  const chartData = hasData ? data : [
    { date: 'Today', pnl: 0, cumulative: 0 },
  ];

  const maxVal = Math.max(...chartData.map((d) => d.cumulative), 0.01);
  const minVal = Math.min(...chartData.map((d) => d.cumulative), 0);

  return (
    <div className="space-y-2">
      <h2 className="font-display text-sm font-bold tracking-widest text-text-muted uppercase">
        7-Day Cumulative P&amp;L
      </h2>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00ff88" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff3b5c" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff3b5c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#2a2a3a" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b6b8a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6b6b8a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#2a2a3a" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={minVal < 0 ? '#ff3b5c' : '#00ff88'}
              strokeWidth={2}
              fill={minVal < 0 ? 'url(#redGradient)' : 'url(#greenGradient)'}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

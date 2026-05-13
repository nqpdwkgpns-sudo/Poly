import React, { useRef, useEffect, useState } from 'react';
import { Position } from '../types';

interface Props {
  positions: Position[];
  onEmergencyClose: () => void;
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function PnlCell({ pnl }: { pnl: number }) {
  const [flashClass, setFlashClass] = useState('');
  const prevPnl = useRef(pnl);

  useEffect(() => {
    if (pnl !== prevPnl.current) {
      setFlashClass(pnl > prevPnl.current ? 'value-flash-green' : 'value-flash-red');
      const timer = setTimeout(() => setFlashClass(''), 600);
      prevPnl.current = pnl;
      return () => clearTimeout(timer);
    }
  }, [pnl]);

  return (
    <td className={`px-3 py-2 font-mono text-right transition-colors rounded ${flashClass} ${pnl >= 0 ? 'text-green' : 'text-red'}`}>
      {pnl >= 0 ? '+' : ''}${fmt(pnl)}
    </td>
  );
}

export function PositionsTable({ positions, onEmergencyClose }: Props) {
  const open = positions.filter((p) => p.status === 'OPEN');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold tracking-widest text-text-muted uppercase">
          Open Positions ({open.length})
        </h2>
        <button
          onClick={onEmergencyClose}
          className="px-3 py-1 text-xs font-bold rounded border border-red text-red hover:bg-red hover:text-background transition-colors"
        >
          CLOSE ALL
        </button>
      </div>

      {open.length === 0 ? (
        <div className="p-6 text-center text-text-muted text-sm rounded bg-panel border border-border">
          No open positions
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-panel">
                <th className="px-3 py-2 text-left text-text-muted text-xs uppercase tracking-wide">Market</th>
                <th className="px-3 py-2 text-center text-text-muted text-xs uppercase tracking-wide">Side</th>
                <th className="px-3 py-2 text-right text-text-muted text-xs uppercase tracking-wide">Entry</th>
                <th className="px-3 py-2 text-right text-text-muted text-xs uppercase tracking-wide">Current</th>
                <th className="px-3 py-2 text-right text-text-muted text-xs uppercase tracking-wide">P&amp;L</th>
                <th className="px-3 py-2 text-right text-text-muted text-xs uppercase tracking-wide">Size</th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => (
                <tr key={p.conditionId} className="border-b border-border hover:bg-panel transition-colors">
                  <td className="px-3 py-2 max-w-[200px] truncate text-text-primary" title={p.marketQuestion}>
                    {p.marketQuestion.slice(0, 35)}…
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.side === 'BUY' ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                      {p.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-primary">
                    {fmt(p.entryPrice, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-primary">
                    {fmt(p.currentPrice, 3)}
                  </td>
                  <PnlCell pnl={p.unrealizedPnl} />
                  <td className="px-3 py-2 text-right font-mono text-text-primary">
                    ${fmt(p.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

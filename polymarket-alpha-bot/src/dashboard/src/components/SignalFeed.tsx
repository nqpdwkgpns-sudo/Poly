import React, { useRef, useEffect } from 'react';
import { Signal } from '../types';

interface Props {
  signals: Signal[];
}

export function SignalFeed({ signals }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [signals.length]);

  const recent = signals.slice(0, 20);

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-bold tracking-widest text-text-muted uppercase">
        Signal Feed
      </h2>

      <div className="h-[400px] overflow-y-auto space-y-1 scrollbar-hide">
        {recent.length === 0 && (
          <div className="p-4 text-center text-text-muted text-sm">
            Waiting for signals...
          </div>
        )}
        {[...recent].reverse().map((signal, i) => {
          const approved = signal.approved !== false;
          return (
            <div
              key={`${signal.conditionId}-${i}`}
              className={`p-2 rounded border text-xs transition-opacity ${
                approved
                  ? 'border-green/20 bg-green/5'
                  : 'border-border bg-panel opacity-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={`font-bold mr-2 ${approved ? 'text-green' : 'text-text-muted'}`}>
                    {signal.strategyName}
                  </span>
                  <span className="text-text-muted truncate block">
                    {signal.conditionId?.slice(0, 12)}…
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`font-bold ${signal.side === 'BUY' ? 'text-green' : 'text-red'}`}>
                    {signal.side}
                  </div>
                  <div className="text-text-muted">
                    Edge: {(signal.edge * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              {!approved && signal.rejectionReason && (
                <div className="text-text-muted mt-1 text-xs">
                  ✗ {signal.rejectionReason}
                </div>
              )}
              {signal.reasoning && (
                <div className="text-text-muted mt-1 text-xs truncate">
                  {signal.reasoning}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

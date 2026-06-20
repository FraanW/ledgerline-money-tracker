import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { RingDatum } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

const PALETTE = [
  "var(--ml-color-accent)",
  "var(--ml-color-accent-2)",
  "var(--ml-color-positive)",
  "var(--ml-color-warning)",
  "var(--ml-color-negative)",
];

/**
 * Concentric activity rings — one per envelope, arc = spent / allocated.
 * Apple-Watch-style at-a-glance budget health. Pure SVG, token-coloured.
 */
export function BudgetRings({ data, size = 240 }: { data: RingDatum[]; size?: number }) {
  const rings = data.slice(0, 5);
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.07;
  const gap = stroke * 0.55;
  const totalAlloc = rings.reduce((s, r) => s + r.allocatedMinor, 0);
  const totalSpent = rings.reduce((s, r) => s + r.spentMinor, 0);
  const tip = useViztip();

  const explain = (r: RingDatum) => {
    const pct = r.allocatedMinor > 0 ? Math.round((r.spentMinor / r.allocatedMinor) * 100) : 0;
    return `Spent ${formatMoney({ minor: r.spentMinor, currency: "INR" })} of ${formatMoney({ minor: r.allocatedMinor, currency: "INR" })} (${pct}%). The ring fills as you spend — a full ring means this envelope is used up.`;
  };

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Budget rings">
        {rings.map((r, i) => {
          const radius = size / 2 - stroke / 2 - i * (stroke + gap);
          if (radius < stroke) return null;
          const circ = 2 * Math.PI * radius;
          const frac = r.allocatedMinor > 0 ? Math.min(1, r.spentMinor / r.allocatedMinor) : 0;
          const color = PALETTE[i % PALETTE.length];
          return (
            <g key={r.id} onMouseEnter={tip.enter(r.label, explain(r))} onMouseLeave={tip.leave} style={{ cursor: "pointer" }}>
              <g transform={`rotate(-90 ${cx} ${cy})`}>
                <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--ml-color-surface-raised)" strokeWidth={stroke} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${circ * frac} ${circ}`}
                  style={{ transition: "stroke-dasharray var(--ml-motion-base) var(--ml-motion-ease)" }}
                />
              </g>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-2">
        <div className="mb-1">
          <div className="text-[0.8em] uppercase tracking-wide text-text-muted">Spent this month</div>
          <div className="font-display text-[1.7em] font-bold text-text">{formatMoney({ minor: totalSpent, currency: "INR" })}</div>
          <div className="text-[0.85em] text-text-muted">of {formatMoney({ minor: totalAlloc, currency: "INR" })} budgeted</div>
        </div>
        {rings.map((r, i) => {
          const pct = r.allocatedMinor > 0 ? Math.round((r.spentMinor / r.allocatedMinor) * 100) : 0;
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 text-[0.88em]"
              onMouseEnter={tip.enter(r.label, explain(r))}
              onMouseLeave={tip.leave}
            >
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="w-20 text-text">{r.label}</span>
              <span className="text-text-muted">{pct}%</span>
            </div>
          );
        })}
      </div>
      {tip.node}
    </div>
  );
}

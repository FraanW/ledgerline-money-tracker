import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { VizSlice } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

const PALETTE = [
  "var(--ml-color-accent)",
  "var(--ml-color-accent-2)",
  "var(--ml-color-positive)",
  "var(--ml-color-warning)",
  "var(--ml-color-negative)",
  "var(--ml-color-text-muted)",
];

/**
 * Spend-by-category donut with the period total in the centre. The calm,
 * universally-legible option. Segments via stroke-dasharray.
 */
export function Donut({ slices, size = 240 }: { slices: VizSlice[]; size?: number }) {
  const tip = useViztip();
  const total = slices.reduce((s, n) => s + n.amountMinor, 0) || 1;
  const stroke = size * 0.16;
  const r = size / 2 - stroke / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let acc = 0;
  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Spend by category donut">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ml-color-surface-raised)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          {slices.map((s, i) => {
            const frac = s.amountMinor / total;
            const seg = frac * circ;
            const offset = -acc * circ;
            acc += frac;
            const pct = Math.round(frac * 100);
            const detail = `${formatMoney({ minor: s.amountMinor, currency: "INR" })} · ${pct}% of total spend. Each ring slice is one category — the longer the arc, the bigger the share.`;
            return (
              <circle
                key={s.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={stroke}
                strokeDasharray={`${seg} ${circ - seg}`}
                strokeDashoffset={offset}
                onMouseEnter={tip.enter(s.label, detail)}
                onMouseLeave={tip.leave}
                style={{ cursor: "pointer" }}
              />
            );
          })}
        </g>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.11} fontWeight={800} fill="var(--ml-color-text)" style={{ fontFamily: "var(--ml-font-display)" }}>
          {formatMoney({ minor: total, currency: "INR" })}
        </text>
        <text x={cx} y={cy + size * 0.1} textAnchor="middle" fontSize="11" fill="var(--ml-color-text-muted)">
          total spend
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {slices.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 text-[0.85em]" onMouseEnter={tip.enter(s.label, `${formatMoney({ minor: s.amountMinor, currency: "INR" })} · ${Math.round((s.amountMinor / total) * 100)}%`)} onMouseLeave={tip.leave}>
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="w-24 text-text">{s.label}</span>
            <span className="text-text-muted">{Math.round((s.amountMinor / total) * 100)}%</span>
          </div>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

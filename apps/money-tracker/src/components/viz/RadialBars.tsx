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
 * Rose / radial-bar chart — each category is an equal wedge, and the wedge
 * reaches further out the more you spent. Striking and surprisingly readable.
 */
export function RadialBars({ slices, size = 300 }: { slices: VizSlice[]; size?: number }) {
  const tip = useViztip();
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 12;
  const minR = size * 0.12;
  const max = Math.max(1, ...slices.map((s) => s.amountMinor));
  const total = slices.reduce((s, n) => s + n.amountMinor, 0) || 1;
  const step = (Math.PI * 2) / slices.length;

  const wedge = (i: number, rOuter: number) => {
    const a0 = -Math.PI / 2 + i * step;
    const a1 = a0 + step * 0.9; // small gap between wedges
    const x0 = cx + minR * Math.cos(a0);
    const y0 = cy + minR * Math.sin(a0);
    const x1 = cx + rOuter * Math.cos(a0);
    const y1 = cy + rOuter * Math.sin(a0);
    const x2 = cx + rOuter * Math.cos(a1);
    const y2 = cy + rOuter * Math.sin(a1);
    const x3 = cx + minR * Math.cos(a1);
    const y3 = cy + minR * Math.sin(a1);
    return `M ${x0} ${y0} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${minR} ${minR} 0 0 0 ${x0} ${y0} Z`;
  };

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Radial spend bars">
        {[0.33, 0.66, 1].map((g) => (
          <circle key={g} cx={cx} cy={cy} r={minR + (maxR - minR) * g} fill="none" stroke="var(--ml-color-border)" strokeDasharray="2 4" opacity={0.5} />
        ))}
        {slices.map((s, i) => {
          const rOuter = minR + (maxR - minR) * (s.amountMinor / max);
          const pct = Math.round((s.amountMinor / total) * 100);
          return (
            <path
              key={s.key}
              d={wedge(i, rOuter)}
              fill={PALETTE[i % PALETTE.length]}
              opacity={s.key === "unallocated" ? 0.55 : 0.9}
              onMouseEnter={tip.enter(s.label, `${formatMoney({ minor: s.amountMinor, currency: "INR" })} · ${pct}% of spend. The further a wedge reaches out, the more went there — the longest wedge is your biggest category.`)}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

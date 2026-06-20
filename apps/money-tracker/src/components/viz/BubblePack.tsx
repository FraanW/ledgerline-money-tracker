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
 * Bubble pack — each category is a bubble sized by spend (radius ∝ √amount, so
 * area is proportional). Playful, instantly comparable. Simple row-wrap layout.
 */
export function BubblePack({ slices, width = 560, height = 300 }: { slices: VizSlice[]; width?: number; height?: number }) {
  const tip = useViztip();
  const total = slices.reduce((s, n) => s + n.amountMinor, 0) || 1;
  const max = Math.max(1, ...slices.map((s) => s.amountMinor));
  const maxR = Math.min(width, height) * 0.22;
  const sized = slices.map((s) => ({ s, r: 14 + maxR * Math.sqrt(s.amountMinor / max) }));

  // simple wrap layout, vertically centred per row
  const pad = 10;
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed = sized.map(({ s, r }) => {
    if (x + r * 2 > width - pad) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    const cx = x + r;
    const cy = y + r;
    x += r * 2 + pad;
    rowH = Math.max(rowH, r * 2);
    return { s, r, cx, cy };
  });

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Spend bubbles">
        {placed.map(({ s, r, cx, cy }, i) => {
          const pct = Math.round((s.amountMinor / total) * 100);
          const showLabel = r > 34;
          return (
            <g
              key={s.key}
              onMouseEnter={tip.enter(s.label, `${formatMoney({ minor: s.amountMinor, currency: "INR" })} · ${pct}% of spend. Bigger bubble = more money — the area is proportional to what you spent.`)}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            >
              <circle cx={cx} cy={cy} r={r} fill={PALETTE[i % PALETTE.length]} opacity={s.key === "unallocated" ? 0.5 : 0.85} />
              {showLabel && (
                <>
                  <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fontWeight={700} fill="var(--ml-color-accent-contrast)">
                    {s.label}
                  </text>
                  <text x={cx} y={cy + 13} textAnchor="middle" fontSize="10" fill="var(--ml-color-accent-contrast)" opacity={0.85}>
                    {pct}%
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

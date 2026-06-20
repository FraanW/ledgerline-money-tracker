import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { VizSlice } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";
import { PingPongScroll } from "./PingPongScroll";

const PALETTE = [
  "var(--ml-color-accent)",
  "var(--ml-color-accent-2)",
  "var(--ml-color-positive)",
  "var(--ml-color-warning)",
  "var(--ml-color-negative)",
  "var(--ml-color-text-muted)",
];

interface Rect {
  slice: VizSlice;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/** Slice-and-dice treemap: alternates split axis so the result reads as tiles. */
function layout(slices: VizSlice[], W: number, H: number): Rect[] {
  const out: Rect[] = [];
  let x = 0,
    y = 0,
    w = W,
    h = H;
  let horizontal = W >= H;
  let remaining = slices.reduce((s, n) => s + n.amountMinor, 0);
  slices.forEach((slice, i) => {
    const isLast = i === slices.length - 1;
    const frac = remaining > 0 ? slice.amountMinor / remaining : 0;
    const color = PALETTE[i % PALETTE.length] ?? "var(--ml-color-accent)";
    if (isLast) {
      out.push({ slice, x, y, w, h, color });
      return;
    }
    if (horizontal) {
      const cw = w * frac;
      out.push({ slice, x, y, w: cw, h, color });
      x += cw;
      w -= cw;
    } else {
      const ch = h * frac;
      out.push({ slice, x, y, w, h: ch, color });
      y += ch;
      h -= ch;
    }
    remaining -= slice.amountMinor;
    horizontal = !horizontal;
  });
  return out;
}

export function CategoryTreemap({ slices, width = 560, height = 320 }: { slices: VizSlice[]; width?: number; height?: number }) {
  const rects = layout(slices, width, height);
  const total = slices.reduce((s, n) => s + n.amountMinor, 0) || 1;
  const tip = useViztip();

  const explain = (r: Rect) => {
    const pct = Math.round((r.slice.amountMinor / total) * 100);
    const rank = rects.findIndex((x) => x.slice.key === r.slice.key) + 1;
    const base = `${formatMoney({ minor: r.slice.amountMinor, currency: "INR" })} · ${pct}% of spend`;
    if (r.slice.key === "unallocated") return `${base}. Money that escaped your plan — re-budget it to shrink this tile.`;
    return `${base}. The bigger the tile, the more of your month it took. Ranked #${rank} this month.`;
  };

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full">
      <PingPongScroll>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Spending treemap">
        {rects.map((r) => {
          const big = r.w > 90 && r.h > 44;
          return (
            <g
              key={r.slice.key}
              onMouseEnter={tip.enter(r.slice.label, explain(r))}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={r.x + 2}
                y={r.y + 2}
                width={Math.max(0, r.w - 4)}
                height={Math.max(0, r.h - 4)}
                rx={10}
                fill={r.color}
                opacity={r.slice.key === "unallocated" ? 0.55 : 0.85}
              />
              {big && (
                <>
                  <text x={r.x + 14} y={r.y + 26} fontSize="13" fontWeight={700} fill="var(--ml-color-accent-contrast)">
                    {r.slice.label}
                  </text>
                  <text x={r.x + 14} y={r.y + 44} fontSize="12" fill="var(--ml-color-accent-contrast)" opacity={0.85}>
                    {formatMoney({ minor: r.slice.amountMinor, currency: "INR" })}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      </PingPongScroll>
      {tip.node}
    </div>
  );
}

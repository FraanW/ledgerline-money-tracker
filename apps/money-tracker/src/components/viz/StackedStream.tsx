import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { StreamSeries } from "../../mocks/vizData";
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
 * Stacked stream — how spending piles up across the month, category by category.
 * Each band is a category; the total height at the right edge is the month's
 * full spend. You watch the month fill in.
 */
export function StackedStream({ series, days, width = 620, height = 280 }: { series: StreamSeries[]; days: number; width?: number; height?: number }) {
  const tip = useViztip();
  const padX = 14;
  const padTop = 14;
  const padBot = 24;
  const plotH = height - padTop - padBot;
  const xs = Array.from({ length: days }, (_, i) => padX + (i * (width - padX * 2)) / Math.max(1, days - 1));
  const maxTotal = Math.max(1, series.reduce((s, srs) => s + (srs.points[days - 1] ?? 0), 0));
  const yOf = (v: number) => height - padBot - (v / maxTotal) * plotH;

  const baseline = new Array(days).fill(0);
  const bands = series.map((srs) => {
    const top = srs.points.map((v, d) => baseline[d] + v);
    const topEdge = top.map((v, d) => `${d === 0 ? "M" : "L"} ${xs[d]} ${yOf(v)}`).join(" ");
    const botEdge = baseline
      .map((v, d) => ({ v, d }))
      .reverse()
      .map(({ v, d }) => `L ${xs[d]} ${yOf(v)}`)
      .join(" ");
    const path = `${topEdge} ${botEdge} Z`;
    for (let d = 0; d < days; d++) baseline[d] = top[d];
    const finalV = srs.points[days - 1] ?? 0;
    return { srs, path, finalV };
  });

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Spending stream over the month">
        {bands.map((b, i) => {
          const pct = Math.round((b.finalV / maxTotal) * 100);
          return (
            <path
              key={b.srs.key}
              d={b.path}
              fill={PALETTE[i % PALETTE.length]}
              opacity={b.srs.key === "unallocated" ? 0.55 : 0.85}
              onMouseEnter={tip.enter(b.srs.label, `${formatMoney({ minor: b.finalV, currency: "INR" })} by month end · ${pct}% of spend. Each band stacks on the one below — the band's thickness is how much that category added as the month went on.`)}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            />
          );
        })}
        <text x={padX} y={height - 6} fontSize="10" fill="var(--ml-color-text-muted)">
          day 1
        </text>
        <text x={width - padX} y={height - 6} textAnchor="end" fontSize="10" fill="var(--ml-color-text-muted)">
          end of month
        </text>
      </svg>
      {tip.node}
    </div>
  );
}

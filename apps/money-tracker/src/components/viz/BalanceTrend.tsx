import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { BalancePoint } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

/**
 * Account-balance trend across the months — a gradient area chart. Shows the
 * payday jumps and the steady drain between them. SVG gradient via token stops.
 */
export function BalanceTrend({ series, width = 620, height = 240 }: { series: BalancePoint[]; width?: number; height?: number }) {
  const tip = useViztip();
  const padX = 16;
  const padTop = 16;
  const padBot = 26;
  const xs = series.map((_, i) => padX + (i * (width - padX * 2)) / Math.max(1, series.length - 1));
  const vals = series.map((p) => p.balanceMinor);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const y = (v: number) => padTop + (1 - (v - min) / span) * (height - padTop - padBot);

  const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${y(p.balanceMinor)}`).join(" ");
  const areaPath = `${linePath} L ${xs[xs.length - 1]} ${height - padBot} L ${xs[0]} ${height - padBot} Z`;

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Balance trend">
        <defs>
          <linearGradient id="balgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ml-color-accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--ml-color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#balgrad)" />
        <path d={linePath} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {series.map((p, i) => {
          const prev = (i > 0 ? series[i - 1]?.balanceMinor : p.balanceMinor) ?? p.balanceMinor;
          const delta = p.balanceMinor - prev;
          const sign = delta >= 0 ? "+" : "-";
          const detail = `Balance ${formatMoney({ minor: p.balanceMinor, currency: "INR" })}. Change since previous: ${sign}${formatMoney({ minor: Math.abs(delta), currency: "INR" })}. Big jumps up are paydays; the slope down is everyday spending.`;
          return (
            <circle
              key={p.date}
              cx={xs[i]}
              cy={y(p.balanceMinor)}
              r={4.5}
              fill="var(--ml-color-surface)"
              stroke="var(--ml-color-accent)"
              strokeWidth={2}
              onMouseEnter={tip.enter(p.date, detail)}
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

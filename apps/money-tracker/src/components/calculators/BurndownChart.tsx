import React from "react";
import { inrCompact, inr, formatMonths, type RunwayPoint } from "../../lib/finance";
import { useViztip } from "../viz/Tooltip";

/**
 * Drawdown chart for the Runway calculator: a filled area that falls from
 * today's savings toward zero, with the 3 / 6 / 12-month emergency-fund
 * benchmarks marked. Recomputes live as the sliders move.
 */
export function BurndownChart({
  series,
  months,
  width = 560,
  height = 240,
}: {
  series: RunwayPoint[];
  months: number;
  width?: number;
  height?: number;
}) {
  const tip = useViztip();
  const padL = 44;
  const padR = 12;
  const padTop = 12;
  const padBot = 22;
  const n = series.length;
  const maxV = Math.max(1, ...series.map((p) => p.balance));
  const x = (i: number) => padL + (i * (width - padL - padR)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (1 - v / maxV) * (height - padTop - padBot);

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.balance)}`).join(" ");
  const area = `${line} L ${x(n - 1)} ${height - padBot} L ${x(0)} ${height - padBot} Z`;

  const gridVals = [0.25, 0.5, 0.75, 1].map((g) => g * maxV);
  // series index == month, so a benchmark at month b sits at x(b) while in range
  const benches = [
    { m: 3, label: "3 mo" },
    { m: 6, label: "6 mo" },
    { m: 12, label: "1 yr" },
  ].filter((b) => b.m < n);
  const samplePts = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const emptyIdx = n - 1;
  const depleted = series[emptyIdx]?.balance === 0;

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Savings runway drawdown">
        <defs>
          <linearGradient id="burngrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ml-color-accent)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--ml-color-accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke="var(--ml-color-border)" strokeDasharray="2 4" opacity={0.5} />
            <text x={4} y={y(v) + 3} fontSize="9" fill="var(--ml-color-text-muted)">{inrCompact(v)}</text>
          </g>
        ))}

        {/* emergency-fund benchmark markers */}
        {benches.map((b) => (
          <g key={b.m}>
            <line x1={x(b.m)} y1={padTop} x2={x(b.m)} y2={height - padBot} stroke="var(--ml-color-text-muted)" strokeDasharray="3 3" opacity={0.45} />
            <text x={x(b.m) + 3} y={padTop + 9} fontSize="9" fill="var(--ml-color-text-muted)">{b.label}</text>
          </g>
        ))}

        <path d={area} fill="url(#burngrad)" />
        <path d={line} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} />

        {samplePts.map((i) => {
          const p = series[i];
          if (!p) return null;
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.balance)}
              r={4}
              fill="var(--ml-color-surface)"
              stroke="var(--ml-color-accent)"
              strokeWidth={2}
              onMouseEnter={tip.enter(
                `After ${formatMonths(p.month)}`,
                p.balance > 0
                  ? `You'd have ${inr(p.balance)} of liquid savings left.`
                  : `Savings are spent — this is where the runway ends.`,
              )}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            />
          );
        })}

        {/* mark the moment it hits zero */}
        {depleted && (
          <circle cx={x(emptyIdx)} cy={y(0)} r={5} fill="var(--ml-color-negative)" stroke="var(--ml-color-surface)" strokeWidth={2} />
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 px-2 text-[0.78em] text-text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-accent" /> savings left</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-4 border-t border-dashed border-text-muted" /> 3 / 6 / 12-mo buffer</span>
      </div>
      {tip.node}
    </div>
  );
}

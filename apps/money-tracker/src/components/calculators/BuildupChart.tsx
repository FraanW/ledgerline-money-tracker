import React from "react";
import { inrCompact, inr, formatMonths, type RunwayPoint } from "../../lib/finance";
import { useViztip } from "../viz/Tooltip";

/**
 * Build-up chart for the contingency planner: a filled area that climbs from
 * what you've saved today toward the target cushion (the dashed line near the
 * top). The opposite shape of the burn-down — this one is about getting safe.
 */
export function BuildupChart({
  series,
  targetFund,
  width = 560,
  height = 240,
}: {
  series: RunwayPoint[];
  targetFund: number;
  width?: number;
  height?: number;
}) {
  const tip = useViztip();
  const padL = 44;
  const padR = 12;
  const padTop = 16;
  const padBot = 22;
  const n = series.length;
  const maxV = Math.max(1, targetFund, ...series.map((p) => p.balance));
  const x = (i: number) => padL + (i * (width - padL - padR)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (1 - v / maxV) * (height - padTop - padBot);

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.balance)}`).join(" ");
  const area = `${line} L ${x(n - 1)} ${height - padBot} L ${x(0)} ${height - padBot} Z`;

  const gridVals = [0.25, 0.5, 0.75, 1].map((g) => g * maxV);
  const samplePts = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Emergency fund build-up">
        <defs>
          <linearGradient id="buildgrad" x1="0" y1="0" x2="0" y2="1">
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

        {/* target cushion line */}
        <line x1={padL} y1={y(targetFund)} x2={width - padR} y2={y(targetFund)} stroke="var(--ml-color-positive)" strokeWidth={1.5} strokeDasharray="5 3" />
        <text x={width - padR} y={y(targetFund) - 4} fontSize="9" textAnchor="end" fill="var(--ml-color-positive)">target {inrCompact(targetFund)}</text>

        <path d={area} fill="url(#buildgrad)" />
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
                p.month === 0 ? "Today" : `After ${formatMonths(p.month)}`,
                `Your cushion would be ${inr(p.balance)}${p.balance >= targetFund ? " — target reached." : ` (${Math.round((p.balance / targetFund) * 100)}% of target).`}`,
              )}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 px-2 text-[0.78em] text-text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-accent" /> your cushion</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--ml-color-positive)" }} /> target</span>
      </div>
      {tip.node}
    </div>
  );
}

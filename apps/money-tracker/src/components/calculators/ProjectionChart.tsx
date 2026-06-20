import React from "react";
import { inrCompact, inr, type ProjectionPoint } from "../../lib/finance";
import { useViztip } from "../viz/Tooltip";

/**
 * Growth-over-time chart for the calculators: a filled "value" area with the
 * "invested" line on top, so the gap between them IS your gains. Recomputes
 * live as the calculator sliders move.
 */
export function ProjectionChart({ series, width = 560, height = 240 }: { series: ProjectionPoint[]; width?: number; height?: number }) {
  const tip = useViztip();
  const padL = 44;
  const padR = 12;
  const padTop = 12;
  const padBot = 22;
  const n = series.length;
  const maxV = Math.max(1, ...series.map((p) => p.value));
  const x = (i: number) => padL + (i * (width - padL - padR)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (1 - v / maxV) * (height - padTop - padBot);

  const valueLine = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const valueArea = `${valueLine} L ${x(n - 1)} ${height - padBot} L ${x(0)} ${height - padBot} Z`;
  const investedLine = series.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.invested)}`).join(" ");

  const gridVals = [0.25, 0.5, 0.75, 1].map((g) => g * maxV);
  const samplePts = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Investment projection">
        <defs>
          <linearGradient id="projgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ml-color-accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--ml-color-accent)" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke="var(--ml-color-border)" strokeDasharray="2 4" opacity={0.5} />
            <text x={4} y={y(v) + 3} fontSize="9" fill="var(--ml-color-text-muted)">{inrCompact(v)}</text>
          </g>
        ))}
        <path d={valueArea} fill="url(#projgrad)" />
        <path d={valueLine} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} />
        <path d={investedLine} fill="none" stroke="var(--ml-color-text-muted)" strokeWidth={1.5} strokeDasharray="4 3" />
        {samplePts.map((i) => {
          const p = series[i];
          if (!p) return null;
          const yrs = (p.month / 12).toFixed(p.month % 12 === 0 ? 0 : 1);
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={4}
              fill="var(--ml-color-surface)"
              stroke="var(--ml-color-accent)"
              strokeWidth={2}
              onMouseEnter={tip.enter(`Year ${yrs}`, `Worth ${inr(p.value)} after investing ${inr(p.invested)} — that's ${inr(p.value - p.invested)} in gains. The gap between the solid line (value) and dashed line (invested) is your returns compounding.`)}
              onMouseLeave={tip.leave}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 px-2 text-[0.78em] text-text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-accent" /> value</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-4 border-t-2 border-dashed border-text-muted" /> invested</span>
      </div>
      {tip.node}
    </div>
  );
}

import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { WaterfallStep } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

/**
 * Cashflow waterfall — start at income, step down through each spending
 * category, land on what's left. The clearest "where did it all go" story:
 * you literally watch the income get whittled down.
 */
export function Waterfall({ steps, width = 620, height = 300 }: { steps: WaterfallStep[]; width?: number; height?: number }) {
  const tip = useViztip();
  const padTop = 16;
  const padBot = 40;
  const plotH = height - padTop - padBot;
  const n = steps.length;
  const gap = 14;
  const barW = (width - gap * (n + 1)) / n;

  // running total to position floating bars (first step is income, the max)
  const peak = steps[0]?.deltaMinor ?? 1;
  const yOf = (v: number) => padTop + (1 - v / peak) * plotH;

  let running = 0;
  const bars = steps.map((s) => {
    let top: number, bottom: number, value: number;
    if (s.kind === "income" || s.kind === "total") {
      top = yOf(s.kind === "income" ? s.deltaMinor : running + s.deltaMinor);
      bottom = yOf(0);
      value = s.kind === "income" ? s.deltaMinor : running + s.deltaMinor;
      if (s.kind === "income") running = s.deltaMinor;
    } else {
      const before = running;
      running += s.deltaMinor; // delta negative
      top = yOf(before);
      bottom = yOf(running);
      value = -s.deltaMinor;
    }
    return { s, top, bottom, value };
  });

  const color = (k: WaterfallStep["kind"]) =>
    k === "income" ? "var(--ml-color-positive)" : k === "total" ? "var(--ml-color-accent-2)" : "var(--ml-color-accent)";

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cashflow waterfall">
        {bars.map((b, i) => {
          const x = gap + i * (barW + gap);
          const h = Math.max(2, b.bottom - b.top);
          const detail =
            b.s.kind === "income"
              ? `${formatMoney({ minor: b.value, currency: "INR" })} came in. Every bar to the right chips away at this.`
              : b.s.kind === "total"
                ? `${formatMoney({ minor: b.value, currency: "INR" })} left after everything. This is what rolls forward.`
                : `${formatMoney({ minor: b.value, currency: "INR" })} spent on ${b.s.label} — the step down from the bar before it.`;
          return (
            <g key={b.s.label} onMouseEnter={tip.enter(b.s.label, detail)} onMouseLeave={tip.leave} style={{ cursor: "pointer" }}>
              <rect x={x} y={b.top} width={barW} height={h} rx={6} fill={color(b.s.kind)} opacity={b.s.kind === "spend" ? 0.85 : 1} />
              {i < bars.length - 1 && (
                <line x1={x} y1={b.bottom} x2={x + barW + gap} y2={b.bottom} stroke="var(--ml-color-border)" strokeDasharray="3 3" />
              )}
              <text x={x + barW / 2} y={height - padBot + 16} textAnchor="middle" fontSize="10" fill="var(--ml-color-text-muted)">
                {b.s.label.length > 8 ? b.s.label.slice(0, 7) + "…" : b.s.label}
              </text>
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

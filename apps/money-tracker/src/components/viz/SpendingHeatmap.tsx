import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { DayCell } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Calendar heatmap — each day's cell shades by spend intensity. Surfaces
 * patterns (payday spikes, weekend blowouts) at a glance. Token-coloured.
 */
export function SpendingHeatmap({
  days,
  firstWeekdayMonday0,
  cell = 38,
}: {
  days: DayCell[];
  firstWeekdayMonday0: number;
  cell?: number;
}) {
  const max = Math.max(1, ...days.map((d) => d.amountMinor));
  const gap = 6;
  const cells: (DayCell | null)[] = [...Array(firstWeekdayMonday0).fill(null), ...days];
  const rows = Math.ceil(cells.length / 7);
  const w = 7 * cell + 6 * gap;
  const h = rows * cell + (rows - 1) * gap + 22;
  const tip = useViztip();

  const explain = (c: DayCell) => {
    if (c.amountMinor === 0) return "No spending logged this day — a clean day for the budget.";
    const pct = Math.round((c.amountMinor / max) * 100);
    return `Spent ${formatMoney({ minor: c.amountMinor, currency: "INR" })}. Darker cells are bigger spend days (${pct}% of your heaviest day this month).`;
  };
  const dateLabel = (c: DayCell) => `${c.date}`;

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative w-full overflow-x-auto">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Spending heatmap">
        {WEEKDAYS.map((d, i) => (
          <text key={i} x={i * (cell + gap) + cell / 2} y={12} fontSize="11" textAnchor="middle" fill="var(--ml-color-text-muted)">
            {d}
          </text>
        ))}
        {cells.map((c, i) => {
          if (!c) return null;
          const col = i % 7;
          const row = Math.floor(i / 7);
          const x = col * (cell + gap);
          const y = 22 + row * (cell + gap);
          const intensity = c.amountMinor / max; // 0..1
          const fill = c.amountMinor === 0 ? "var(--ml-color-surface-raised)" : "var(--ml-color-accent)";
          return (
            <g key={c.date} onMouseEnter={tip.enter(dateLabel(c), explain(c))} onMouseLeave={tip.leave} style={{ cursor: "pointer" }}>
              <rect
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={9}
                fill={fill}
                opacity={c.amountMinor === 0 ? 1 : 0.25 + intensity * 0.75}
              />
              <text
                x={x + 7}
                y={y + 16}
                fontSize="10"
                fill={intensity > 0.55 ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)"}
              >
                {c.day}
              </text>
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

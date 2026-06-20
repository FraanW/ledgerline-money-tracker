import React from "react";
import { formatMoney } from "@ledgerline/types";
import { useViztip } from "./Tooltip";

/**
 * Liquid gauge — a single big circle that fills like water with the % of income
 * spent. The wave gives it life; the number keeps it honest.
 */
export function LiquidGauge({
  spentMinor,
  incomeMinor,
  size = 220,
}: {
  spentMinor: number;
  incomeMinor: number;
  size?: number;
}) {
  const tip = useViztip();
  const pct = incomeMinor > 0 ? Math.min(1, spentMinor / incomeMinor) : 0;
  const r = size / 2 - 6;
  const cx = size / 2;
  const cy = size / 2;
  const level = cy + r - 2 * r * pct; // y of the water surface
  const waveW = r * 2;
  // two stacked sine-ish wave paths for a subtle layered look
  const wave = (amp: number, phase: number) =>
    `M ${cx - r} ${level} q ${waveW / 4} ${-amp} ${waveW / 2} 0 t ${waveW / 2} 0 ` +
    `L ${cx + r} ${cy + r} L ${cx - r} ${cy + r} Z`;

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative inline-flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Income spent gauge"
        onMouseEnter={tip.enter(
          "Income spent",
          `${formatMoney({ minor: spentMinor, currency: "INR" })} of ${formatMoney({ minor: incomeMinor, currency: "INR" })} (${Math.round(pct * 100)}%). The water rises as you spend more of what you earned — near the top means you're living close to the edge.`,
        )}
        onMouseLeave={tip.leave}
        style={{ cursor: "pointer" }}
      >
        <defs>
          <clipPath id="liquid-clip">
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="var(--ml-color-surface-raised)" stroke="var(--ml-color-border)" strokeWidth={2} />
        <g clipPath="url(#liquid-clip)">
          <path d={wave(10, 0)} fill="var(--ml-color-accent)" opacity={0.35} />
          <path d={wave(7, 1)} fill="var(--ml-color-accent)" opacity={0.85} />
        </g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2} />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.22} fontWeight={850} fill="var(--ml-color-text)" style={{ fontFamily: "var(--ml-font-display)" }}>
          {Math.round(pct * 100)}%
        </text>
        <text x={cx} y={cy + size * 0.13} textAnchor="middle" fontSize="11" fill="var(--ml-color-text-muted)">
          of income spent
        </text>
      </svg>
      {tip.node}
    </div>
  );
}

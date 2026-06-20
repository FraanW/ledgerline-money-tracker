import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { RingDatum } from "../../mocks/vizData";
import { useViztip } from "./Tooltip";

/**
 * Envelopes as "jars" filling with money — fill height = money still available
 * (remaining / allocated). Empty jar = spent out. Playful and instantly legible.
 */
export function MoneyJars({ data, jarW = 84, jarH = 150 }: { data: RingDatum[]; jarW?: number; jarH?: number }) {
  const tip = useViztip();
  const jars = data.slice(0, 6);

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative flex flex-wrap items-end gap-[calc(1rem*var(--ml-density))]">
      {jars.map((r) => {
        const remaining = Math.max(0, r.allocatedMinor - r.spentMinor);
        const frac = r.allocatedMinor > 0 ? Math.min(1, remaining / r.allocatedMinor) : 0;
        const inner = jarH - 12;
        const fillH = Math.round(inner * frac);
        const empty = remaining === 0;
        const explain = `${formatMoney({ minor: remaining, currency: "INR" })} still available of ${formatMoney({ minor: r.allocatedMinor, currency: "INR" })}. The jar drains as you spend — empty means this envelope is used up for the month.`;
        return (
          <div
            key={r.id}
            className="flex flex-col items-center gap-1"
            onMouseEnter={tip.enter(r.label, explain)}
            onMouseLeave={tip.leave}
            style={{ cursor: "pointer" }}
          >
            <svg width={jarW} height={jarH} viewBox={`0 0 ${jarW} ${jarH}`}>
              {/* jar body */}
              <rect x={6} y={6} width={jarW - 12} height={inner} rx={14} fill="var(--ml-color-surface-raised)" stroke="var(--ml-color-border)" />
              {/* fill */}
              <clipPath id={`clip-${r.id}`}>
                <rect x={6} y={6} width={jarW - 12} height={inner} rx={14} />
              </clipPath>
              <g clipPath={`url(#clip-${r.id})`}>
                <rect
                  x={6}
                  y={6 + (inner - fillH)}
                  width={jarW - 12}
                  height={fillH}
                  fill={empty ? "var(--ml-color-negative)" : "var(--ml-color-accent)"}
                  opacity={empty ? 0.35 : 0.9}
                  style={{ transition: "y var(--ml-motion-base) var(--ml-motion-ease), height var(--ml-motion-base)" }}
                />
              </g>
              <text x={jarW / 2} y={jarH / 2} textAnchor="middle" fontSize="12" fontWeight={700} fill={frac > 0.45 ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text)"}>
                {Math.round(frac * 100)}%
              </text>
            </svg>
            <span className="text-[0.82em] font-medium text-text">{r.label}</span>
            <span className="text-[0.75em] text-text-muted">{formatMoney({ minor: remaining, currency: "INR" })}</span>
          </div>
        );
      })}
      {tip.node}
    </div>
  );
}

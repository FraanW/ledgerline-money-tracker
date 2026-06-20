import React from "react";
import { vibeScore } from "../../mocks/vizData";
import { genzVibeLines } from "../../mocks/remarks";
import { useThemeId } from "../../theme/ThemeProvider";
import { useViztip } from "./Tooltip";

/**
 * Gamified "vibe check" — a 0–100 budget-health score with a fully transparent
 * breakdown (every point is explained, so it's never a black box). Gen-Z flavour,
 * works in every theme.
 */
export function VibeScore({ size = 200 }: { size?: number }) {
  const { score, label, factors, bucket } = vibeScore;
  const themeId = useThemeId();
  const isGenz = themeId === "genz";
  // Gen Z gets the playful "vibe check" framing + emoji; everyone else (esp.
  // Senior) gets a calm, plain "budget health" with no slang or emoji.
  const heading = isGenz ? "Vibe check" : "Budget health";
  const plainLabel = score >= 80 ? "Excellent" : score >= 60 ? "On track" : score >= 40 ? "Needs attention" : "Off track";
  const shownLabel = isGenz ? label : plainLabel;
  const genzLine = isGenz ? genzVibeLines[bucket][0] : null;
  const tip = useViztip();
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const frac = score / 100;
  const tone = score >= 80 ? "var(--ml-color-positive)" : score >= 50 ? "var(--ml-color-accent)" : "var(--ml-color-warning)";

  return (
    <div ref={tip.ref} onMouseMove={tip.onMove} className="relative flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Vibe check score">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ml-color-surface-raised)" strokeWidth={14} />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${circ * frac} ${circ}`}
            style={{ transition: "stroke-dasharray var(--ml-motion-base) var(--ml-motion-ease)" }}
          />
        </g>
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.26} fontWeight={850} fill="var(--ml-color-text)" style={{ fontFamily: "var(--ml-font-display)" }}>
          {score}
        </text>
        <text x={cx} y={cy + size * 0.16} textAnchor="middle" fontSize="13" fill="var(--ml-color-text-muted)">
          / 100
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        <div className="text-[0.78em] uppercase tracking-wide text-text-muted">{heading}</div>
        <div className="font-display text-[1.4em] font-bold text-text">{shownLabel}</div>
        {genzLine && (
          <p className="max-w-xs rounded-md bg-surface-raised px-3 py-1.5 text-[0.85em] text-text" style={{ borderLeft: "3px solid var(--ml-color-accent)" }}>
            {genzLine}
          </p>
        )}
        <p className="mb-1 max-w-xs text-[0.85em] text-text-muted">
          Your budget health this month. Hover each factor to see exactly how the score is built — no black box.
        </p>
        {factors.map((f) => (
          <div
            key={f.label}
            className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-3 py-1.5 text-[0.85em]"
            onMouseEnter={tip.enter(f.label, f.detail)}
            onMouseLeave={tip.leave}
            style={{ cursor: "pointer" }}
          >
            <span className="text-text">{f.label}</span>
            <span className="font-bold text-accent">+{f.points}</span>
          </div>
        ))}
      </div>
      {tip.node}
    </div>
  );
}

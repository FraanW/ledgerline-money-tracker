"use client";

import React, { useState, useMemo } from "react";
import { Card } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Conscious Spending Plan (Ramit Sethi). Take-home is split into four buckets,
 * each judged against a target BAND — not a single number — because Ramit's
 * whole point is latitude, not a tight leash. In-band = green, out = amber.
 * Then "Money Dials": rank the guilt-free categories, star the 1–2 you truly
 * love (exempt from cuts), and the un-starred tail is what to trim mercilessly.
 */

type BucketKey = "fixed" | "invest" | "savings" | "guilt";

interface BucketDef {
  key: BucketKey;
  label: string;
  icon: string;
  emoji: string;
  envIds: string[];
  /** Target band as fraction of take-home. */
  lo: number;
  hi: number;
  /** Some bands are one-sided (investments: "at least"). */
  oneSidedMin?: boolean;
}

const BUCKETS: BucketDef[] = [
  { key: "fixed", label: "Fixed Costs", icon: "rent", emoji: "🏠", envIds: ["rent", "emi", "groceries", "utilities", "transport"], lo: 0.5, hi: 0.6 },
  { key: "invest", label: "Investments", icon: "invest", emoji: "📈", envIds: ["sip"], lo: 0.1, hi: 1, oneSidedMin: true },
  { key: "savings", label: "Savings Goals", icon: "shield", emoji: "🛟", envIds: ["emergency", "goa"], lo: 0.05, hi: 0.1 },
  { key: "guilt", label: "Guilt-Free", icon: "party", emoji: "🍕", envIds: ["dining", "shopping", "fun", "subs"], lo: 0.2, hi: 0.35 },
];

export function ConsciousSpendingPlan(): React.ReactElement {
  const tip = useViztip();
  const takeHome = L.profile.monthlyTakeHome;

  // Discretionary categories within Guilt-Free → the Money Dials candidates.
  const dials = useMemo(
    () =>
      L.envelopes
        .filter((e) => e.bucket === "want")
        .map((e) => ({ id: e.id, name: e.name, icon: e.icon, emoji: e.emoji, spent: e.spent }))
        .sort((a, b) => b.spent - a.spent),
    [],
  );

  // Default: pre-star the single biggest dial so the first render already tells a story.
  const [starred, setStarred] = useState<Set<string>>(() => new Set(dials[0] ? [dials[0].id] : []));

  const toggleStar = (id: string): void => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 2) next.add(id); // Ramit: pick ONE or TWO money dials, no more
      return next;
    });
  };

  const buckets = useMemo(
    () =>
      BUCKETS.map((b) => {
        const spent = b.envIds.reduce((s, id) => s + (L.envelopes.find((e) => e.id === id)?.spent ?? 0), 0);
        const pct = (spent / takeHome) * 100;
        const loPct = b.lo * 100;
        const hiPct = b.oneSidedMin ? 100 : b.hi * 100;
        const inBand = b.oneSidedMin ? pct >= loPct : pct >= loPct && pct <= hiPct;
        return { ...b, spent, pct, loPct, hiPct, inBand };
      }),
    [takeHome],
  );

  const guiltSpent = buckets.find((b) => b.key === "guilt")?.spent ?? 0;
  const starredSpent = dials.filter((d) => starred.has(d.id)).reduce((s, d) => s + d.spent, 0);
  const tailSpent = guiltSpent - starredSpent;
  const tail = dials.filter((d) => !starred.has(d.id));

  // Conscious Spending "score": how many buckets sit inside their band (0–4).
  const inBandCount = buckets.filter((b) => b.inBand).length;
  const allGreen = inBandCount === 4;

  // SVG geometry for the signature four-bar chart.
  const W = 460;
  const H = 168;
  const padL = 96;
  const padR = 16;
  const rowH = H / BUCKETS.length;
  const barH = 20;
  const scaleMax = 65; // % axis ceiling (fixed costs cap ~60%)
  const xOf = (p: number): number => padL + (Math.min(p, scaleMax) / scaleMax) * (W - padL - padR);

  return (
    <LensCard
      icon="budget"
      emoji="💸"
      title="Conscious Spending Plan"
      subtitle="Spend extravagantly on what you love · cut mercilessly on what you don't"
      badge={<Pill tone={allGreen ? "positive" : inBandCount >= 3 ? "accent" : "warning"}>{inBandCount}/4 buckets in band</Pill>}
    >
      <HeroStat
        eyebrow="Your take-home, consciously split"
        value={
          <span className="tabular-nums">
            {inr(takeHome)} <span className="text-[0.5em] font-medium opacity-90">/ month</span>
          </span>
        }
        sub={
          allGreen
            ? "Every bucket is inside Ramit's band — this is a Rich Life on autopilot."
            : `${inBandCount} of 4 buckets land in range. The rest just need a nudge, not a budget.`
        }
      />

      {/* ── Signature: four bucket bars with target-band overlays ─────────── */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[0.78em] font-medium uppercase tracking-wide text-text-muted">The four buckets</span>
          <span className="flex items-center gap-1 text-[0.72em] text-text-muted">
            <span className="inline-block h-2 w-4 rounded-sm" style={{ background: "color-mix(in srgb, var(--ml-color-positive) 26%, transparent)" }} />
            target band
          </span>
        </div>
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Four conscious-spending buckets versus their target bands">
            {buckets.map((b, i) => {
              const cy = i * rowH + rowH / 2;
              const bandX = xOf(b.loPct);
              const bandW = xOf(b.hiPct) - bandX;
              const fillW = xOf(b.pct) - padL;
              const tone = b.inBand ? "var(--ml-color-positive)" : "var(--ml-color-warning)";
              const detail = b.oneSidedMin
                ? `${inr(b.spent)} · ${b.pct.toFixed(0)}% of take-home. Target: at least ${b.loPct.toFixed(0)}%. ${b.inBand ? "You're paying future-you first." : "Bump this toward 10%."}`
                : `${inr(b.spent)} · ${b.pct.toFixed(0)}% of take-home. Target band ${b.loPct.toFixed(0)}–${b.hiPct.toFixed(0)}%. ${b.inBand ? "Right in range." : b.pct > b.hiPct ? "Running hot — trim a little." : "Below band — you have room."}`;
              return (
                <g key={b.key}>
                  {/* track */}
                  <rect x={padL} y={cy - barH / 2} width={W - padL - padR} height={barH} rx={5} fill="var(--ml-color-surface-raised)" />
                  {/* target band */}
                  <rect x={bandX} y={cy - barH / 2} width={bandW} height={barH} rx={3} fill="color-mix(in srgb, var(--ml-color-positive) 22%, transparent)" />
                  {/* band edges */}
                  <line x1={bandX} x2={bandX} y1={cy - barH / 2 - 3} y2={cy + barH / 2 + 3} stroke="var(--ml-color-positive)" strokeWidth={1.5} opacity={0.5} />
                  {!b.oneSidedMin && (
                    <line x1={bandX + bandW} x2={bandX + bandW} y1={cy - barH / 2 - 3} y2={cy + barH / 2 + 3} stroke="var(--ml-color-positive)" strokeWidth={1.5} opacity={0.5} />
                  )}
                  {/* actual fill */}
                  <rect x={padL} y={cy - barH / 2 + 3} width={Math.max(2, fillW)} height={barH - 6} rx={3} fill={tone} style={{ transition: "width var(--ml-motion-base)" }} />
                  {/* label */}
                  <text x={padL - 8} y={cy - 1} textAnchor="end" className="font-display" fontSize={11} fontWeight={700} fill="var(--ml-color-text)">
                    {b.label}
                  </text>
                  <text x={padL - 8} y={cy + 11} textAnchor="end" fontSize={9} fill="var(--ml-color-text-muted)">
                    {b.pct.toFixed(0)}%
                  </text>
                  {/* hover hit-area */}
                  <rect
                    x={padL}
                    y={cy - barH / 2 - 4}
                    width={W - padL - padR}
                    height={barH + 8}
                    fill="transparent"
                    onMouseEnter={tip.enter(b.label, detail)}
                    onMouseLeave={tip.leave}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            })}
          </svg>
          {tip.node}
        </div>
      </div>

      {/* ── Bucket readout chips ──────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {buckets.map((b) => (
          <KeyStat
            key={b.key}
            label={b.label}
            value={`${b.pct.toFixed(0)}%`}
            tone={b.inBand ? "positive" : "warning"}
            hint={b.oneSidedMin ? `min ${b.loPct.toFixed(0)}% · ${inr(b.spent)}` : `${b.loPct.toFixed(0)}–${b.hiPct.toFixed(0)}% · ${inr(b.spent)}`}
          />
        ))}
      </div>

      {/* ── Money Dials: star what you love, trim the tail ────────────────── */}
      <Card raised className="mt-5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="party" emoji="🎛️" size={18} className="text-accent" />
              <h4 className="font-display text-[1.05em] font-bold text-text">Money Dials</h4>
            </div>
            <p className="mt-0.5 text-[0.8em] text-text-muted">Star the 1–2 things you genuinely love. Those are off-limits to cuts — trim the rest.</p>
          </div>
          <Pill tone="accent">{starred.size}/2 starred</Pill>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {dials.map((d) => {
            const isStar = starred.has(d.id);
            const share = guiltSpent ? (d.spent / guiltSpent) * 100 : 0;
            const locked = !isStar && starred.size >= 2;
            return (
              <button
                key={d.id}
                onClick={() => toggleStar(d.id)}
                className="group flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-[border-color,background-color]"
                style={{
                  cursor: locked ? "not-allowed" : "pointer",
                  borderColor: isStar ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                  background: isStar ? "color-mix(in srgb, var(--ml-color-accent) 10%, transparent)" : "transparent",
                  transitionDuration: "var(--ml-motion-fast)",
                  opacity: locked ? 0.55 : 1,
                }}
                aria-pressed={isStar}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ background: "var(--ml-color-surface-raised)", color: isStar ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)" }}
                >
                  <Icon name={d.icon} emoji={d.emoji} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.9em] font-medium text-text">{d.name}</span>
                    <span className="shrink-0 font-display text-[0.9em] font-bold tabular-nums text-text">{inr(d.spent)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--ml-color-surface)" }}>
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${share}%`, background: isStar ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)", transitionDuration: "var(--ml-motion-base)" }}
                    />
                  </div>
                </div>
                <span
                  className="shrink-0 text-[1.1em] transition-transform group-hover:scale-110"
                  style={{ color: isStar ? "var(--ml-color-warning)" : "var(--ml-color-text-muted)", transitionDuration: "var(--ml-motion-fast)" }}
                  aria-hidden
                >
                  {isStar ? "★" : "☆"}
                </span>
              </button>
            );
          })}
        </div>

        {/* The tell, made human. */}
        <div className="mt-3 rounded-md p-3 text-[0.84em] leading-snug" style={{ background: "var(--ml-color-surface-raised)" }}>
          {starred.size === 0 ? (
            <span className="text-text-muted">
              Nothing starred yet. Pick what you&apos;d defend to a friend — Ramit says spend <span className="font-medium text-text">extravagantly</span> there, mercilessly elsewhere.
            </span>
          ) : (
            <span className="text-text">
              You love{" "}
              <span className="font-medium text-accent">{dials.filter((d) => starred.has(d.id)).map((d) => d.name).join(" & ")}</span>{" "}
              ({inr(starredSpent)}). That stays. The un-starred tail —{" "}
              <span className="font-medium text-warning">{tail.length ? tail.map((d) => d.name).join(", ") : "nothing left"}</span>{" "}
              {tail.length ? `(${inr(tailSpent)}) is where to cut without missing a thing.` : "— is already trimmed."}
            </span>
          )}
        </div>
      </Card>
    </LensCard>
  );
}

export default ConsciousSpendingPlan;
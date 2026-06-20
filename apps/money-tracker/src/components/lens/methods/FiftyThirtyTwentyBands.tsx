"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, ToggleRow } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * 50/30/20 Bands — Elizabeth Warren's "All Your Worth" rule.
 * Of every take-home rupee: <=50% to needs, <=30% to wants, >=20% to savings.
 * Coarse on purpose — three bands, not forty envelopes. We render one full-width
 * stacked bar of where the money actually went, with target gridlines at 50% and
 * 80%, and colour each band amber/red the moment it breaches its ceiling (or, for
 * savings, falls under its floor). The one toggle is the only honest ambiguity in
 * the rule: does unassigned cash count as savings yet, or is it simply unspent?
 */

type BandKey = "need" | "want" | "savings";

interface BandDef {
  key: BandKey;
  label: string;
  icon: string;
  emoji: string;
  /** Warren's ceiling (needs/wants) or floor (savings), as a % of take-home. */
  target: number;
  /** A ceiling band breaches when it goes OVER; the floor band when it goes UNDER. */
  kind: "ceiling" | "floor";
}

const BANDS: BandDef[] = [
  { key: "need", label: "Needs", icon: "rent", emoji: "🏠", target: 50, kind: "ceiling" },
  { key: "want", label: "Wants", icon: "fun", emoji: "🛍️", target: 30, kind: "ceiling" },
  { key: "savings", label: "Savings", icon: "invest", emoji: "📈", target: 20, kind: "floor" },
];

const COLOR: Record<BandKey, string> = {
  need: "var(--ml-color-accent)",
  want: "var(--ml-color-accent-2)",
  savings: "var(--ml-color-positive)",
};

export function FiftyThirtyTwentyBands(): React.ReactElement {
  // The rule's one real ambiguity: is idle cash already "saved", or just unspent?
  const [cashCountsAsSavings, setCashCountsAsSavings] = useState<boolean>(false);
  const tip = useViztip();

  const takeHome = L.profile.monthlyTakeHome;

  const bands = useMemo(() => {
    const spent = L.spendByBucket();
    const savings = spent.savings + (cashCountsAsSavings ? L.availableCash : 0);
    const actual: Record<BandKey, number> = { need: spent.need, want: spent.want, savings };
    return BANDS.map((b) => {
      const amount = actual[b.key];
      const pct = takeHome > 0 ? (amount / takeHome) * 100 : 0;
      const breached = b.kind === "ceiling" ? pct > b.target + 0.05 : pct < b.target - 0.05;
      // How badly: ceilings over-shoot, the floor under-shoots. Drives amber→red.
      const miss = b.kind === "ceiling" ? pct - b.target : b.target - pct;
      const tone: "positive" | "warning" | "negative" =
        !breached ? "positive" : miss > 8 ? "negative" : "warning";
      return { ...b, amount, pct, breached, tone };
    });
  }, [cashCountsAsSavings, takeHome]);

  const allocated = bands.reduce((s, b) => s + b.amount, 0);
  const leftover = takeHome - allocated; // unspent + (cash, if not counted as savings)
  const breachCount = bands.filter((b) => b.breached).length;
  const savingsBand = bands.find((b) => b.key === "savings");
  const needBand = bands.find((b) => b.key === "need");

  const toneColor = (t: "positive" | "warning" | "negative"): string =>
    t === "negative" ? "var(--ml-color-negative)" : t === "warning" ? "var(--ml-color-warning)" : "var(--ml-color-positive)";

  // ── Signature: one full-width stacked bar with 50 / 80 target gridlines ──
  const W = 520;
  const H = 70;
  const pad = 1;
  const inner = W - pad * 2;
  let cursor = pad;
  const segs = bands.map((b) => {
    const w = Math.max(0, (b.amount / takeHome) * inner);
    const seg = { ...b, x: cursor, w };
    cursor += w;
    return seg;
  });
  const leftoverX = cursor;
  const leftoverW = Math.max(0, (leftover / takeHome) * inner);
  const gridX = (p: number): number => pad + (p / 100) * inner;

  return (
    <LensCard
      icon="budget"
      emoji="⚖️"
      title="50 / 30 / 20"
      subtitle="Of every take-home rupee — needs, wants, and what you keep. Coarse on purpose."
      badge={<Pill tone={breachCount === 0 ? "positive" : "warning"}>Warren · the rule of thirds</Pill>}
    >
      <HeroStat
        eyebrow={`of ${inr(takeHome)} take-home this month`}
        value={
          <span className="tabular-nums">
            {(savingsBand?.pct ?? 0).toFixed(0)}% kept
          </span>
        }
        sub={
          (savingsBand?.breached ?? false) ? (
            <>below the 20% savings floor — the band the whole rule is built to protect</>
          ) : (
            <>clear of the 20% savings floor · {breachCount === 0 ? "all three bands in line" : `${breachCount} spend band over its ceiling`}</>
          )
        }
      />

      {/* ── Three band KeyStats: actual % vs target ── */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {bands.map((b) => (
          <KeyStat
            key={b.key}
            label={b.label}
            value={`${b.pct.toFixed(0)}%`}
            tone={b.tone === "positive" ? "positive" : b.tone === "warning" ? "warning" : "negative"}
            hint={`${inr(b.amount)} · ${b.kind === "ceiling" ? `≤${b.target}%` : `≥${b.target}%`} target`}
          />
        ))}
      </div>

      {/* ── Signature stacked band bar with 50/80 gridlines ── */}
      <div ref={tip.ref} onMouseMove={tip.onMove} className="relative mt-5 rounded-md border border-border bg-surface-raised p-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.76em] text-text-muted">
          {bands.map((b) => (
            <span key={b.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: b.breached ? toneColor(b.tone) : COLOR[b.key] }} />
              {b.label}
            </span>
          ))}
          {leftoverW > 0.5 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm border border-border" style={{ background: "var(--ml-color-surface)" }} />
              {cashCountsAsSavings ? "unspent" : "unassigned"}
            </span>
          )}
        </div>

        <svg width="100%" viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" className="block">
          {/* track */}
          <rect x={pad} y={6} width={inner} height={H - 12} rx={8} fill="var(--ml-color-surface)" />

          {/* spend + savings segments — breach repaints the fill */}
          {segs.map((s) =>
            s.w <= 0 ? null : (
              <rect
                key={s.key}
                x={s.x}
                y={6}
                width={Math.max(0, s.w - 1)}
                height={H - 12}
                fill={s.breached ? toneColor(s.tone) : COLOR[s.key]}
                opacity={s.breached ? 0.92 : 0.85}
                onMouseEnter={tip.enter(
                  `${s.label} — ${s.pct.toFixed(0)}% of take-home`,
                  s.kind === "ceiling"
                    ? s.breached
                      ? `${inr(s.amount)}. Over the ${s.target}% ceiling by ${(s.pct - s.target).toFixed(0)} points — the rule wants this band trimmed.`
                      : `${inr(s.amount)}. Comfortably under the ${s.target}% ceiling. Room to breathe here.`
                    : s.breached
                      ? `${inr(s.amount)}. Below the ${s.target}% savings floor — the one band Warren says to defend first.`
                      : `${inr(s.amount)}. Above the ${s.target}% floor. This is the money the rule exists to grow.`,
                )}
                onMouseLeave={tip.leave}
              />
            ),
          )}

          {/* leftover / unassigned — soft ghosted slice */}
          {leftoverW > 0.5 && (
            <rect
              x={leftoverX}
              y={6}
              width={Math.max(0, leftoverW - 1)}
              height={H - 12}
              fill="var(--ml-color-text-muted)"
              opacity={0.18}
              onMouseEnter={tip.enter(
                cashCountsAsSavings ? "Unspent" : "Unassigned cash",
                cashCountsAsSavings
                  ? `${inr(leftover)} still in your account with no job yet. Counted toward the 20% — flip the toggle to treat it as plain unspent.`
                  : `${inr(leftover)} that's landed but isn't doing anything. Not counted as saved until you give it a job — flip the toggle to fold it into savings.`,
              )}
              onMouseLeave={tip.leave}
            />
          )}

          {/* target gridlines at 50% and 80% — the rule's two cut-points */}
          {[
            { p: 50, label: "50" },
            { p: 80, label: "80" },
          ].map((g) => (
            <g key={g.p}>
              <line x1={gridX(g.p)} y1={2} x2={gridX(g.p)} y2={H - 2} stroke="var(--ml-color-text)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.55} />
              <text x={gridX(g.p)} y={H + 13} fontSize={10} fill="var(--ml-color-text-muted)" textAnchor="middle">
                {g.label}%
              </text>
            </g>
          ))}
          <text x={gridX(0)} y={H + 13} fontSize={10} fill="var(--ml-color-text-muted)" textAnchor="start">
            0%
          </text>
          <text x={gridX(100)} y={H + 13} fontSize={10} fill="var(--ml-color-text-muted)" textAnchor="end">
            100%
          </text>
        </svg>
        {tip.node}
      </div>

      {/* ── The one toggle: how to treat idle cash ── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-raised p-3">
        <div className="text-[0.84em] text-text">
          <div className="font-medium">Count {inr(L.availableCash)} unassigned cash as savings?</div>
          <div className="text-[0.82em] text-text-muted">Off = it&apos;s just unspent until you give it a job.</div>
        </div>
        <ToggleRow label={cashCountsAsSavings ? "Counts as saved" : "Just unspent"} on={cashCountsAsSavings} onChange={setCashCountsAsSavings} />
      </div>

      {/* ── The tell, made human ── */}
      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-surface-raised p-3 text-[0.85em] text-text">
        <span className="mt-0.5 text-accent">
          <Icon name="brain" emoji="💡" size={16} />
        </span>
        <p>
          {(needBand?.breached ?? false) ? (
            <>
              Your <span className="font-medium">needs</span> eat{" "}
              <span className="font-display font-bold text-warning">{(needBand?.pct ?? 0).toFixed(0)}%</span> — past Warren&apos;s 50% line, so wants and savings are fighting over what&apos;s left. Big fixed costs (rent, EMI) are the usual culprit, and the slowest to move.
            </>
          ) : (savingsBand?.breached ?? false) ? (
            <>
              You&apos;re keeping <span className="font-display font-bold text-negative">{(savingsBand?.pct ?? 0).toFixed(0)}%</span>, under the 20% floor. Closing the gap needs only{" "}
              <span className="font-display font-bold text-positive">{inr(Math.max(0, takeHome * 0.2 - (savingsBand?.amount ?? 0)))}</span> more put away — the rule treats this as the first band to defend, not the last.
            </>
          ) : (
            <>
              All three bands sit inside the rule: needs under 50%, wants under 30%, and{" "}
              <span className="font-display font-bold text-positive">{(savingsBand?.pct ?? 0).toFixed(0)}%</span> kept against a 20% floor. The whole point of 50/30/20 is that you can stop optimising once it&apos;s green — coarse, but enough.
            </>
          )}
        </p>
      </div>
    </LensCard>
  );
}

export default FiftyThirtyTwentyBands;

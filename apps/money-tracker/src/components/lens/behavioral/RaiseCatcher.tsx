"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow, StackedBar, LENS_PALETTE } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact, sipResult } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Raise Catcher — Benartzi & Thaler's "Save More Tomorrow" (SMarT).
 *
 * People won't cut today's spending to save more, but they'll happily pre-commit
 * to saving a slice of FUTURE raises — because the increase never feels like a
 * loss. We detect the salary step-up in L.incomeEvents (78k → 82k in May),
 * let Anaya pin a % of the +₹4,000 to her SIP while take-home STILL grows, and
 * compound that committed slice forward so the "tiny" monthly habit becomes a
 * visibly large number. Default state already tells the whole story.
 */

const RETURN_PCT = 11; // assumed equity SIP return

/** Find the most recent month-over-month income increase in the event series. */
function detectRaise(events: L.IncomeEvent[]): { before: number; after: number; delta: number; month: string } | null {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = sorted.length - 1; i >= 1; i--) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    if (cur && prev && cur.amount > prev.amount) {
      return { before: prev.amount, after: cur.amount, delta: cur.amount - prev.amount, month: cur.date };
    }
  }
  return null;
}

const MONTH_LABEL: Record<string, string> = {
  "2026-03-01": "Mar",
  "2026-04-01": "Apr",
  "2026-05-01": "May",
  "2026-06-01": "Jun",
};

export function RaiseCatcher(): React.JSX.Element {
  const [commitPct, setCommitPct] = useState<number>(30); // % of the raise pre-committed
  const [years, setYears] = useState<number>(15);
  const tip = useViztip();

  const raise = useMemo(() => detectRaise(L.incomeEvents), []);
  const delta = raise?.delta ?? 0;

  const committed = Math.round((delta * commitPct) / 100); // future-you slice
  const kept = delta - committed; // you-keep slice — take-home still grows
  const currentSip = useMemo(() => L.envelopes.find((e) => e.id === "sip")?.allocated ?? 0, []);

  // Compound just the committed slice forward as an ongoing monthly SIP.
  const proj = useMemo(() => sipResult(committed, RETURN_PCT, years), [committed, years]);
  // Counterfactual: the same slice left in take-home, "saved" at near-zero (spent away).
  const newTakeHome = (raise?.after ?? L.profile.monthlyTakeHome) - committed;

  /* ── Signature visual: income step timeline + the raise-split fork ────────── */
  const W = 520;
  const H = 188;
  const padX = 30;
  const baseY = 150; // baseline (pre-raise take-home)
  const sorted = useMemo(() => [...L.incomeEvents].sort((a, b) => a.date.localeCompare(b.date)), []);
  const incMin = Math.min(...sorted.map((e) => e.amount));
  const incMax = Math.max(...sorted.map((e) => e.amount));
  const span = incMax - incMin || 1;
  const stepX = (i: number): number => padX + ((W - 2 * padX) * i) / Math.max(1, sorted.length - 1);
  // map an income level to a y inside the upper band
  const incY = (v: number): number => baseY - 18 - ((v - incMin) / span) * 70;
  const raiseIdx = sorted.findIndex((e) => e.amount > incMin);

  // step path: flat then a clean vertical riser at the raise month
  const stepPath = useMemo<string>(() => {
    let d = "";
    sorted.forEach((e, i) => {
      const x = stepX(i);
      const y = incY(e.amount);
      if (i === 0) d += `M ${x} ${y}`;
      else {
        const prev = sorted[i - 1];
        const py = incY(prev?.amount ?? e.amount);
        d += ` L ${x} ${py} L ${x} ${y}`;
      }
    });
    d += ` L ${stepX(sorted.length - 1)} ${incY(sorted[sorted.length - 1]?.amount ?? incMin)}`;
    return d;
  }, [sorted]);

  const raiseX = raiseIdx >= 0 ? stepX(raiseIdx) : stepX(0);
  const raiseTopY = incY(incMax);

  // the fork: split bar widths for the +delta into kept (left) vs committed (right)
  const keptW = delta > 0 ? (kept / delta) * 100 : 0;

  return (
    <LensCard
      icon="invest"
      emoji="🪜"
      title="Raise Catcher"
      subtitle="Save More Tomorrow — pre-commit a slice of your next raise, not today's pay."
      badge={<Pill tone="positive">Benartzi &amp; Thaler · SMarT</Pill>}
    >
      <HeroStat
        eyebrow={`Commit ${commitPct}% of your ${inr(delta)}/mo raise →`}
        value={
          <span className="tabular-nums">
            {inrCompact(proj.futureValue)} <span className="text-[0.6em] font-normal opacity-90">future you</span>
          </span>
        }
        sub={
          <>
            {inr(committed)}/mo for {years} yrs grows here — and you still take home{" "}
            <span className="font-semibold">{inr(kept)} more</span> every month, starting now.
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KeyStat label="Raise detected" value={`+${inr(delta)}`} tone="positive" hint={`${inr(raise?.before ?? 0)} → ${inr(raise?.after ?? 0)}`} />
        <KeyStat label="You keep" value={`+${inr(kept)}`} tone="accent" hint="take-home still rises" />
        <KeyStat label="Future you" value={`+${inr(committed)}`} tone="positive" hint={`into SIP · ${commitPct}%`} />
        <KeyStat label="New SIP" value={inr(currentSip + committed)} tone="default" hint={`was ${inr(currentSip)}`} />
      </div>

      {/* ── SIGNATURE: the income step + the raise fork ──────────────────────── */}
      <div className="mt-5 rounded-md border border-border bg-surface-raised p-3">
        <div className="mb-1 flex items-center gap-2 text-[0.8em] text-text-muted">
          <Icon name="invest" emoji="🪜" size={15} />
          Your pay stepped up in {MONTH_LABEL[raise?.month ?? ""] ?? "May"} — catch a slice before it melts into spending.
        </div>
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Income step-up and raise split">
            <defs>
              <linearGradient id="rc-keep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--ml-color-accent)" stopOpacity={0.85} />
                <stop offset="100%" stopColor="var(--ml-color-accent)" stopOpacity={0.55} />
              </linearGradient>
            </defs>

            {/* pre-raise baseline reference */}
            <line x1={padX} y1={incY(incMin)} x2={W - padX} y2={incY(incMin)} stroke="var(--ml-color-border)" strokeWidth={1} strokeDasharray="3 4" />

            {/* shaded "the raise" region above baseline, after the step */}
            <path
              d={`M ${raiseX} ${incY(incMin)} L ${raiseX} ${raiseTopY} L ${W - padX} ${raiseTopY} L ${W - padX} ${incY(incMin)} Z`}
              fill="var(--ml-color-positive)"
              opacity={0.12}
            />

            {/* the income step line */}
            <path d={stepPath} fill="none" stroke="var(--ml-color-text)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

            {/* month dots + labels */}
            {sorted.map((e, i) => (
              <g key={e.id}>
                <circle cx={stepX(i)} cy={incY(e.amount)} r={3.5} fill={e.amount > incMin ? "var(--ml-color-positive)" : "var(--ml-color-text-muted)"} />
                <text x={stepX(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--ml-color-text-muted)">
                  {MONTH_LABEL[e.date] ?? ""}
                </text>
              </g>
            ))}

            {/* the raise riser callout */}
            <text x={raiseX + 6} y={raiseTopY - 5} fontSize={10} fill="var(--ml-color-positive)" className="tabular-nums">
              +{inrCompact(delta)}/mo
            </text>

            {/* the FORK — split the +delta into "you keep" (accent) vs "future you" (positive) */}
            {(() => {
              const forkY = baseY + 8;
              const forkH = 18;
              const x0 = raiseX;
              const x1 = W - padX;
              const splitX = x0 + ((x1 - x0) * keptW) / 100;
              return (
                <g>
                  <rect
                    x={x0}
                    y={forkY}
                    width={Math.max(0, splitX - x0)}
                    height={forkH}
                    rx={3}
                    fill="url(#rc-keep)"
                    style={{ transition: "width var(--ml-motion-base)" }}
                    onMouseEnter={tip.enter("You keep", `${inr(kept)}/mo lands in your pocket — a real raise you feel today. SMarT never asks you to cut current spending.`)}
                    onMouseLeave={tip.leave}
                  />
                  <rect
                    x={splitX}
                    y={forkY}
                    width={Math.max(0, x1 - splitX)}
                    height={forkH}
                    rx={3}
                    fill="var(--ml-color-positive)"
                    style={{ transition: "x var(--ml-motion-base), width var(--ml-motion-base)" }}
                    onMouseEnter={tip.enter("Future you", `${inr(committed)}/mo auto-routes to your SIP before you ever see it. Over ${years} yrs at ${RETURN_PCT}% it compounds to ${inr(proj.futureValue)}.`)}
                    onMouseLeave={tip.leave}
                  />
                  <text x={x0 + 4} y={forkY + forkH - 5} fontSize={9} fill="var(--ml-color-accent-contrast)" fontWeight={600}>
                    keep
                  </text>
                  {keptW < 88 && (
                    <text x={x1 - 4} y={forkY + forkH - 5} fontSize={9} fill="var(--ml-color-accent-contrast)" textAnchor="end" fontWeight={600}>
                      save
                    </text>
                  )}
                </g>
              );
            })()}
          </svg>
          {tip.node}
        </div>
      </div>

      {/* ── The split, spelled out as a stacked bar ──────────────────────────── */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[0.78em] text-text-muted">
          <span>Where your +{inr(delta)} raise goes</span>
          <span className="tabular-nums">
            <span className="text-accent">{inr(kept)} keep</span> · <span className="text-positive">{inr(committed)} save</span>
          </span>
        </div>
        <StackedBar
          total={delta || 1}
          height={22}
          segments={[
            { label: "You keep", value: kept, color: LENS_PALETTE[0] ?? "var(--ml-color-accent)" },
            { label: "Future you", value: committed, color: LENS_PALETTE[2] ?? "var(--ml-color-positive)" },
          ]}
        />
      </div>

      {/* ── Controls — default already looks great ───────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SliderRow
          label="Slice of the raise to save"
          value={commitPct}
          min={0}
          max={100}
          step={5}
          onChange={(v: number) => setCommitPct(v)}
          format={(v: number) => `${v}%`}
        />
        <SliderRow
          label="Let it compound for"
          value={years}
          min={5}
          max={30}
          step={1}
          onChange={(v: number) => setYears(v)}
          format={(v: number) => `${v} yrs`}
        />
      </div>

      {/* ── Before / after take-home — proof you still get a raise ───────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-surface-raised p-3">
          <div className="text-[0.72em] uppercase tracking-wide text-text-muted">Take-home before</div>
          <div className="font-display text-[1.15em] font-bold tabular-nums text-text-muted">{inr(raise?.before ?? 0)}</div>
        </div>
        <div className="rounded-md p-3 text-accent-contrast" style={{ background: "var(--ml-gradient-hero)" }}>
          <div className="text-[0.72em] uppercase tracking-wide opacity-90">After, with the catch</div>
          <div className="font-display text-[1.15em] font-bold tabular-nums">
            {inr(newTakeHome)} <span className="text-[0.7em] font-normal opacity-90">still up {inr(kept)}</span>
          </div>
        </div>
      </div>

      {/* ── The tell, made human ─────────────────────────────────────────────── */}
      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-surface-raised p-3 text-[0.85em] leading-snug text-text">
        <span className="mt-0.5 shrink-0 text-accent">
          <Icon name="brain" emoji="🧠" size={16} />
        </span>
        <p>
          You&apos;d never agree to cut <span className="font-medium">{inr(committed)}</span> from this month&apos;s spending — that feels
          like a loss. But routing it out of a raise you haven&apos;t gotten used to yet?{" "}
          <span className="font-semibold text-positive">Painless.</span> Your take-home still climbs by{" "}
          <span className="font-semibold text-accent">{inr(kept)}</span>, while the quiet slice compounds into{" "}
          <span className="font-display font-bold text-positive">{inrCompact(proj.futureValue)}</span>. Save more tomorrow,
          not today.
        </p>
      </div>
    </LensCard>
  );
}

export default RaiseCatcher;

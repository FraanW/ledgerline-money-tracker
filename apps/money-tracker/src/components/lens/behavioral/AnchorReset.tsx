"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Anchor Reset — Ariely / Tversky & Kahneman (Anchoring & Coherent Arbitrariness).
 *
 * Budget numbers are arbitrary anchors that, once set, quietly stop moving — even
 * as real spend drifts away from them. We rebuild a 3-month actual-spend series
 * for each variable envelope, measure the gap between the *stale anchor* (the
 * flat budget) and the *real average*, and flag every envelope drifting >15%.
 * The fix is one tap: re-baseline the budget to the data, not the anchor.
 *
 * Signature visual: per drifting envelope, a 3-month spend sparkline with the
 * flat budget anchor drawn as a dashed line straight through it — you literally
 * see the anchor failing to track reality — plus a one-tap reset that snaps the
 * total budget to what Anaya actually spends.
 */

const DRIFT_THRESHOLD = 0.15; // flag when |avg − budget| / budget > 15%

interface Drift {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  anchor: number; // stale budgeted figure (flat for months)
  series: number[]; // last 3 months of actual spend
  avg: number; // real average → the proposed re-baseline
  driftPct: number; // signed: + = under-budgeted (spending more), − = over-budgeted
}

/**
 * Deterministic 3-month spend series anchored around the envelope's current
 * .spent — a stable design fixture (no Math.random, so Storybook is stable).
 * The shape encodes each envelope's "tell": dining/shopping creep upward past a
 * budget that never moved; utilities sit comfortably under a too-fat budget.
 */
function deriveDrifts(): Drift[] {
  // shape[0..2] = multipliers on .spent for [Apr, May, Jun]; tuned per envelope.
  const shapes: Record<string, [number, number, number]> = {
    groceries: [1.12, 1.28, 1.22], // creeping up — anchor too low
    dining: [1.42, 1.66, 1.58], // big creep — classic under-budgeted want
    shopping: [2.1, 1.7, 1.95], // lumpy + high — anchor way off
    fun: [1.18, 0.96, 1.1],
    transport: [1.05, 1.18, 1.12],
    utilities: [0.62, 0.7, 0.66], // chronically under the fat budget
  };

  const out: Drift[] = [];
  for (const env of L.envelopes) {
    if (env.isProtected) continue; // never re-baseline rent/EMI/SIP/emergency
    const shape = shapes[env.id];
    if (!shape) continue;
    const base = env.spent;
    const series = shape.map((m) => Math.round((base * m) / 10) * 10);
    const avg = Math.round(series.reduce((s, v) => s + v, 0) / series.length / 10) * 10;
    const anchor = env.allocated;
    const driftPct = anchor > 0 ? (avg - anchor) / anchor : 0;
    if (Math.abs(driftPct) <= DRIFT_THRESHOLD) continue;
    out.push({ id: env.id, name: env.name, icon: env.icon, emoji: env.emoji, anchor, series, avg, driftPct });
  }
  // worst drift first
  return out.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));
}

/** Tiny anchor-vs-actual chart: actual spend line + flat dashed budget anchor. */
function AnchorChart({
  series,
  anchor,
  reset,
  width = 220,
  height = 56,
}: {
  series: number[];
  anchor: number;
  reset: boolean;
  width?: number;
  height?: number;
}): React.ReactElement {
  const lo = Math.min(anchor, ...series);
  const hi = Math.max(anchor, ...series);
  const span = hi - lo || 1;
  const padY = 8;
  const x = (i: number) => (series.length > 1 ? (i / (series.length - 1)) * (width - 8) + 4 : width / 2);
  const y = (v: number) => height - padY - ((v - lo) / span) * (height - padY * 2);
  const linePath = series.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const anchorY = y(anchor);
  const accent = "var(--ml-color-accent)";
  const muted = "var(--ml-color-text-muted)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {/* stale anchor — flat dashed line that ignores the trend */}
      <line
        x1={4}
        y1={anchorY}
        x2={width - 4}
        y2={anchorY}
        stroke={muted}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        opacity={reset ? 0.35 : 0.85}
        style={{ transition: "opacity var(--ml-motion-base)" }}
      />
      {/* actual spend trend */}
      <path
        d={`${linePath} L ${(width - 4).toFixed(1)} ${height} L 4 ${height} Z`}
        fill={accent}
        opacity={0.12}
      />
      <path d={linePath} fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {series.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={accent} />
      ))}
    </svg>
  );
}

export function AnchorReset(): React.ReactElement {
  const drifts = useMemo(() => deriveDrifts(), []);
  // which envelopes the user has re-baselined (default: none — the default view
  // already tells the story; resetting is the deliberate action).
  const [reset, setReset] = useState<Record<string, boolean>>({});
  const tip = useViztip();

  const staleTotal = useMemo(() => drifts.reduce((s, d) => s + d.anchor, 0), [drifts]);
  const proposedTotal = useMemo(
    () => drifts.reduce((s, d) => s + (reset[d.id] ? d.avg : d.anchor), 0),
    [drifts, reset],
  );
  // The honest, fully re-anchored budget (what the data says) for the hero delta.
  const realTotal = useMemo(() => drifts.reduce((s, d) => s + d.avg, 0), [drifts]);
  const delta = realTotal - staleTotal;
  const resetCount = drifts.filter((d) => reset[d.id]).length;
  const allReset = resetCount === drifts.length && drifts.length > 0;

  const resetAll = () =>
    setReset(drifts.reduce<Record<string, boolean>>((a, d) => ((a[d.id] = !allReset), a), {}));

  return (
    <LensCard
      icon="budget"
      emoji="⚓"
      title="Anchor Reset"
      subtitle="Ariely · your budget is anchored to a number that stopped being true"
      badge={<Pill tone={delta > 0 ? "warning" : "accent"}>{drifts.length} drifting</Pill>}
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow="If you re-anchor every drifting budget to your real 3-month average"
          value={
            <span className="tabular-nums">
              {delta >= 0 ? "+" : "−"}
              {inr(Math.abs(delta))}/mo
            </span>
          }
          sub={
            <>
              the honest budget is <b>{inr(realTotal)}</b>, not the stale <b>{inr(staleTotal)}</b> — the anchor was{" "}
              {delta > 0 ? "under-counting" : "padding"} what you really spend
            </>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <KeyStat label="Stale anchor" value={inr(staleTotal)} tone="default" hint="budgets, flat for months" />
          <KeyStat
            label="Live budget"
            value={inr(proposedTotal)}
            tone={resetCount > 0 ? "accent" : "default"}
            hint={`${resetCount}/${drifts.length} re-anchored`}
          />
          <KeyStat
            label="Real average"
            value={inr(realTotal)}
            tone={delta > 0 ? "warning" : "positive"}
            hint="what the data says"
          />
        </div>

        {/* Signature: per-envelope stale-anchor vs real-average, one tap to reset */}
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Anchor vs your real average</span>
            <span className="text-[0.72em] text-text-muted">dashed = budget · line = actual</span>
          </div>

          {drifts.map((d) => {
            const on = reset[d.id] ?? false;
            const under = d.driftPct > 0; // spending MORE than budgeted
            const tone = under ? "var(--ml-color-warning)" : "var(--ml-color-positive)";
            const current = on ? d.avg : d.anchor;
            return (
              <div
                key={d.id}
                className="rounded-md border border-border p-3 transition-[border-color] hover:border-accent"
                style={{ transitionDuration: "var(--ml-motion-fast)" }}
                onMouseEnter={tip.enter(
                  d.name,
                  `Budgeted ${inr(d.anchor)} but the last 3 months averaged ${inr(d.avg)} — that's ${Math.abs(
                    Math.round(d.driftPct * 100),
                  )}% ${under ? "over the anchor (under-budgeted)" : "under the anchor (over-budgeted)"}. Reset to ${inr(
                    d.avg,
                  )}.`,
                )}
                onMouseLeave={tip.leave}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
                    <Icon name={d.icon} emoji={d.emoji} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.9em] font-medium text-text">{d.name}</span>
                      <Pill tone={under ? "warning" : "positive"}>
                        {under ? "+" : "−"}
                        {Math.abs(Math.round(d.driftPct * 100))}%
                      </Pill>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1.5 text-[0.78em]">
                      <span className="text-text-muted line-through" style={{ opacity: on ? 1 : 0.7 }}>
                        {inr(d.anchor)}
                      </span>
                      <span className="text-text-muted">→</span>
                      <span className="font-display font-bold tabular-nums" style={{ color: tone }}>
                        {inr(d.avg)}
                      </span>
                      <span className="text-text-muted">real avg</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setReset((r) => ({ ...r, [d.id]: !(r[d.id] ?? false) }))}
                    className="shrink-0 rounded-md border px-2.5 py-1 text-[0.76em] font-medium transition-[background-color,border-color,color]"
                    style={{
                      background: on ? "var(--ml-color-accent)" : "transparent",
                      borderColor: on ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                      color: on ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)",
                      transitionDuration: "var(--ml-motion-fast)",
                      cursor: "pointer",
                    }}
                  >
                    {on ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="check" emoji="✓" size={13} /> re-anchored
                      </span>
                    ) : (
                      "Reset to avg"
                    )}
                  </button>
                </div>

                {/* the tell, drawn: flat anchor vs the drifting actual line */}
                <div className="mt-2 flex items-center gap-3">
                  <AnchorChart series={d.series} anchor={d.anchor} reset={on} />
                  <div className="flex flex-col gap-0.5 text-[0.7em] text-text-muted">
                    <span>Apr · May · Jun</span>
                    <span>
                      now using{" "}
                      <b className="text-text" style={{ color: on ? "var(--ml-color-accent)" : undefined }}>
                        {inr(current)}
                      </b>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {tip.node}
        </div>

        <button
          onClick={resetAll}
          className="rounded-md border border-accent px-3 py-2 text-[0.84em] font-medium text-accent transition-[background-color,color] hover:bg-accent hover:text-accent-contrast"
          style={{ transitionDuration: "var(--ml-motion-fast)", cursor: "pointer" }}
        >
          {allReset ? "Undo all — back to the old anchors" : `Re-anchor all ${drifts.length} to the data`}
        </button>

        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, these numbers never reflected a decision — they&apos;re
            just where the budget happened to land months ago and then froze. Anchored low, you &quot;overspend&quot; every month;
            anchored high, the slack hides savings you could redirect. Re-baseline to the real average and the budget
            starts describing your life instead of an old guess.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default AnchorReset;

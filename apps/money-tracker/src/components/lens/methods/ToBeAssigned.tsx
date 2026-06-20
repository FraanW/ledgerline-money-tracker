"use client";

import React, { useState, useMemo } from "react";
import { LensCard, KeyStat, Pill } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * To Be Assigned — Jesse Mecham / YNAB Zero-Based Budgeting ("Give Every Rupee a Job").
 *
 * Start with L.availableCash (8300) sitting unassigned. Every rupee must get a
 * job: the user funds under-filled envelopes with +/- steppers, and the giant
 * "To Be Assigned" header counts down toward ₹0. It turns GREEN only at exactly
 * ₹0 — the YNAB invariant. The pool can never go negative (you can only give
 * away money you actually have), which is the whole point of the method, so we
 * hard-clamp it and dramatise the wall. Signature visual: a "cash stack" bar
 * that drains from unassigned (warm) into per-envelope assigned blocks, with a
 * celebratory zeroed-out state.
 */

interface Job {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  bucket: L.Bucket;
  /** Suggested top-up — how short this envelope is right now. */
  suggested: number;
}

/** Under-funded envelopes become "jobs" needing rupees (skip protected/maxed ones). */
function deriveJobs(): Job[] {
  const need = L.envelopes
    .filter((e) => !e.isProtected && e.expectedRemaining > 0)
    .map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon,
      emoji: e.emoji,
      bucket: e.bucket,
      // A little more than what's still expected, so funding is meaningful.
      suggested: Math.round(e.expectedRemaining * 1.15),
    }));
  // Add two goal envelopes as savings jobs — every rupee can also chase a goal.
  const goalJobs: Job[] = [
    { id: "emergency", name: "Emergency Fund", icon: "shield", emoji: "🛟", bucket: "savings", suggested: 2000 },
    { id: "goa", name: "Goa Trip", icon: "goal", emoji: "🏖️", bucket: "savings", suggested: 1500 },
  ];
  return [...need, ...goalJobs];
}

const BUCKET_COLOR: Record<L.Bucket, string> = {
  need: "var(--ml-color-accent)",
  want: "var(--ml-color-accent-2)",
  savings: "var(--ml-color-positive)",
};
const BUCKET_LABEL: Record<L.Bucket, string> = { need: "Need", want: "Want", savings: "Savings" };

const STEP = 250;

export function ToBeAssigned(): React.ReactElement {
  const jobs = useMemo(() => deriveJobs(), []);
  const pool = L.availableCash;
  const [assigned, setAssigned] = useState<Record<string, number>>(() =>
    jobs.reduce<Record<string, number>>((acc, j) => {
      acc[j.id] = 0;
      return acc;
    }, {}),
  );
  const tip = useViztip();

  const totalAssigned = useMemo(() => Object.values(assigned).reduce((s, v) => s + v, 0), [assigned]);
  const toBeAssigned = pool - totalAssigned;
  const zeroed = toBeAssigned === 0;
  const fundedCount = jobs.filter((j) => (assigned[j.id] ?? 0) > 0).length;

  // Give a job `delta` rupees, clamped so the pool can NEVER go negative and a
  // job can never drop below 0 — the never-negative invariant, made physical.
  const give = (id: string, delta: number): void => {
    setAssigned((cur) => {
      const have = cur[id] ?? 0;
      const used = Object.values(cur).reduce((s, v) => s + v, 0); // recompute from cur, not stale closure
      const room = pool - (used - have); // max this job could hold
      const next = Math.max(0, Math.min(room, have + delta));
      return { ...cur, [id]: next };
    });
  };

  // Auto-distribute everything left across still-hungry jobs (by suggested gap).
  const autoFill = (): void => {
    setAssigned((cur) => {
      const used = Object.values(cur).reduce((s, v) => s + v, 0);
      let left = pool - used;
      if (left <= 0) return cur;
      const next = { ...cur };
      const hungry = jobs
        .map((j) => ({ j, gap: Math.max(0, j.suggested - (next[j.id] ?? 0)) }))
        .filter((x) => x.gap > 0);
      const gapTotal = hungry.reduce((s, x) => s + x.gap, 0) || 1;
      for (const { j, gap } of hungry) {
        const share = Math.min(gap, Math.round((gap / gapTotal) * left));
        next[j.id] = (next[j.id] ?? 0) + share;
      }
      // Sweep any rounding remainder into the first hungry job.
      const after = Object.values(next).reduce((s, v) => s + v, 0);
      const rem = pool - after;
      const first = hungry[0]?.j.id;
      if (rem > 0 && first) next[first] = (next[first] ?? 0) + rem;
      return next;
    });
  };

  const reset = (): void => setAssigned(jobs.reduce<Record<string, number>>((a, j) => ((a[j.id] = 0), a), {}));

  // ── Cash-stack geometry (signature) ──
  const W = 520;
  const H = 30;
  let cursor = 0;
  const blocks = jobs
    .filter((j) => (assigned[j.id] ?? 0) > 0)
    .map((j) => {
      const v = assigned[j.id] ?? 0;
      const x = (cursor / pool) * W;
      const w = (v / pool) * W;
      cursor += v;
      return { j, v, x, w };
    });
  const unassignedX = (totalAssigned / pool) * W;
  const unassignedW = (toBeAssigned / pool) * W;

  return (
    <LensCard
      icon="budget"
      emoji="💸"
      title="To Be Assigned"
      subtitle="Jesse Mecham · YNAB — give every rupee a job"
      badge={
        <Pill tone={zeroed ? "positive" : "warning"}>
          {zeroed ? "every rupee employed" : `${fundedCount} of ${jobs.length} funded`}
        </Pill>
      }
    >
      <div className="flex flex-col gap-5">
        {/* SIGNATURE HERO — the countdown that only greens at exactly ₹0 */}
        <div
          className="rounded-md p-4 text-accent-contrast transition-[background] relative overflow-hidden"
          style={{
            background: zeroed ? "var(--ml-color-positive)" : "var(--ml-gradient-hero)",
            boxShadow: "var(--ml-glow)",
            transitionDuration: "var(--ml-motion-base)",
          }}
        >
          <div className="text-[0.8em] opacity-90 flex items-center gap-1.5">
            {zeroed ? <Icon name="check" emoji="🎉" size={15} /> : <Icon name="bank" emoji="🪙" size={15} />}
            {zeroed ? "Zero-based budget — balanced" : "Cash on hand waiting for a job"}
          </div>
          <div className="font-display text-[2.4em] font-bold leading-tight tabular-nums">{inr(toBeAssigned)}</div>
          <div className="text-[0.84em] opacity-95">
            {zeroed ? (
              <>Nice — all {inr(pool)} is working. Nothing idle, nothing leaking.</>
            ) : (
              <>
                of {inr(pool)} · assign the last {inr(toBeAssigned)} to hit <b>₹0</b>
              </>
            )}
          </div>
        </div>

        {/* Cash-stack bar: assigned blocks drain the warm unassigned remainder */}
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">The cash stack</span>
            <span className="text-[0.72em] text-text-muted tabular-nums">
              {inr(totalAssigned)} assigned · {inr(toBeAssigned)} idle
            </span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
            <rect x={0} y={0} width={W} height={H} rx={6} fill="var(--ml-color-surface-raised)" />
            {blocks.map(({ j, v, x, w }) => (
              <rect
                key={j.id}
                x={x}
                y={0}
                width={Math.max(0, w - 1)}
                height={H}
                fill={BUCKET_COLOR[j.bucket]}
                style={{ transition: "x var(--ml-motion-base), width var(--ml-motion-base)" }}
                onMouseEnter={tip.enter(
                  `${j.name} · ${BUCKET_LABEL[j.bucket]}`,
                  `You gave this envelope ${inr(v)} a job. In YNAB, money only counts once it's named.`,
                )}
                onMouseLeave={tip.leave}
              />
            ))}
            {toBeAssigned > 0 && (
              <rect
                x={unassignedX}
                y={0}
                width={Math.max(0, unassignedW)}
                height={H}
                fill="var(--ml-color-warning)"
                opacity={0.85}
                style={{ transition: "x var(--ml-motion-base), width var(--ml-motion-base)" }}
                onMouseEnter={tip.enter(
                  "Unemployed rupees",
                  `${inr(toBeAssigned)} still has no job. Idle money is the easiest money to lose — give it one.`,
                )}
                onMouseLeave={tip.leave}
              />
            )}
            {/* The ₹0 wall: the right edge you can fill up to but never past. */}
            <line x1={W - 0.5} y1={0} x2={W - 0.5} y2={H} stroke="var(--ml-color-text)" strokeWidth={1} opacity={0.4} />
          </svg>
          {tip.node}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <KeyStat label="Cash on hand" value={inr(pool)} tone="accent" hint="unassigned to start" />
          <KeyStat label="Given a job" value={inr(totalAssigned)} tone="positive" hint={`${fundedCount} envelopes`} />
          <KeyStat
            label="Still idle"
            value={inr(toBeAssigned)}
            tone={zeroed ? "positive" : "warning"}
            hint={zeroed ? "balanced ✓" : "needs a job"}
          />
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={autoFill}
            disabled={zeroed}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-[0.82em] font-medium text-accent transition-[opacity] disabled:opacity-40"
            style={{ cursor: zeroed ? "default" : "pointer", transitionDuration: "var(--ml-motion-fast)" }}
          >
            <Icon name="brain" emoji="✨" size={14} /> Auto-assign the rest
          </button>
          <button
            onClick={reset}
            disabled={totalAssigned === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[0.82em] font-medium text-text-muted transition-[opacity] disabled:opacity-40"
            style={{ cursor: totalAssigned === 0 ? "default" : "pointer", transitionDuration: "var(--ml-motion-fast)" }}
          >
            Reset
          </button>
        </div>

        {/* The jobs — envelopes that light up as funded */}
        <div className="flex flex-col gap-2">
          <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Give each rupee a job</span>
          {jobs.map((j) => {
            const v = assigned[j.id] ?? 0;
            const funded = v > 0;
            const metGoal = v >= j.suggested;
            const room = pool - (totalAssigned - v);
            const canAdd = room > v && toBeAssigned > 0;
            return (
              <div
                key={j.id}
                className="flex items-center gap-3 rounded-md border p-2.5 transition-[border-color,background-color]"
                style={{
                  borderColor: funded ? BUCKET_COLOR[j.bucket] : "var(--ml-color-border)",
                  background: funded
                    ? `color-mix(in srgb, ${BUCKET_COLOR[j.bucket]} 9%, transparent)`
                    : "transparent",
                  transitionDuration: "var(--ml-motion-base)",
                }}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors"
                  style={{
                    background: funded ? BUCKET_COLOR[j.bucket] : "var(--ml-color-surface-raised)",
                    color: funded ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)",
                    transitionDuration: "var(--ml-motion-base)",
                  }}
                >
                  <Icon name={j.icon} emoji={j.emoji} size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.9em] font-medium text-text">
                      {j.name}
                      <span className="ml-2 text-[0.7em] font-normal text-text-muted">
                        {BUCKET_LABEL[j.bucket]} · needs ~{inr(j.suggested)}
                      </span>
                    </span>
                    <span
                      className="shrink-0 font-display text-[0.95em] font-bold tabular-nums"
                      style={{ color: funded ? BUCKET_COLOR[j.bucket] : "var(--ml-color-text-muted)" }}
                    >
                      {inr(v)}
                    </span>
                  </div>
                  {/* fill toward the suggested top-up */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${Math.min(100, (v / Math.max(1, j.suggested)) * 100)}%`,
                        background: metGoal ? "var(--ml-color-positive)" : BUCKET_COLOR[j.bucket],
                        transitionDuration: "var(--ml-motion-base)",
                      }}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => give(j.id, -STEP)}
                    disabled={v === 0}
                    aria-label={`Take ${inr(STEP)} from ${j.name}`}
                    className="grid h-7 w-7 place-items-center rounded-md border border-border text-text-muted transition-[opacity] disabled:opacity-30"
                    style={{ cursor: v === 0 ? "default" : "pointer", transitionDuration: "var(--ml-motion-fast)" }}
                  >
                    −
                  </button>
                  <button
                    onClick={() => give(j.id, STEP)}
                    disabled={!canAdd}
                    aria-label={`Give ${inr(STEP)} to ${j.name}`}
                    className="grid h-7 w-7 place-items-center rounded-md border text-[0.95em] font-bold transition-[opacity] disabled:opacity-30"
                    style={{
                      cursor: canAdd ? "pointer" : "default",
                      borderColor: canAdd ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                      color: canAdd ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)",
                      transitionDuration: "var(--ml-motion-fast)",
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* The tell — made human */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b>{" "}
            {zeroed ? (
              <>
                Every rupee of {L.profile.name}&apos;s {inr(pool)} now has a job. That&apos;s a zero-based budget — you didn&apos;t make
                more money, you just stopped letting it drift.
              </>
            ) : (
              <>
                {L.profile.name} has {inr(toBeAssigned)} drifting with no instructions. The number can&apos;t go below ₹0 —
                you can only assign money you actually have. Decide where it goes <i>before</i> the month spends it for
                you.
              </>
            )}
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default ToBeAssigned;
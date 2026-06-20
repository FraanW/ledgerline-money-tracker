"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/* ── Local fixtures ───────────────────────────────────────────────────────
 * Ramsey minimums per debt (not in the shared mock — inline so the snowball
 * math is honest). Keyed to L.liabilities ids: l1 card, l2 personal, l3 phone.
 * Baby Step 1 = a ~₹1L starter emergency buffer before attacking debt. */
const MINIMUMS: Record<string, number> = { l1: 1000, l2: 4200, l3: 2500 };
const STARTER_BUFFER = 100000;
const APR_HINT: Record<string, string> = {
  l1: "~42% APR — the costliest balance, but not the smallest.",
  l2: "Personal loan EMI keeps the snowball fed once it clears.",
  l3: "Smallest balance — your first quick win.",
};

interface Debt {
  id: string;
  name: string;
  balance: number;
  minimum: number;
}

interface PayoffStep {
  id: string;
  name: string;
  startMonth: number;
  endMonth: number;
  rollIn: number; // snowball size when this debt becomes the target
}

interface PayoffPlan {
  months: number;
  steps: PayoffStep[];
}

/** Iterative amortization: every open debt pays its minimum each month; the
 *  smallest-balance target additionally absorbs the freed minimums + extra. As
 *  debts clear, their minimums "roll" forward, so the snowball keeps growing. */
function simulateSnowball(debts: Debt[], extra: number): PayoffPlan {
  const remaining = debts.map((d) => ({ ...d, cleared: false, start: 0 }));
  const steps: PayoffStep[] = [];
  let month = 0;
  let freed = 0; // minimums of already-cleared debts, rolled into the snowball

  while (remaining.some((d) => !d.cleared) && month < 600) {
    month += 1;
    const target = remaining.find((d) => !d.cleared);
    if (!target) break;
    // The current target gets its own minimum + every freed minimum + the extra.
    if (target.start === 0) target.start = month - 1;
    const targetPower = target.minimum + freed + extra;
    // Non-target open debts simply pay their minimum and amortize.
    for (const d of remaining) {
      if (d.cleared) continue;
      d.balance -= d.id === target.id ? targetPower : d.minimum;
    }
    if (target.balance <= 0) {
      steps.push({
        id: target.id,
        name: target.name,
        startMonth: target.start,
        endMonth: month,
        rollIn: targetPower,
      });
      freed += target.minimum;
      target.cleared = true;
    }
  }
  return { months: month, steps };
}

function formatMonths(m: number): string {
  if (m >= 600) return "50+ yrs";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (y <= 0) return `${mo} mo`;
  if (mo === 0) return `${y} yr`;
  return `${y} yr ${mo} mo`;
}

export function SnowballCoach(): React.JSX.Element {
  const [extra, setExtra] = useState<number>(0);
  const tip = useViztip();

  // Smallest balance first — the Ramsey order.
  const debts: Debt[] = useMemo(
    () =>
      [...L.liabilities]
        .map((d) => ({ id: d.id, name: d.name, balance: d.amountRupees, minimum: MINIMUMS[d.id] ?? 1000 }))
        .sort((a, b) => a.balance - b.balance),
    [],
  );

  const totalDebt = useMemo(() => debts.reduce((s, d) => s + d.balance, 0), [debts]);
  const baseMinimum = useMemo(() => debts.reduce((s, d) => s + d.minimum, 0), [debts]);
  const snowball = baseMinimum + extra;

  const planNow = useMemo(() => simulateSnowball(debts, extra), [debts, extra]);
  const planBase = useMemo(() => simulateSnowball(debts, 0), [debts]);
  const saved = Math.max(0, planBase.months - planNow.months);

  // Baby Step 1: is the ~₹1L starter buffer funded? (Emergency fund current).
  const emergency = L.goals.find((g) => g.id === "g_emergency");
  const bufferFunded = (emergency?.current ?? 0) >= STARTER_BUFFER;

  // Discretionary "want" spend — the lever Ramsey would redirect into the snowball.
  const wantSpend = L.spendByBucket().want;

  const targetDebt = debts[0];

  /* ── Signature visual geometry: snowball rolling down an ordered slope ──── */
  const W = 520;
  const H = 200;
  const padX = 28;
  const slopeTop = 34;
  const slopeBot = H - 30;
  const n = debts.length;
  // x positions for each debt "station" along the slope, left→right (small→large balance)
  const stationX = (i: number) => padX + ((W - 2 * padX) * i) / Math.max(1, n - 1);
  const slopeY = (i: number) => slopeTop + ((slopeBot - slopeTop) * i) / Math.max(1, n - 1);
  // snowball radius grows as it absorbs each freed minimum + the extra
  const maxRoll = baseMinimum + extra;
  const rFor = (rollIn: number): number => 9 + 20 * Math.min(1, rollIn / Math.max(1, maxRoll));

  return (
    <LensCard
      icon="bank"
      emoji="⛄"
      title="Snowball Coach"
      subtitle="Dave Ramsey · smallest balance first, momentum over math"
      badge={<Pill tone="accent">Baby Step 2</Pill>}
    >
      <div className="flex flex-col gap-4">
        <HeroStat
          eyebrow="Debt-free in"
          value={
            <span className="font-display tabular-nums">{formatMonths(planNow.months)}</span>
          }
          sub={
            <>
              {inr(totalDebt)} across {n} debts ·{" "}
              {saved > 0 ? `${saved} mo sooner with your extra` : "add extra to roll faster"}
            </>
          }
        />

        <div className="grid grid-cols-3 gap-2">
          <KeyStat label="Snowball / mo" value={inr(snowball)} tone="accent" hint={`${inr(baseMinimum)} min + extra`} />
          <KeyStat
            label="Target now"
            value={targetDebt ? inr(targetDebt.balance) : "—"}
            tone="warning"
            hint={targetDebt ? targetDebt.name : ""}
          />
          <KeyStat
            label="Starter buffer"
            value={bufferFunded ? "Funded" : "Unfunded"}
            tone={bufferFunded ? "positive" : "negative"}
            hint={`Baby Step 1 · ${inrCompact(STARTER_BUFFER)}`}
          />
        </div>

        {/* ── SIGNATURE: snowball rolling down the ordered slope ──────────── */}
        <div className="rounded-md border border-border bg-surface-raised p-3">
          <div className="mb-1 flex items-center gap-2 text-[0.8em] text-text-muted">
            <Icon name="insights" emoji="📉" size={15} />
            The snowball grows as it rolls — each cleared debt frees its minimum into the next.
          </div>
          <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Debt snowball slope">
              <defs>
                <linearGradient id="sc-slope" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ml-color-accent)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--ml-color-accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              {/* the hill */}
              <path
                d={`M ${padX} ${slopeY(0)} L ${stationX(n - 1)} ${slopeBot} L ${stationX(n - 1)} ${H} L ${padX} ${H} Z`}
                fill="url(#sc-slope)"
              />
              <line
                x1={padX}
                y1={slopeY(0)}
                x2={stationX(n - 1)}
                y2={slopeBot}
                stroke="var(--ml-color-border)"
                strokeWidth={2}
              />

              {/* debt stations + growing snowballs */}
              {debts.map((d, i) => {
                const step = planNow.steps.find((s) => s.id === d.id);
                const cleared = !!step && step.endMonth <= planNow.months;
                const cx = stationX(i);
                const cy = slopeY(i) - 4;
                const r = rFor(step ? step.rollIn : d.minimum + extra);
                const order = i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`;
                const detail = step
                  ? `${order} target · clears month ${step.endMonth}. Rolls ${inr(step.rollIn)}/mo. ${APR_HINT[d.id] ?? ""}`
                  : `${order} target · ${inr(d.balance)}. ${APR_HINT[d.id] ?? ""}`;
                return (
                  <g key={d.id}>
                    {/* station marker */}
                    <circle cx={cx} cy={slopeY(i)} r={3} fill="var(--ml-color-text-muted)" />
                    {/* the snowball */}
                    <circle
                      cx={cx}
                      cy={cy - r}
                      r={r}
                      fill={cleared ? "var(--ml-color-positive)" : "var(--ml-color-accent)"}
                      fillOpacity={0.9}
                      stroke="var(--ml-color-surface)"
                      strokeWidth={2}
                      style={{ transition: "r var(--ml-motion-base), cx var(--ml-motion-base), cy var(--ml-motion-base)" }}
                    />
                    {/* invisible hit area for the tooltip */}
                    <rect
                      x={cx - 30}
                      y={cy - r - 30}
                      width={60}
                      height={r + 50}
                      fill="transparent"
                      onMouseEnter={tip.enter(d.name, detail)}
                      onMouseLeave={tip.leave}
                    />
                    <text
                      x={cx}
                      y={H - 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--ml-color-text-muted)"
                      className="tabular-nums"
                    >
                      {inrCompact(d.balance)}
                    </text>
                    {cleared && (
                      <text x={cx} y={cy - r - 6} textAnchor="middle" fontSize={11} fill="var(--ml-color-positive)">
                        ✓
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {tip.node}
          </div>
        </div>

        {/* ── Payoff timeline: when each debt clears ──────────────────────── */}
        <div className="flex flex-col gap-2">
          {planNow.steps.map((s, i) => {
            const span = s.endMonth - s.startMonth;
            const pct = Math.max(4, Math.min(100, (s.endMonth / Math.max(1, planNow.months)) * 100));
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[0.82em] text-text">{s.name}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                    style={{
                      width: `${pct}%`,
                      background: i === 0 ? "var(--ml-color-accent)" : "var(--ml-gradient-accent)",
                      transitionDuration: "var(--ml-motion-base)",
                    }}
                  />
                  <span className="absolute inset-y-0 right-2 flex items-center text-[0.7em] font-medium text-text-muted">
                    mo {s.endMonth}
                  </span>
                </div>
                <span className="w-10 shrink-0 text-right text-[0.72em] text-text-muted tabular-nums">{span}mo</span>
              </div>
            );
          })}
        </div>

        {/* ── The interactive lever ───────────────────────────────────────── */}
        <div className="rounded-md border border-border p-3">
          <SliderRow
            label="Extra payment / month"
            value={extra}
            min={0}
            max={20000}
            step={500}
            onChange={(v: number) => setExtra(v)}
            format={(v: number) => (v === 0 ? "none yet" : inr(v))}
          />
        </div>

        {/* ── The tell, made human ────────────────────────────────────────── */}
        <div className="flex items-start gap-2 rounded-md bg-surface-raised p-3 text-[0.84em] leading-snug text-text">
          <span className="mt-0.5 shrink-0 text-accent">
            <Icon name="brain" emoji="🧠" size={16} />
          </span>
          <span>
            {bufferFunded ? (
              <>
                Your ₹1L starter buffer is parked, so attack debt full-tilt. You spent{" "}
                <strong className="text-warning">{inr(wantSpend)}</strong> on wants this month — redirect even half of
                that and the snowball clears <strong className="text-positive">months</strong> sooner. Debt is a
                behaviour problem, not a math problem.
              </>
            ) : (
              <>
                Park a <strong>{inrCompact(STARTER_BUFFER)}</strong> starter buffer first (Baby Step 1), then roll the
                snowball. The smallest win first is what keeps you going.
              </>
            )}
          </span>
        </div>
      </div>
    </LensCard>
  );
}
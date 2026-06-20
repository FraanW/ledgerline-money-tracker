"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow, ProgressRing } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Years-to-FI — the Trinity Study & the 4% Safe-Withdrawal Rule.
 *
 * A nest egg of ~25x annual expenses sustains ~4%/yr withdrawals for ~30 years.
 * The one lever that sets time-to-freedom is the SAVINGS RATE — and it pulls
 * twice: a higher rate adds more fuel each month AND shrinks the expenses you
 * must fund, so the FI number itself drops. We model net worth compounding at a
 * real return until it crosses that (moving) FI line, and draw the approach.
 */

const SAFE_WITHDRAWAL_PCT = 4; // Trinity Study: 4% → 25x annual expenses
const MULTIPLE = 100 / SAFE_WITHDRAWAL_PCT; // 25x
const MAX_YEARS = 50;

interface FiResult {
  fiNumber: number;
  annualExpenses: number;
  monthlySavings: number;
  /** Years until net worth reaches fiNumber; clamped at MAX_YEARS. */
  years: number;
  reached: boolean;
  /** Yearly net-worth points [start .. fiNumber], for the approach curve. */
  series: number[];
}

/** Grow today's investable wealth, adding monthly savings at a real return, until FI. */
function projectToFi(start: number, monthlySavings: number, realReturnPct: number, fiNumber: number): FiResult {
  const i = realReturnPct / 100 / 12;
  let value = start;
  const yearly: number[] = [start];
  let months = MAX_YEARS * 12;
  let reached = false;
  for (let m = 1; m <= MAX_YEARS * 12; m++) {
    value = value * (1 + i) + monthlySavings;
    if (m % 12 === 0) yearly.push(Math.round(value));
    if (value >= fiNumber && !reached) {
      months = m;
      reached = true;
    }
  }
  return { fiNumber, annualExpenses: 0, monthlySavings, years: months / 12, reached, series: yearly };
}

export function YearsToFi(): React.ReactElement {
  // Anaya's current monthly savings = sip + emergency + goa = 21,000 of 82,000 ≈ 25.6%.
  const takeHome = L.profile.monthlyTakeHome;
  const currentSavings = useMemo<number>(
    () => L.envelopes.filter((e) => e.bucket === "savings").reduce((s, e) => s + e.allocated, 0),
    [],
  );
  const baselineRate = Math.round((currentSavings / takeHome) * 100);

  const [savingsRate, setSavingsRate] = useState<number>(baselineRate);
  const [realReturnPct, setRealReturnPct] = useState<number>(7);
  const tip = useViztip();

  const fi = useMemo<FiResult>(() => {
    const monthlySavings = Math.round((savingsRate / 100) * takeHome);
    const annualExpenses = (takeHome - monthlySavings) * 12;
    const fiNumber = annualExpenses * MULTIPLE;
    const r = projectToFi(L.portfolioValue, monthlySavings, realReturnPct, fiNumber);
    return { ...r, annualExpenses, monthlySavings };
  }, [savingsRate, realReturnPct, takeHome]);

  // Compare against the baseline rate to show the savings-rate "magic".
  const baseline = useMemo<FiResult>(() => {
    const monthlySavings = currentSavings;
    const annualExpenses = (takeHome - monthlySavings) * 12;
    const fiNumber = annualExpenses * MULTIPLE;
    return { ...projectToFi(L.portfolioValue, monthlySavings, realReturnPct, fiNumber), annualExpenses, monthlySavings };
  }, [currentSavings, realReturnPct, takeHome]);

  const progressPct = Math.min(100, (L.portfolioValue / fi.fiNumber) * 100);
  const fiAge = L.profile.age + fi.years;
  const yearsSaved = baseline.years - fi.years;
  const ring = progressPct >= 100 ? "positive" : progressPct >= 50 ? "accent" : "warning";

  // ── Signature: net worth approaching the (moving) FI line ────────────────
  const W = 520;
  const H = 190;
  const PAD_L = 8;
  const PAD_B = 18;
  const horizon = Math.min(MAX_YEARS, Math.ceil(fi.reached ? fi.years + 2 : MAX_YEARS));
  const pts = fi.series.slice(0, horizon + 1);
  const yMax = fi.fiNumber * 1.12;
  const x = (k: number): number => PAD_L + (k / horizon) * (W - PAD_L * 2);
  const y = (v: number): number => H - PAD_B - (Math.min(v, yMax) / yMax) * (H - PAD_B - 8);
  const fiY = y(fi.fiNumber);

  const linePath = pts.map((v, k) => `${k === 0 ? "M" : "L"} ${x(k).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(pts.length - 1).toFixed(1)} ${H - PAD_B} L ${x(0).toFixed(1)} ${H - PAD_B} Z`;
  const crossK = fi.reached ? Math.min(Math.round(fi.years), horizon) : -1;

  return (
    <LensCard
      icon="goal"
      emoji="🔥"
      title="Years to Freedom"
      subtitle="25x your spending funds a 4% withdrawal for ~30 years. Your savings rate sets the clock."
      badge={<Pill tone="accent">Trinity · FIRE 4% rule</Pill>}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <HeroStat
          eyebrow="If you keep this up, you reach financial independence in"
          value={
            <span className="tabular-nums">
              {fi.reached ? (
                <>
                  {fi.years.toFixed(1)} <span className="text-[0.55em] font-semibold opacity-90">years</span>
                </>
              ) : (
                <>50+ yrs</>
              )}
            </span>
          }
          sub={
            fi.reached ? (
              <>
                around age <span className="font-semibold">{Math.round(fiAge)}</span> — when {inrCompact(fi.fiNumber)} throws
                off {inr(fi.annualExpenses)}/yr at a safe 4%
              </>
            ) : (
              <>at this rate the finish line stays out of reach within 50 years — turn up the savings dial</>
            )
          }
        />
        <div className="grid place-items-center">
          <ProgressRing
            pct={progressPct}
            size={132}
            stroke={13}
            tone={ring}
            label={
              <div className="text-center">
                <div className="font-display text-[1.5em] font-bold leading-none text-text tabular-nums">
                  {progressPct < 10 ? progressPct.toFixed(1) : Math.round(progressPct)}%
                </div>
                <div className="mt-1 text-[0.62em] uppercase tracking-wide text-text-muted">to FI</div>
              </div>
            }
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KeyStat label="Your FI number" value={inrCompact(fi.fiNumber)} tone="accent" hint={`25x of ${inrCompact(fi.annualExpenses)}/yr`} />
        <KeyStat label="Invested so far" value={inrCompact(L.portfolioValue)} hint="counts toward FI" />
        <KeyStat label="Saving each month" value={inr(fi.monthlySavings)} tone="positive" hint={`${savingsRate}% of take-home`} />
        <KeyStat
          label="Safe annual income"
          value={inrCompact(fi.fiNumber * (SAFE_WITHDRAWAL_PCT / 100))}
          tone="positive"
          hint="forever, at 4%"
        />
      </div>

      {/* ── Signature: the approach to the FI line ── */}
      <div ref={tip.ref} onMouseMove={tip.onMove} className="relative mt-5 rounded-md border border-border bg-surface-raised p-3">
        <div className="mb-2 flex items-center justify-between text-[0.78em]">
          <span className="flex items-center gap-1.5 text-text-muted">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--ml-color-accent)" }} /> your net worth
          </span>
          <span className="flex items-center gap-1.5 text-text-muted">
            <span className="inline-block h-0.5 w-3" style={{ background: "var(--ml-color-positive)" }} /> FI line ({inrCompact(fi.fiNumber)})
          </span>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
          {/* the FI finish line */}
          <line x1={PAD_L} y1={fiY} x2={W - PAD_L} y2={fiY} stroke="var(--ml-color-positive)" strokeWidth={1.5} strokeDasharray="5 4" />
          {/* net-worth curve + glow fill */}
          <path d={areaPath} fill="var(--ml-color-accent)" opacity={0.14} />
          <path d={linePath} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {/* the crossing point — the moment of freedom */}
          {crossK >= 0 && (
            <>
              <line x1={x(crossK)} y1={fiY} x2={x(crossK)} y2={H - PAD_B} stroke="var(--ml-color-positive)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <circle cx={x(crossK)} cy={fiY} r={4.5} fill="var(--ml-color-positive)" stroke="var(--ml-color-surface-raised)" strokeWidth={1.5} />
            </>
          )}
          {/* hover zones across the horizon */}
          {Array.from({ length: horizon }, (_, k) => k).map((k) => {
            const v0 = pts[k] ?? 0;
            const v1 = pts[k + 1] ?? v0;
            const gap = Math.max(0, fi.fiNumber - v1);
            return (
              <rect
                key={k}
                x={x(k)}
                y={0}
                width={x(k + 1) - x(k)}
                height={H - PAD_B}
                fill="transparent"
                onMouseEnter={tip.enter(
                  `Year ${k + 1} · age ${L.profile.age + k + 1}`,
                  gap <= 0
                    ? `Net worth ≈ ${inr(v1)} — past the FI line. From here your portfolio can pay your bills.`
                    : `Net worth grows to ≈ ${inr(v1)}. Still ${inr(gap)} short — each year of saving + compounding closes the gap faster.`,
                )}
                onMouseLeave={tip.leave}
              />
            );
          })}
          {/* x-axis ticks */}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={x(horizon * f)} y={H - 4} fontSize={9} fill="var(--ml-color-text-muted)" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>
              {Math.round(horizon * f)}y
            </text>
          ))}
        </svg>
        {tip.node}
      </div>

      {/* ── Controls — default state already tells the story ── */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SliderRow label="Savings rate" value={savingsRate} min={5} max={70} step={1} onChange={setSavingsRate} format={(v) => `${v}%`} />
        <SliderRow label="Expected real return" value={realReturnPct} min={3} max={11} step={0.5} onChange={setRealReturnPct} format={(v) => `${v}%`} />
      </div>

      {/* ── The tell, made human ── */}
      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-surface-raised p-3 text-[0.85em] text-text">
        <span className="mt-0.5 text-accent">
          <Icon name="brain" emoji="🔥" size={16} />
        </span>
        <p>
          {savingsRate > baselineRate && yearsSaved > 0.1 ? (
            <>
              Lifting your savings rate from <span className="font-medium">{baselineRate}%</span> to{" "}
              <span className="font-medium">{savingsRate}%</span> pulls freedom forward by{" "}
              <span className="font-display font-bold text-positive">{yearsSaved.toFixed(1)} years</span> — because every rupee
              saved both fuels the pot <em>and</em> lowers the spending you ever have to fund.
            </>
          ) : savingsRate < baselineRate && yearsSaved < -0.1 ? (
            <>
              Easing off to <span className="font-medium">{savingsRate}%</span> pushes FI back by{" "}
              <span className="font-display font-bold text-negative">{Math.abs(yearsSaved).toFixed(1)} years</span> — spending
              more today raises both your monthly burn and the 25x target it implies.
            </>
          ) : fi.reached ? (
            <>
              At your current <span className="font-medium">{baselineRate}%</span> savings rate you cross the line around age{" "}
              <span className="font-display font-bold text-accent">{Math.round(fiAge)}</span>. Nudge the dial up a few points and
              watch the finish line jump toward you — savings rate, not salary, is the lever.
            </>
          ) : (
            <>
              At your current <span className="font-medium">{baselineRate}%</span> savings rate, FI stays beyond a 50-year
              horizon. Nudge the dial up a few points and watch the finish line appear — savings rate, not salary, is the lever.
            </>
          )}
        </p>
      </div>
    </LensCard>
  );
}

export default YearsToFi;

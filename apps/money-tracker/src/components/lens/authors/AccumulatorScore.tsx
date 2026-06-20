"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow, Bar } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Accumulator Score — Stanley's "Millionaire Next Door" wealth equation.
 *
 *   Expected Net Worth = age × pre-tax annual income ÷ 10
 *   Wealth Index       = actual net worth ÷ expected
 *   PAW ≥ 2.0   ·   Average ~1.0   ·   UAW ≤ 0.5
 *
 * The formula is calibrated for mid-career earners, so a 29-year-old almost
 * always lands in "UAW" — we surface that honestly, then reframe it warmly:
 * the gap is youth, not failure, and we show the trajectory to PAW.
 */

const UAW_MAX = 0.5; // ≤ 0.5  → Under-Accumulator
const PAW_MIN = 2.0; // ≥ 2.0  → Prodigious-Accumulator
const SCALE_MAX = 2.5; // gauge tops out a touch past PAW

type Zone = "uaw" | "avg" | "paw";
function zoneOf(idx: number): Zone {
  if (idx >= PAW_MIN) return "paw";
  if (idx <= UAW_MAX) return "uaw";
  return "avg";
}

export function AccumulatorScore() {
  const tip = useViztip();

  // Live levers — default to Anaya's real numbers so the rest state looks great.
  const [annualIncomeL, setAnnualIncomeL] = useState<number>(L.profile.annualPretaxIncome / 1e5); // in lakh
  const [monthlySave, setMonthlySave] = useState<number>(17000); // SIP 12k + EF 5k from envelopes

  const annualIncome = annualIncomeL * 1e5;
  const expectedNW = (L.profile.age * annualIncome) / 10;
  const index = expectedNW > 0 ? L.netWorth / expectedNW : 0;
  const zone = zoneOf(index);

  // Net worth Anaya would need *today* to be a PAW, and the shortfall to it.
  const pawNW = PAW_MIN * expectedNW;
  const shortfallToPaw = Math.max(0, pawNW - L.netWorth);

  // Rough trajectory: grow net worth by savings + 11% market growth, hold
  // expected NW fixed at today's age (a friendly "if you froze the clock"
  // projection — Stanley's bar rises with age too, so this is the optimistic
  // read we use to motivate, clearly labelled "at today's benchmark").
  const yearsToPaw = useMemo<number>(() => {
    const r = 0.11;
    let nw = L.netWorth;
    for (let y = 1; y <= 60; y++) {
      nw = nw * (1 + r) + monthlySave * 12;
      if (nw >= pawNW) return y;
    }
    return 60;
  }, [monthlySave, pawNW]);

  // ── Signature: 270° gauge geometry ──────────────────────────────────────
  const size = 220;
  const stroke = 18;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke / 2 - 2;
  const START = 135; // degrees; arc opens downward, sweeps 270°
  const SWEEP = 270;
  const toAngle = (v: number) => START + (Math.min(v, SCALE_MAX) / SCALE_MAX) * SWEEP;
  const polar = (deg: number, rad: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const arc = (v0: number, v1: number, rad: number) => {
    const a0 = toAngle(v0);
    const a1 = toAngle(v1);
    const p0 = polar(a0, rad);
    const p1 = polar(a1, rad);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${rad} ${rad} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  };

  const needleAngle = toAngle(index);
  const needleTip = polar(needleAngle, r - 4);

  const zoneLabel = zone === "paw" ? "Prodigious Accumulator" : zone === "uaw" ? "Under-Accumulator (for now)" : "Average Accumulator";
  const zoneTone = zone === "paw" ? "positive" : zone === "uaw" ? "warning" : "accent";
  const zoneEmoji = zone === "paw" ? "🏆" : zone === "uaw" ? "🌱" : "⚖️";

  const tickVals: { v: number; label: string }[] = [
    { v: 0, label: "0" },
    { v: UAW_MAX, label: "0.5" },
    { v: 1, label: "1.0" },
    { v: PAW_MIN, label: "2.0" },
  ];

  return (
    <LensCard
      icon="networth"
      emoji="📏"
      title="Accumulator Score"
      subtitle="Stanley's wealth equation — what you keep, judged against your age & income"
      badge={<Pill tone={zoneTone}>{zoneEmoji} {zone.toUpperCase()}</Pill>}
    >
      <HeroStat
        eyebrow="WEALTH INDEX · actual net worth ÷ expected"
        value={<span className="tabular-nums">{index.toFixed(2)}×</span>}
        sub={
          <>
            You keep {inr(L.netWorth)} against a benchmark of {inr(expectedNW)} — {zoneLabel}
          </>
        }
      />

      <div className="mt-5 grid items-center gap-5 md:grid-cols-[auto,1fr]">
        {/* ── Signature gauge with PAW / Average / UAW zones + needle ── */}
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative mx-auto">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* zone arcs */}
            <path
              d={arc(0, UAW_MAX, r)}
              fill="none"
              stroke="var(--ml-color-warning)"
              strokeWidth={stroke}
              strokeLinecap="round"
              opacity={zone === "uaw" ? 1 : 0.4}
              onMouseEnter={tip.enter("UAW zone · Index ≤ 0.5", "Under-Accumulator: you keep less than half the benchmark. Normal early in a career — the formula assumes decades of compounding you haven't had yet.")}
              onMouseLeave={tip.leave}
            />
            <path
              d={arc(UAW_MAX, PAW_MIN, r)}
              fill="none"
              stroke="var(--ml-color-accent)"
              strokeWidth={stroke}
              opacity={zone === "avg" ? 1 : 0.4}
              onMouseEnter={tip.enter("Average zone · 0.5 – 2.0", "Average Accumulator: roughly the net worth Stanley's formula expects for your age and income.")}
              onMouseLeave={tip.leave}
            />
            <path
              d={arc(PAW_MIN, SCALE_MAX, r)}
              fill="none"
              stroke="var(--ml-color-positive)"
              strokeWidth={stroke}
              strokeLinecap="round"
              opacity={zone === "paw" ? 1 : 0.4}
              onMouseEnter={tip.enter("PAW zone · Index ≥ 2.0", "Prodigious Accumulator: double the benchmark. You turn income into kept wealth far better than your peers.")}
              onMouseLeave={tip.leave}
            />

            {/* ticks */}
            {tickVals.map((tk) => {
              const a = toAngle(tk.v);
              const inner = polar(a, r - stroke / 2 - 4);
              const outer = polar(a, r + stroke / 2 + 2);
              const lbl = polar(a, r + stroke / 2 + 13);
              return (
                <g key={tk.v}>
                  <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--ml-color-border)" strokeWidth={1.5} />
                  <text x={lbl.x} y={lbl.y} fontSize={9} textAnchor="middle" dominantBaseline="middle" fill="var(--ml-color-text-muted)">
                    {tk.label}
                  </text>
                </g>
              );
            })}

            {/* needle — points at the live Wealth Index */}
            <line
              x1={cx}
              y1={cy}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="var(--ml-color-text)"
              strokeWidth={3}
              strokeLinecap="round"
              style={{ transition: "all var(--ml-motion-base)" }}
            />
            <circle cx={cx} cy={cy} r={6} fill="var(--ml-color-surface-raised)" stroke="var(--ml-color-text)" strokeWidth={2} />
          </svg>

          {/* center readout sits just below the hub */}
          <div className="pointer-events-none absolute inset-x-0 bottom-7 grid place-items-center text-center">
            <div className="font-display text-[1.5em] font-bold leading-none text-text tabular-nums">{index.toFixed(2)}×</div>
            <div className="mt-0.5 text-[0.7em] uppercase tracking-wide text-text-muted">wealth index</div>
          </div>
          {tip.node}
        </div>

        {/* ── Right rail: the human read + the levers ── */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <KeyStat label="Expected net worth" value={inrCompact(expectedNW)} tone="default" hint={`age ${L.profile.age} × ${inrCompact(annualIncome)} ÷ 10`} />
            <KeyStat label="What you've kept" value={inrCompact(L.netWorth)} tone="accent" hint="assets − liabilities" />
            <KeyStat label="PAW threshold" value={inrCompact(pawNW)} tone="positive" hint="2× the benchmark" />
            <KeyStat label="Gap to PAW" value={inrCompact(shortfallToPaw)} tone="warning" hint="more to keep, today" />
          </div>

          <SliderRow
            label="Pre-tax annual income"
            value={annualIncomeL}
            min={5}
            max={40}
            step={0.5}
            onChange={(v: number) => setAnnualIncomeL(v)}
            format={(v: number) => `₹${v.toFixed(1)}L`}
          />
          <SliderRow
            label="You set aside / month"
            value={monthlySave}
            min={0}
            max={60000}
            step={1000}
            onChange={(v: number) => setMonthlySave(v)}
            format={(v: number) => inr(v)}
          />
        </div>
      </div>

      {/* ── Trajectory: how far along, and when PAW comes into reach ── */}
      <div className="mt-5 rounded-md border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[0.85em] font-medium text-text">
            <Icon name="invest" emoji="🚀" size={16} /> Trajectory to Prodigious Accumulator
          </span>
          <Pill tone="positive">≈ {yearsToPaw} yrs at this pace</Pill>
        </div>
        <div className="mt-3">
          <Bar pct={Math.min(100, (L.netWorth / pawNW) * 100)} tone="positive" height={12} />
          <div className="mt-1 flex items-center justify-between text-[0.72em] text-text-muted">
            <span>{inrCompact(L.netWorth)} kept now</span>
            <span>{Math.round((L.netWorth / pawNW) * 100)}% of the PAW bar</span>
            <span>{inrCompact(pawNW)} = PAW</span>
          </div>
        </div>
        <p className="mt-3 text-[0.85em] leading-snug text-text-muted">
          Stanley&apos;s formula is built for mid-career savers, so at {L.profile.age} a low score is{" "}
          <span className="text-text">expected, not a verdict</span>. The number that matters is the slope: keeping{" "}
          <span className="font-display text-text">{inr(monthlySave)}/mo</span> and letting it compound puts you in PAW
          territory in roughly <span className="font-display text-text">{yearsToPaw} years</span>. Wealth is what you keep —
          and you&apos;re already keeping.
        </p>
      </div>
    </LensCard>
  );
}

export default AccumulatorScore;

"use client";

import React, { useState } from "react";
import { Card } from "../primitives";
import { Icon } from "../Icon";
import { BurndownChart } from "./BurndownChart";
import { BuildupChart } from "./BuildupChart";
import { runwayProjection, buildupProjection, formatMonths, inr } from "../../lib/finance";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[0.88em]">
        <span className="text-text-muted">{label}</span>
        <span className="font-display font-bold text-text">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--ml-color-accent)" }} />
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 text-[0.85em] text-text" style={{ cursor: "pointer" }}>
      <span className="grid h-5 w-9 items-center rounded-full px-0.5 transition-colors" style={{ background: on ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)", transitionDuration: "var(--ml-motion-fast)" }}>
        <span className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "translateX(0)", transitionDuration: "var(--ml-motion-fast)" }} />
      </span>
      {label}
    </button>
  );
}

/** "around <Mon YYYY>" — months from today, no external date dep. */
function dateAfter(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.round(months));
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

type Mode = "stand" | "build";

export function RunwayCalculator() {
  const [mode, setMode] = useState<Mode>("stand");

  // shared
  const [savings, setSavings] = useState(600000);
  const [expenses, setExpenses] = useState(45000);
  const [earnInterest, setEarnInterest] = useState(true);
  const [ret, setRet] = useState(6);

  // "where I stand" only
  const [income, setIncome] = useState(0);
  const [inflation, setInflation] = useState(false);
  const [infl, setInfl] = useState(6);

  // "build a cushion" only
  const [targetMonths, setTargetMonths] = useState(6);
  const [setAside, setSetAside] = useState(15000);

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
            <Icon name="shield" emoji="🛟" size={20} />
          </span>
          <div>
            <h3 className="font-display text-[1.3em] font-bold text-text">Runway &amp; Safety Net</h3>
            <p className="text-[0.88em] text-text-muted">See where you stand, then make a plan to get a comfortable cushion.</p>
          </div>
        </div>
        <div className="flex rounded-md border border-border p-0.5 text-[0.82em]">
          {([["stand", "Where I stand"], ["build", "Build a cushion"]] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="rounded-sm px-3 py-1"
              style={{ background: mode === m ? "var(--ml-color-accent)" : "transparent", color: mode === m ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)", cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "stand" ? (
        <WhereIStand
          savings={savings} setSavings={setSavings}
          expenses={expenses} setExpenses={setExpenses}
          income={income} setIncome={setIncome}
          earnInterest={earnInterest} setEarnInterest={setEarnInterest}
          ret={ret} setRet={setRet}
          inflation={inflation} setInflation={setInflation}
          infl={infl} setInfl={setInfl}
          onPlan={() => setMode("build")}
        />
      ) : (
        <BuildACushion
          savings={savings} setSavings={setSavings}
          expenses={expenses} setExpenses={setExpenses}
          earnInterest={earnInterest} setEarnInterest={setEarnInterest}
          ret={ret} setRet={setRet}
          targetMonths={targetMonths} setTargetMonths={setTargetMonths}
          setAside={setAside} setSetAside={setSetAside}
        />
      )}
    </Card>
  );
}

/* ── Mode 1: where I stand (forward runway) ─────────────────────────────── */

function WhereIStand(p: {
  savings: number; setSavings: (v: number) => void;
  expenses: number; setExpenses: (v: number) => void;
  income: number; setIncome: (v: number) => void;
  earnInterest: boolean; setEarnInterest: (v: boolean) => void;
  ret: number; setRet: (v: number) => void;
  inflation: boolean; setInflation: (v: boolean) => void;
  infl: number; setInfl: (v: number) => void;
  onPlan: () => void;
}) {
  const res = runwayProjection({
    savings: p.savings,
    monthlyExpenses: p.expenses,
    monthlyIncome: p.income,
    annualReturnPct: p.earnInterest ? p.ret : 0,
    annualInflationPct: p.inflation ? p.infl : 0,
  });
  const covered = res.indefinite;
  const months = res.months;
  const strong = covered || months >= 6;

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Slider label="Liquid savings (the cushion)" value={p.savings} min={0} max={10000000} step={25000} onChange={p.setSavings} format={inr} />
        <Slider label="Monthly living costs" value={p.expenses} min={5000} max={300000} step={2500} onChange={p.setExpenses} format={inr} />
        <Slider label="Income still coming in" value={p.income} min={0} max={200000} step={2500} onChange={p.setIncome} format={(v) => (v === 0 ? "none" : inr(v))} />
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Toggle label="Savings still earn interest" on={p.earnInterest} onChange={p.setEarnInterest} />
          {p.earnInterest && <Slider label="Return on parked savings (p.a.)" value={p.ret} min={2} max={9} step={0.5} onChange={p.setRet} format={(v) => `${v}%`} />}
          <Toggle label="Account for rising costs (inflation)" on={p.inflation} onChange={p.setInflation} />
          {p.inflation && <Slider label="Annual inflation" value={p.infl} min={3} max={12} step={0.5} onChange={p.setInfl} format={(v) => `${v}%`} />}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-md p-4 text-accent-contrast" style={{ background: "var(--ml-gradient-hero)", boxShadow: "var(--ml-glow)" }}>
          <div className="text-[0.8em] opacity-90">Your savings would cover you for</div>
          <div className="font-display text-[2.1em] font-bold leading-tight">{covered ? "As long as you like" : formatMonths(months)}</div>
          <div className="text-[0.82em] opacity-90">
            {covered
              ? `Your ${inr(p.income)}/mo income covers the ${inr(p.expenses)}/mo you spend — the cushion isn't being touched.`
              : `That's roughly ${Math.max(1, Math.round(months))} months of breathing room at ${inr(p.expenses)}/mo.`}
          </div>
        </div>

        {/* benchmarks framed as milestones reached, not failures */}
        <div className="grid grid-cols-3 gap-2">
          {[{ m: 3, cap: "starter" }, { m: 6, cap: "solid" }, { m: 12, cap: "fortress" }].map((b) => {
            const hit = covered || months >= b.m;
            return (
              <div key={b.m} className="rounded-md border p-2.5 text-center" style={{ borderColor: hit ? "var(--ml-color-accent)" : "var(--ml-color-border)", background: hit ? "color-mix(in srgb, var(--ml-color-accent) 10%, transparent)" : "transparent" }}>
                <div className="flex items-center justify-center gap-1 text-[0.72em] font-medium" style={{ color: hit ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)" }}>
                  {hit && <Icon name="check" emoji="✅" size={12} />}
                  {b.m === 12 ? "1 yr" : `${b.m} mo`}
                </div>
                <div className="mt-0.5 text-[0.66em] text-text-muted">{b.cap}</div>
              </div>
            );
          })}
        </div>

        {/* supportive next-step — encourage, don't scare */}
        {strong ? (
          <div className="rounded-md border border-border bg-surface-raised p-3 text-[0.85em] text-text">
            <span className="font-medium">You&apos;re in good shape.</span> Most planners suggest 3–6 months of expenses set aside — you&apos;re there. {!covered && `If you ever lose income, ${dateAfter(months)} is your far horizon, so there's plenty of room to react.`}
          </div>
        ) : (
          <div className="rounded-md p-3 text-[0.85em]" style={{ background: "color-mix(in srgb, var(--ml-color-accent) 10%, transparent)" }}>
            <span className="font-medium text-text">No panic — let&apos;s build it up.</span>
            <span className="text-text-muted"> A 6-month cushion is the usual comfort zone. </span>
            <button onClick={p.onPlan} className="font-medium underline underline-offset-2" style={{ color: "var(--ml-color-accent)", cursor: "pointer" }}>
              Make a plan →
            </button>
          </div>
        )}

        {!covered && <BurndownChart series={res.series} months={months} />}
      </div>
    </div>
  );
}

/* ── Mode 2: build a cushion (reverse / contingency plan) ───────────────── */

function BuildACushion(p: {
  savings: number; setSavings: (v: number) => void;
  expenses: number; setExpenses: (v: number) => void;
  earnInterest: boolean; setEarnInterest: (v: boolean) => void;
  ret: number; setRet: (v: number) => void;
  targetMonths: number; setTargetMonths: (v: number) => void;
  setAside: number; setSetAside: (v: number) => void;
}) {
  const targetFund = p.targetMonths * p.expenses;
  const gap = Math.max(0, targetFund - p.savings);
  const fundedPct = Math.min(100, targetFund > 0 ? (p.savings / targetFund) * 100 : 100);
  const covered = p.savings >= targetFund;

  const build = buildupProjection({
    savings: p.savings,
    monthlySetAside: p.setAside,
    targetFund,
    annualReturnPct: p.earnInterest ? p.ret : 0,
  });

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Slider label="Target cushion" value={p.targetMonths} min={1} max={18} step={1} onChange={p.setTargetMonths} format={(v) => `${v} months`} />
        <Slider label="Monthly living costs" value={p.expenses} min={5000} max={300000} step={2500} onChange={p.setExpenses} format={inr} />
        <Slider label="Saved so far" value={p.savings} min={0} max={10000000} step={25000} onChange={p.setSavings} format={inr} />
        <Slider label="I can set aside / month" value={p.setAside} min={0} max={150000} step={1000} onChange={p.setSetAside} format={(v) => (v === 0 ? "—" : inr(v))} />
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <Toggle label="The fund earns interest while it grows" on={p.earnInterest} onChange={p.setEarnInterest} />
          {p.earnInterest && <Slider label="Return on the parked fund (p.a.)" value={p.ret} min={2} max={9} step={0.5} onChange={p.setRet} format={(v) => `${v}%`} />}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-md p-4 text-accent-contrast" style={{ background: "var(--ml-gradient-hero)", boxShadow: "var(--ml-glow)" }}>
          {covered ? (
            <>
              <div className="text-[0.8em] opacity-90">Your {p.targetMonths}-month cushion is</div>
              <div className="font-display text-[2.1em] font-bold leading-tight">Fully funded 🎉</div>
              <div className="text-[0.82em] opacity-90">You&apos;ve got {inr(targetFund)} covered{p.savings > targetFund ? ` with ${inr(p.savings - targetFund)} to spare` : ""}. Consider stretching the target, or investing the surplus.</div>
            </>
          ) : (
            <>
              <div className="text-[0.8em] opacity-90">To reach a {p.targetMonths}-month cushion you need</div>
              <div className="font-display text-[2.1em] font-bold leading-tight">{inr(gap)} more</div>
              <div className="text-[0.82em] opacity-90">
                {p.setAside > 0 && build.reached
                  ? `At ${inr(p.setAside)}/mo you'll be fully covered in ${formatMonths(build.months)} — around ${dateAfter(build.months)}.`
                  : `Add a monthly amount you can spare to see how soon you'd get there.`}
              </div>
            </>
          )}
        </div>

        {/* progress toward target */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[0.8em] text-text-muted">
            <span>{inr(p.savings)} saved</span>
            <span>{Math.round(fundedPct)}% of {inr(targetFund)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${fundedPct}%`, background: "var(--ml-color-accent)", transitionDuration: "var(--ml-motion-base)" }} />
          </div>
        </div>

        {/* milestone ladder — fund the first month first */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 3, p.targetMonths].filter((v, i, a) => a.indexOf(v) === i).map((m) => {
            const need = m * p.expenses;
            const hit = p.savings >= need;
            return (
              <div key={m} className="rounded-md border p-2.5 text-center" style={{ borderColor: hit ? "var(--ml-color-accent)" : "var(--ml-color-border)", background: hit ? "color-mix(in srgb, var(--ml-color-accent) 10%, transparent)" : "transparent" }}>
                <div className="flex items-center justify-center gap-1 text-[0.72em] font-medium" style={{ color: hit ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)" }}>
                  {hit && <Icon name="check" emoji="✅" size={12} />}
                  {m} mo
                </div>
                <div className="mt-0.5 text-[0.66em] text-text-muted">{inr(need)}</div>
              </div>
            );
          })}
        </div>

        {!covered && p.setAside > 0 && build.reached ? (
          <BuildupChart series={build.series} targetFund={targetFund} />
        ) : (
          <div className="rounded-md border border-border bg-surface-raised p-3 text-[0.85em] text-text-muted">
            {covered
              ? "You're already past this target — nudge it higher to keep building."
              : "Even a small monthly amount starts the climb. Fund a 1-month buffer first, then keep going."}
          </div>
        )}
      </div>
    </div>
  );
}

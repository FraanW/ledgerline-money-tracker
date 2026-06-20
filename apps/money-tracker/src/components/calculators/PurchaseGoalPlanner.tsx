"use client";

import React, { useState } from "react";
import { Card, Badge } from "../primitives";
import { inr } from "../../lib/finance";

type Cadence = "weekly" | "monthly" | "yearly";

const PRESETS = [
  { label: "📱 New phone", amount: 80000, months: 10 },
  { label: "✈️ Goa trip", amount: 40000, months: 6 },
  { label: "💻 Laptop", amount: 90000, months: 12 },
  { label: "🛟 Emergency fund", amount: 150000, months: 18 },
];

/**
 * "I want to buy X in N months" → how much to set aside each week/month/year,
 * with a reminder hook. Short-horizon savings goal (no market returns assumed —
 * this is discipline, not investing).
 */
export function PurchaseGoalPlanner() {
  const [item, setItem] = useState("New phone");
  const [target, setTarget] = useState(80000);
  const [months, setMonths] = useState(10);
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [remind, setRemind] = useState(true);

  const periods = cadence === "monthly" ? months : cadence === "weekly" ? Math.max(1, Math.round(months * 4.345)) : Math.max(1, Math.round(months / 12));
  const per = Math.ceil(target / periods);
  const periodWord = cadence === "monthly" ? "month" : cadence === "weekly" ? "week" : "year";

  return (
    <Card className="p-5 md:p-6">
      <h3 className="font-display text-[1.3em] font-bold text-text">Goal: save up for something</h3>
      <p className="text-[0.88em] text-text-muted">Pick what you want and when — we&apos;ll tell you how much to tuck away, and nudge you to actually do it.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => { setItem(p.label.replace(/^\S+\s/, "")); setTarget(p.amount); setMonths(p.months); }}
            className="rounded-full border border-border px-3 py-1 text-[0.82em] text-text"
            style={{ cursor: "pointer" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-[0.88em]">
            <span className="text-text-muted">What are you saving for?</span>
            <input value={item} onChange={(e) => setItem(e.target.value)} className="rounded-md border border-border bg-surface px-3 py-2 text-text" />
          </label>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.88em]">
              <span className="text-text-muted">Target amount</span>
              <span className="font-display font-bold text-text">{inr(target)}</span>
            </div>
            <input type="range" min={1000} max={500000} step={1000} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--ml-color-accent)" }} />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.88em]">
              <span className="text-text-muted">In how long?</span>
              <span className="font-display font-bold text-text">{months} months</span>
            </div>
            <input type="range" min={1} max={60} step={1} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--ml-color-accent)" }} />
          </div>
          <div className="flex rounded-md border border-border p-0.5 text-[0.82em]">
            {(["weekly", "monthly", "yearly"] as const).map((c) => (
              <button key={c} onClick={() => setCadence(c)} className="flex-1 rounded-sm px-3 py-1 capitalize" style={{ background: cadence === c ? "var(--ml-color-accent)" : "transparent", color: cadence === c ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)", cursor: "pointer" }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-md p-4 text-accent-contrast" style={{ background: "var(--ml-gradient-hero)", boxShadow: "var(--ml-glow)" }}>
            <div className="text-[0.8em] opacity-90">Set aside every {periodWord}</div>
            <div className="font-display text-[2em] font-bold">{inr(per)}</div>
            <div className="text-[0.82em] opacity-90">{periods} {periodWord}s · {item || "your goal"} · {inr(target)}</div>
          </div>

          <div className="rounded-md border border-border p-3">
            <div className="mb-2 text-[0.82em] font-medium text-text">Your next few allocations</div>
            <ul className="flex flex-col gap-1.5 text-[0.85em]">
              {[1, 2, 3].map((k) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="text-text-muted">{periodWord} {k}</span>
                  <span className="font-medium text-text">{inr(per)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between text-text-muted">
                <span>…</span><span>×{periods}</span>
              </li>
            </ul>
          </div>

          <button onClick={() => setRemind(!remind)} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[0.88em] text-text" style={{ cursor: "pointer" }}>
            <span>🔔 Remind me each {periodWord} to allocate</span>
            <Badge tone={remind ? "positive" : "neutral"}>{remind ? "on" : "off"}</Badge>
          </button>
        </div>
      </div>
    </Card>
  );
}

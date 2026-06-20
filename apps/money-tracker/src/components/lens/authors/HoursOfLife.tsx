"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Hours of Life — Vicki Robin & Joe Dominguez, *Your Money or Your Life*.
 * Money is life energy: finite life-hours you trade for it. So the honest unit
 * isn't the rupee — it's the HOUR. We compute the *real* hourly wage (take-home
 * minus the costs of holding the job, over every hour it actually eats:
 * work + commute + decompression), then re-price each spend category in
 * hours-of-life. The "fulfilment" thumb is the book's core question: did this
 * spend bring fulfilment in proportion to the life energy it cost?
 */

type Fulfilment = "up" | "down" | null;

interface CatRow {
  key: string;
  name: string;
  icon: string;
  emoji: string;
  rupees: number;
}

const CAT_META: Record<string, { name: string; icon: string; emoji: string }> = {
  Rent: { name: "Rent", icon: "rent", emoji: "🏠" },
  Groceries: { name: "Groceries", icon: "groceries", emoji: "🛒" },
  "Eating Out": { name: "Eating Out", icon: "food", emoji: "🍕" },
  Shopping: { name: "Shopping", icon: "shopping", emoji: "🛍️" },
  Transport: { name: "Transport", icon: "travel", emoji: "🚌" },
  Fun: { name: "Fun", icon: "fun", emoji: "🎬" },
  Subscriptions: { name: "Subscriptions", icon: "bell", emoji: "📺" },
  Investments: { name: "Investments", icon: "invest", emoji: "📈" },
};

function fmtHours(h: number): string {
  if (h >= 10) return `${Math.round(h)}h`;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(h * 60)}m`;
}

export function HoursOfLife() {
  // Sliders — the job's true footprint on a month of life.
  const [workHrs, setWorkHrs] = useState<number>(160);
  const [commuteHrs, setCommuteHrs] = useState<number>(40);
  const [decompHrs, setDecompHrs] = useState<number>(20);
  const [workCosts, setWorkCosts] = useState<number>(5200); // commute fuel + grab-lunches near office
  const [verdict, setVerdict] = useState<Record<string, Fulfilment>>({
    "Eating Out": "up",
    Shopping: "down",
    Subscriptions: "down",
  });

  const takeHome = L.profile.monthlyTakeHome;
  const lifeHrs = Math.max(1, workHrs + commuteHrs + decompHrs);
  const nominalWage = takeHome / Math.max(1, workHrs);
  const realWage = Math.max(0.01, (takeHome - workCosts) / lifeHrs);
  const realPct = Math.round((realWage / nominalWage) * 100);

  // Group this month's spend by category → rupees → hours of life.
  const cats: CatRow[] = useMemo(() => {
    const sums = new Map<string, number>();
    for (const txn of L.currentMonthTxns) {
      sums.set(txn.category, (sums.get(txn.category) ?? 0) + txn.amount);
    }
    return Array.from(sums.entries())
      .map(([key, rupees]) => {
        const meta = CAT_META[key] ?? { name: key, icon: "other", emoji: "💸" };
        return { key, name: meta.name, icon: meta.icon, emoji: meta.emoji, rupees };
      })
      .filter((c) => c.rupees > 0)
      .sort((a, b) => b.rupees - a.rupees);
  }, []);

  const totalRupees = cats.reduce((s, c) => s + c.rupees, 0);
  const totalHours = totalRupees / realWage;
  const maxHours = Math.max(1, ...cats.map((c) => c.rupees / realWage));

  // The tell: life energy spent on things that didn't bring fulfilment.
  const regretRupees = cats
    .filter((c) => verdict[c.key] === "down")
    .reduce((s, c) => s + c.rupees, 0);
  const regretHours = regretRupees / realWage;

  const tip = useViztip();

  function cycle(key: string) {
    setVerdict((prev) => {
      const cur = prev[key] ?? null;
      const next: Fulfilment = cur === null ? "up" : cur === "up" ? "down" : null;
      return { ...prev, [key]: next };
    });
  }

  return (
    <LensCard
      icon="brain"
      emoji="⏳"
      title="Hours of Life"
      subtitle="Your money is life energy. Priced in the only unit that's truly finite — your hours."
      badge={<Pill tone="accent">Your Money or Your Life</Pill>}
    >
      {/* Signature HeroStat — real wage, far below nominal */}
      <HeroStat
        eyebrow="Your real hourly wage"
        value={
          <>
            {inr(Math.round(realWage))}
            <span className="text-[0.5em] font-medium opacity-90">/hour of life</span>
          </>
        }
        sub={
          <>
            Not {inr(Math.round(nominalWage))}/hr — that&apos;s the sticker. After the costs of holding the job, spread
            over every hour it eats, your time is really worth {realPct}% of that.
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KeyStat label="Take-home" value={inr(takeHome)} hint="this month" />
        <KeyStat label="Life-hours sold" value={`${lifeHrs}h`} tone="accent" hint="work + commute + decompress" />
        <KeyStat label="Spent this month" value={fmtHours(totalHours)} tone="warning" hint={inr(totalRupees)} />
        <KeyStat
          label="Energy you'd take back"
          value={fmtHours(regretHours)}
          tone={regretHours > 0 ? "negative" : "positive"}
          hint={regretHours > 0 ? "low-fulfilment spend" : "all worth it"}
        />
      </div>

      {/* Sliders — calibrate the true footprint of the job */}
      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <div className="col-span-full -mb-1 text-[0.78em] font-medium uppercase tracking-wide text-text-muted">
          What the job really costs you
        </div>
        <SliderRow label="Work hours / month" value={workHrs} min={80} max={260} step={4} onChange={setWorkHrs} format={(v) => `${v}h`} />
        <SliderRow label="Commute hours / month" value={commuteHrs} min={0} max={100} step={2} onChange={setCommuteHrs} format={(v) => `${v}h`} />
        <SliderRow label="Decompression hours / month" value={decompHrs} min={0} max={80} step={2} onChange={setDecompHrs} format={(v) => `${v}h`} />
        <SliderRow label="Work-enabling costs" value={workCosts} min={0} max={20000} step={200} onChange={setWorkCosts} format={(v) => inr(v)} />
      </div>

      {/* Signature visual — the life-energy ledger: every category re-priced in hours */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[0.85em] font-medium text-text">Where your hours went</div>
          <div className="text-[0.74em] text-text-muted">tap a row to judge its fulfilment</div>
        </div>

        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative flex flex-col">
          {cats.map((c) => {
            const hours = c.rupees / realWage;
            const pct = (hours / maxHours) * 100;
            const v = verdict[c.key] ?? null;
            const barColor =
              v === "down" ? "var(--ml-color-negative)" : v === "up" ? "var(--ml-color-positive)" : "var(--ml-color-accent)";
            return (
              <button
                key={c.key}
                onClick={() => cycle(c.key)}
                className="group flex items-center gap-3 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-surface-raised"
                style={{ cursor: "pointer", transitionDuration: "var(--ml-motion-fast)" }}
              >
                <span className="flex w-28 shrink-0 items-center gap-2 text-[0.86em] text-text">
                  <Icon name={c.icon} emoji={c.emoji} size={15} />
                  <span className="truncate">{c.name}</span>
                </span>

                <span className="relative h-6 flex-1">
                  <span
                    className="absolute inset-y-0 left-0 rounded-md transition-[width]"
                    style={{ width: `${Math.max(4, pct)}%`, background: barColor, transitionDuration: "var(--ml-motion-base)" }}
                    onMouseEnter={tip.enter(
                      `${c.name} — ${fmtHours(hours)}`,
                      `${inr(c.rupees)} this month. At ${inr(Math.round(realWage))}/hr of real life energy, that's ${fmtHours(
                        hours,
                      )} of your one finite life traded away.`,
                    )}
                    onMouseLeave={tip.leave}
                  />
                </span>

                <span className="w-16 shrink-0 text-right font-display text-[0.95em] font-bold tabular-nums" style={{ color: barColor }}>
                  {fmtHours(hours)}
                </span>

                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors"
                  style={{
                    borderColor: v ? barColor : "var(--ml-color-border)",
                    color: v ? barColor : "var(--ml-color-text-muted)",
                    background: v ? "color-mix(in srgb, " + barColor + " 12%, transparent)" : "transparent",
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                  aria-label="fulfilment verdict"
                >
                  <Icon
                    name={v === "down" ? "bell" : "check"}
                    emoji={v === "up" ? "👍" : v === "down" ? "👎" : "🤔"}
                    size={14}
                  />
                </span>
              </button>
            );
          })}
          {tip.node}
        </div>
      </div>

      {/* The tell, made human */}
      <div
        className="mt-4 rounded-md border-l-4 p-3 text-[0.9em]"
        style={{
          borderColor: regretHours > 0 ? "var(--ml-color-negative)" : "var(--ml-color-positive)",
          background: "color-mix(in srgb, var(--ml-color-surface-raised) 80%, transparent)",
        }}
      >
        {regretHours > 0 ? (
          <span className="text-text">
            You marked <span className="font-bold" style={{ color: "var(--ml-color-negative)" }}>{inr(regretRupees)}</span> as
            not-worth-it — about <span className="font-bold" style={{ color: "var(--ml-color-negative)" }}>{fmtHours(regretHours)}</span> of
            life energy. That&apos;s roughly{" "}
            <span className="font-bold text-text">{(regretHours / Math.max(1, workHrs / 22)).toFixed(1)} working days</span> you&apos;d
            quietly buy back next month by passing on it.
          </span>
        ) : (
          <span className="text-text">
            Every category earned its hours so far. Robin&apos;s point isn&apos;t to spend less — it&apos;s that each rupee out is life energy
            in, so spend where the fulfilment matches the hours.
          </span>
        )}
      </div>
    </LensCard>
  );
}
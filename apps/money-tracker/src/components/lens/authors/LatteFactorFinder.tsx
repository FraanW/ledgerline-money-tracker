"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow, Sparkline } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact, sipResult } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * The Latte Factor — David Bach.
 * Trivial recurring small spends compound into a fortune. We cluster the
 * "lattes" (monthly subscriptions + repeated coffee/food UPI taps) out of the
 * ledger, annualise each, and project what redirecting them into an 11% SIP
 * would be worth. Toggle which lattes to redirect; the future-value total
 * climbs. Signature visual: a ranked "opportunity-cost" list where each latte's
 * bar is its 20-yr future value, plus a growing hero number and a compounding
 * sparkline.
 */

const RETURN_PCT = 11; // long-run Indian equity SIP assumption

interface Latte {
  id: string;
  merchant: string;
  emoji: string;
  icon: string;
  kind: "Subscription" | "Coffee" | "Food";
  monthly: number; // normalised monthly outflow, rupees
  note: string;
}

/** Derive the recurring "lattes" from the shared ledger. */
function deriveLattes(): Latte[] {
  // Monthly subscriptions — one charge each, recurring every month.
  const subs: Latte[] = [
    { id: "netflix", merchant: "Netflix", emoji: "📺", icon: "bell", kind: "Subscription", monthly: 649, note: "auto-debit every month" },
    { id: "spotify", merchant: "Spotify", emoji: "🎧", icon: "bell", kind: "Subscription", monthly: 119, note: "auto-debit every month" },
    { id: "cult", merchant: "Cult.fit", emoji: "🏋️", icon: "bell", kind: "Subscription", monthly: 1500, note: "auto-debit · last gym visit?" },
    { id: "audible", merchant: "Audible", emoji: "🎙️", icon: "bell", kind: "Subscription", monthly: 199, note: "free trial that quietly converted" },
  ];

  // Small UPI taps — cluster by merchant, infer a monthly cadence from the
  // ~3-month window the ledger spans (Apr–Jun).
  const months = 3;
  const taps = new Map<string, { sum: number; n: number; emoji: string }>();
  for (const x of L.transactions) {
    const small = x.method === "upi" && x.bucket === "want" && x.amount <= 800;
    if (!small) continue;
    const cur = taps.get(x.merchant) ?? { sum: 0, n: 0, emoji: "☕" };
    cur.sum += x.amount;
    cur.n += 1;
    if (x.category === "Eating Out" && /coffee|tokai|starbucks/i.test(x.merchant)) cur.emoji = "☕";
    else cur.emoji = "🥡";
    taps.set(x.merchant, cur);
  }

  const food: Latte[] = [];
  for (const [merchant, agg] of taps) {
    if (agg.n < 1) continue;
    const perMonth = Math.round(agg.sum / months);
    const isCoffee = agg.emoji === "☕";
    food.push({
      id: `tap_${merchant.toLowerCase().replace(/\s+/g, "")}`,
      merchant,
      emoji: agg.emoji,
      icon: isCoffee ? "food" : "food",
      kind: isCoffee ? "Coffee" : "Food",
      monthly: perMonth,
      note: `${agg.n} taps in 3 mo · ~${inr(Math.round(agg.sum / agg.n))} each`,
    });
  }

  return [...subs, ...food].sort((a, b) => b.monthly - a.monthly);
}

export function LatteFactorFinder(): React.ReactElement {
  const lattes = useMemo(() => deriveLattes(), []);
  const [years, setYears] = useState<number>(20);
  const [redirected, setRedirected] = useState<Record<string, boolean>>(() =>
    lattes.reduce<Record<string, boolean>>((acc, l) => {
      acc[l.id] = true;
      return acc;
    }, {}),
  );
  const tip = useViztip();

  // Future value of one latte's monthly amount, redirected into an 11% SIP.
  const fvOf = (monthly: number): number => sipResult(monthly, RETURN_PCT, years).futureValue;

  const redirectedMonthly = useMemo(
    () => lattes.reduce((s, l) => (redirected[l.id] ? s + l.monthly : s), 0),
    [lattes, redirected],
  );

  const result = useMemo(() => sipResult(redirectedMonthly, RETURN_PCT, years), [redirectedMonthly, years]);
  const totalMonthly = useMemo(() => lattes.reduce((s, l) => s + l.monthly, 0), [lattes]);
  const maxFv = useMemo(() => Math.max(1, ...lattes.map((l) => fvOf(l.monthly))), [lattes, years]);

  // Compounding curve (yearly samples) for the sparkline of the redirect total.
  const curve = useMemo(() => {
    const series = result.series;
    const pts: number[] = [];
    for (let y = 0; y <= years; y++) {
      const idx = Math.min(series.length - 1, y * 12);
      pts.push(series[idx]?.value ?? 0);
    }
    return pts.length >= 2 ? pts : [0, result.futureValue];
  }, [result, years]);

  const onCount = lattes.filter((l) => redirected[l.id]).length;
  const investedTotal = result.invested;
  const gainsMultiple = investedTotal > 0 ? result.futureValue / investedTotal : 0;

  return (
    <LensCard
      icon="food"
      emoji="☕"
      title="The Latte Factor"
      subtitle="David Bach · small recurring taps, compounded"
      badge={<Pill tone="accent">{onCount} redirected</Pill>}
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow={`If you redirect these into an ${RETURN_PCT}% SIP for ${years} years`}
          value={
            <span className="tabular-nums">{inr(result.futureValue)}</span>
          }
          sub={
            <>
              from just <b>{inr(redirectedMonthly)}/mo</b> of lattes · you&apos;d contribute {inrCompact(investedTotal)}, the
              rest is compounding
            </>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <KeyStat label="Latte spend / mo" value={inr(totalMonthly)} tone="warning" hint="all small recurring taps" />
          <KeyStat label="You'd invest" value={inrCompact(investedTotal)} tone="default" hint={`over ${years} yrs`} />
          <KeyStat
            label="Growth multiple"
            value={`${gainsMultiple.toFixed(1)}×`}
            tone="positive"
            hint="future value ÷ contributed"
          />
        </div>

        {/* Compounding curve of the redirect total */}
        <div
          ref={tip.ref}
          onMouseMove={tip.onMove}
          className="relative rounded-md border border-border bg-surface-raised p-3"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">The compounding curve</span>
            <span className="font-display text-[0.85em] font-bold text-positive tabular-nums">
              {inrCompact(result.futureValue)} at yr {years}
            </span>
          </div>
          <Sparkline points={curve} width={520} height={64} tone="positive" fill />
          <svg
            className="absolute inset-x-3 top-9 bottom-3"
            style={{ width: "calc(100% - 1.5rem)", height: 64 }}
            preserveAspectRatio="none"
            viewBox="0 0 520 64"
          >
            <rect
              x={0}
              y={0}
              width={520}
              height={64}
              fill="transparent"
              onMouseEnter={tip.enter(
                "Snowball, not a stream",
                `Redirecting ${inr(redirectedMonthly)}/mo for ${years} yrs at ${RETURN_PCT}% grows to ${inr(result.futureValue)} — ${inrCompact(result.futureValue - investedTotal)} of it is pure compounding.`,
              )}
              onMouseLeave={tip.leave}
            />
          </svg>
          {tip.node}
        </div>

        {/* Signature: ranked opportunity-cost list */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">
              What each latte is really costing you
            </span>
            <span className="text-[0.72em] text-text-muted">bar = {years}-yr future value</span>
          </div>

          {lattes.map((l) => {
            const fv = fvOf(l.monthly);
            const on = redirected[l.id] ?? false;
            const pct = Math.max(3, (fv / maxFv) * 100);
            return (
              <button
                key={l.id}
                onClick={() => setRedirected((r) => ({ ...r, [l.id]: !(r[l.id] ?? false) }))}
                className="group flex w-full items-center gap-3 rounded-md border border-border p-2.5 text-left transition-[border-color,background-color] hover:border-accent"
                style={{ transitionDuration: "var(--ml-motion-fast)", opacity: on ? 1 : 0.5 }}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-raised"
                  style={{ color: on ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)" }}
                >
                  <Icon name={l.icon} emoji={l.emoji} size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.9em] font-medium text-text">
                      {l.merchant}
                      <span className="ml-2 text-[0.72em] font-normal text-text-muted">{inr(l.monthly)}/mo</span>
                    </span>
                    <span className="shrink-0 font-display text-[0.95em] font-bold tabular-nums text-positive">
                      {inrCompact(fv)}
                    </span>
                  </div>
                  {/* per-latte future-value bar */}
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${pct}%`,
                        background: on ? "var(--ml-color-positive)" : "var(--ml-color-text-muted)",
                        transitionDuration: "var(--ml-motion-base)",
                      }}
                    />
                  </div>
                  <div className="mt-0.5 truncate text-[0.7em] text-text-muted">{l.note}</div>
                </div>

                <span
                  className="grid h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors"
                  style={{
                    background: on ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)",
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                >
                  <span
                    className="h-4 w-4 rounded-full bg-white transition-transform"
                    style={{ transform: on ? "translateX(16px)" : "translateX(0)", transitionDuration: "var(--ml-motion-fast)" }}
                  />
                </span>
              </button>
            );
          })}
        </div>

        <SliderRow
          label="Project forward"
          value={years}
          min={10}
          max={30}
          step={1}
          onChange={(v: number) => setYears(v)}
          format={(v: number) => `${v} years`}
        />

        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, the issue was never the coffee. It&apos;s that{" "}
            {inr(redirectedMonthly)} leaking out every month, invested instead, becomes{" "}
            <b className="text-positive">{inr(result.futureValue)}</b> in {years} years. Automate the redirect and you
            never feel the cut.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default LatteFactorFinder;

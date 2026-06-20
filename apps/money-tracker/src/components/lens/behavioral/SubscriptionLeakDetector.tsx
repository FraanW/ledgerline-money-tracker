"use client";

import React, { useState, useMemo } from "react";
import { Card } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill, StackedBar, LENS_PALETTE } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Subscription Leak Detector — Samuelson & Zeckhauser's Endowment Effect &
 * Status-Quo Bias. We over-stick with what we already have: cancelling an
 * unused subscription registers as a *loss*, so the autopay quietly renews
 * forever. The fix is a reframe — stop showing the harmless ₹119/mo and show
 * the ₹1,428/yr it really is, then turn cancelling into a *gain* by tallying
 * the money you recover. Loss-framing in, gain-framing out.
 */

interface Sub {
  id: string;
  merchant: string;
  monthly: number;
  annual: number;
  months: number; // distinct months we've seen the charge (the "endowment age")
  icon: string;
  emoji: string;
  sneaked?: boolean; // a free trial that silently converted to paid
}

/** Group recurring 'want' subscription charges by merchant into a stable monthly series. */
function detectSubs(): Sub[] {
  const meta: Record<string, { icon: string; emoji: string }> = {
    Netflix: { icon: "fun", emoji: "📺" },
    Spotify: { icon: "fun", emoji: "🎧" },
    "Cult.fit": { icon: "party", emoji: "🏋️" },
    Audible: { icon: "bell", emoji: "🎙️" },
  };
  const groups = new Map<string, { monthly: number; months: Set<string>; trial: boolean }>();
  for (const tx of L.transactions) {
    if (!tx.recurring && !tx.trial) continue;
    if (tx.category !== "Subscriptions") continue;
    const g = groups.get(tx.merchant) ?? { monthly: 0, months: new Set<string>(), trial: false };
    if (tx.trial) g.trial = true;
    if (tx.amount > 0) {
      g.monthly = Math.max(g.monthly, tx.amount); // the settled monthly price
      g.months.add(tx.date.slice(0, 7));
    }
    groups.set(tx.merchant, g);
  }
  return Array.from(groups.entries())
    .map(([merchant, g]) => {
      const m = meta[merchant] ?? { icon: "bell", emoji: "🔁" };
      return {
        id: merchant,
        merchant,
        monthly: g.monthly,
        annual: g.monthly * 12,
        months: g.months.size + (g.trial ? 1 : 0),
        icon: m.icon,
        emoji: m.emoji,
        sneaked: g.trial,
      };
    })
    .sort((a, b) => b.annual - a.annual);
}

export function SubscriptionLeakDetector(): React.ReactElement {
  const subs = useMemo<Sub[]>(detectSubs, []);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const tip = useViztip();

  const toggle = (id: string): void =>
    setCancelled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalAnnual = subs.reduce((s, x) => s + x.annual, 0);
  const recovered = subs.filter((x) => cancelled.has(x.id)).reduce((s, x) => s + x.annual, 0);
  const stillBleeding = totalAnnual - recovered;
  // Days of take-home pay these renewals quietly cost (annual ÷ daily pay).
  const daysOfTakeHome = stillBleeding / (L.profile.monthlyTakeHome / 30 || 1);

  // ── Signature: the "yearly tax" — every sub as a segment of one annual bar ──
  const segments = subs.map((s, i) => ({
    label: s.merchant,
    value: cancelled.has(s.id) ? 0 : s.annual,
    color: LENS_PALETTE[i % LENS_PALETTE.length] ?? "var(--ml-color-accent)",
  }));

  return (
    <LensCard
      icon="bell"
      emoji="🔁"
      title="The Quiet Renewals"
      subtitle="₹119/mo feels like nothing. ₹1,428/yr is the real bill. See it whole — then decide."
      badge={<Pill tone="warning">Endowment effect</Pill>}
    >
      <HeroStat
        eyebrow="What your autopay subscriptions cost — per year"
        value={<span className="tabular-nums">{inr(stillBleeding)}</span>}
        sub={
          <>
            across {subs.length - cancelled.size} active service{subs.length - cancelled.size === 1 ? "" : "s"} · about{" "}
            {daysOfTakeHome.toFixed(1)} days of take-home pay you renew without a vote
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KeyStat label="Per month" value={inr(stillBleeding / 12)} tone="default" hint="the number you usually see" />
        <KeyStat label="Per year" value={inrCompact(stillBleeding)} tone="warning" hint="the number that actually leaves" />
        <KeyStat
          label="Recovered"
          value={recovered > 0 ? `+${inrCompact(recovered)}` : "—"}
          tone={recovered > 0 ? "positive" : "default"}
          hint="cancelled = a yearly gain"
        />
        <KeyStat label="Never reviewed" value={`${subs.length}/${subs.length}`} tone="negative" hint="just kept renewing" />
      </div>

      {/* ── Signature: the yearly-tax bar ── */}
      <div ref={tip.ref} onMouseMove={tip.onMove} className="relative mt-5 rounded-md border border-border bg-surface-raised p-3">
        <div className="mb-2 flex items-center justify-between text-[0.78em] text-text-muted">
          <span>Your subscription year, stacked</span>
          <span className="tabular-nums">{inr(stillBleeding)} / yr</span>
        </div>
        <StackedBar segments={segments} total={Math.max(totalAnnual, 1)} height={26} />
        {/* hover zones over each live segment — self-documenting */}
        <div className="absolute inset-x-3 top-[34px] flex" style={{ height: 26 }}>
          {subs.map((s) => {
            const w = cancelled.has(s.id) ? 0 : (s.annual / Math.max(totalAnnual, 1)) * 100;
            if (w === 0) return null;
            return (
              <div
                key={s.id}
                style={{ width: `${w}%` }}
                onMouseEnter={tip.enter(
                  `${s.merchant} — ${inr(s.annual)}/yr`,
                  `Looks like just ${inr(s.monthly)}/mo, but you've quietly renewed it for ${s.months} month${s.months === 1 ? "" : "s"}. That's ${((s.annual / Math.max(totalAnnual, 1)) * 100).toFixed(0)}% of your yearly subscription bill.`,
                )}
                onMouseLeave={tip.leave}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.72em] text-text-muted">
          {subs.map((s, i) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-3 rounded-sm transition-opacity"
                style={{
                  background: LENS_PALETTE[i % LENS_PALETTE.length] ?? "var(--ml-color-accent)",
                  opacity: cancelled.has(s.id) ? 0.25 : 1,
                  transitionDuration: "var(--ml-motion-fast)",
                }}
              />
              <span style={{ textDecoration: cancelled.has(s.id) ? "line-through" : "none" }}>{s.merchant}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Leaderboard: subs by annual cost, with cancel toggles ── */}
      <div className="mt-5 space-y-1.5">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-1 text-[0.7em] uppercase tracking-wide text-text-muted">
          <span>Subscription</span>
          <span className="text-right">Per year</span>
          <span className="text-right">Keep / cancel</span>
        </div>
        {subs.map((s) => {
          const isCancelled = cancelled.has(s.id);
          return (
            <Card key={s.id} className="px-3 py-2.5">
              <div
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 transition-opacity"
                style={{ opacity: isCancelled ? 0.55 : 1, transitionDuration: "var(--ml-motion-fast)" }}
              >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
                  <Icon name={s.icon} emoji={s.emoji} size={16} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[0.9em] font-medium text-text" style={{ textDecoration: isCancelled ? "line-through" : "none" }}>
                      {s.merchant}
                    </span>
                    {s.sneaked && <Pill tone="negative">trial → paid</Pill>}
                  </div>
                  <div className="text-[0.72em] text-text-muted">
                    {inr(s.monthly)}/mo · active {s.months} mo · <span className="text-warning">never reviewed</span>
                  </div>
                </div>
              </div>
              <div className="text-right font-display text-[0.95em] font-bold tabular-nums text-text">{inr(s.annual)}</div>
              <div className="flex justify-end">
                <button
                  onClick={() => toggle(s.id)}
                  className="rounded-full border px-3 py-1 text-[0.75em] font-medium transition-colors"
                  style={{
                    cursor: "pointer",
                    borderColor: isCancelled ? "var(--ml-color-positive)" : "var(--ml-color-border)",
                    color: isCancelled ? "var(--ml-color-positive)" : "var(--ml-color-text-muted)",
                    background: isCancelled ? "color-mix(in srgb, var(--ml-color-positive) 12%, transparent)" : "transparent",
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                >
                  {isCancelled ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="check" emoji="✅" size={12} /> recovered {inrCompact(s.annual)}/yr
                    </span>
                  ) : (
                    "cancel"
                  )}
                </button>
              </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── The tell, made human ── */}
      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-surface-raised p-3 text-[0.85em] text-text">
        <span className="mt-0.5 text-accent">
          <Icon name="brain" emoji="💡" size={16} />
        </span>
        <p>
          {recovered > 0 ? (
            <>
              You just turned a <span className="font-medium">loss</span> into a{" "}
              <span className="font-display font-bold text-positive">+{inr(recovered)}/yr</span> gain — money you keep simply by not renewing
              something you weren&apos;t using. That&apos;s the trick: cancelling only feels like losing because the autopay made keeping it the default.
            </>
          ) : (
            <>
              Cancelling feels like giving something up, so the autopay wins by default — for{" "}
              <span className="font-medium">{subs[0]?.months ?? 0} straight months</span>. Flip the frame: don&apos;t ask &quot;do I want to lose{" "}
              {inr(subs[0]?.monthly ?? 0)}/mo?&quot; Ask &quot;would I pay{" "}
              <span className="font-display font-bold text-warning">{inr(subs[0]?.annual ?? 0)}</span> today to start{" "}
              {subs[0]?.merchant ?? "this"}?&quot;
            </>
          )}
        </p>
      </div>
    </LensCard>
  );
}

export default SubscriptionLeakDetector;

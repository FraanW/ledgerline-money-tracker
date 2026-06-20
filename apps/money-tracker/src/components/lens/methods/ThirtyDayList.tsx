"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, ProgressRing } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * The 30-Day Rule — a cooling-off heuristic.
 * Park every non-essential "want" on a list for 30 days before buying. Most
 * urges fade; the few that survive are the real ones. Each wishlist item runs a
 * 30-day countdown RING; once it matures you make the call — KEEP it (earmark
 * the money toward a goal) or SKIP it (drop the price into an "Impulse Saved"
 * tally). The hero number is the total you've talked yourself out of.
 *
 * Signature visual: a row of wishlist cards, each a countdown ring filling
 * toward maturity, matured ones glowing and demanding a decision.
 */

const COOL_DAYS = 30;

type Status = "cooling" | "matured" | "kept" | "skipped";

interface WishItem {
  id: string;
  name: string;
  emoji: string;
  icon: string;
  price: number;
  daysElapsed: number; // since added to the list
  note: string;
}

/** Inline wishlist fixture — data the shared ledger doesn't carry. */
const SEED: WishItem[] = [
  { id: "sneakers", name: "Limited-drop Sneakers", emoji: "👟", icon: "footprints", price: 7499, daysElapsed: 31, note: "saw an Insta ad · added 31 days ago" },
  { id: "airpods", name: "AirPods Pro", emoji: "🎧", icon: "headphones", price: 24990, daysElapsed: 28, note: "current pair still works · 28 days in" },
  { id: "keyboard", name: "Mechanical Keyboard", emoji: "⌨️", icon: "keyboard", price: 8999, daysElapsed: 12, note: "want clicky keys · 12 days in" },
];

/** Items the "+ Add a want" button pulls from, in order. */
const POOL: WishItem[] = [
  { id: "watch", name: "Smartwatch (new model)", emoji: "⌚", icon: "watch", price: 18999, daysElapsed: 0, note: "just added · timer starts now" },
  { id: "camera", name: "Mirrorless Camera", emoji: "📷", icon: "camera", price: 54990, daysElapsed: 0, note: "just added · timer starts now" },
  { id: "console", name: "Gaming Console", emoji: "🎮", icon: "fun", price: 44990, daysElapsed: 0, note: "just added · timer starts now" },
];

const ringTone = (s: Status): "accent" | "positive" | "warning" =>
  s === "skipped" ? "positive" : s === "matured" ? "warning" : "accent";

export function ThirtyDayList(): React.ReactElement {
  const [items, setItems] = useState<WishItem[]>(() => SEED);
  // Decisions made on matured items: id -> "kept" | "skipped".
  const [decisions, setDecisions] = useState<Record<string, "kept" | "skipped">>({});
  const [poolIdx, setPoolIdx] = useState<number>(0);
  const tip = useViztip();

  const statusOf = (it: WishItem): Status => {
    const d = decisions[it.id];
    if (d) return d;
    return it.daysElapsed >= COOL_DAYS ? "matured" : "cooling";
  };

  const impulseSaved = useMemo(
    () => items.reduce((s, it) => (decisions[it.id] === "skipped" ? s + it.price : s), 0),
    [items, decisions],
  );
  const earmarked = useMemo(
    () => items.reduce((s, it) => (decisions[it.id] === "kept" ? s + it.price : s), 0),
    [items, decisions],
  );

  const maturedPending = items.filter((it) => statusOf(it) === "matured");
  const onList = items.filter((it) => statusOf(it) === "cooling" || statusOf(it) === "matured");
  const onListValue = onList.reduce((s, it) => s + it.price, 0);

  // What the saved amount becomes if parked in the emergency goal.
  const emergency = L.goals.find((g) => g.id === "g_emergency");
  // The share THIS saved amount contributes toward the goal (not total fund completion).
  const towardGoal = emergency && emergency.target > 0 ? Math.round((impulseSaved / emergency.target) * 100) : 0;

  const decide = (id: string, choice: "kept" | "skipped") =>
    setDecisions((d) => ({ ...d, [id]: choice }));

  const addWant = () => {
    const next = POOL[poolIdx % POOL.length];
    if (!next) return;
    const stamp = `${next.id}_${poolIdx}`;
    setItems((xs) => [...xs, { ...next, id: stamp }]);
    setPoolIdx((i) => i + 1);
  };

  return (
    <LensCard
      icon="hourglass"
      emoji="⏳"
      title="The 30-Day List"
      subtitle="Cooling-off rule · sleep on every want for 30 days"
      badge={
        maturedPending.length > 0 ? (
          <Pill tone="warning">{maturedPending.length} ready to decide</Pill>
        ) : (
          <Pill tone="positive">all cooling</Pill>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow="Impulse saved — wants you talked yourself out of"
          value={<span className="tabular-nums">{inr(impulseSaved)}</span>}
          sub={
            impulseSaved > 0 ? (
              <>
                that&apos;s <b>{towardGoal}%</b> of your Emergency Fund target, banked instead of a one-day dopamine hit
              </>
            ) : (
              <>let the timers run — most of these urges won&apos;t survive 30 days</>
            )
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <KeyStat label="On the list" value={inr(onListValue)} tone="warning" hint={`${onList.length} wants cooling`} />
          <KeyStat label="Kept (earmarked)" value={inr(earmarked)} tone="accent" hint="the urges that survived" />
          <KeyStat label="Impulse saved" value={inr(impulseSaved)} tone="positive" hint="skipped after 30 days" />
        </div>

        {/* Signature: a row of countdown rings filling toward maturity. */}
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">The 30-day cooling shelf</span>
            <span className="text-[0.72em] text-text-muted">ring fills as the urge cools</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {items.map((it) => {
              const st = statusOf(it);
              const pct = Math.min(100, (it.daysElapsed / COOL_DAYS) * 100);
              const daysLeft = Math.max(0, COOL_DAYS - it.daysElapsed);
              const tone = ringTone(st);
              const dimmed = st === "kept";
              const ringPct = st === "skipped" || st === "kept" ? 100 : pct;

              return (
                <div
                  key={it.id}
                  className="flex flex-col items-center gap-2 rounded-md border bg-surface-raised p-3 text-center transition-[border-color,box-shadow]"
                  style={{
                    borderColor: st === "matured" ? "var(--ml-color-warning)" : "var(--ml-color-border)",
                    boxShadow: st === "matured" ? "var(--ml-glow)" : undefined,
                    opacity: dimmed ? 0.6 : 1,
                    transitionDuration: "var(--ml-motion-base)",
                  }}
                >
                  <div
                    className="relative"
                    onMouseEnter={tip.enter(
                      it.name,
                      st === "skipped"
                        ? `Skipped — ${inr(it.price)} stayed in your account.`
                        : st === "kept"
                          ? `Kept — ${inr(it.price)} earmarked toward a goal.`
                          : st === "matured"
                            ? `${it.daysElapsed} days on the list. The cooling-off period is over — still want it?`
                            : `${it.daysElapsed}/${COOL_DAYS} days cooled · ${daysLeft} to go. Buying now is the impulse the rule guards against.`,
                    )}
                    onMouseLeave={tip.leave}
                  >
                    <ProgressRing
                      pct={ringPct}
                      size={92}
                      stroke={9}
                      tone={tone}
                      label={
                        <div className="leading-none">
                          {st === "skipped" ? (
                            <span className="text-positive">
                              <Icon name="check" emoji="✅" size={22} />
                            </span>
                          ) : st === "kept" ? (
                            <span className="text-accent">
                              <Icon name="goal" emoji="🎯" size={22} />
                            </span>
                          ) : (
                            <>
                              <div className="font-display text-[1.15em] font-bold text-text tabular-nums">
                                {st === "matured" ? COOL_DAYS : it.daysElapsed}
                              </div>
                              <div className="text-[0.6em] uppercase tracking-wide text-text-muted">
                                {st === "matured" ? "ready" : `of ${COOL_DAYS}d`}
                              </div>
                            </>
                          )}
                        </div>
                      }
                    />
                    <span className="absolute -right-1 -top-1 text-[1.1em]">
                      <Icon name={it.icon} emoji={it.emoji} size={18} />
                    </span>
                  </div>

                  <div className="min-h-[2.4em]">
                    <div className="text-[0.82em] font-medium leading-tight text-text">{it.name}</div>
                    <div className="font-display text-[0.95em] font-bold tabular-nums text-text">{inr(it.price)}</div>
                  </div>

                  {st === "matured" ? (
                    <div className="flex w-full gap-1.5">
                      <button
                        onClick={() => decide(it.id, "skipped")}
                        className="flex-1 rounded-md py-1.5 text-[0.78em] font-semibold transition-[opacity]"
                        style={{
                          background: "var(--ml-color-positive)",
                          color: "var(--ml-color-accent-contrast)",
                          transitionDuration: "var(--ml-motion-fast)",
                        }}
                      >
                        Skip · save
                      </button>
                      <button
                        onClick={() => decide(it.id, "kept")}
                        className="flex-1 rounded-md border border-border py-1.5 text-[0.78em] font-semibold text-text transition-[border-color] hover:border-accent"
                        style={{ transitionDuration: "var(--ml-motion-fast)" }}
                      >
                        Keep
                      </button>
                    </div>
                  ) : st === "kept" ? (
                    <Pill tone="accent">earmarked</Pill>
                  ) : st === "skipped" ? (
                    <Pill tone="positive">urge faded</Pill>
                  ) : (
                    <span className="text-[0.68em] text-text-muted">{daysLeft}d left to cool</span>
                  )}
                </div>
              );
            })}
          </div>
          {tip.node}
        </div>

        <button
          onClick={addWant}
          className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-[0.85em] font-medium text-text-muted transition-[border-color,color] hover:border-accent hover:text-accent"
          style={{ transitionDuration: "var(--ml-motion-fast)" }}
        >
          <Icon name="plus" emoji="➕" size={16} />
          Tempted by something? Park it for 30 days instead of buying
        </button>

        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, the rule isn&apos;t &quot;never buy&quot; — it&apos;s &quot;don&apos;t buy
            today.&quot; The Sneakers matured at 31 days; if the want&apos;s gone, that{" "}
            <b className="text-positive">{inr((SEED[0]?.price ?? 0))}</b> quietly becomes savings. Decide once the timer
            ends, not in the heat of the scroll.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default ThirtyDayList;
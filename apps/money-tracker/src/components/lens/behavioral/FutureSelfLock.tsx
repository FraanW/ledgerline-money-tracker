"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow, ToggleRow, Gauge } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact, sipResult } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Future-Self Commitment Lock — Laibson, hyperbolic discounting / present bias.
 *
 * We over-weight rewards we can have *now* and steeply discount our future self;
 * willpower loses, commitment devices win (BNPL is the weaponised inverse).
 * This lens (a) measures a present-bias proxy — discretionary spend in the first
 * 48h after a paycheck lands ÷ total monthly discretionary — on a gauge that
 * flags >0.40, (b) shows the payday-spike timeline that produced it, and (c)
 * builds the antidote: a Save-More-Tomorrow lock that auto-routes a fixed % of
 * every detected income credit to the goal *before* the present self can touch
 * it, with an optional 24h cooling-off hold on discretionary top-ups.
 */

const RETURN_PCT = 11; // long-run Indian equity SIP assumption
const SPIKE_FLAG = 0.4; // present-bias gauge flags above this

/** Days between two YYYY-MM-DD dates (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

interface DayBucket {
  day: number; // days after payday (0 = payday)
  discretionary: number; // rupees of impulse spend that day
}

export function FutureSelfLock(): React.ReactElement {
  const [commitPct, setCommitPct] = useState<number>(15);
  const [coolingOff, setCoolingOff] = useState<boolean>(true);
  const tip = useViztip();

  // The latest detected income credit (the lock fires on this signal).
  const lastIncome = useMemo(
    () => L.incomeEvents.reduce((a, b) => (a && a.date > b.date ? a : b)),
    [],
  );

  // Discretionary = impulse "want" spend (subscriptions/autopay aren't impulses).
  const discretionary = useMemo(
    () => L.currentMonthTxns.filter((x) => x.bucket === "want" && x.method !== "autopay"),
    [],
  );
  const totalDiscretionary = useMemo(
    () => discretionary.reduce((s, x) => s + x.amount, 0),
    [discretionary],
  );

  // Present-bias proxy: share of the month's impulse spend that happened inside
  // 48h of the paycheck landing — the "I just got paid" dopamine window.
  const within48h = useMemo(
    () =>
      discretionary
        .filter((x) => {
          const d = daysBetween(lastIncome.date, x.date);
          return d >= 0 && d < 2;
        })
        .reduce((s, x) => s + x.amount, 0),
    [discretionary, lastIncome],
  );
  const biasProxy = totalDiscretionary > 0 ? within48h / totalDiscretionary : 0;
  const flagged = biasProxy > SPIKE_FLAG;

  // Signature timeline: discretionary spend per day-after-payday (first 16 days).
  const SPAN = 16;
  const dayBuckets = useMemo<DayBucket[]>(() => {
    const acc = new Array<number>(SPAN).fill(0);
    for (const x of discretionary) {
      const d = daysBetween(lastIncome.date, x.date);
      if (d >= 0 && d < SPAN) acc[d] = (acc[d] ?? 0) + x.amount;
    }
    return acc.map((discretionarySum, day) => ({ day, discretionary: discretionarySum }));
  }, [discretionary, lastIncome]);
  const maxDay = useMemo(() => Math.max(1, ...dayBuckets.map((b) => b.discretionary)), [dayBuckets]);

  // The lock: a fixed % of every paycheck, auto-routed to the future self.
  const perPaycheck = Math.round((lastIncome.amount * commitPct) / 100);
  const annualRouted = perPaycheck * 12;
  // What 10 years of that locked-away routing compounds to (the future self's win).
  const futureSelf = useMemo(() => sipResult(perPaycheck, RETURN_PCT, 10), [perPaycheck]);

  // Goa goal as the concrete near-term destination for the routed slice.
  const goa = useMemo(() => L.goals.find((g) => g.id === "g_goa"), []);
  const goaGap = goa ? Math.max(0, goa.target - goa.current) : 0;
  const monthsToGoa = perPaycheck > 0 ? Math.ceil(goaGap / perPaycheck) : Infinity;

  // Geometry for the gauge needle annotation (270° arc, flag tick at 40%).
  const flagAngle = 135 + SPIKE_FLAG * 270;
  const flagRad = (flagAngle * Math.PI) / 180;

  return (
    <LensCard
      icon="lock"
      emoji="🔒"
      title="Future-Self Lock"
      subtitle="Laibson · present bias beaten by commitment, not willpower"
      badge={
        <Pill tone={flagged ? "negative" : "positive"}>
          {flagged ? "payday spike" : "in control"}
        </Pill>
      }
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow="Pre-commit this slice of every paycheck — before your present self sees it"
          value={
            <span className="tabular-nums">
              {commitPct}% · {inr(perPaycheck)}
              <span className="text-[0.55em] font-medium opacity-90"> /paycheck</span>
            </span>
          }
          sub={
            <>
              auto-routed the moment income lands · {inr(annualRouted)}/yr that compounds to{" "}
              <b>{inrCompact(futureSelf.futureValue)}</b> in 10 years
            </>
          }
        />

        {/* Signature: present-bias gauge + payday-spike timeline */}
        <div
          ref={tip.ref}
          onMouseMove={tip.onMove}
          className="relative grid grid-cols-1 gap-4 rounded-md border border-border bg-surface-raised p-4 sm:grid-cols-[auto_1fr]"
        >
          {/* Present-bias gauge with a flag tick at 0.40 */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative">
              <Gauge
                value={biasProxy}
                max={1}
                size={156}
                tone={flagged ? "negative" : "positive"}
                label={<>{(biasProxy * 100).toFixed(0)}%</>}
                sublabel={<>present-bias</>}
              />
              {/* flag tick on the arc at the 0.40 threshold */}
              <svg className="pointer-events-none absolute inset-0" width={156} height={156} viewBox="0 0 156 156">
                <line
                  x1={78 + Math.cos(flagRad) * 56}
                  y1={78 + Math.sin(flagRad) * 56}
                  x2={78 + Math.cos(flagRad) * 76}
                  y2={78 + Math.sin(flagRad) * 76}
                  stroke="var(--ml-color-warning)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="mt-1 text-[0.7em] text-text-muted">
              spent in 48h ÷ month · <span className="text-warning">flag at 40%</span>
            </span>
          </div>

          {/* Payday-spike timeline */}
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Days since paycheck</span>
              <span className="font-display text-[0.85em] font-bold tabular-nums text-text">
                {inr(within48h)} <span className="text-[0.85em] font-normal text-text-muted">in first 48h</span>
              </span>
            </div>
            <svg width="100%" height={132} viewBox="0 0 480 132" preserveAspectRatio="none">
              {/* 48h danger window backdrop */}
              <rect
                x={0}
                y={0}
                width={(2 / SPAN) * 480}
                height={108}
                fill="var(--ml-color-negative)"
                opacity={0.1}
              />
              {dayBuckets.map((b) => {
                const bw = 480 / SPAN;
                const h = b.discretionary > 0 ? Math.max(3, (b.discretionary / maxDay) * 100) : 0;
                const inWindow = b.day < 2;
                return (
                  <g key={b.day}>
                    {h > 0 && (
                      <rect
                        x={b.day * bw + bw * 0.18}
                        y={108 - h}
                        width={bw * 0.64}
                        height={h}
                        rx={2}
                        fill={inWindow ? "var(--ml-color-negative)" : "var(--ml-color-accent)"}
                        style={{ transition: "height var(--ml-motion-base)" }}
                      />
                    )}
                    <rect
                      x={b.day * bw}
                      y={0}
                      width={bw}
                      height={132}
                      fill="transparent"
                      onMouseEnter={tip.enter(
                        `Day ${b.day} after payday`,
                        b.discretionary > 0
                          ? `${inr(b.discretionary)} of impulse spend${inWindow ? " — inside the 48h dopamine window" : ""}.`
                          : "No impulse spend this day.",
                      )}
                      onMouseLeave={tip.leave}
                    />
                    {(b.day === 0 || b.day === 7 || b.day === 14) && (
                      <text
                        x={b.day * bw + bw / 2}
                        y={126}
                        textAnchor="middle"
                        fontSize={10}
                        fill="var(--ml-color-text-muted)"
                      >
                        {b.day === 0 ? "payday" : `+${b.day}d`}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          {tip.node}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <KeyStat
            label="48h spike"
            value={`${(biasProxy * 100).toFixed(0)}%`}
            tone={flagged ? "negative" : "positive"}
            hint="of monthly impulse spend"
          />
          <KeyStat
            label="Routed / yr"
            value={inrCompact(annualRouted)}
            tone="accent"
            hint={`${commitPct}% × ${inr(lastIncome.amount)}`}
          />
          <KeyStat
            label={goa ? "Goa, locked in" : "Future self"}
            value={Number.isFinite(monthsToGoa) ? `${monthsToGoa} mo` : "—"}
            tone="positive"
            hint={goa ? `to fund ${inrCompact(goaGap)} left` : "auto-saved"}
          />
        </div>

        {/* The commitment controls */}
        <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4">
          <SliderRow
            label="Pre-commit % of each paycheck"
            value={commitPct}
            min={5}
            max={40}
            step={1}
            onChange={(v: number) => setCommitPct(v)}
            format={(v: number) => `${v}%`}
          />
          <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0">
              <ToggleRow label="24h cooling-off on discretionary top-ups" on={coolingOff} onChange={setCoolingOff} />
              <p className="mt-1 text-[0.74em] leading-snug text-text-muted">
                {coolingOff
                  ? "Any “add to a want” waits a day — the present self can ask, the future self approves."
                  : "Off — impulse top-ups clear instantly. This is the door BNPL walks through."}
              </p>
            </div>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background: coolingOff
                  ? "color-mix(in srgb, var(--ml-color-positive) 16%, transparent)"
                  : "color-mix(in srgb, var(--ml-color-negative) 16%, transparent)",
                color: coolingOff ? "var(--ml-color-positive)" : "var(--ml-color-negative)",
              }}
            >
              <Icon name={coolingOff ? "lock" : "bell"} emoji={coolingOff ? "🔒" : "⏰"} size={17} />
            </span>
          </div>
        </div>

        {/* The tell — plain English */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, {(biasProxy * 100).toFixed(0)}% of your impulse
            spending lands in the <b className={flagged ? "text-negative" : "text-text"}>48 hours after payday</b> — your
            future self never gets a vote.{" "}
            {flagged ? (
              <>That&apos;s above the 40% line.</>
            ) : (
              <>You&apos;re under the 40% line, but the lock keeps it that way.</>
            )}{" "}
            Route <b className="text-accent">{inr(perPaycheck)}</b> away the instant income lands and willpower never has
            to show up.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default FutureSelfLock;

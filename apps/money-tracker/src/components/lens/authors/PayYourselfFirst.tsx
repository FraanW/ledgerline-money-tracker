"use client";

import React, { useState, useMemo } from "react";
import { Card } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow, Bar } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Pay-Yourself-First — Clason ("The Richest Man in Babylon") + David Bach.
 * "A part of all you earn is yours to keep." For each pay-day, did a savings
 * transfer fire *first* (within ~2 days), and was it >= the target slice?
 * Signature visual: a months timeline — salary lands (day 1), the auto-transfer
 * fires (day 2), an arc connects them. A streak counter + savings-rate bars
 * make the habit legible. Target % slider (default 10).
 */

type Bucket = "need" | "want" | "savings";
interface SavingsTxn {
  date: string;
  amount: number;
  method: string;
}

/** Savings transfers that count as "paying yourself" — autopay SIP / fund moves. */
const SAVINGS_TXNS: SavingsTxn[] = L.transactions
  .filter((x: L.LedgerTxn) => x.bucket === ("savings" as Bucket))
  .map((x: L.LedgerTxn) => ({ date: x.date, amount: x.amount, method: x.method }));

const MONTH_LABEL: Record<string, string> = {
  "2026-03": "Mar",
  "2026-04": "Apr",
  "2026-05": "May",
  "2026-06": "Jun",
};

function dayOf(date: string): number {
  return Number(date.slice(8, 10)) || 1;
}
function monthKey(date: string): string {
  return date.slice(0, 7);
}
/** Whole days from a → b (b later). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

interface PayCycle {
  key: string;
  label: string;
  income: number;
  payDay: number;
  /** Qualifying first transfer this cycle, if any. */
  transfer?: { day: number; amount: number; gapDays: number };
  saved: number;
  ratePct: number;
}

export function PayYourselfFirst() {
  const [targetPct, setTargetPct] = useState<number>(10);
  const tip = useViztip();

  const cycles = useMemo<PayCycle[]>(() => {
    return L.incomeEvents.map((ev: L.IncomeEvent): PayCycle => {
      const mk = monthKey(ev.date);
      const mine = SAVINGS_TXNS.filter((s) => monthKey(s.date) === mk);
      const saved = mine.reduce((sum, s) => sum + s.amount, 0);
      // "First transfer" = earliest savings move that lands within a week of pay-day.
      const first = mine
        .filter((s) => daysBetween(ev.date, s.date) >= 0 && daysBetween(ev.date, s.date) <= 7)
        .sort((a, b) => dayOf(a.date) - dayOf(b.date))[0];
      return {
        key: mk,
        label: MONTH_LABEL[mk] ?? mk,
        income: ev.amount,
        payDay: dayOf(ev.date),
        transfer: first ? { day: dayOf(first.date), amount: first.amount, gapDays: daysBetween(ev.date, first.date) } : undefined,
        saved,
        ratePct: ev.amount ? (saved / ev.amount) * 100 : 0,
      };
    });
  }, []);

  // A cycle "passes" when a transfer fired first (<=2 days) AND cleared the target slice.
  const passed = (c: PayCycle): boolean => !!c.transfer && c.transfer.gapDays <= 2 && c.ratePct >= targetPct;

  // Current streak = consecutive passing cycles counting back from the latest.
  const streak = useMemo<number>(() => {
    let n = 0;
    for (let i = cycles.length - 1; i >= 0; i--) {
      const c = cycles[i];
      if (c && passed(c)) n++;
      else break;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles, targetPct]);

  const latest = cycles[cycles.length - 1];
  const latestRate = latest ? latest.ratePct : 0;
  const latestIncome = latest ? latest.income : L.profile.monthlyTakeHome;
  const targetRupees = Math.round((targetPct / 100) * latestIncome);
  const latestSaved = latest ? latest.saved : 0;
  const surplus = latestSaved - targetRupees;
  const passing = latest ? passed(latest) : false;
  const missed = cycles.filter((c) => !passed(c)).length;

  // ── Timeline geometry ──
  const W = 560;
  const H = 150;
  const padX = 30;
  const padTop = 34;
  const colW = (W - padX * 2) / Math.max(1, cycles.length);
  // Within a column, map day 1..6 to a small horizontal offset so salary→transfer reads left→right.
  const dayX = (col: number, day: number): number => padX + col * colW + colW * 0.22 + Math.min(day - 1, 6) * (colW * 0.09);
  const yIn = padTop + 6;
  const yOut = padTop + 64;

  return (
    <LensCard
      icon="bank"
      emoji="🏛️"
      title="Pay Yourself First"
      subtitle="A part of all you earn is yours to keep — Clason & Bach"
      badge={
        passing ? (
          <Pill tone="positive">
            <Icon name="check" emoji="✅" size={12} /> on track
          </Pill>
        ) : (
          <Pill tone="warning">
            <Icon name="bell" emoji="🔔" size={12} /> nudge
          </Pill>
        )
      }
    >
      <HeroStat
        eyebrow={`You kept ${latestRate.toFixed(1)}% of your last paycheque — before spending a rupee`}
        value={
          <>
            {inr(latestSaved)} <span className="text-[0.5em] font-medium opacity-90">/ {inr(latestIncome)}</span>
          </>
        }
        sub={
          <>
            {passing
              ? `Auto-transfer fired ${latest?.transfer ? `${latest.transfer.gapDays}` : "1"} day after pay-day — you paid yourself first.`
              : "No qualifying transfer fired right after pay-day this cycle."}
          </>
        }
      />

      {/* ── Stat row ── */}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KeyStat
          label="First-10% streak"
          value={
            <>
              {streak} <span className="text-[0.7em] font-medium">mo</span>
            </>
          }
          tone={streak >= 3 ? "positive" : streak > 0 ? "accent" : "warning"}
          hint={streak >= cycles.length ? "spotless run" : "consecutive pay-days"}
        />
        <KeyStat label="This cycle" value={`${latestRate.toFixed(1)}%`} tone={passing ? "positive" : "warning"} hint={`target ${targetPct}%`} />
        <KeyStat
          label={surplus >= 0 ? "Above target by" : "Short of target by"}
          value={inr(Math.abs(surplus))}
          tone={surplus >= 0 ? "positive" : "negative"}
          hint={`${inr(targetRupees)} = ${targetPct}%`}
        />
        <KeyStat label="Pay-days missed" value={`${missed}`} tone={missed === 0 ? "positive" : "warning"} hint={`of ${cycles.length} on record`} />
      </div>

      {/* ── Signature: salary-in → transfer-out timeline ── */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[0.8em] font-medium text-text">Every pay-day: salary lands, then you pay yourself</span>
          <span className="hidden text-[0.72em] text-text-muted sm:inline">hover a cycle</span>
        </div>
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative overflow-hidden rounded-md bg-surface-raised p-1">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Salary-in to transfer-out timeline">
            <defs>
              <marker id="pyf-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="var(--ml-color-accent)" />
              </marker>
            </defs>

            {/* lane labels */}
            <text x={padX - 6} y={yIn + 4} textAnchor="end" fontSize="9" fill="var(--ml-color-text-muted)">
              in
            </text>
            <text x={padX - 6} y={yOut + 4} textAnchor="end" fontSize="9" fill="var(--ml-color-text-muted)">
              out
            </text>

            {cycles.map((c, i) => {
              const ok = passed(c);
              const xIn = dayX(i, c.payDay);
              const xOut = c.transfer ? dayX(i, c.transfer.day) : xIn + colW * 0.4;
              const accent = ok ? "var(--ml-color-positive)" : "var(--ml-color-warning)";
              const colCenter = padX + i * colW + colW / 2;
              return (
                <g key={c.key}>
                  {/* hover hit-area for the whole column */}
                  <rect
                    x={padX + i * colW}
                    y={padTop - 14}
                    width={colW}
                    height={H - padTop}
                    fill="transparent"
                    onMouseEnter={tip.enter(
                      `${c.label} — ${inr(c.income)} in`,
                      c.transfer
                        ? `${inr(c.transfer.amount)} auto-saved on day ${c.transfer.day} (${c.transfer.gapDays} day${c.transfer.gapDays === 1 ? "" : "s"} after pay-day) = ${c.ratePct.toFixed(1)}%. ${ok ? `Clears your ${targetPct}% target — paid yourself first.` : `Below the ${targetPct}% target.`}`
                        : `No savings transfer landed near pay-day — you spent before you saved.`,
                    )}
                    onMouseLeave={tip.leave}
                  />

                  {/* month label */}
                  <text x={colCenter} y={H - 6} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ml-color-text)">
                    {c.label}
                  </text>

                  {/* salary-in node */}
                  <circle cx={xIn} cy={yIn} r={6} fill="var(--ml-color-accent)" />
                  <text x={xIn} y={yIn - 10} textAnchor="middle" fontSize="8" fill="var(--ml-color-text-muted)">
                    {`day ${c.payDay}`}
                  </text>

                  {c.transfer ? (
                    <>
                      {/* connecting arc salary → transfer */}
                      <path
                        d={`M ${xIn} ${yIn + 6} C ${xIn} ${(yIn + yOut) / 2}, ${xOut} ${(yIn + yOut) / 2}, ${xOut} ${yOut - 7}`}
                        fill="none"
                        stroke="var(--ml-color-accent)"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        opacity={0.7}
                        markerEnd="url(#pyf-arrow)"
                      />
                      {/* transfer-out node */}
                      <circle cx={xOut} cy={yOut} r={7} fill={accent} />
                      {ok ? (
                        <path
                          d={`M ${xOut - 3} ${yOut} l 2 2.5 l 4 -5`}
                          fill="none"
                          stroke="var(--ml-color-accent-contrast)"
                          strokeWidth={1.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <text x={xOut} y={yOut + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ml-color-accent-contrast)">
                          !
                        </text>
                      )}
                      <text x={xOut} y={yOut + 22} textAnchor="middle" fontSize="9" fontWeight="700" fill={accent}>
                        {`${c.ratePct.toFixed(0)}%`}
                      </text>
                    </>
                  ) : (
                    <>
                      {/* missed pay-day: hollow marker, no arc */}
                      <circle cx={xOut} cy={yOut} r={7} fill="none" stroke="var(--ml-color-negative)" strokeWidth={2} strokeDasharray="2 2" />
                      <text x={xOut} y={yOut + 22} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--ml-color-negative)">
                        none
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {tip.node}
        </div>
      </div>

      {/* ── Savings-rate-vs-target bars ── */}
      <div className="mt-5">
        <span className="text-[0.8em] font-medium text-text">Savings rate vs your {targetPct}% line</span>
        <div className="mt-2 flex flex-col gap-2">
          {cycles.map((c) => {
            const ok = c.ratePct >= targetPct;
            // Scale bars to a generous 25% ceiling so the target line sits mid-track.
            const ceil = 25;
            return (
              <div key={c.key} className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-[0.78em] text-text-muted">{c.label}</span>
                <div className="relative flex-1">
                  <Bar pct={(c.ratePct / ceil) * 100} tone={ok ? "positive" : "warning"} height={12} />
                  <span
                    className="absolute top-[-2px] h-[16px] w-0.5"
                    style={{ left: `${(targetPct / ceil) * 100}%`, background: "var(--ml-color-text)", opacity: 0.55 }}
                    title={`${targetPct}% target`}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-[0.78em] font-bold tabular-nums" style={{ color: ok ? "var(--ml-color-positive)" : "var(--ml-color-warning)" }}>
                  {c.ratePct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Target slider ── */}
      <div className="mt-5 rounded-md border border-border p-3">
        <SliderRow
          label="Your pay-yourself-first target"
          value={targetPct}
          min={5}
          max={25}
          step={1}
          onChange={(v: number) => setTargetPct(v)}
          format={(v: number) => `${v}% · ${inr(Math.round((v / 100) * latestIncome))}/mo`}
        />
        <p className="mt-2 text-[0.78em] leading-snug text-text-muted">
          Babylon&apos;s rule starts at 10%. Bach&apos;s twist: don&apos;t budget it — automate it the instant your salary lands, so the choice is already made.
        </p>
      </div>

      {/* ── The tell, made human ── */}
      <Card raised className="mt-4 p-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-accent">
            <Icon name={passing ? "shield" : "bell"} emoji={passing ? "🛟" : "🔔"} size={16} />
          </span>
          <p className="text-[0.86em] leading-snug text-text">
            {passing ? (
              <>
                Your SIP fires <span className="font-semibold text-positive">{latest?.transfer?.gapDays ?? 1} day</span> after pay-day — money is gone before you can spend it. Keep the streak: nudge the target to{" "}
                <span className="font-semibold">{Math.min(targetPct + 5, 25)}%</span> and you&apos;d still keep {inr(Math.round((Math.min(targetPct + 5, 25) / 100) * latestIncome))}/mo on autopilot.
              </>
            ) : (
              <>
                This cycle the savings transfer didn&apos;t clear your {targetPct}% line. Set up an autopay for{" "}
                <span className="font-semibold text-accent">{inr(targetRupees)}</span> dated the day after your salary — pay yourself first, then live on the rest.
              </>
            )}
          </p>
        </div>
      </Card>
    </LensCard>
  );
}

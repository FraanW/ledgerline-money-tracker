"use client";

import React, { useMemo } from "react";
import { AppShell } from "../AppShell";
import { Card, Badge } from "../primitives";
import { Donut } from "../viz/Donut";
import { SipCalculator } from "../calculators/SipCalculator";
import { GoalPlanner } from "../calculators/GoalPlanner";
import { CompoundingLesson } from "../calculators/CompoundingLesson";
import { useHoldings, useGoals } from "../../lib/hooks";
import { formatINR } from "../../lib/format";
import type { VizSlice } from "../../mocks/vizData";

/**
 * Investments — live holdings + goals from the API; the planners keep their own
 * local interactive inputs (pure projection math, not ledger data). All money is
 * integer paise from the API, displayed via formatINR.
 */
export function InvestmentsPage() {
  const holdings = useHoldings();
  const goals = useGoals();

  const list = holdings.data ?? [];
  const invested = list.reduce((s, h) => s + h.investedMinor, 0);
  const value = list.reduce((s, h) => s + h.valueMinor, 0);
  const gains = value - invested;
  const returnPct = invested > 0 ? Math.round((gains / invested) * 1000) / 10 : 0;

  // Allocation by current value, mapped into the Donut's VizSlice shape (paise).
  const allocation: VizSlice[] = useMemo(
    () => list.map((h) => ({ key: h.id, label: h.name, amountMinor: h.valueMinor })),
    [list],
  );

  return (
    <AppShell active="investments">
      <div className="mx-auto max-w-5xl p-5 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.8em] font-bold">Investments</h1>
            <p className="text-[0.95em] text-text-muted">Grow toward your goals — plan it, then track it.</p>
          </div>
          <div className="text-right">
            <div className="font-display text-[1.8em] font-bold tabular-nums">{formatINR(value)}</div>
            <Badge tone={gains >= 0 ? "positive" : "negative"}>
              {gains >= 0 ? "+" : "−"}
              {formatINR(Math.abs(gains))} · {returnPct}%
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-3 font-bold">Allocation</h3>
            {holdings.loading && list.length === 0 ? (
              <p className="text-[0.9em] text-text-muted">Loading…</p>
            ) : allocation.length === 0 ? (
              <p className="text-[0.9em] text-text-muted">No holdings yet.</p>
            ) : (
              <Donut slices={allocation} size={200} />
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-bold">Holdings</h3>
            <ul className="divide-y divide-border">
              {list.map((h) => {
                const g = h.valueMinor - h.investedMinor;
                const pct = h.investedMinor > 0 ? Math.round((g / h.investedMinor) * 1000) / 10 : 0;
                return (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.95em] font-medium">{h.name}</p>
                      <p className="text-[0.8em] text-text-muted">
                        {h.kind} · invested {formatINR(h.investedMinor)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">{formatINR(h.valueMinor)}</div>
                      <div
                        className="text-[0.8em]"
                        style={{ color: g >= 0 ? "var(--ml-color-positive)" : "var(--ml-color-negative)" }}
                      >
                        {g >= 0 ? "+" : ""}
                        {pct}%
                      </div>
                    </div>
                  </li>
                );
              })}
              {list.length === 0 && !holdings.loading && (
                <li className="py-2.5 text-[0.85em] text-text-muted">No holdings yet.</li>
              )}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[0.9em]">
              <span className="text-text-muted">Total invested</span>
              <span className="font-bold tabular-nums">{formatINR(invested)}</span>
            </div>
          </Card>

          {/* Goals */}
          <Card className="p-5 lg:col-span-2">
            <h3 className="mb-3 font-bold">Goals</h3>
            {goals.loading && (goals.data ?? []).length === 0 ? (
              <p className="text-[0.9em] text-text-muted">Loading…</p>
            ) : (goals.data ?? []).length === 0 ? (
              <p className="text-[0.9em] text-text-muted">No goals yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(goals.data ?? []).map((g) => {
                  const pct = g.targetMinor > 0 ? Math.min(100, Math.round((g.currentMinor / g.targetMinor) * 100)) : 0;
                  return (
                    <div key={g.id} className="rounded-md border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[0.95em] font-medium">{g.name}</span>
                        <span className="text-[0.8em] text-text-muted">{pct}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised">
                        <div style={{ width: `${pct}%`, background: "var(--ml-color-accent)", height: "100%" }} />
                      </div>
                      <div className="mt-2 text-[0.82em] text-text-muted tabular-nums">
                        {formatINR(g.currentMinor)} of {formatINR(g.targetMinor)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="lg:col-span-2">
            <CompoundingLesson />
          </div>
          <div className="lg:col-span-2">
            <SipCalculator />
          </div>
          <div className="lg:col-span-2">
            <GoalPlanner />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

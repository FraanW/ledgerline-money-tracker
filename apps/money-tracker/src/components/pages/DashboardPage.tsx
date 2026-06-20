"use client";

import React, { useMemo } from "react";
import { AppShell } from "../AppShell";
import { Card, Badge } from "../primitives";
import { Quote } from "../Quote";
import { LogNudge } from "../LogNudge";
import { BudgetRings } from "../viz/BudgetRings";
import type { RingDatum } from "../../mocks/vizData";
import { useTransactions, useBudget, useCategories } from "../../lib/hooks";
import { formatINR } from "../../lib/format";
import { useSession } from "../../lib/session";

/**
 * Logged-in home — wired to live data. The headline, recent activity, the
 * one-line takeaway, and the budget-health rings all derive from the current
 * month's transactions + budget. The decorative mock-fed viz (VibeScore,
 * MoneyFlow) were removed when wiring live data — they read static mock modules
 * and had no data prop, so showing them on a live surface would have been a lie.
 */

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function DashboardPage() {
  const { session } = useSession();
  const period = currentPeriod();
  const monthLabel = useMemo(
    () => new Date().toLocaleDateString("en-IN", { month: "long" }),
    [],
  );

  const txns = useTransactions({ from: `${period}-01`, limit: 200 });
  const budget = useBudget(period);
  const cats = useCategories();

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cats.data ?? []) m.set(c.id, c.name);
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [cats.data]);

  const items = txns.data?.items ?? [];
  const recent = items.slice(0, 5);

  // Spend by category for the current month (debits only), in paise.
  const spendByCat = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const t of items) {
      if (t.direction !== "debit") continue;
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount.minor);
    }
    return m;
  }, [items]);

  // Top spend slice for the one-line takeaway.
  const topSlice = useMemo(() => {
    let best: { label: string; minor: number } | null = null;
    let total = 0;
    for (const [id, minor] of spendByCat) {
      total += minor;
      const label = catName(id) ?? "Unallocated";
      if (!best || minor > best.minor) best = { label, minor };
    }
    return best ? { ...best, total: total || 1 } : null;
  }, [spendByCat, catName]);

  // Live budget rings. NOTE (approximation): the budget endpoint returns each
  // envelope's remaining balance, not an allocated/spent split. We reconstruct
  // spent from the month's debits matched on the envelope's categoryId, then
  // treat allocated ≈ remaining + spent — the same honest reconstruction the
  // design fixtures used. Envelopes with no matching category show 0 spent.
  const rings: RingDatum[] = useMemo(() => {
    const envs = budget.data?.envelopes ?? [];
    return envs.map((e) => {
      const spent = e.categoryId ? spendByCat.get(e.categoryId) ?? 0 : 0;
      return {
        id: e.id,
        label: e.name,
        spentMinor: spent,
        allocatedMinor: e.balanceMinor + spent,
      };
    });
  }, [budget.data, spendByCat]);

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-5xl p-5 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.8em] font-bold tracking-tight">
              Hey{session?.displayName ? `, ${session.displayName.split(" ")[0]}` : ""}
            </h1>
            <p className="text-[0.95em] text-text-muted">Here&apos;s your {monthLabel} at a glance.</p>
          </div>
        </div>

        <div className="mt-4">
          <LogNudge />
        </div>

        {topSlice && (
          <div className="mt-4">
            <Quote cite="your month, in one line">
              {topSlice.label} took the biggest bite — {Math.round((topSlice.minor / topSlice.total) * 100)}% of
              everything you spent.
            </Quote>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-3 font-bold">Budget health</h3>
            {budget.loading && !budget.data ? (
              <p className="text-[0.9em] text-text-muted">Loading…</p>
            ) : rings.length === 0 ? (
              <p className="text-[0.9em] text-text-muted">No envelopes yet — set up your budget to see this.</p>
            ) : (
              <BudgetRings data={rings} size={170} />
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-bold">This month&apos;s spend</h3>
            {spendByCat.size === 0 ? (
              <p className="text-[0.9em] text-text-muted">No spending logged this month yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...spendByCat.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([id, minor]) => (
                    <li key={id ?? "unallocated"} className="flex items-center justify-between gap-3 text-[0.9em]">
                      {catName(id) ? (
                        <Badge tone="neutral">{catName(id)}</Badge>
                      ) : (
                        <Badge tone="warning">Unallocated</Badge>
                      )}
                      <span className="font-medium tabular-nums">{formatINR(minor)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Recent transactions</h3>
              <a className="text-[0.85em] text-accent" href="/transactions">
                View all
              </a>
            </div>
            {txns.loading && items.length === 0 ? (
              <p className="text-[0.9em] text-text-muted">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="text-[0.9em] text-text-muted">Nothing yet this month.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((t) => {
                  const credit = t.direction === "credit";
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[0.95em] font-medium">{t.merchant ?? t.rawDescription}</p>
                        <p className="text-[0.8em] text-text-muted">{t.postedAt}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {catName(t.categoryId) ? (
                          <Badge tone="neutral">{catName(t.categoryId)}</Badge>
                        ) : (
                          <Badge tone="warning">Unallocated</Badge>
                        )}
                        <span
                          className="w-24 text-right font-medium tabular-nums"
                          style={{ color: credit ? "var(--ml-color-positive)" : "var(--ml-color-text)" }}
                        >
                          {credit ? "+" : "−"}
                          {formatINR(t.amount.minor)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

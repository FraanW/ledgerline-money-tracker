import React from "react";
import type { Envelope } from "@ledgerline/types";
import { Card, MoneyText, ScreenShell } from "./primitives";
import { PageRemark } from "./PageRemark";
import { Quote } from "./Quote";
import type { CategorySpend } from "../mocks/fixtures";

/**
 * "Where did my money go" — spend by category for the period + the Unallocated
 * callout (ADR-0006): when reality outruns the budget, Unallocated grows, and
 * this is where the user sees how much escaped their plan.
 *
 * Layout seam: `breakdownRenderer` lets a theme choose bars / donut / list
 * without touching this component (THEMING.md).
 */
export function SummaryScreen({
  spendByCategory,
  unallocated,
  period,
  breakdownRenderer,
}: {
  spendByCategory: CategorySpend[];
  unallocated: Envelope;
  period: string;
  breakdownRenderer?: (rows: CategorySpend[]) => React.ReactNode;
}) {
  const total = spendByCategory.reduce((s, r) => s + r.spent.minor, 0);
  const max = Math.max(1, ...spendByCategory.map((r) => r.spent.minor));

  return (
    <ScreenShell
      title="Where did my money go?"
      subtitle={`Spending in ${period}, across every account, in one honest view.`}
    >
      <PageRemark screen="summary" />
      {spendByCategory[0] && (
        <Quote cite="your month, in one line">
          {spendByCategory[0].name} took the biggest bite this month — {Math.round((spendByCategory[0].spent.minor / total) * 100)}% of everything you spent.
        </Quote>
      )}
      {/* The Unallocated callout — the signal that reality outran the budget. */}
      <Card raised className="border-warning p-[calc(1.25rem*var(--ml-density))]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.85em] uppercase tracking-wide text-warning">Escaped your plan</p>
            <p className="mt-1 text-[0.92em] text-text-muted">
              Spend with no envelope (or that would have overdrawn one) landed in Unallocated.
              Re-budget it to bring your plan back in line.
            </p>
          </div>
          <MoneyText value={unallocated.balance} tone="warning" className="text-[1.7em] font-bold" />
        </div>
      </Card>

      <Card className="p-[calc(1.25rem*var(--ml-density))]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.95em] font-medium text-text">By category</span>
          <MoneyText value={{ minor: total, currency: "INR" }} tone="muted" />
        </div>
        {breakdownRenderer ? (
          breakdownRenderer(spendByCategory)
        ) : (
          <ul className="flex flex-col gap-[calc(0.6rem*var(--ml-density))]">
            {spendByCategory.map((r) => {
              const pct = Math.round((r.spent.minor / max) * 100);
              const escaped = r.categoryId === null;
              return (
                <li key={r.categoryId ?? "unallocated"} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[0.9em]">
                    <span className={escaped ? "text-warning" : "text-text"}>{r.name}</span>
                    <MoneyText value={r.spent} tone={escaped ? "warning" : "default"} />
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-sm bg-surface-raised">
                    <div
                      className={escaped ? "h-full bg-warning" : "h-full bg-accent"}
                      style={{ width: `${pct}%`, transition: "width var(--ml-motion-base) var(--ml-motion-ease)" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </ScreenShell>
  );
}

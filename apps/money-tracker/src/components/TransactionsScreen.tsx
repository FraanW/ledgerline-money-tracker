import React from "react";
import type { Transaction, Category } from "@ledgerline/types";
import { Card, Badge, MoneyText, ScreenShell } from "./primitives";
import { PageRemark } from "./PageRemark";

/**
 * Transactions for a period, with category + an uncategorised/Unallocated
 * indicator. Period filter is an affordance only (no wiring).
 */
export function TransactionsScreen({
  transactions,
  categories,
  period,
}: {
  transactions: Transaction[];
  categories: Category[];
  period: string;
}) {
  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? id : null);
  const rows = transactions.filter((t) => t.postedAt.startsWith(period));

  return (
    <ScreenShell
      title="Transactions"
      subtitle={`${rows.length} transactions in ${period}`}
      actions={<Badge tone="neutral">Period: {period}</Badge>}
    >
      <PageRemark screen="transactions" />
      <Card>
        <ul className="divide-y divide-border">
          {rows.map((t) => {
            const cat = catName(t.categoryId);
            const isCredit = t.direction === "credit";
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 px-[calc(1rem*var(--ml-density))] py-[calc(0.75rem*var(--ml-density))]">
                <div className="min-w-0">
                  <p className="truncate text-[0.98em] font-medium text-text">{t.merchant ?? t.rawDescription}</p>
                  <p className="text-[0.82em] text-text-muted">{t.postedAt}</p>
                </div>
                <div className="flex items-center gap-3">
                  {cat ? (
                    <Badge tone="neutral">{cat}</Badge>
                  ) : (
                    <Badge tone="warning">Unallocated</Badge>
                  )}
                  <MoneyText
                    value={t.amount}
                    tone={isCredit ? "positive" : "default"}
                    className="w-28 text-right font-medium"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </ScreenShell>
  );
}

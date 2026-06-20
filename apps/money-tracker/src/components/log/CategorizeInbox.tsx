"use client";

import React, { useState } from "react";
import { formatMoney } from "@ledgerline/types";
import { Card, Badge } from "../primitives";
import { Icon } from "../Icon";
import { transactions, categories, CURRENT_PERIOD } from "../../mocks/fixtures";

const CHIP: Record<string, { name: string; emoji: string }> = {
  Groceries: { name: "groceries", emoji: "🛒" },
  Rent: { name: "rent", emoji: "🏠" },
  Dining: { name: "food", emoji: "🍔" },
  Transport: { name: "travel", emoji: "🚌" },
  Fun: { name: "fun", emoji: "🎉" },
};

/**
 * The "statement doesn't tell you where you spent" fix: a one-tap inbox of
 * transactions the rules couldn't categorize. Tap a chip to file it — and that
 * choice becomes a rule, so next month it's automatic.
 */
export function CategorizeInbox() {
  const uncategorized = transactions.filter((t) => t.postedAt.startsWith(CURRENT_PERIOD) && t.direction === "debit" && t.categoryId === null);
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const [assigned, setAssigned] = useState<Record<string, string>>({});

  const left = uncategorized.filter((t) => !assigned[t.id]).length;

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[1.3em] font-bold text-text">To categorize</h3>
        <Badge tone={left === 0 ? "positive" : "warning"}>
          {left === 0 ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="check" emoji="🎉" size={12} /> all done
            </span>
          ) : (
            `${left} left`
          )}
        </Badge>
      </div>
      <p className="mt-1 text-[0.85em] text-text-muted">Your bank statement won&apos;t tell you what these were. Tap to file each one — we&apos;ll remember for next time.</p>

      <ul className="mt-4 flex flex-col gap-3">
        {uncategorized.map((t) => {
          const a = assigned[t.id];
          return (
            <li key={t.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.92em] font-medium text-text">{t.rawDescription}</p>
                  <p className="text-[0.78em] text-text-muted">{t.postedAt}</p>
                </div>
                <span className="font-display font-bold text-text tabular-nums">{formatMoney(t.amount)}</span>
              </div>
              {a ? (
                <div className="mt-2 text-[0.85em]" style={{ color: "var(--ml-color-positive)" }}>
                  ✓ filed under <strong>{a}</strong> — rule saved
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {expenseCats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setAssigned((m) => ({ ...m, [t.id]: c.name }))}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[0.82em] text-text"
                      style={{ cursor: "pointer" }}
                    >
                      <Icon name={CHIP[c.name]?.name ?? "other"} emoji={CHIP[c.name]?.emoji ?? "•"} size={15} />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

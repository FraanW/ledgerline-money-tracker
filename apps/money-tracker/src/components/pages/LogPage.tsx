import React from "react";
import { AppShell } from "../AppShell";
import { LogNudge } from "../LogNudge";
import { QuickExpenseLogger } from "../log/QuickExpenseLogger";
import { CategorizeInbox } from "../log/CategorizeInbox";

/**
 * The daily-logging surface — solves "digitised money is invisible": a fast
 * logger for cash/UPI spends, plus an inbox to categorize the vague statement
 * lines. The nudge drives the habit; both feed the monthly report.
 */
export function LogPage() {
  return (
    <AppShell active="log">
      <div className="mx-auto max-w-5xl p-5 md:p-8">
        <h1 className="font-display text-[1.8em] font-bold">Daily log</h1>
        <p className="text-[0.95em] text-text-muted">Where did it actually go? Log cash &amp; UPI in seconds, and file what your statement couldn&apos;t.</p>
        <div className="mt-4">
          <LogNudge />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QuickExpenseLogger />
          <CategorizeInbox />
        </div>
      </div>
    </AppShell>
  );
}

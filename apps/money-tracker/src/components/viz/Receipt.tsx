import React from "react";
import { formatMoney } from "@ledgerline/types";
import type { VizSlice } from "../../mocks/vizData";

const MONO = "ui-monospace, SFMono-Regular, 'Cascadia Code', Menlo, Consolas, monospace";

/**
 * The month as a thermal receipt — quirky, screenshot-able, oddly satisfying.
 * Categories as line items with dot leaders, a total, and a cheeky footer.
 */
export function Receipt({ slices, incomeMinor, period }: { slices: VizSlice[]; incomeMinor: number; period: string }) {
  const total = slices.reduce((s, n) => s + n.amountMinor, 0);
  const leftover = incomeMinor - total;

  const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
    <div className="flex items-end gap-1" style={{ fontWeight: strong ? 700 : 400 }}>
      <span className="whitespace-nowrap">{label}</span>
      <span className="mb-1 flex-1 border-b border-dashed border-border" />
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );

  return (
    <div
      className="mx-auto w-full max-w-xs bg-surface p-5 text-[0.85em] text-text shadow-md"
      style={{ fontFamily: MONO, borderRadius: "var(--ml-radius-sm)" }}
    >
      <div className="text-center">
        <div className="text-[1.15em] font-bold tracking-wider">MONEY TRACKER</div>
        <div className="text-text-muted">monthly statement</div>
        <div className="text-text-muted">{period} · all accounts</div>
      </div>
      <div className="my-3 border-t border-dashed border-border" />
      <Row label="INCOME" value={formatMoney({ minor: incomeMinor, currency: "INR" })} strong />
      <div className="my-3 border-t border-dashed border-border" />
      <div className="flex flex-col gap-1.5">
        {slices.map((s) => (
          <Row key={s.key} label={s.label.toUpperCase().slice(0, 16)} value={"-" + formatMoney({ minor: s.amountMinor, currency: "INR" })} />
        ))}
      </div>
      <div className="my-3 border-t border-dashed border-border" />
      <Row label="TOTAL SPENT" value={"-" + formatMoney({ minor: total, currency: "INR" })} strong />
      <Row label="LEFTOVER" value={formatMoney({ minor: leftover, currency: "INR" })} strong />
      <div className="my-3 border-t border-dashed border-border" />
      <div className="text-center text-text-muted">
        <div>items: {slices.length}</div>
        <div className="mt-2">*** thank you for budgeting ***</div>
        <div className="mt-2 flex justify-center gap-[2px]" aria-hidden>
          {Array.from({ length: 34 }).map((_, i) => (
            <span key={i} className="inline-block" style={{ width: i % 3 === 0 ? 3 : 1, height: 26, background: "var(--ml-color-text)" }} />
          ))}
        </div>
        <div className="mt-1 tracking-[0.3em]">{period.replace("-", "")}0042</div>
      </div>
    </div>
  );
}

import React from "react";
import { Card, Badge } from "../primitives";
import { Quote } from "../Quote";
import { Icon } from "../Icon";
import { inr } from "../../lib/finance";
import { assets, liabilities, assetsTotal, liabilitiesTotal, netWorth, incomeGeneratingTotal, type BalanceItem } from "../../mocks/networth";

/**
 * Personal balance sheet — the Rich Dad Poor Dad lens. Not a bland totals
 * table: it teaches the asset-vs-liability distinction and flags which "assets"
 * actually put money in your pocket.
 */
function Column({ title, items, total, tone }: { title: string; items: BalanceItem[]; total: number; tone: "positive" | "negative" }) {
  const color = tone === "positive" ? "var(--ml-color-positive)" : "var(--ml-color-negative)";
  return (
    <Card className="p-[calc(1.25rem*var(--ml-density))]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-text">{title}</h3>
        <span className="font-display text-[1.15em] font-bold tabular-nums" style={{ color }}>
          {tone === "negative" ? "−" : ""}{inr(total)}
        </span>
      </div>
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[0.95em] font-medium text-text">{it.name}</span>
                {tone === "positive" &&
                  (it.incomeGenerating ? (
                    <Badge tone="positive">puts money in</Badge>
                  ) : (
                    <Badge tone="neutral">store of value</Badge>
                  ))}
              </div>
              {it.note && <div className="text-[0.78em] text-text-muted">{it.note}</div>}
            </div>
            <span className="shrink-0 font-medium tabular-nums text-text">{inr(it.amountRupees)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function BalanceSheet() {
  const max = Math.max(assetsTotal, liabilitiesTotal, 1);
  return (
    <div className="flex flex-col gap-[calc(1.25rem*var(--ml-density))]">
      {/* Net worth headline */}
      <Card raised className="p-[calc(1.5rem*var(--ml-density))]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[0.8em] uppercase tracking-wide text-text-muted">Net worth</div>
            <div className="font-display text-[2.4em] font-bold tabular-nums text-text">{inr(netWorth)}</div>
            <div className="text-[0.85em] text-text-muted">what you own, minus what you owe</div>
          </div>
          <div className="flex gap-5">
            <div>
              <div className="text-[0.75em] uppercase tracking-wide text-text-muted">Assets</div>
              <div className="font-bold tabular-nums" style={{ color: "var(--ml-color-positive)" }}>{inr(assetsTotal)}</div>
            </div>
            <div>
              <div className="text-[0.75em] uppercase tracking-wide text-text-muted">Liabilities</div>
              <div className="font-bold tabular-nums" style={{ color: "var(--ml-color-negative)" }}>{inr(liabilitiesTotal)}</div>
            </div>
          </div>
        </div>
        {/* assets vs liabilities bar */}
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-raised">
          <div style={{ width: `${(assetsTotal / max) * 100}%`, background: "var(--ml-color-positive)" }} />
        </div>
        <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-surface-raised">
          <div style={{ width: `${(liabilitiesTotal / max) * 100}%`, background: "var(--ml-color-negative)" }} />
        </div>
      </Card>

      {/* The lens */}
      <Card className="p-[calc(1.25rem*var(--ml-density))]">
        <Quote cite="Robert Kiyosaki · Rich Dad Poor Dad">
          An asset puts money in your pocket. A liability takes money out. The rich buy assets; everyone else buys liabilities they think are assets.
        </Quote>
        <div className="mt-3 flex items-start gap-2 rounded-md bg-surface-raised p-3 text-[0.88em] text-text-muted">
          <Icon name="brain" emoji="🧠" size={18} className="mt-0.5 text-accent" />
          <span>
            Of your {inr(assetsTotal)} in assets, only <strong className="text-text">{inr(incomeGeneratingTotal)}</strong> actually
            puts money in your pocket. The rest (gold, cash) holds value but doesn&apos;t grow it — worth knowing the difference.
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-[calc(1rem*var(--ml-density))] lg:grid-cols-2">
        <Column title="Assets" items={assets} total={assetsTotal} tone="positive" />
        <Column title="Liabilities" items={liabilities} total={liabilitiesTotal} tone="negative" />
      </div>
    </div>
  );
}

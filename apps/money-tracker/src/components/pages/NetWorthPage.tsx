"use client";

import React from "react";
import { AppShell } from "../AppShell";
import { Card, Badge } from "../primitives";
import { Quote } from "../Quote";
import { Icon } from "../Icon";
import { useNetWorth } from "../../lib/hooks";
import { formatINR } from "../../lib/format";
import type { NetWorthItemWire } from "../../lib/api";

/**
 * Net Worth — a personal balance sheet through the Rich Dad Poor Dad lens, wired
 * to the live /networth endpoint (items + totals, all integer paise). Same
 * structure/teaching as the design-phase BalanceSheet, fed from real data.
 */
export function NetWorthPage() {
  const nw = useNetWorth();

  const items = nw.data?.items ?? [];
  const assets = items.filter((i) => i.itemType === "asset");
  const liabilities = items.filter((i) => i.itemType === "liability");
  const totals = nw.data?.totals ?? { assetsMinor: 0, liabilitiesMinor: 0, netMinor: 0 };
  const incomeGeneratingTotal = assets
    .filter((a) => a.incomeGenerating === true)
    .reduce((s, a) => s + a.amountMinor, 0);
  const max = Math.max(totals.assetsMinor, totals.liabilitiesMinor, 1);

  return (
    <AppShell active="networth">
      <div className="mx-auto max-w-4xl p-5 md:p-8">
        <h1 className="font-display text-[1.8em] font-bold tracking-tight">Net worth</h1>
        <p className="mb-5 text-[0.95em] text-text-muted">
          What you own minus what you owe — and which of your &quot;assets&quot; actually earn.
        </p>

        {nw.error && (
          <Card className="border-negative p-4">
            <p className="text-[0.9em] text-negative">{nw.error}</p>
          </Card>
        )}
        {nw.loading && !nw.data ? (
          <p className="text-[0.9em] text-text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-[calc(1.25rem*var(--ml-density))]">
            {/* Net worth headline */}
            <Card raised className="p-[calc(1.5rem*var(--ml-density))]">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[0.8em] uppercase tracking-wide text-text-muted">Net worth</div>
                  <div className="font-display text-[2.4em] font-bold tabular-nums text-text">
                    {formatINR(totals.netMinor)}
                  </div>
                  <div className="text-[0.85em] text-text-muted">what you own, minus what you owe</div>
                </div>
                <div className="flex gap-5">
                  <div>
                    <div className="text-[0.75em] uppercase tracking-wide text-text-muted">Assets</div>
                    <div className="font-bold tabular-nums" style={{ color: "var(--ml-color-positive)" }}>
                      {formatINR(totals.assetsMinor)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.75em] uppercase tracking-wide text-text-muted">Liabilities</div>
                    <div className="font-bold tabular-nums" style={{ color: "var(--ml-color-negative)" }}>
                      {formatINR(totals.liabilitiesMinor)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-raised">
                <div style={{ width: `${(totals.assetsMinor / max) * 100}%`, background: "var(--ml-color-positive)" }} />
              </div>
              <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-surface-raised">
                <div style={{ width: `${(totals.liabilitiesMinor / max) * 100}%`, background: "var(--ml-color-negative)" }} />
              </div>
            </Card>

            {/* The lens */}
            <Card className="p-[calc(1.25rem*var(--ml-density))]">
              <Quote cite="Robert Kiyosaki · Rich Dad Poor Dad">
                An asset puts money in your pocket. A liability takes money out. The rich buy assets; everyone else
                buys liabilities they think are assets.
              </Quote>
              <div className="mt-3 flex items-start gap-2 rounded-md bg-surface-raised p-3 text-[0.88em] text-text-muted">
                <Icon name="brain" emoji="🧠" size={18} className="mt-0.5 text-accent" />
                <span>
                  Of your {formatINR(totals.assetsMinor)} in assets, only{" "}
                  <strong className="text-text">{formatINR(incomeGeneratingTotal)}</strong> actually puts money in your
                  pocket. The rest holds value but doesn&apos;t grow it — worth knowing the difference.
                </span>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-[calc(1rem*var(--ml-density))] lg:grid-cols-2">
              <Column title="Assets" items={assets} total={totals.assetsMinor} tone="positive" />
              <Column title="Liabilities" items={liabilities} total={totals.liabilitiesMinor} tone="negative" />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Column({
  title,
  items,
  total,
  tone,
}: {
  title: string;
  items: NetWorthItemWire[];
  total: number;
  tone: "positive" | "negative";
}) {
  const color = tone === "positive" ? "var(--ml-color-positive)" : "var(--ml-color-negative)";
  return (
    <Card className="p-[calc(1.25rem*var(--ml-density))]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-text">{title}</h3>
        <span className="font-display text-[1.15em] font-bold tabular-nums" style={{ color }}>
          {tone === "negative" ? "−" : ""}
          {formatINR(total)}
        </span>
      </div>
      <ul className="flex flex-col">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-start justify-between gap-3 border-t border-border py-2.5 first:border-t-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[0.95em] font-medium text-text">{it.name}</span>
                {tone === "positive" &&
                  (it.incomeGenerating ? (
                    <Badge tone="positive">puts money in</Badge>
                  ) : it.incomeGenerating === false ? (
                    <Badge tone="neutral">store of value</Badge>
                  ) : null)}
              </div>
              {it.note && <div className="text-[0.78em] text-text-muted">{it.note}</div>}
            </div>
            <span className="shrink-0 font-medium tabular-nums text-text">{formatINR(it.amountMinor)}</span>
          </li>
        ))}
        {items.length === 0 && <li className="py-2.5 text-[0.85em] text-text-muted">Nothing here yet.</li>}
      </ul>
    </Card>
  );
}

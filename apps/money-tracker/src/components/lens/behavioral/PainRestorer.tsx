"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, Pill, ToggleRow, Gauge, StackedBar, LENS_PALETTE } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Pain Restorer — Prelec & Loewenstein, "Pain of Paying" & payment decoupling.
 *
 * Cards / UPI / autopay decouple the moment of payment from the moment of
 * consumption, so the restraining *pain* that cash imposes never fires —
 * UPI-heavy spenders bleed money they never feel leaving. We compute a
 * Decoupling Index (frictionless spend ÷ total spend) from each transaction's
 * method, then re-frame this month's taps as cash leaving a wallet.
 *
 * Signature: a tactile "wallet drain" — a stack of note-bars depleting from the
 * top, where the painless (UPI/card/autopay) layers are faded and the felt
 * (cash) layer alone keeps its colour — paired with a decoupling-index gauge
 * and a per-category live "spend receipt". A "Cash mode" switch re-adds the
 * friction the digital rails removed.
 */

type PayMethod = L.PayMethod;

const PAINLESS: PayMethod[] = ["upi", "card", "autopay"];
// How much "felt pain" each rail keeps, relative to handing over cash (=1).
const PAIN_WEIGHT: Record<PayMethod, number> = { cash: 1, card: 0.35, upi: 0.18, autopay: 0.05 };
const METHOD_META: Record<PayMethod, { label: string; emoji: string; icon: string; color: string }> = {
  cash: { label: "Cash", emoji: "💵", icon: "bank", color: "var(--ml-color-positive)" },
  card: { label: "Card", emoji: "💳", icon: "transactions", color: LENS_PALETTE[3] ?? "var(--ml-color-warning)" },
  upi: { label: "UPI", emoji: "📲", icon: "link", color: "var(--ml-color-accent)" },
  autopay: { label: "Autopay", emoji: "🔁", icon: "bell", color: LENS_PALETTE[1] ?? "var(--ml-color-accent-2)" },
};

interface MethodAgg { method: PayMethod; total: number; count: number }
interface CatReceipt { category: string; emoji: string; icon: string; total: number; painless: number; topMerchant: string; taps: number }

export function PainRestorer(): React.ReactElement {
  const tip = useViztip();
  const [cashMode, setCashMode] = useState<boolean>(false);
  const [activeCat, setActiveCat] = useState<string>("Eating Out");

  const txns = L.currentMonthTxns;

  // ── Decoupling index + method split ───────────────────────────────────────
  const { byMethod, total, decoupled, decouplingPct } = useMemo(() => {
    const map = new Map<PayMethod, MethodAgg>();
    for (const x of txns) {
      const cur = map.get(x.method) ?? { method: x.method, total: 0, count: 0 };
      cur.total += x.amount;
      cur.count += 1;
      map.set(x.method, cur);
    }
    const order: PayMethod[] = ["upi", "autopay", "card", "cash"];
    const byMethod = order.map((m) => map.get(m) ?? { method: m, total: 0, count: 0 });
    const total = byMethod.reduce((s, a) => s + a.total, 0);
    const decoupled = byMethod.reduce((s, a) => (PAINLESS.includes(a.method) ? s + a.total : s), 0);
    return { byMethod, total, decoupled, decouplingPct: total ? (decoupled / total) * 100 : 0 };
  }, [txns]);

  // Felt pain: a tap on cash hurts fully; a UPI tap barely registers. Cash mode
  // forces every rail to cash, restoring the pain the digital rails removed.
  const feltPain = useMemo(() => {
    return txns.reduce((s, x) => s + x.amount * (cashMode ? 1 : PAIN_WEIGHT[x.method]), 0);
  }, [txns, cashMode]);
  const painPct = total ? (feltPain / total) * 100 : 0;
  // Money that left without being felt — the "ghost" spend the pain never guarded.
  const ghostSpend = Math.max(0, total - feltPain);

  // ── Per-category receipts ─────────────────────────────────────────────────
  const receipts = useMemo<CatReceipt[]>(() => {
    const map = new Map<string, CatReceipt>();
    for (const x of txns) {
      const cur = map.get(x.category) ?? { category: x.category, emoji: "🧾", icon: "tags", total: 0, painless: 0, topMerchant: x.merchant, taps: 0 };
      cur.total += x.amount;
      if (PAINLESS.includes(x.method)) cur.painless += x.amount;
      cur.taps += 1;
      map.set(x.category, cur);
    }
    const emojiFor: Record<string, { emoji: string; icon: string }> = {
      "Eating Out": { emoji: "🍕", icon: "food" },
      Groceries: { emoji: "🛒", icon: "groceries" },
      Shopping: { emoji: "🛍️", icon: "shopping" },
      Transport: { emoji: "🚌", icon: "travel" },
      Subscriptions: { emoji: "📺", icon: "bell" },
      Fun: { emoji: "🎬", icon: "fun" },
      Rent: { emoji: "🏠", icon: "rent" },
      Investments: { emoji: "📈", icon: "invest" },
    };
    return [...map.values()]
      .map((c) => ({ ...c, ...(emojiFor[c.category] ?? { emoji: "🧾", icon: "tags" }) }))
      .sort((a, b) => b.painless - a.painless);
  }, [txns]);

  const active = receipts.find((r) => r.category === activeCat) ?? receipts[0];
  const activeTxns = useMemo(
    () => txns.filter((x) => x.category === (active?.category ?? "")).sort((a, b) => b.amount - a.amount),
    [txns, active],
  );

  // ── Wallet-drain geometry: notes stacked, painless layers faded ───────────
  // Each method becomes a band of "notes"; height ∝ rupees. The cash band keeps
  // full colour (you felt it), the painless bands are ghosted (you didn't).
  const drainBands = byMethod.filter((a) => a.total > 0);
  const W = 300;
  const Hb = 168;
  const GAP = 3;

  const indexTone: "negative" | "warning" | "accent" =
    decouplingPct >= 75 ? "negative" : decouplingPct >= 50 ? "warning" : "accent";
  const indexVerdict =
    decouplingPct >= 75 ? "Heavily decoupled" : decouplingPct >= 50 ? "Mostly decoupled" : "Some friction left";

  return (
    <LensCard
      icon="brain"
      emoji="🧠"
      title="Pain Restorer"
      subtitle="Prelec & Loewenstein — pay painlessly, spend invisibly"
      badge={<Pill tone={cashMode ? "positive" : indexTone}>{cashMode ? "💵 Cash mode" : `${Math.round(decouplingPct)}% painless`}</Pill>}
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow="THIS MONTH · spend you actually FELT leave"
          value={<span className="tabular-nums">{inr(cashMode ? total : feltPain)}</span>}
          sub={
            cashMode ? (
              <>
                In cash, every {inr(total)} <b>hurts in full</b> — that ache is the brake UPI quietly removed.
              </>
            ) : (
              <>
                of <b>{inr(total)}</b> spent · {inr(ghostSpend)} slipped out almost <b>painlessly</b> via UPI &amp; autopay
              </>
            )
          }
        />

        <div className="grid items-center gap-5 md:grid-cols-[auto,1fr]">
          {/* ── Signature: the wallet drain ── */}
          <div ref={tip.ref} onMouseMove={tip.onMove} className="relative mx-auto">
            <svg width={W} height={Hb} viewBox={`0 0 ${W} ${Hb}`} role="img" aria-label="Wallet drain by payment method">
              {(() => {
                let y = 0;
                return drainBands.map((a) => {
                  const meta = METHOD_META[a.method];
                  const h = Math.max(8, (a.total / (total || 1)) * (Hb - GAP * (drainBands.length - 1)));
                  const painless = PAINLESS.includes(a.method);
                  const ghosted = painless && !cashMode;
                  const notes = Math.max(1, Math.round(h / 11));
                  const band = (
                    <g key={a.method} transform={`translate(0 ${y})`} style={{ transition: "opacity var(--ml-motion-base)" }}>
                      {/* note strata — thin lines evoke a stack of banknotes */}
                      <rect
                        x={0}
                        y={0}
                        width={W}
                        height={h}
                        rx={4}
                        fill={meta.color}
                        opacity={ghosted ? 0.16 : 0.9}
                        stroke={meta.color}
                        strokeOpacity={ghosted ? 0.4 : 1}
                        strokeWidth={ghosted ? 1 : 0}
                        strokeDasharray={ghosted ? "5 4" : undefined}
                        onMouseEnter={tip.enter(
                          `${meta.label} · ${inr(a.total)}`,
                          ghosted
                            ? `${a.count} taps that barely registered — ${meta.label} keeps only ~${Math.round(PAIN_WEIGHT[a.method] * 100)}% of cash's pain, so this money left without the brake firing.`
                            : `${a.count} ${a.method === "cash" ? "cash hand-overs you felt in full" : "charges, now felt like cash"}.`,
                        )}
                        onMouseLeave={tip.leave}
                        style={{ transition: "opacity var(--ml-motion-base), fill var(--ml-motion-base)" }}
                      />
                      {Array.from({ length: notes - 1 }).map((_, k) => (
                        <line
                          key={k}
                          x1={0}
                          x2={W}
                          y1={((k + 1) * h) / notes}
                          y2={((k + 1) * h) / notes}
                          stroke="var(--ml-color-surface)"
                          strokeWidth={1}
                          opacity={ghosted ? 0.25 : 0.55}
                        />
                      ))}
                      {h > 18 && (
                        <text x={10} y={h / 2 + 4} fontSize={11} fontWeight={700} fill="var(--ml-color-surface)" opacity={ghosted ? 0.85 : 1} style={{ pointerEvents: "none" }}>
                          {meta.label} · {inr(a.total)}
                        </text>
                      )}
                    </g>
                  );
                  y += h + GAP;
                  return band;
                });
              })()}
            </svg>
            <div className="mt-1 text-center text-[0.7em] text-text-muted">
              {cashMode ? "every layer felt — the wallet empties visibly" : "faded layers = money that left without the pain"}
            </div>
            {tip.node}
          </div>

          {/* ── Right rail: decoupling gauge + the levers ── */}
          <div className="flex flex-col items-center gap-3">
            <Gauge
              value={decouplingPct}
              max={100}
              size={170}
              tone={indexTone}
              label={<span className="tabular-nums">{Math.round(decouplingPct)}%</span>}
              sublabel={<>decoupling index</>}
            />
            <div className="text-center text-[0.8em] text-text-muted">
              <b className="text-text">{indexVerdict}.</b> {inr(decoupled)} of {inr(total)} left via frictionless rails.
            </div>
            <div className="w-full rounded-md border border-border bg-surface-raised p-3">
              <ToggleRow
                label={cashMode ? "Cash mode ON — friction restored" : "Switch to Cash mode"}
                on={cashMode}
                onChange={(b: boolean) => setCashMode(b)}
              />
              <p className="mt-1.5 text-[0.74em] leading-snug text-text-muted">
                Replays the month as if every tap were a cash hand-over. Felt pain jumps to{" "}
                <b className="text-text tabular-nums">{Math.round(cashMode ? 100 : painPct)}%</b> — that gap is the brake the rails removed.
              </p>
            </div>
          </div>
        </div>

        {/* ── Method split bar ── */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">How the money left your wallet</span>
            <span className="text-[0.72em] text-text-muted">{txns.length} taps this month</span>
          </div>
          <StackedBar
            total={total}
            height={22}
            segments={byMethod.filter((a) => a.total > 0).map((a) => ({ label: METHOD_META[a.method].label, value: a.total, color: METHOD_META[a.method].color }))}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {byMethod.filter((a) => a.total > 0).map((a) => (
              <span key={a.method} className="inline-flex items-center gap-1.5 text-[0.74em] text-text-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_META[a.method].color }} />
                {METHOD_META[a.method].label}
                <span className="font-display font-bold text-text tabular-nums">{inr(a.total)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Category picker + live spend receipt ── */}
        <div className="grid gap-3 md:grid-cols-[1.1fr,1fr]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Where the painless spend hides</span>
            {receipts.slice(0, 5).map((r) => {
              const on = r.category === active?.category;
              const ratio = r.total ? (r.painless / r.total) * 100 : 0;
              return (
                <button
                  key={r.category}
                  onClick={() => setActiveCat(r.category)}
                  className="group flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-[border-color,background-color]"
                  style={{
                    transitionDuration: "var(--ml-motion-fast)",
                    borderColor: on ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                    background: on ? "color-mix(in srgb, var(--ml-color-accent) 8%, transparent)" : "transparent",
                  }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
                    <Icon name={r.icon} emoji={r.emoji} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.88em] font-medium text-text">{r.category}</span>
                      <span className="shrink-0 font-display text-[0.9em] font-bold tabular-nums text-text">{inr(r.total)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                      <div className="h-full rounded-full transition-[width]" style={{ width: `${ratio}%`, background: indexTone === "negative" ? "var(--ml-color-negative)" : "var(--ml-color-accent)", transitionDuration: "var(--ml-motion-base)" }} />
                    </div>
                    <div className="mt-0.5 text-[0.7em] text-text-muted">{Math.round(ratio)}% painless · {r.taps} taps</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* the tactile receipt */}
          <div className="rounded-md border border-dashed border-border bg-surface-raised p-4" style={{ fontFamily: "var(--ml-font-display, inherit)" }}>
            <div className="flex items-center justify-between border-b border-dashed border-border pb-2">
              <span className="flex items-center gap-1.5 text-[0.82em] font-bold text-text">
                <Icon name="transactions" emoji="🧾" size={15} /> {active?.category ?? "Receipt"}
              </span>
              <span className="text-[0.68em] uppercase tracking-wide text-text-muted">spend receipt</span>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {activeTxns.slice(0, 5).map((x) => (
                <div key={x.id} className="flex items-baseline justify-between gap-2 text-[0.8em]">
                  <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
                    <span className="shrink-0">{METHOD_META[x.method].emoji}</span>
                    <span className="truncate text-text">{x.merchant}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: PAINLESS.includes(x.method) ? "var(--ml-color-text-muted)" : "var(--ml-color-text)" }}>
                    {inr(x.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-border pt-2">
              <span className="text-[0.78em] text-text-muted">Felt like</span>
              <span className="font-display text-[1.05em] font-bold tabular-nums" style={{ color: "var(--ml-color-positive)" }}>
                {inr(cashMode ? (active?.total ?? 0) : (active ? activeTxns.reduce((s, x) => s + x.amount * PAIN_WEIGHT[x.method], 0) : 0))}
              </span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between text-[0.74em] text-text-muted">
              <span>Actually paid</span>
              <span className="tabular-nums">{inr(active?.total ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* ── The tell ── */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent"><Icon name="brain" emoji="💡" size={16} /></span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, {Math.round(decouplingPct)}% of your spend left on rails built to
            feel like nothing — so you only *felt* about <b className="text-text">{inr(feltPain)}</b> of the real{" "}
            <b className="text-text">{inr(total)}</b>. The fix isn&apos;t spending less by willpower; it&apos;s adding back a sliver of
            friction — a daily UPI tally, a weekly cash envelope for &quot;wants&quot; — so the brake fires again before you tap.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default PainRestorer;
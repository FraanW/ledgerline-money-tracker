"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, ProgressRing } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Free-Trap Tracker — the Zero-Price Effect (Shampanier, Mazar & Ariely).
 * "Free" doesn't just lower the price, it over-values the benefit, so we sign up
 * for trials we'd never have paid for. We mine the ledger for the ₹0/₹1 trial →
 * paid pattern on the SAME merchant (Audible: ₹0 in May → ₹199 in June, recurring),
 * then warn BEFORE the next silent debit with a countdown ring and a projected
 * annual cost if ignored. Per-trap keep/cancel toggles. Plus a "free-shipping"
 * trap: topping a cart to hit free delivery that costs more than the ₹ shipping saved.
 * Signature visual: a free → paid trap timeline with a conversion-day countdown ring.
 */

const TODAY = "2026-06-03"; // current date in the fixture
const MS_DAY = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_DAY);
}

interface Trap {
  id: string;
  merchant: string;
  emoji: string;
  trialDate: string; // ₹0 free-trial charge
  paidDate: string; // first real debit
  monthly: number; // recurring cost once converted
}

/** Detect the ₹0/₹1 trial → paid pattern across L.transactions, per merchant. */
function deriveTraps(): Trap[] {
  const byMerchant = new Map<string, L.LedgerTxn[]>();
  for (const x of L.transactions) {
    const list = byMerchant.get(x.merchant) ?? [];
    list.push(x);
    byMerchant.set(x.merchant, list);
  }

  const traps: Trap[] = [];
  for (const [merchant, txns] of byMerchant) {
    const trial = txns.find((x) => x.trial && x.amount <= 1);
    if (!trial) continue;
    // first recurring paid debit on the same merchant, after the trial
    const paid = txns
      .filter((x) => x.recurring && x.amount > 1 && x.date > trial.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!paid) continue;
    traps.push({
      id: merchant.toLowerCase().replace(/\s+/g, ""),
      merchant,
      emoji: "🎙️",
      trialDate: trial.date,
      paidDate: paid.date,
      monthly: paid.amount,
    });
  }
  return traps;
}

/** Free-shipping trap: a small inline fixture (no such field in the shared mock). */
interface ShipTrap {
  needed: number; // ₹ still short of the free-shipping threshold
  shippingSaved: number; // ₹ delivery fee waived
}
const SHIP: ShipTrap = { needed: 350, shippingSaved: 49 };

export function FreeTrapTracker(): React.ReactElement {
  const traps = useMemo(() => deriveTraps(), []);
  const [decided, setDecided] = useState<Record<string, "keep" | "cancel">>({});
  const tip = useViztip();

  const primary: Trap | undefined = traps[0];

  // Annual leak: every kept (or not-yet-decided) trap's monthly × 12.
  const annualLeak = useMemo(
    () => traps.reduce((s, tr) => (decided[tr.id] === "cancel" ? s : s + tr.monthly * 12), 0),
    [traps, decided],
  );
  const cancelledSaving = useMemo(
    () => traps.reduce((s, tr) => (decided[tr.id] === "cancel" ? s + tr.monthly * 12 : s), 0),
    [traps, decided],
  );

  if (!primary) {
    return (
      <LensCard icon="bell" emoji="🎟️" title="Free-Trap Tracker" subtitle="Zero-Price Effect · no traps found">
        <p className="text-[0.88em] text-text-muted">Nothing free is quietly turning paid right now. Clean ledger.</p>
      </LensCard>
    );
  }

  // Countdown geometry: where TODAY sits between the free trial and the first paid debit.
  const span = Math.max(1, daysBetween(primary.trialDate, primary.paidDate));
  const elapsed = Math.max(0, Math.min(span, daysBetween(primary.trialDate, TODAY)));
  const daysLeft = daysBetween(TODAY, primary.paidDate);
  const decidedPrimary = decided[primary.id];
  const ringPct = (elapsed / span) * 100;
  const ringTone: "warning" | "positive" = decidedPrimary === "cancel" ? "positive" : "warning";

  const fmtDay = (d: string): string =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  // ── Timeline geometry (inline SVG) ──
  const W = 520;
  const H = 88;
  const padX = 44;
  const trackY = 40;
  const xAt = (frac: number): number => padX + frac * (W - padX * 2);
  const trialX = xAt(0);
  const paidX = xAt(1);
  const todayX = xAt(elapsed / span);

  return (
    <LensCard
      icon="bell"
      emoji="🎟️"
      title="Free-Trap Tracker"
      subtitle={`Zero-Price Effect · ${traps.length} trial${traps.length > 1 ? "s" : ""} converting to paid`}
      badge={
        decidedPrimary === "cancel" ? (
          <Pill tone="positive">cancelled</Pill>
        ) : (
          <Pill tone="warning">{daysLeft <= 0 ? "charging now" : `${daysLeft}d left`}</Pill>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow={`${primary.merchant}'s "free" trial converts to ${inr(primary.monthly)}/mo on the ${new Date(primary.paidDate).getDate()}th`}
          value={
            <span className="tabular-nums">
              {inr(primary.monthly * 12)}
              <span className="text-[0.5em] font-semibold opacity-90"> /yr if ignored</span>
            </span>
          }
          sub={
            <>
              Free felt like a no-brainer — but a yes to free was a silent yes to{" "}
              <b>{inr(primary.monthly)}, every month</b>.
            </>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <KeyStat
            label="Days to charge"
            value={daysLeft <= 0 ? "today" : `${daysLeft}d`}
            tone={daysLeft <= 3 ? "negative" : "warning"}
            hint={`first debit ${fmtDay(primary.paidDate)}`}
          />
          <KeyStat label="Annual leak" value={inr(annualLeak)} tone="warning" hint="all live traps × 12" />
          <KeyStat
            label="Saved by cancelling"
            value={inr(cancelledSaving)}
            tone="positive"
            hint={cancelledSaving > 0 ? "nice catch" : "decide below"}
          />
        </div>

        {/* ── Signature: the free → paid trap timeline with a countdown ring ── */}
        <div
          ref={tip.ref}
          onMouseMove={tip.onMove}
          className="relative rounded-md border border-border bg-surface-raised p-3"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">The trap timeline</span>
            <span className="font-display text-[0.82em] font-bold tabular-nums" style={{ color: "var(--ml-color-warning)" }}>
              {daysLeft <= 0 ? "debiting now" : `${daysLeft} days to decide`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="flex-1">
              {/* base track */}
              <line x1={trialX} y1={trackY} x2={paidX} y2={trackY} stroke="var(--ml-color-border)" strokeWidth={6} strokeLinecap="round" />
              {/* elapsed (trial → today) — the "free" runway, drawn warning */}
              <line
                x1={trialX}
                y1={trackY}
                x2={todayX}
                y2={trackY}
                stroke={decidedPrimary === "cancel" ? "var(--ml-color-positive)" : "var(--ml-color-warning)"}
                strokeWidth={6}
                strokeLinecap="round"
                style={{ transition: "stroke var(--ml-motion-base)" }}
              />

              {/* FREE node */}
              <g>
                <circle cx={trialX} cy={trackY} r={9} fill="var(--ml-color-surface)" stroke="var(--ml-color-positive)" strokeWidth={3} />
                <text x={trialX} y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ml-color-positive)">
                  ₹0 FREE
                </text>
                <text x={trialX} y={trackY + 26} textAnchor="middle" fontSize={10} fill="var(--ml-color-text-muted)">
                  {fmtDay(primary.trialDate)}
                </text>
              </g>

              {/* TODAY marker */}
              <g>
                <line x1={todayX} y1={trackY - 16} x2={todayX} y2={trackY + 16} stroke="var(--ml-color-text)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
                <text x={todayX} y={trackY + 26} textAnchor="middle" fontSize={9} fill="var(--ml-color-text-muted)">
                  today
                </text>
              </g>

              {/* PAID node — the trap snaps shut */}
              <g>
                <circle
                  cx={paidX}
                  cy={trackY}
                  r={9}
                  fill="var(--ml-color-surface)"
                  stroke={decidedPrimary === "cancel" ? "var(--ml-color-text-muted)" : "var(--ml-color-negative)"}
                  strokeWidth={3}
                />
                <text
                  x={paidX}
                  y={20}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={decidedPrimary === "cancel" ? "var(--ml-color-text-muted)" : "var(--ml-color-negative)"}
                >
                  {inr(primary.monthly)}/mo
                </text>
                <text x={paidX} y={trackY + 26} textAnchor="middle" fontSize={10} fill="var(--ml-color-text-muted)">
                  {fmtDay(primary.paidDate)}
                </text>
              </g>

              {/* hover hotspot over the whole track */}
              <rect
                x={0}
                y={0}
                width={W}
                height={H}
                fill="transparent"
                onMouseEnter={tip.enter(
                  "Why free is the trap",
                  `Saying yes to a ₹0 trial felt costless — but it pre-committed you to ${inr(primary.monthly)}/mo from ${fmtDay(primary.paidDate)}. The countdown ring is your window to cancel before the silent debit.`,
                )}
                onMouseLeave={tip.leave}
              />
            </svg>

            {/* countdown ring at the conversion date */}
            <ProgressRing
              pct={decidedPrimary === "cancel" ? 100 : ringPct}
              size={104}
              stroke={11}
              tone={ringTone}
              label={
                <div className="leading-tight">
                  <div className="font-display text-[1.2em] font-bold text-text tabular-nums">
                    {decidedPrimary === "cancel" ? "✓" : daysLeft <= 0 ? "0" : daysLeft}
                  </div>
                  <div className="text-[0.62em] text-text-muted">
                    {decidedPrimary === "cancel" ? "cancelled" : "days left"}
                  </div>
                </div>
              }
            />
          </div>
          {tip.node}
        </div>

        {/* ── Per-trap keep / cancel decisions ── */}
        <div className="flex flex-col gap-2">
          <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Keep it or kill it</span>
          {traps.map((tr) => {
            const decision = decided[tr.id];
            return (
              <div
                key={tr.id}
                className="flex items-center gap-3 rounded-md border border-border p-2.5"
                style={{ opacity: decision === "cancel" ? 0.7 : 1, transition: "opacity var(--ml-motion-base)" }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
                  <Icon name="bell" emoji={tr.emoji} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[0.9em] font-medium text-text">
                    {tr.merchant}
                    <span className="ml-2 text-[0.72em] font-normal text-text-muted">{inr(tr.monthly)}/mo</span>
                  </div>
                  <div className="text-[0.7em] text-text-muted">
                    ₹0 on {fmtDay(tr.trialDate)} → first debit {fmtDay(tr.paidDate)} · {inr(tr.monthly * 12)}/yr
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setDecided((d) => ({ ...d, [tr.id]: "keep" }))}
                    className="rounded-md border px-2.5 py-1 text-[0.78em] font-medium transition-colors"
                    style={{
                      transitionDuration: "var(--ml-motion-fast)",
                      cursor: "pointer",
                      borderColor: decision === "keep" ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                      color: decision === "keep" ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)",
                    }}
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => setDecided((d) => ({ ...d, [tr.id]: "cancel" }))}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[0.78em] font-medium transition-colors"
                    style={{
                      transitionDuration: "var(--ml-motion-fast)",
                      cursor: "pointer",
                      borderColor: decision === "cancel" ? "var(--ml-color-positive)" : "var(--ml-color-border)",
                      color: decision === "cancel" ? "var(--ml-color-positive)" : "var(--ml-color-text-muted)",
                    }}
                  >
                    {decision === "cancel" && <Icon name="check" emoji="✓" size={12} />}
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── The other free trap: free-shipping top-ups ── */}
        <div
          className="flex items-start gap-2 rounded-md border bg-surface-raised p-3"
          style={{ borderColor: "color-mix(in srgb, var(--ml-color-warning) 45%, transparent)" }}
        >
          <span className="mt-0.5" style={{ color: "var(--ml-color-warning)" }}>
            <Icon name="cart" emoji="🛒" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The free-shipping trap:</b> you&rsquo;re {inr(SHIP.needed)} short of free delivery to
            dodge a {inr(SHIP.shippingSaved)} fee. Adding {inr(SHIP.needed)} of &ldquo;stuff&rdquo; to save{" "}
            {inr(SHIP.shippingSaved)} spends{" "}
            <b style={{ color: "var(--ml-color-negative)" }}>{inr(SHIP.needed - SHIP.shippingSaved)} more</b>, not less.
          </p>
        </div>

        {/* ── The tell, made human ── */}
        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, &ldquo;free&rdquo; isn&rsquo;t a price — it&rsquo;s a
            hook. The ₹0 felt like a gift, so you didn&rsquo;t weigh whether {primary.merchant} was worth{" "}
            {inr(primary.monthly * 12)} a year. You have{" "}
            <b style={{ color: "var(--ml-color-warning)" }}>
              {daysLeft <= 0 ? "no" : daysLeft} day{daysLeft === 1 ? "" : "s"}
            </b>{" "}
            to decide on purpose, not on autopilot.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default FreeTrapTracker;
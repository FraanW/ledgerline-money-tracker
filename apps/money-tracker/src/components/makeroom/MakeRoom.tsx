"use client";

import React, { useMemo, useState } from "react";
import { Card, Button } from "../primitives";
import { Icon } from "../Icon";
import { inr } from "../../lib/finance";
import { planMakeRoom, breathingRoom, sinkingFundMonthly, periodLabel, type Envelope, type Pull } from "../../lib/makeRoom";
import { MOCK_ENVELOPES } from "../../mocks/envelopes";

const QUICK = [500, 1000, 2500, 5000, 12000];
const PERIODS = [
  { m: 1, label: "monthly" },
  { m: 3, label: "quarterly" },
  { m: 6, label: "twice a year" },
  { m: 12, label: "yearly" },
];

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 text-[0.85em] text-text" style={{ cursor: "pointer" }}>
      <span className="grid h-5 w-9 items-center rounded-full px-0.5 transition-colors" style={{ background: on ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)", transitionDuration: "var(--ml-motion-fast)" }}>
        <span className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "translateX(0)", transitionDuration: "var(--ml-motion-fast)" }} />
      </span>
      {label}
    </button>
  );
}

/** One contributing envelope: before→after bar with the "need" line + the pull. */
function PullRow({ p }: { p: Pull }) {
  const max = Math.max(1, p.balance);
  const needPct = Math.min(100, (p.expectedRemaining / max) * 100);
  const afterPct = Math.min(100, (p.after / max) * 100);
  const safe = p.after >= p.expectedRemaining;
  const amount = p.fromSlack + p.fromCommitted;

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-center justify-between text-[0.88em]">
        <span className="flex items-center gap-2 text-text">
          <Icon name={p.icon} emoji={p.emoji} size={16} />
          {p.name}
          {p.goalName && <span className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-[0.7em] text-text-muted">goal</span>}
        </span>
        <span className="font-display font-bold" style={{ color: p.fromCommitted > 0 ? "var(--ml-color-negative)" : "var(--ml-color-text)" }}>
          −{inr(amount)}
        </span>
      </div>

      {/* track: full = current balance; fill = what's left after the pull */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${afterPct}%`, background: safe ? "var(--ml-color-accent)" : "var(--ml-color-negative)", transitionDuration: "var(--ml-motion-base)" }} />
        {/* the "need" line — expected remaining spend */}
        {p.expectedRemaining > 0 && (
          <span className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-text-muted" style={{ left: `${needPct}%` }} title="expected spend" />
        )}
      </div>

      <div className="flex items-center justify-between text-[0.74em] text-text-muted">
        <span>{inr(p.balance)} → <span style={{ color: safe ? "var(--ml-color-text)" : "var(--ml-color-negative)" }}>{inr(p.after)}</span></span>
        <span>{p.fromCommitted > 0 ? `${inr(p.fromCommitted)} bites the plan` : "from spare room"}</span>
      </div>
    </div>
  );
}

export function MakeRoom({
  envelopes = MOCK_ENVELOPES,
  initialWhat = "Riya's birthday gift",
  initialAmount = 2500,
  initialRecurring = false,
  initialPeriodMonths = 12,
}: {
  envelopes?: Envelope[];
  initialWhat?: string;
  initialAmount?: number;
  initialRecurring?: boolean;
  initialPeriodMonths?: number;
}) {
  const [what, setWhat] = useState(initialWhat);
  const [amount, setAmount] = useState(initialAmount);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [periodMonths, setPeriodMonths] = useState(initialPeriodMonths);

  const plan = useMemo(() => planMakeRoom(amount, envelopes), [amount, envelopes]);
  const drip = sinkingFundMonthly(amount, periodMonths);
  const fundName = (what || "This expense").trim();

  // the full breathing-room ledger (answers "a breathing amount for each envelope")
  const ledger = envelopes
    .map((e) => ({ e, room: breathingRoom(e) }))
    .sort((a, b) => b.room - a.room);

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
          <Icon name="budget" emoji="🧮" size={20} />
        </span>
        <div>
          <h3 className="font-display text-[1.3em] font-bold text-text">Make Room</h3>
          <p className="text-[0.88em] text-text-muted">An unplanned expense? See exactly how it hits your envelopes — and how to recover.</p>
        </div>
      </div>

      {/* Input */}
      <div className="mt-4 flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-[0.8em] text-text-muted">
          What&apos;s it for?
          <input value={what} onChange={(e) => setWhat(e.target.value)} className="rounded-md border border-border bg-surface px-3 py-2 text-[1em] text-text" style={{ outlineColor: "var(--ml-color-accent)" }} />
        </label>
        <label className="flex flex-col gap-1 text-[0.8em] text-text-muted sm:w-40">
          How much?
          <input type="number" min={0} step={100} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} className="rounded-md border border-border bg-surface px-3 py-2 text-[1em] font-bold text-text" style={{ outlineColor: "var(--ml-color-accent)" }} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} onClick={() => setAmount(q)} className="rounded-full border px-2.5 py-0.5 text-[0.78em]" style={{ borderColor: amount === q ? "var(--ml-color-accent)" : "var(--ml-color-border)", color: amount === q ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)", cursor: "pointer" }}>
              {inr(q)}
            </button>
          ))}
        </div>
        <Toggle label="This happens again" on={recurring} onChange={setRecurring} />
        {recurring && (
          <div className="flex rounded-md border border-border p-0.5 text-[0.76em]">
            {PERIODS.map((p) => (
              <button key={p.m} onClick={() => setPeriodMonths(p.m)} className="rounded-sm px-2 py-0.5" style={{ background: periodMonths === p.m ? "var(--ml-color-accent)" : "transparent", color: periodMonths === p.m ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)", cursor: "pointer" }}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Verdict */}
      <div className="mt-4 rounded-md p-4 text-accent-contrast" style={{ background: plan.impossible ? "var(--ml-color-negative)" : "var(--ml-gradient-hero)", boxShadow: plan.impossible ? "none" : "var(--ml-glow)" }}>
        {plan.impossible ? (
          <>
            <div className="font-display text-[1.3em] font-bold leading-tight">That&apos;s more than you can free up</div>
            <div className="text-[0.84em] opacity-95">Covering {inr(amount)} would need money from protected envelopes (rent, EMIs, emergency fund). Consider a smaller amount or a sinking fund.</div>
          </>
        ) : plan.absorbable ? (
          <>
            <div className="text-[0.8em] opacity-90">{what || "This expense"}</div>
            <div className="font-display text-[1.6em] font-bold leading-tight">Absorbed comfortably ✓</div>
            <div className="text-[0.84em] opacity-95">All {inr(amount)} comes from spare room — no setback. You have {inr(plan.totalBreathing)} of breathing room in total.</div>
          </>
        ) : (
          <>
            <div className="text-[0.8em] opacity-90">{what || "This expense"}</div>
            <div className="font-display text-[1.6em] font-bold leading-tight">Doable — but it bites {inr(plan.shortfall)}</div>
            <div className="text-[0.84em] opacity-95">{inr(plan.totalBreathing)} comes from spare room; {inr(plan.shortfall)} dips into committed money. Here&apos;s the hit and the way back.</div>
          </>
        )}
      </div>

      {/* Sinking-fund nudge — the better way for anything that recurs */}
      {recurring && amount > 0 && (
        <div className="mt-4 rounded-md border-2 p-4" style={{ borderColor: "var(--ml-color-accent)", background: "color-mix(in srgb, var(--ml-color-accent) 8%, transparent)" }}>
          <div className="flex items-center gap-2 text-[0.78em] font-medium uppercase tracking-wide" style={{ color: "var(--ml-color-accent)" }}>
            <Icon name="goal" emoji="🎯" size={14} />
            Plan ahead — don&apos;t scramble every {periodLabel(periodMonths)}
          </div>
          <p className="mt-1.5 text-[0.92em] text-text">
            Drip <span className="font-display text-[1.15em] font-bold" style={{ color: "var(--ml-color-accent)" }}>{inr(drip)}/mo</span> into a
            {" "}<span className="font-medium">“{fundName}”</span> envelope and it&apos;s fully funded by next time — no reshuffle needed.
          </p>
          <p className="mt-1 text-[0.82em] text-text-muted">
            That&apos;s {inr(drip)}/month quietly set aside, versus finding {inr(amount)} in a panic every {periodLabel(periodMonths)}
            {plan.shortfall > 0 ? " — and skipping the setback entirely." : "."}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" leftIcon={<Icon name="goal" emoji="🎯" size={16} />}>Create “{fundName}” sinking fund</Button>
            <span className="text-[0.78em] text-text-muted">Auto-funds {inr(drip)} each month</span>
          </div>
        </div>
      )}

      {recurring && plan.pulls.length > 0 && (
        <div className="mt-4 text-[0.82em] text-text-muted">…or just cover it this once:</div>
      )}

      {/* Where it comes from */}
      {plan.pulls.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[0.85em] font-medium text-text">Where it comes from</div>
          <div className="divide-y divide-border">
            {plan.pulls.map((p) => <PullRow key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {/* Setback */}
      <div className="mt-4 rounded-md border border-border p-3">
        <div className="mb-1 text-[0.85em] font-medium text-text">Your setback</div>
        {plan.setbacks.length === 0 ? (
          <p className="text-[0.85em] text-text-muted">None — everything came from spare room. Next month resets clean.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-[0.85em] text-text-muted">
            {plan.setbacks.map((s) => (
              <li key={s.name} className="flex items-start gap-1.5">
                <Icon name="bell" emoji="⚠️" size={14} className="mt-0.5 text-warning" />
                {s.goalName
                  ? <span><span className="text-text">{s.goalName}</span> progress set back {inr(s.short)} — your goal moves further out.</span>
                  : <span><span className="text-text">{s.name}</span> will be {inr(s.short)} short of its expected spend this month.</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recovery */}
      {plan.shortfall > 0 && (
        <div className="mt-3 rounded-md p-3 text-[0.85em]" style={{ background: "color-mix(in srgb, var(--ml-color-accent) 10%, transparent)" }}>
          <span className="font-medium text-text">Back to whole in {plan.recoveryMonths} months.</span>{" "}
          <span className="text-text-muted">
            Set aside {inr(plan.recoveryMonthly)}/mo{plan.recoverySource ? ` — trimming ${plan.recoverySource} is the easiest source` : ""} — or let your next pay cycles refill it automatically.
          </span>
        </div>
      )}

      {/* Apply */}
      {!plan.impossible && plan.pulls.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" leftIcon={<Icon name="check" emoji="✅" size={16} />}>Apply this reshuffle</Button>
          <span className="text-[0.78em] text-text-muted">Atomic transfers — all move together or none do.</span>
        </div>
      )}

      {/* Full breathing-room ledger */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 text-[0.85em] font-medium text-text">Breathing room across your envelopes</div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ledger.map(({ e, room }) => {
            const locked = e.isProtected || !!e.goalName;
            return (
              <div key={e.id} className="flex items-center justify-between rounded-md bg-surface-raised px-3 py-1.5 text-[0.84em]">
                <span className="flex items-center gap-2 text-text">
                  <Icon name={e.icon} emoji={e.emoji} size={15} />
                  {e.name}
                </span>
                {locked ? (
                  <span className="flex items-center gap-1 text-[0.85em] text-text-muted">
                    <Icon name="lock" emoji="🔒" size={12} />
                    {e.goalName ? "goal" : "protected"}
                  </span>
                ) : (
                  <span className="font-display font-bold" style={{ color: room > 0 ? "var(--ml-color-positive)" : "var(--ml-color-text-muted)" }}>{inr(room)} free</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

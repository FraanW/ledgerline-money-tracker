"use client";

import React, { useState, useMemo } from "react";
import { Button } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Cash-Stack Envelopes — the Cash Stuffing / Envelope Method (folk tradition,
 * popularised on TikTok). The literal ancestor of our model: at the start of the
 * month you pre-stuff physical cash into labelled envelopes, one per category.
 * You spend only what's inside. When an envelope is empty, that category is DONE
 * — you can't overspend because there's nothing left to pull out. No credit, no
 * borrowing from next month, never negative.
 *
 * Here every L.envelope is rendered as a tactile "cash stack": a stack of note
 * slots that visibly empties as you spend. Tap to expand; the "simulate a spend"
 * stepper pulls real notes out and greys/locks the envelope the moment it hits
 * zero — making the never-negative rule viscerally physical.
 */

interface EnvView {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  bucket: L.Bucket;
  allocated: number;
  baseSpent: number;
  isProtected: boolean;
}

/** Denomination used to slice an envelope into a stack of "notes". */
const NOTE = 500;
const MAX_SLOTS = 14; // visual cap so big envelopes don't tower

export function CashStackEnvelopes() {
  const envs: EnvView[] = useMemo(
    () =>
      L.envelopes.map((e) => ({
        id: e.id,
        name: e.name,
        icon: e.icon,
        emoji: e.emoji,
        bucket: e.bucket,
        allocated: e.allocated,
        baseSpent: e.spent,
        isProtected: !!e.isProtected,
      })),
    [],
  );

  // Extra simulated spend per envelope (on top of baseSpent). Never lets an
  // envelope go below zero — that's the whole point of the method.
  const [sim, setSim] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const tip = useViztip();

  const spentOf = (e: EnvView) => Math.min(e.allocated, e.baseSpent + (sim[e.id] ?? 0));
  const leftOf = (e: EnvView) => Math.max(0, e.allocated - spentOf(e));

  function stuff(id: string, delta: number) {
    setSim((prev) => {
      const e = envs.find((x) => x.id === id);
      if (!e) return prev;
      const cur = prev[id] ?? 0;
      const maxExtra = e.allocated - e.baseSpent; // can't pull more than is in the envelope
      const next = Math.max(0, Math.min(maxExtra, cur + delta));
      return { ...prev, [id]: next };
    });
  }

  const totalAllocated = envs.reduce((s, e) => s + e.allocated, 0);
  const totalLeft = envs.reduce((s, e) => s + leftOf(e), 0);
  const emptyCount = envs.filter((e) => leftOf(e) === 0).length;
  const leftPct = totalAllocated ? Math.round((totalLeft / totalAllocated) * 100) : 0;

  return (
    <LensCard
      icon="budget"
      emoji="💵"
      title="Cash-Stack Envelopes"
      subtitle="Stuff each category with cash at month-start. Spend only what's inside. Empty envelope = you're done — never negative."
      badge={<Pill tone="accent">Cash Stuffing</Pill>}
    >
      <HeroStat
        eyebrow="Cash still in your envelopes"
        value={
          <>
            {inr(totalLeft)}
            <span className="text-[0.42em] font-medium opacity-90"> of {inr(totalAllocated)} stuffed</span>
          </>
        }
        sub={
          <>
            {leftPct}% of this month&apos;s cash is still on the table across {envs.length} envelopes.{" "}
            {emptyCount > 0 ? `${emptyCount} ${emptyCount === 1 ? "envelope is" : "envelopes are"} already empty — locked till next month.` : "None empty yet."}
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KeyStat label="Stuffed" value={inr(totalAllocated)} hint="month-start cash" />
        <KeyStat label="Still inside" value={inr(totalLeft)} tone="positive" hint={`${leftPct}% remaining`} />
        <KeyStat label="Already spent" value={inr(totalAllocated - totalLeft)} tone="warning" hint="pulled out" />
        <KeyStat
          label="Empty & locked"
          value={`${emptyCount}`}
          tone={emptyCount > 0 ? "negative" : "default"}
          hint={emptyCount > 0 ? "no overspend possible" : "all have room"}
        />
      </div>

      {/* Signature visual — the grid of skeuomorphic cash-stack envelopes */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[0.85em] font-medium text-text">Your envelopes</div>
          <div className="text-[0.74em] text-text-muted">tap one to open it & spend</div>
        </div>

        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {envs.map((e) => {
              const left = leftOf(e);
              const spent = spentOf(e);
              const empty = left === 0;
              const pct = e.allocated ? left / e.allocated : 0;

              // Slice into note-slots; filled = cash still inside, hollow = spent.
              const totalSlots = Math.min(MAX_SLOTS, Math.max(1, Math.ceil(e.allocated / NOTE)));
              const fullSlots = Math.round(pct * totalSlots);

              const accent = empty
                ? "var(--ml-color-text-muted)"
                : pct <= 0.15
                  ? "var(--ml-color-negative)"
                  : pct <= 0.35
                    ? "var(--ml-color-warning)"
                    : "var(--ml-color-positive)";

              return (
                <button
                  key={e.id}
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  className="group relative flex flex-col gap-2 rounded-md border p-3 text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5"
                  style={{
                    cursor: "pointer",
                    borderColor: open === e.id ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                    background: empty ? "var(--ml-color-surface-raised)" : "var(--ml-color-surface)",
                    opacity: empty ? 0.72 : 1,
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[0.82em] font-medium text-text">
                      <Icon name={e.icon} emoji={e.emoji} size={15} />
                      <span className="truncate">{e.name}</span>
                    </span>
                    {empty ? (
                      <Icon name="lock" emoji="🔒" size={13} className="text-text-muted" />
                    ) : e.isProtected ? (
                      <Icon name="shield" emoji="🛡️" size={13} className="text-text-muted" />
                    ) : null}
                  </div>

                  {/* The cash stack — layered note rects that deplete with spend */}
                  <svg
                    viewBox="0 0 100 64"
                    className="w-full"
                    onMouseEnter={tip.enter(
                      `${e.name} — ${inr(left)} left`,
                      empty
                        ? `Empty & locked. You stuffed ${inr(e.allocated)} and it's all spent. The envelope method stops you here — there's literally nothing left to pull, so this category can't go negative.`
                        : `${inr(left)} of ${inr(e.allocated)} cash still inside (${inr(spent)} spent). When the last note comes out, this category is done for the month.`,
                    )}
                    onMouseLeave={tip.leave}
                  >
                    {/* envelope flap */}
                    <path d="M2 12 L50 2 L98 12" fill="none" stroke="var(--ml-color-border)" strokeWidth={1.5} />
                    {/* envelope body */}
                    <rect x={2} y={10} width={96} height={52} rx={4} fill="var(--ml-color-surface-raised)" stroke="var(--ml-color-border)" strokeWidth={1.5} />
                    {/* note stack — bottom (oldest) to top */}
                    {Array.from({ length: totalSlots }).map((_, i) => {
                      const filled = i < fullSlots;
                      const slotH = 44 / totalSlots;
                      const y = 56 - (i + 1) * slotH + slotH * 0.12;
                      return (
                        <rect
                          key={i}
                          x={10}
                          y={y}
                          width={80}
                          height={Math.max(2, slotH * 0.76)}
                          rx={1.4}
                          fill={filled ? accent : "transparent"}
                          stroke={filled ? "transparent" : "var(--ml-color-border)"}
                          strokeWidth={filled ? 0 : 0.8}
                          strokeDasharray={filled ? undefined : "2 2"}
                          opacity={filled ? 0.85 - i * 0.015 : 0.5}
                          style={{ transition: "fill var(--ml-motion-base), opacity var(--ml-motion-base)" }}
                        />
                      );
                    })}
                  </svg>

                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-[0.98em] font-bold tabular-nums" style={{ color: accent }}>
                      {inr(left)}
                    </span>
                    <span className="text-[0.7em] text-text-muted tabular-nums">of {inr(e.allocated)}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {tip.node}
        </div>
      </div>

      {/* Expanded envelope — detail + the "simulate a spend" stepper */}
      {(() => {
        const e = open ? envs.find((x) => x.id === open) : undefined;
        if (!e) return null;
        const left = leftOf(e);
        const spent = spentOf(e);
        const empty = left === 0;
        const simExtra = sim[e.id] ?? 0;
        return (
          <div className="mt-4 rounded-md border border-accent bg-surface-raised p-4" style={{ boxShadow: "var(--ml-glow)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-accent">
                  <Icon name={e.icon} emoji={e.emoji} size={18} />
                </span>
                <div>
                  <div className="font-display text-[1.05em] font-bold text-text">{e.name}</div>
                  <div className="text-[0.76em] text-text-muted">
                    {e.bucket === "need" ? "Need" : e.bucket === "want" ? "Want" : "Savings"}
                    {e.isProtected ? " · protected envelope" : ""}
                  </div>
                </div>
              </div>
              {empty ? <Pill tone="negative">Empty · locked</Pill> : <Pill tone="positive">{inr(left)} left</Pill>}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <KeyStat label="Stuffed" value={inr(e.allocated)} />
              <KeyStat label="Spent" value={inr(spent)} tone="warning" hint={simExtra > 0 ? `incl. ${inr(simExtra)} simulated` : undefined} />
              <KeyStat label="Left" value={inr(left)} tone={empty ? "negative" : "positive"} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[0.82em] text-text-muted">Pull a note:</span>
              <Button variant="secondary" onClick={() => stuff(e.id, 200)} disabled={empty}>
                Spend ₹200
              </Button>
              <Button variant="secondary" onClick={() => stuff(e.id, 500)} disabled={empty}>
                Spend ₹500
              </Button>
              <Button variant="secondary" onClick={() => stuff(e.id, -500)} disabled={simExtra === 0}>
                Undo
              </Button>
              {simExtra > 0 && (
                <Button variant="link" onClick={() => stuff(e.id, -simExtra)}>
                  Reset
                </Button>
              )}
            </div>

            <p className="mt-3 text-[0.86em] leading-snug text-text">
              {empty ? (
                <>
                  The envelope&apos;s empty — and the method won&apos;t let it go negative. In cash stuffing there&apos;s no overdraft and no
                  borrowing from next month: <span className="font-bold text-text">{e.name} is simply closed</span> until you re-stuff it.
                </>
              ) : (
                <>
                  Every tap pulls a real note out of the stack above. Keep going and watch it grey out and lock — that hard floor
                  at <span className="font-bold" style={{ color: "var(--ml-color-positive)" }}>₹0</span> is exactly why the envelope
                  method has survived for a century.
                </>
              )}
            </p>
          </div>
        );
      })()}

      {/* The tell, made human */}
      <div
        className="mt-4 rounded-md border-l-4 p-3 text-[0.9em]"
        style={{
          borderColor: emptyCount > 0 ? "var(--ml-color-warning)" : "var(--ml-color-accent)",
          background: "color-mix(in srgb, var(--ml-color-surface-raised) 80%, transparent)",
        }}
      >
        <span className="text-text">
          The whole trick is the empty envelope. You can&apos;t spend cash you&apos;ve already pulled out, so overspending isn&apos;t a
          willpower fight — it&apos;s <span className="font-bold text-text">physically impossible</span>. Our digital ledger is just
          this idea, made faster.
        </span>
      </div>
    </LensCard>
  );
}

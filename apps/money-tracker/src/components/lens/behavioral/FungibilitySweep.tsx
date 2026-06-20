"use client";

import React, { useState, useMemo } from "react";
import { Button } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill, ToggleRow } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Fungibility Sweep — Thaler & Shefrin, Mental Accounting & the Behavioral
 * Life-Cycle. Money is fungible, but we file it into non-fungible mental
 * "envelopes" and leave the leftovers idle — a rupee marked "Eating Out" feels
 * unspendable on a goal, so it just sits. The fix is a sweep: at month-end,
 * collect every envelope's unspent slack + the unassigned cash and move it, in
 * one tap, to the goal that needs it most.
 *
 * Signature visual: a row of idle-cash "coins" on the left, each a selected
 * envelope's surplus, draining along curved SVG channels into a single chosen
 * goal ring on the right that fills from its current % up to the post-sweep %.
 */

interface SweepSource {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  /** Idle rupees this source can contribute (allocated − spent, or raw cash). */
  idle: number;
  kind: "envelope" | "cash";
}

const RETURN = "var(--ml-color-positive)";

/** Sweepable surplus: each non-protected envelope's leftover + unassigned cash. */
function deriveSources(): SweepSource[] {
  const env: SweepSource[] = L.envelopes
    .filter((e) => !e.isProtected && e.allocated - e.spent > 0)
    .map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon,
      emoji: e.emoji,
      idle: e.allocated - e.spent,
      kind: "envelope" as const,
    }))
    .sort((a, b) => b.idle - a.idle);

  const cash: SweepSource = {
    id: "_cash",
    name: "Unassigned cash",
    icon: "bank",
    emoji: "💸",
    idle: L.availableCash,
    kind: "cash",
  };
  return [cash, ...env];
}

export function FungibilitySweep(): React.ReactElement {
  const sources = useMemo(() => deriveSources(), []);
  const tip = useViztip();

  // Default: rank goals by absolute gap, pre-select the one with the largest gap.
  const rankedGoals = useMemo(
    () => [...L.goals].sort((a, b) => b.target - b.current - (a.target - a.current)),
    [],
  );
  const defaultGoal = rankedGoals[0] ?? L.goals[0];
  const [goalId, setGoalId] = useState<string>(defaultGoal?.id ?? "");
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    sources.reduce<Record<string, boolean>>((acc, s) => {
      acc[s.id] = true;
      return acc;
    }, {}),
  );

  const goal = useMemo(() => L.goals.find((g) => g.id === goalId) ?? defaultGoal, [goalId, defaultGoal]);

  const swept = useMemo(
    () => sources.reduce((s, src) => (picked[src.id] ? s + src.idle : s), 0),
    [sources, picked],
  );
  const totalIdle = useMemo(() => sources.reduce((s, src) => s + src.idle, 0), [sources]);

  const target = goal?.target ?? 1;
  const current = goal?.current ?? 0;
  const beforePct = Math.min(100, (current / target) * 100);
  const afterRaw = current + swept;
  const afterPct = Math.min(100, (afterRaw / target) * 100);
  const gapBefore = Math.max(0, target - current);
  const gapAfter = Math.max(0, target - afterRaw);
  const idleShare = totalIdle > 0 ? Math.round((swept / totalIdle) * 100) : 0;

  const activeSources = sources.filter((s) => picked[s.id] && s.idle > 0);
  const pickedCount = activeSources.length;

  /* ── Signature SVG geometry: coins on the left draining into the ring ── */
  const W = 540;
  const H = 196;
  const ringCx = W - 86;
  const ringCy = H / 2;
  const ringR = 60;

  return (
    <LensCard
      icon="link"
      emoji="🧲"
      title="Fungibility Sweep"
      subtitle="Thaler & Shefrin · idle envelope money is still your money"
      badge={<Pill tone="accent">{inr(swept)} ready</Pill>}
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow="Sweep this idle slack into one goal, in one tap"
          value={<span className="tabular-nums">{inr(swept)}</span>}
          sub={
            <>
              scattered across <b>{pickedCount}</b> envelopes as unspent leftovers — money that should be working, not
              waiting
            </>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <KeyStat label="Total idle" value={inr(totalIdle)} tone="warning" hint="surplus + unassigned cash" />
          <KeyStat
            label={goal?.name ?? "Goal"}
            value={`${Math.round(beforePct)}% → ${Math.round(afterPct)}%`}
            tone="positive"
            hint="progress after the sweep"
          />
          <KeyStat label="Gap closes by" value={inrCompact(gapBefore - gapAfter)} tone="accent" hint="distance to target" />
        </div>

        {/* ── Signature: idle coins draining into the chosen goal ring ── */}
        <div
          ref={tip.ref}
          onMouseMove={tip.onMove}
          className="relative rounded-md border border-border bg-surface-raised p-3"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">The sweep</span>
            <span className="font-display text-[0.85em] font-bold tabular-nums text-positive">
              +{inrCompact(swept)} → {goal?.name}
            </span>
          </div>

          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
            {/* curved channels from each active coin into the ring hub */}
            {activeSources.map((s, i) => {
              const n = Math.max(1, activeSources.length);
              const y = 28 + (i / Math.max(1, n - 1 || 1)) * (H - 56);
              const startX = 150;
              const cx = (startX + ringCx) / 2;
              return (
                <path
                  key={`flow_${s.id}`}
                  d={`M ${startX} ${y} C ${cx} ${y}, ${cx} ${ringCy}, ${ringCx - ringR} ${ringCy}`}
                  fill="none"
                  stroke={RETURN}
                  strokeWidth={Math.max(1.5, Math.min(6, (s.idle / Math.max(1, totalIdle)) * 22))}
                  strokeLinecap="round"
                  opacity={0.32}
                  style={{ transition: "stroke-width var(--ml-motion-base), opacity var(--ml-motion-base)" }}
                />
              );
            })}

            {/* idle "coins" — one per source, height encodes its surplus */}
            {sources.map((s, i) => {
              const n = sources.length;
              const y = 28 + (i / Math.max(1, n - 1)) * (H - 56);
              const on = (picked[s.id] ?? false) && s.idle > 0;
              return (
                <g
                  key={`coin_${s.id}`}
                  style={{ cursor: "pointer", transition: "opacity var(--ml-motion-base)", opacity: on ? 1 : 0.32 }}
                  onClick={() => setPicked((p) => ({ ...p, [s.id]: !(p[s.id] ?? false) }))}
                  onMouseEnter={tip.enter(
                    `${s.name} · ${inr(s.idle)} idle`,
                    on
                      ? `This ${s.kind === "cash" ? "unassigned cash" : "envelope's unspent slack"} is being swept into ${goal?.name}. A rupee here is just as spendable as any other.`
                      : `${inr(s.idle)} sitting idle — tap to add it to the sweep.`,
                  )}
                  onMouseLeave={tip.leave}
                >
                  <circle cx={70} cy={y} r={11} fill={on ? RETURN : "var(--ml-color-surface)"} stroke="var(--ml-color-border)" strokeWidth={1.5} />
                  <text x={70} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={on ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)"}>
                    ₹
                  </text>
                  <text x={88} y={y + 4} fontSize={11} fill="var(--ml-color-text)">
                    {s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name}
                  </text>
                </g>
              );
            })}

            {/* goal ring hub — track + before arc + swept arc */}
            <g>
              <circle cx={ringCx} cy={ringCy} r={ringR} fill="none" stroke="var(--ml-color-surface)" strokeWidth={12} />
              <g transform={`rotate(-90 ${ringCx} ${ringCy})`}>
                <circle
                  cx={ringCx}
                  cy={ringCy}
                  r={ringR}
                  fill="none"
                  stroke="var(--ml-color-accent)"
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={`${(beforePct / 100) * 2 * Math.PI * ringR} ${2 * Math.PI * ringR}`}
                  opacity={0.55}
                />
                <circle
                  cx={ringCx}
                  cy={ringCy}
                  r={ringR}
                  fill="none"
                  stroke={RETURN}
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={`${((afterPct - beforePct) / 100) * 2 * Math.PI * ringR} ${2 * Math.PI * ringR}`}
                  strokeDashoffset={`${-(beforePct / 100) * 2 * Math.PI * ringR}`}
                  style={{ transition: "stroke-dasharray var(--ml-motion-base), stroke-dashoffset var(--ml-motion-base)" }}
                />
              </g>
              <text x={ringCx} y={ringCy - 2} textAnchor="middle" className="font-display" fontSize={20} fontWeight={700} fill="var(--ml-color-text)">
                {Math.round(afterPct)}%
              </text>
              <text x={ringCx} y={ringCy + 16} textAnchor="middle" fontSize={10} fill="var(--ml-color-text-muted)">
                {inrCompact(afterRaw)} / {inrCompact(target)}
              </text>
            </g>

            {/* invisible hover zone over the ring for the headline explanation */}
            <circle
              cx={ringCx}
              cy={ringCy}
              r={ringR + 6}
              fill="transparent"
              onMouseEnter={tip.enter(
                `${goal?.name}: ${Math.round(beforePct)}% → ${Math.round(afterPct)}%`,
                `One sweep of ${inr(swept)} moves this goal from ${inr(current)} to ${inr(afterRaw)} of ${inr(target)}. The dim arc is where you were; the bright arc is the idle money doing its job.`,
              )}
              onMouseLeave={tip.leave}
            />
          </svg>
          {tip.node}
        </div>

        {/* Goal picker — where the surplus lands */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Sweep into</span>
          <div className="grid grid-cols-3 gap-2">
            {rankedGoals.map((g) => {
              const on = g.id === goalId;
              const gap = Math.max(0, g.target - g.current);
              return (
                <button
                  key={g.id}
                  onClick={() => setGoalId(g.id)}
                  className="flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-[border-color,background-color]"
                  style={{
                    borderColor: on ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                    background: on ? "color-mix(in srgb, var(--ml-color-accent) 12%, transparent)" : "transparent",
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                >
                  <span className="flex items-center gap-1.5" style={{ color: on ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)" }}>
                    <Icon name={g.icon} emoji={g.emoji} size={16} />
                    <span className="text-[0.82em] font-medium text-text">{g.name}</span>
                  </span>
                  <span className="text-[0.7em] text-text-muted">{inrCompact(gap)} to go</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Source toggles — which idle money to include */}
        <div className="flex flex-col gap-2">
          <span className="text-[0.78em] uppercase tracking-wide text-text-muted">Pull idle money from</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <ToggleRow
                  label={`${s.name} · ${inr(s.idle)}`}
                  on={picked[s.id] ?? false}
                  onChange={(b: boolean) => setPicked((p) => ({ ...p, [s.id]: b }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised p-3">
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, that {inr(swept)} isn&apos;t &quot;Eating-Out money&quot; or
            &quot;spare cash&quot; — it&apos;s <b className="text-text">just money</b>. Swept into {goal?.name}, it closes{" "}
            <b className="text-positive">{idleShare}%</b> of your idle slack and the gap shrinks by{" "}
            <b className="text-positive">{inrCompact(gapBefore - gapAfter)}</b>.
          </p>
          <Button variant="primary" onClick={() => undefined}>
            Sweep {inrCompact(swept)}
          </Button>
        </div>
      </div>
    </LensCard>
  );
}

export default FungibilitySweep;

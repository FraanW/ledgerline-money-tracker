"use client";

import React, { useState, useMemo } from "react";
import { LensCard, HeroStat, KeyStat, Pill, SegmentedControl } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Reference-Framed Budget — Kahneman & Tversky (Prospect Theory / Loss Aversion).
 *
 * A loss looms ~2× a gain. The same ₹500 under-spend that should feel like a win
 * barely registers, while a ₹500 over-spend stings twice as hard — and which it
 * IS depends entirely on the reference point you measure against. So we let the
 * user flip the anchor (budget vs a trailing 3-month mean) and watch the same
 * envelopes reframe from "wins" to "losses".
 *
 * Signature visual: the prospect-theory value function itself — concave over
 * gains, convex + steeper over losses, with a kink at the reference point — and
 * every envelope plotted as a dot on it, so you literally SEE how much each delta
 * is *felt* (loss side dives faster than the gain side rises). The list below is
 * ordered by loss-aversion-weighted salience (losses count ×2), so the things
 * that hurt float to the top.
 */

const LOSS_WEIGHT = 2; // losses loom ~2× a gain (Tversky & Kahneman, λ ≈ 2.25)

type RefMode = "budget" | "mean";

interface Frame {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  spent: number;
  reference: number; // the anchor we judge against
  delta: number; // reference − spent  (positive = kept, negative = over)
  felt: number; // prospect-weighted magnitude (losses ×2) — drives salience
}

/** Simulate a trailing 3-month mean per envelope (~5% above what was spent). */
function meanFor(spent: number): number {
  return Math.round(spent * 1.05);
}

function buildFrames(mode: RefMode): Frame[] {
  return L.envelopes
    .filter((e) => !e.isProtected) // fixed/protected lines have no "win/loss" framing
    .map((e) => {
      const reference = mode === "budget" ? e.allocated : meanFor(e.spent);
      const delta = reference - e.spent;
      const felt = delta < 0 ? Math.abs(delta) * LOSS_WEIGHT : delta;
      return { id: e.id, name: e.name, icon: e.icon, emoji: e.emoji, spent: e.spent, reference, delta, felt };
    })
    .sort((a, b) => b.felt - a.felt); // most-salient first
}

/** Prospect value function v(x): concave gains, convex + steeper losses. */
function valueFn(x: number, scale: number): number {
  const norm = x / scale; // -1..+1-ish
  if (norm >= 0) return Math.pow(norm, 0.65); // concave gains
  return -LOSS_WEIGHT * Math.pow(-norm, 0.65); // steeper losses
}

export function ReferenceFramedBudget(): React.ReactElement {
  const [mode, setMode] = useState<RefMode>("budget");
  const tip = useViztip();

  const frames = useMemo(() => buildFrames(mode), [mode]);

  const kept = useMemo(() => frames.filter((f) => f.delta >= 0).reduce((s, f) => s + f.delta, 0), [frames]);
  const over = useMemo(() => frames.filter((f) => f.delta < 0).reduce((s, f) => s + Math.abs(f.delta), 0), [frames]);
  const net = kept - over; // raw rupee net
  const feltNet = kept - over * LOSS_WEIGHT; // how the brain scores it (losses ×2)
  const overCount = frames.filter((f) => f.delta < 0).length;

  // Largest swing sets the curve's x-scale so dots spread nicely.
  const maxAbs = useMemo(() => Math.max(1, ...frames.map((f) => Math.abs(f.delta))), [frames]);

  /* ── Value-function curve geometry (inline SVG) ──────────────────────── */
  const W = 520;
  const H = 200;
  const padX = 28;
  const cx = W / 2; // x = 0 (the reference point) sits dead centre
  const cy = H / 2; // v = 0
  const halfW = cx - padX;
  const halfH = cy - 20;
  // Map a rupee delta → svg x; a value-fn output (-LOSS_WEIGHT..1) → svg y.
  const sx = (d: number) => cx + (d / maxAbs) * halfW;
  const sy = (v: number) => cy - (v / LOSS_WEIGHT) * halfH;

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const d = -maxAbs + (i / 60) * (2 * maxAbs);
      pts.push(`${i === 0 ? "M" : "L"} ${sx(d).toFixed(1)} ${sy(valueFn(d, maxAbs)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [maxAbs]);

  const modeLabel = mode === "budget" ? "your budget" : "your 3-month average";

  return (
    <LensCard
      icon="brain"
      emoji="🧠"
      title="Reference-Framed Budget"
      subtitle="Kahneman & Tversky · a loss looms 2× a gain"
      badge={<Pill tone={net >= 0 ? "positive" : "negative"}>{net >= 0 ? "net win" : "net over"}</Pill>}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.8em] text-text-muted">Measure each envelope against…</span>
          <SegmentedControl<RefMode>
            options={[
              { value: "budget", label: "Budget" },
              { value: "mean", label: "3-mo avg" },
            ]}
            value={mode}
            onChange={(v: RefMode) => setMode(v)}
          />
        </div>

        <HeroStat
          eyebrow={`Versus ${modeLabel}, across your flexible envelopes`}
          value={
            net >= 0 ? (
              <span className="tabular-nums">You kept {inr(net)}</span>
            ) : (
              <span className="tabular-nums">You&apos;re {inr(Math.abs(net))} over</span>
            )
          }
          sub={
            <>
              kept <b>{inr(kept)}</b> here, gave back <b>{inr(over)}</b> there — but your gut weights the overspend
              twice, so it <i>feels</i> like {feltNet >= 0 ? inr(feltNet) : `−${inr(Math.abs(feltNet))}`}
            </>
          }
        />

        <div className="grid grid-cols-3 gap-3">
          <KeyStat label="Kept (under)" value={inr(kept)} tone="positive" hint="should feel good" />
          <KeyStat label="Over" value={inr(over)} tone="negative" hint={`${overCount} envelope${overCount === 1 ? "" : "s"}`} />
          <KeyStat label="Loss penalty" value={`${LOSS_WEIGHT}×`} tone="warning" hint="how losses are weighted" />
        </div>

        {/* ── SIGNATURE: the prospect-theory value function ─────────────── */}
        <div
          ref={tip.ref}
          onMouseMove={tip.onMove}
          className="relative rounded-md border border-border bg-surface-raised p-3"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">The value function</span>
            <span className="text-[0.72em] text-text-muted">losses dive faster than gains climb</span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img">
            {/* axes */}
            <line x1={padX} y1={cy} x2={W - padX} y2={cy} stroke="var(--ml-color-border)" strokeWidth={1} />
            <line x1={cx} y1={16} x2={cx} y2={H - 16} stroke="var(--ml-color-border)" strokeWidth={1} strokeDasharray="3 3" />
            {/* gain / loss quadrant tints */}
            <rect x={cx} y={16} width={W - padX - cx} height={cy - 16} fill="var(--ml-color-positive)" opacity={0.06} />
            <rect x={padX} y={cy} width={cx - padX} height={H - 16 - cy} fill="var(--ml-color-negative)" opacity={0.07} />
            {/* the curve */}
            <path d={curve} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} strokeLinecap="round" />
            {/* reference-point kink marker */}
            <circle cx={cx} cy={cy} r={3.5} fill="var(--ml-color-text)" />
            {/* axis labels */}
            <text x={W - padX} y={cy - 8} textAnchor="end" fontSize={10} fill="var(--ml-color-positive)">
              under-spend →
            </text>
            <text x={padX} y={cy + 16} textAnchor="start" fontSize={10} fill="var(--ml-color-negative)">
              ← over-spend
            </text>

            {/* each envelope plotted on the curve */}
            {frames.map((f) => {
              const px = sx(f.delta);
              const py = sy(valueFn(f.delta, maxAbs));
              const won = f.delta >= 0;
              return (
                <g key={f.id}>
                  <line x1={px} y1={cy} x2={px} y2={py} stroke="var(--ml-color-border)" strokeWidth={1} opacity={0.6} />
                  <circle
                    cx={px}
                    cy={py}
                    r={5}
                    fill={won ? "var(--ml-color-positive)" : "var(--ml-color-negative)"}
                    stroke="var(--ml-color-surface)"
                    strokeWidth={1.5}
                    onMouseEnter={tip.enter(
                      f.name,
                      won
                        ? `${inr(f.delta)} under ${modeLabel} — a small "win" that the curve barely lifts off zero.`
                        : `${inr(Math.abs(f.delta))} over ${modeLabel} — the curve plunges ~${LOSS_WEIGHT}× as hard, so it stings far more than an equal saving pleases.`,
                    )}
                    onMouseLeave={tip.leave}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            })}
          </svg>
          {tip.node}
        </div>

        {/* ── envelopes, ordered by loss-aversion-weighted salience ─────── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.78em] uppercase tracking-wide text-text-muted">What your gut notices first</span>
            <span className="text-[0.72em] text-text-muted">losses bubble up (×{LOSS_WEIGHT})</span>
          </div>

          {frames.map((f) => {
            const won = f.delta >= 0;
            const barPct = Math.max(4, (Math.abs(f.delta) / maxAbs) * 100);
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-md border border-border p-2.5"
                style={{ borderColor: won ? undefined : "color-mix(in srgb, var(--ml-color-negative) 40%, var(--ml-color-border))" }}
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-raised"
                  style={{ color: won ? "var(--ml-color-positive)" : "var(--ml-color-negative)" }}
                >
                  <Icon name={f.icon} emoji={f.emoji} size={17} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.9em] font-medium text-text">
                      {f.name}
                      <span className="ml-2 text-[0.72em] font-normal text-text-muted">
                        {inr(f.spent)} of {inr(f.reference)}
                      </span>
                    </span>
                    <span
                      className="shrink-0 font-display text-[0.95em] font-bold tabular-nums"
                      style={{ color: won ? "var(--ml-color-positive)" : "var(--ml-color-negative)" }}
                    >
                      {won ? `kept ${inr(f.delta)}` : `${inr(Math.abs(f.delta))} over`}
                    </span>
                  </div>
                  {/* delta bar, anchored to the reference */}
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${barPct}%`,
                        background: won ? "var(--ml-color-positive)" : "var(--ml-color-negative)",
                        transitionDuration: "var(--ml-motion-base)",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3">
          <span className="mt-0.5 text-accent">
            <Icon name="brain" emoji="💡" size={16} />
          </span>
          <p className="text-[0.84em] leading-snug text-text-muted">
            <b className="text-text">The tell:</b> {L.profile.name}, you&apos;re actually{" "}
            <b className={net >= 0 ? "text-positive" : "text-negative"}>
              {net >= 0 ? `${inr(net)} ahead` : `${inr(Math.abs(net))} behind`}
            </b>{" "}
            against {modeLabel}. The reason it doesn&apos;t feel that way is loss aversion — the {overCount} overspend
            {overCount === 1 ? "" : "s"} loom twice as large as the wins. Flip the anchor to your 3-month average and
            most &quot;losses&quot; quietly become wins; the money never moved, only the reference point did.
          </p>
        </div>
      </div>
    </LensCard>
  );
}

export default ReferenceFramedBudget;

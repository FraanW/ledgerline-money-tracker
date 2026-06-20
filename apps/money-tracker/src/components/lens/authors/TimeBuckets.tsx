"use client";

import React, { useState, useMemo } from "react";
import { Card, Button, Badge } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill, LENS_PALETTE } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Time Buckets — Bill Perkins, "Die With Zero".
 * Optimise net fulfillment, not net worth. Some experiences only fit certain
 * decades; money saved past its useful window is wasted life energy. We split
 * life into age buckets, let you slot experiences into the decade they best
 * fit, and overlay the net-worth curve that *should* peak mid-life and glide
 * toward zero — not pile up unspent.
 */

interface Experience {
  id: string;
  label: string;
  emoji: string;
  /** Default decade-of-life this experience best fits (start age). */
  bucket: number;
}

// A small default wishlist — the kind of life-energy spend the philosophy means.
const DEFAULT_EXPERIENCES: Experience[] = [
  { id: "e1", label: "Backpack South America", emoji: "🎒", bucket: 30 },
  { id: "e2", label: "Learn to surf in Sri Lanka", emoji: "🏄", bucket: 30 },
  { id: "e3", label: "Take parents on a world trip", emoji: "✈️", bucket: 40 },
  { id: "e4", label: "Sabbatical to write", emoji: "📖", bucket: 40 },
  { id: "e5", label: "Himalayan trek with friends", emoji: "🏔️", bucket: 50 },
  { id: "e6", label: "Long stay in Italy", emoji: "🍝", bucket: 60 },
];

const IDEAS: { label: string; emoji: string }[] = [
  { label: "Diving trip in the Andamans", emoji: "🤿" },
  { label: "Grandkids' education fund", emoji: "🎓" },
  { label: "Restore a vintage bike", emoji: "🏍️" },
  { label: "Cooking school in Bangkok", emoji: "🍜" },
];

// Net-worth curve: accumulates, peaks ~55, then decumulates toward zero (DWZ).
const PEAK_AGE = 55;
const END_AGE = 85;

export function TimeBuckets(): React.ReactElement {
  const startAge = L.profile.age; // 29
  const buckets = useMemo(() => [30, 40, 50, 60, 70, 80], []);
  const tip = useViztip();

  const [experiences, setExperiences] = useState<Experience[]>(DEFAULT_EXPERIENCES);
  const [active, setActive] = useState<number>(30);
  const [ideaIdx, setIdeaIdx] = useState<number>(0);

  const assignTo = (id: string, bucket: number): void =>
    setExperiences((xs) => xs.map((x) => (x.id === id ? { ...x, bucket } : x)));

  const addIdea = (): void => {
    const idea = IDEAS[ideaIdx % IDEAS.length] ?? IDEAS[0];
    if (!idea) return;
    setExperiences((xs) => [...xs, { id: `c${xs.length}_${Date.now()}`, label: idea.label, emoji: idea.emoji, bucket: active }]);
    setIdeaIdx((i) => i + 1);
  };

  // Net worth: today's real figure, projected up to a peak then drawn down.
  const nwToday = L.netWorth;
  const nwPeak = Math.round(nwToday * 4.2); // illustrative mid-life peak
  const curve = useMemo(() => {
    const pts: { age: number; nw: number }[] = [];
    for (let age = startAge; age <= END_AGE; age++) {
      let nw: number;
      if (age <= PEAK_AGE) {
        const f = (age - startAge) / (PEAK_AGE - startAge);
        nw = nwToday + (nwPeak - nwToday) * (f * f); // accelerating accumulation
      } else {
        const f = (age - PEAK_AGE) / (END_AGE - PEAK_AGE);
        nw = nwPeak * (1 - f) * (1 - f); // glide toward ~zero
      }
      pts.push({ age, nw: Math.max(0, Math.round(nw)) });
    }
    return pts;
  }, [startAge, nwToday, nwPeak]);

  // The tell: this month's experience spend vs accumulation.
  const env = L.envelopes;
  const findSpent = (id: string): number => env.find((e) => e.id === id)?.spent ?? 0;
  const experienceSpend = findSpent("dining") + findSpent("fun") + findSpent("goa");
  const accumulation = findSpent("sip") + findSpent("emergency");
  const ratio = accumulation > 0 ? experienceSpend / accumulation : 0;

  // SVG geometry for the signature timeline + curve.
  const W = 680;
  const H = 200;
  const padL = 8;
  const padR = 8;
  const plotW = W - padL - padR;
  const maxNw = Math.max(...curve.map((c) => c.nw), 1);
  const x = (age: number): number => padL + ((age - startAge) / (END_AGE - startAge)) * plotW;
  const y = (nw: number): number => H - 34 - (nw / maxNw) * (H - 64);
  const line = curve.map((c, i) => `${i === 0 ? "M" : "L"} ${x(c.age).toFixed(1)} ${y(c.nw).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(END_AGE).toFixed(1)} ${H - 34} L ${x(startAge).toFixed(1)} ${H - 34} Z`;

  const bucketCount = (b: number): number => experiences.filter((e) => e.bucket === b).length;
  const activeExp = experiences.filter((e) => e.bucket === active);

  return (
    <LensCard
      icon="travel"
      emoji="🪣"
      title="Time Buckets"
      subtitle="Die With Zero — spend life energy while it still buys memories"
      badge={<Badge tone="accent">Bill Perkins</Badge>}
    >
      <div className="flex flex-col gap-5">
        <HeroStat
          eyebrow="Net fulfillment, not net worth"
          value={<>You have ~{PEAK_AGE - startAge} prime years before the curve should peak</>}
          sub={<>Money parked past the decade it could buy an experience is spent life energy you can&apos;t refund.</>}
        />

        {/* ── SIGNATURE: life timeline + decumulation curve ── */}
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <div className="mb-2 flex items-center justify-between text-[0.75em] text-text-muted">
            <span className="uppercase tracking-wide">Your life, by the decade</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--ml-color-accent)" }} /> projected net worth
            </span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net-worth curve across age buckets" style={{ display: "block" }}>
            <defs>
              <linearGradient id="tb-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ml-color-accent)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--ml-color-accent)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* bucket columns (clickable) */}
            {buckets.map((b, i) => {
              const x0 = x(b);
              const x1 = b === 80 ? x(END_AGE) : x(buckets[i + 1] ?? END_AGE);
              const isActive = active === b;
              const count = bucketCount(b);
              return (
                <g key={b} style={{ cursor: "pointer" }} onClick={() => setActive(b)}>
                  <rect
                    x={x0}
                    y={6}
                    width={Math.max(1, x1 - x0 - 4)}
                    height={H - 40}
                    rx={6}
                    fill={isActive ? "color-mix(in srgb, var(--ml-color-accent) 12%, transparent)" : "var(--ml-color-surface-raised)"}
                    stroke={isActive ? "var(--ml-color-accent)" : "var(--ml-color-border)"}
                    strokeWidth={isActive ? 1.5 : 1}
                    onMouseEnter={tip.enter(`Your ${b}s`, `${count} experience${count === 1 ? "" : "s"} slotted here. The window for some of these never reopens — fitness, energy and the people you'd share them with all change by the next bucket.`)}
                    onMouseLeave={tip.leave}
                  />
                  <text x={(x0 + x1) / 2 - 2} y={H - 18} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ml-color-text)">{b}s</text>
                  {count > 0 && (
                    <text x={(x0 + x1) / 2 - 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--ml-color-text-muted)">{count} planned</text>
                  )}
                </g>
              );
            })}

            {/* net-worth curve */}
            <path d={area} fill="url(#tb-fill)" />
            <path d={line} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "all var(--ml-motion-base)" }} />

            {/* peak marker */}
            <g onMouseEnter={tip.enter("Peak ~age 55", `Net worth should crest near ${inrCompact(nwPeak)} here, then be deliberately drawn down. Most people keep climbing and die with the biggest balance of their life — Perkins calls that wasted.`)} onMouseLeave={tip.leave}>
              <circle cx={x(PEAK_AGE)} cy={y(nwPeak)} r={5} fill="var(--ml-color-accent)" stroke="var(--ml-color-surface)" strokeWidth={2} />
              <line x1={x(PEAK_AGE)} y1={y(nwPeak)} x2={x(PEAK_AGE)} y2={H - 34} stroke="var(--ml-color-accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            </g>

            {/* "you are here" marker */}
            <g onMouseEnter={tip.enter("You are here", `Age ${startAge} · net worth ${inrCompact(nwToday)}. Plenty of runway ahead — but the most physical, adventurous experiences sit in the next two buckets.`)} onMouseLeave={tip.leave}>
              <circle cx={x(startAge)} cy={y(nwToday)} r={5} fill="var(--ml-color-positive)" stroke="var(--ml-color-surface)" strokeWidth={2} />
              <text x={x(startAge) + 8} y={y(nwToday) - 6} fontSize="10" fontWeight="700" fill="var(--ml-color-positive)">now · {startAge}</text>
            </g>
          </svg>
          {tip.node}
        </div>

        {/* ── KEY STATS: the memory-dividend tell ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KeyStat label="Experiences / mo" value={inr(experienceSpend)} tone="accent" hint="dining + fun + Goa fund" />
          <KeyStat label="Pure accumulation / mo" value={inr(accumulation)} tone="warning" hint="SIP + emergency top-up" />
          <KeyStat label="Spend-to-stack ratio" value={`${ratio.toFixed(2)}×`} tone={ratio < 0.5 ? "negative" : "positive"} hint="experience ÷ accumulation" />
        </div>

        {ratio < 0.5 && (
          <div className="rounded-md border border-border bg-surface-raised p-3 text-[0.86em] leading-relaxed text-text">
            <span className="font-display font-bold text-warning">The tell · </span>
            You&apos;re stacking <b>{inr(accumulation)}</b> a month but spending only <b>{inr(experienceSpend)}</b> on experiences. A future-you with a fat balance can&apos;t go back and do your <b>30s</b> twice. The memory dividend on a trip taken now compounds for decades.
          </div>
        )}

        {/* ── INTERACTIVE: assign experiences to the active bucket ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-display text-[1.05em] font-bold text-text">
              Your {active}s
              <span className="ml-2 text-[0.7em] font-normal text-text-muted">ages {active}–{active + 9}</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {buckets.map((b) => (
                <button
                  key={b}
                  onClick={() => setActive(b)}
                  className="rounded-full border px-2.5 py-0.5 text-[0.74em] font-medium transition-colors"
                  style={{
                    borderColor: active === b ? "var(--ml-color-accent)" : "var(--ml-color-border)",
                    color: active === b ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)",
                    background: active === b ? "color-mix(in srgb, var(--ml-color-accent) 10%, transparent)" : "transparent",
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                >
                  {b}s
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {activeExp.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-[0.84em] text-text-muted">
                Nothing slotted into your {active}s yet. What would make this decade unforgettable?
              </p>
            )}
            {activeExp.map((e, i) => {
              const color = LENS_PALETTE[i % LENS_PALETTE.length] ?? LENS_PALETTE[0];
              return (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-raised p-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--ml-color-accent) 12%, transparent)" }}>
                      <Icon name="goal" emoji={e.emoji} size={15} />
                    </span>
                    <span className="truncate text-[0.88em] text-text">{e.label}</span>
                  </div>
                  <select
                    value={e.bucket}
                    onChange={(ev) => assignTo(e.id, Number(ev.target.value))}
                    className="shrink-0 rounded-sm border border-border bg-surface px-2 py-1 text-[0.78em] text-text-muted"
                    style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                    aria-label={`Move ${e.label} to another decade`}
                  >
                    {buckets.map((b) => (
                      <option key={b} value={b}>Move to {b}s</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={addIdea} leftIcon={<Icon name="goal" emoji="✨" size={15} />}>
              Add an experience to your {active}s
            </Button>
            <Pill tone="neutral">{experiences.length} experiences mapped across life</Pill>
          </div>
        </div>
      </div>
    </LensCard>
  );
}

export default TimeBuckets;

"use client";

import React, { useState, useMemo } from "react";
import { Button, Badge } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Kakeibo Reflection — Hani Motoko, the 1904 mindful-spending journal.
 * Kakeibo (家計簿) sorts a month's spending into four pillars — Needs (生活費),
 * Wants (娯楽費), Culture (教養費) and Unexpected (予備費) — then closes the
 * month with four questions. The categorising and the writing ARE the practice:
 * the pause is the product. This is the most serene view in the gallery —
 * editorial, unhurried, a ledger you sit with rather than a dashboard that
 * shouts. We auto-sort June's transactions into the four pillars, weigh your
 * intended save against what actually stayed, and leave room for a closing note.
 */

type Pillar = "needs" | "wants" | "culture" | "unexpected";

interface PillarMeta {
  key: Pillar;
  label: string;
  kanji: string;
  emoji: string;
  icon: string;
  gloss: string;
  color: string;
}

const NEEDS: PillarMeta = { key: "needs", label: "Needs", kanji: "生活費", emoji: "🍙", icon: "rent", gloss: "Survival — what life simply requires", color: "var(--ml-color-accent)" };
const PILLARS: PillarMeta[] = [
  NEEDS,
  { key: "wants", label: "Wants", kanji: "娯楽費", emoji: "🍡", icon: "fun", gloss: "Optional — small joys, chosen freely", color: "var(--ml-color-accent-2)" },
  { key: "culture", label: "Culture", kanji: "教養費", emoji: "📖", icon: "brain", gloss: "Enrichment — what makes a life, not just a budget", color: "var(--ml-color-positive)" },
  { key: "unexpected", label: "Unexpected", kanji: "予備費", emoji: "🌧️", icon: "other", gloss: "Surprises — the one-offs you didn't plan for", color: "var(--ml-color-warning)" },
];

// Kakeibo's classic four month-end questions — the journal walks them in order.
const QUESTIONS: { q: string; sub: string }[] = [
  { q: "How much do I have?", sub: "This month's take-home, the money you actually held." },
  { q: "How much would I like to save?", sub: "Set the intention first — saving is a decision, not a leftover." },
  { q: "How much am I spending?", sub: "Sorted into the four pillars, gently and without judgement." },
  { q: "How can I improve?", sub: "One honest line for next month. The writing is the practice." },
];

/** Map a transaction to one of the four Kakeibo pillars. */
function pillarOf(txn: L.LedgerTxn): Pillar {
  if (txn.bucket === "need") return "needs";
  if (txn.bucket === "savings") return "culture"; // SIP as investing-in-future-self enrichment
  // wants → split by character
  if (txn.trial) return "unexpected"; // a trial that quietly converted
  if (txn.category === "Subscriptions" || txn.merchant === "Audible" || txn.merchant === "Spotify") return "culture";
  if (txn.category === "Shopping") return "unexpected"; // one-off purchases
  return "wants"; // dining, fun, the everyday optionals
}

export function KakeiboReflection(): React.ReactElement {
  const tip = useViztip();
  const [step, setStep] = useState<number>(0);
  const [saveTargetPct, setSaveTargetPct] = useState<number>(20);
  const [note, setNote] = useState<string>("");

  const income = L.profile.monthlyTakeHome; // 82,000 — the May raise has landed

  // ── Auto-sort June into the four pillars ──
  const breakdown = useMemo(() => {
    const sums: Record<Pillar, number> = { needs: 0, wants: 0, culture: 0, unexpected: 0 };
    for (const txn of L.currentMonthTxns) sums[pillarOf(txn)] += txn.amount;
    return sums;
  }, []);

  const totalSpent = PILLARS.reduce((s, p) => s + breakdown[p.key], 0);
  const actualSaved = income - totalSpent;
  const actualSavePct = income > 0 ? (actualSaved / income) * 100 : 0;
  const targetSaved = Math.round((saveTargetPct / 100) * income);
  const gap = actualSaved - targetSaved; // + = beat the intention, − = fell short
  const metTarget = gap >= 0;

  const biggest = PILLARS.reduce<PillarMeta>((a, b) => (breakdown[b.key] > breakdown[a.key] ? b : a), NEEDS);

  // ── Signature SVG: a calm four-pillar "stacked column" ledger ──
  const W = 560;
  const H = 230;
  const baseY = H - 34;
  const top = 18;
  const colW = 96;
  const gap0 = (W - PILLARS.length * colW) / (PILLARS.length + 1);
  const maxVal = Math.max(...PILLARS.map((p) => breakdown[p.key]), 1);
  const colX = (i: number): number => gap0 + i * (colW + gap0);
  const colH = (v: number): number => (v / maxVal) * (baseY - top);

  return (
    <LensCard
      icon="log"
      emoji="📓"
      title="Kakeibo Reflection"
      subtitle="家計簿 — the mindful household ledger · Hani Motoko, 1904"
      badge={<Badge tone="accent">Method · Monthly</Badge>}
    >
      <div className="flex flex-col gap-5">
        {/* Opening epigraph — lean into the serif, set the contemplative tone */}
        <figure className="rounded-md border border-border bg-surface-raised p-4">
          <blockquote className="font-display text-[1.05em] italic leading-relaxed text-text">
            “Before you spend, pause and ask the page. The act of writing is what turns
            spending into a choice.”
          </blockquote>
          <figcaption className="mt-2 text-[0.78em] text-text-muted">— the spirit of kakeibo</figcaption>
        </figure>

        <HeroStat
          flat
          eyebrow={`Closing the books on June · ${PILLARS.length} pillars`}
          value={
            <span className={metTarget ? "text-positive" : "text-warning"}>
              {metTarget ? "You kept " : "You set aside "}
              {inr(actualSaved)}
            </span>
          }
          sub={
            <>
              That&apos;s <b>{actualSavePct.toFixed(0)}%</b> of what you took home —{" "}
              {metTarget
                ? <>{inr(gap)} ahead of your {saveTargetPct}% intention. Quietly done.</>
                : <>{inr(Math.abs(gap))} short of your {saveTargetPct}% intention. No alarm — just a note for next month.</>}
            </>
          }
        />

        {/* ── SIGNATURE: serene four-pillar ledger ── */}
        <div ref={tip.ref} onMouseMove={tip.onMove} className="relative">
          <div className="mb-2 flex items-center justify-between text-[0.75em] text-text-muted">
            <span className="uppercase tracking-wide">June, sorted into four pillars</span>
            <span>biggest: <b className="text-text">{biggest.label}</b></span>
          </div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="June spending across the four kakeibo pillars" style={{ display: "block" }}>
            {/* the page line */}
            <line x1={gap0 / 2} y1={baseY} x2={W - gap0 / 2} y2={baseY} stroke="var(--ml-color-border)" strokeWidth={1} />

            {PILLARS.map((p, i) => {
              const v = breakdown[p.key];
              const h = colH(v);
              const x0 = colX(i);
              const share = totalSpent > 0 ? Math.round((v / totalSpent) * 100) : 0;
              return (
                <g
                  key={p.key}
                  style={{ cursor: "default" }}
                  onMouseEnter={tip.enter(
                    `${p.label} · ${p.kanji}`,
                    `${inr(v)} this month — ${share}% of spending. ${p.gloss}.`,
                  )}
                  onMouseLeave={tip.leave}
                >
                  {/* soft column track */}
                  <rect x={x0} y={top} width={colW} height={baseY - top} rx={8} fill="var(--ml-color-surface-raised)" />
                  {/* filled pillar */}
                  <rect
                    x={x0}
                    y={baseY - h}
                    width={colW}
                    height={Math.max(2, h)}
                    rx={8}
                    fill={p.color}
                    opacity={0.92}
                    style={{ transition: "height var(--ml-motion-base), y var(--ml-motion-base)" }}
                  />
                  {/* value above the pillar */}
                  <text x={x0 + colW / 2} y={baseY - h - 7} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--ml-color-text)">
                    {inr(v)}
                  </text>
                  {/* kanji watermark inside the pillar */}
                  <text x={x0 + colW / 2} y={baseY - 12} textAnchor="middle" fontSize="15" fill="var(--ml-color-surface)" opacity={h > 40 ? 0.85 : 0}>
                    {p.kanji}
                  </text>
                  {/* label + share under the line */}
                  <text x={x0 + colW / 2} y={baseY + 16} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ml-color-text)">
                    {p.label}
                  </text>
                  <text x={x0 + colW / 2} y={baseY + 28} textAnchor="middle" fontSize="9.5" fill="var(--ml-color-text-muted)">
                    {share}%
                  </text>
                </g>
              );
            })}
          </svg>
          {tip.node}
        </div>

        {/* ── Pillar legend with glosses — the cultural heart of kakeibo ── */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PILLARS.map((p) => (
            <div key={p.key} className="rounded-md border border-border bg-surface-raised p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <Icon name={p.icon} emoji={p.emoji} size={14} />
                <span className="text-[0.82em] font-bold text-text">{p.label}</span>
              </div>
              <div className="mt-1 font-display text-[1.05em] font-bold text-text tabular-nums">{inr(breakdown[p.key])}</div>
              <div className="mt-0.5 text-[0.7em] leading-snug text-text-muted">{p.gloss}</div>
            </div>
          ))}
        </div>

        {/* ── The four questions, walked one at a time ── */}
        <div className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[0.78em] font-bold text-accent-contrast">
                {step + 1}
              </span>
              <h4 className="font-display text-[1.1em] font-bold text-text">{QUESTIONS[step]?.q}</h4>
            </div>
            <Pill tone="neutral">{step + 1} / {QUESTIONS.length}</Pill>
          </div>
          <p className="mt-1.5 text-[0.84em] leading-relaxed text-text-muted">{QUESTIONS[step]?.sub}</p>

          <div className="mt-3">
            {step === 0 && (
              <div className="grid grid-cols-2 gap-3">
                <KeyStat label="Take-home this month" value={inr(income)} tone="accent" hint="May raise has landed" />
                <KeyStat label="Spent so far" value={inr(totalSpent)} tone="default" hint={`across all ${PILLARS.length} pillars`} />
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <SliderRow
                  label="I'd like to save"
                  value={saveTargetPct}
                  min={0}
                  max={50}
                  step={5}
                  onChange={(v: number) => setSaveTargetPct(v)}
                  format={(v: number) => `${v}%  ·  ${inr(Math.round((v / 100) * income))}`}
                />
                <div className="grid grid-cols-2 gap-3">
                  <KeyStat label="Intended save" value={inr(targetSaved)} tone="accent" hint={`${saveTargetPct}% of take-home`} />
                  <KeyStat label="Actually stayed" value={inr(actualSaved)} tone={metTarget ? "positive" : "warning"} hint={`${actualSavePct.toFixed(0)}% of take-home`} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-2">
                {PILLARS.map((p) => {
                  const v = breakdown[p.key];
                  const pct = totalSpent > 0 ? (v / totalSpent) * 100 : 0;
                  return (
                    <div key={p.key} className="flex items-center gap-3">
                      <span className="flex w-28 shrink-0 items-center gap-1.5 text-[0.84em] text-text">
                        <Icon name={p.icon} emoji={p.emoji} size={14} />
                        {p.label}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-raised">
                        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: p.color, transitionDuration: "var(--ml-motion-base)" }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-[0.82em] font-bold tabular-nums text-text">{inr(v)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={note}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
                  rows={3}
                  placeholder={
                    metTarget
                      ? "e.g. Culture spend felt worth every rupee — keep it. Trim one Swiggy night."
                      : "e.g. Shopping crept up. Next month I'll wait a day before tapping 'buy'."
                  }
                  className="w-full resize-none rounded-md border border-border bg-surface p-3 text-[0.88em] leading-relaxed text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
                  style={{ transitionDuration: "var(--ml-motion-fast)" }}
                  aria-label="How can I improve next month?"
                />
                <div className="text-[0.75em] text-text-muted">
                  {note.trim().length > 0
                    ? <>Saved to next month&apos;s first page. {note.trim().length} characters of reflection.</>
                    : <>One honest line is enough — kakeibo asks for awareness, not perfection.</>}
                </div>
              </div>
            )}
          </div>

          {/* step navigation */}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            {step < QUESTIONS.length - 1 ? (
              <Button variant="primary" onClick={() => setStep((s) => Math.min(QUESTIONS.length - 1, s + 1))} leftIcon={<Icon name="log" emoji="✍️" size={15} />}>
                Next question
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep(0)} leftIcon={<Icon name="check" emoji="🍵" size={15} />}>
                Close the month
              </Button>
            )}
          </div>
        </div>

        {/* ── The tell, made human ── */}
        <div className="rounded-md border border-border bg-surface-raised p-3 text-[0.86em] leading-relaxed text-text">
          <span className="font-display font-bold text-accent">The pause · </span>
          Your biggest pillar this month was <b>{biggest.label}</b> at <b>{inr(breakdown[biggest.key])}</b>. Notice
          that <b>Culture</b> — books, learning, investing in tomorrow — sits beside <b>Wants</b> here, not buried inside
          it. Kakeibo&apos;s quiet radicalism is that enrichment is never the first thing you cut.
        </div>
      </div>
    </LensCard>
  );
}

export default KakeiboReflection;

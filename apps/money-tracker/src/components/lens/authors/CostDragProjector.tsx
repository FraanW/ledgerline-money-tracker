"use client";

import React, { useState, useMemo } from "react";
import { Card } from "../../primitives";
import { LensCard, HeroStat, KeyStat, Pill, SliderRow } from "../kit";
import { Icon } from "../../Icon";
import { useViztip } from "../../viz/Tooltip";
import { inr, inrCompact } from "../../../lib/finance";
import * as L from "../../../mocks/lensData";

/**
 * Cost Drag Projector — John Bogle's Cost Matters Hypothesis.
 * Net return = gross return − costs. Costs are the one lever you control with
 * certainty, and they compound against you ("the tyranny of compounding costs").
 * We grow each holding forward twice — once at the fund's real expense ratio,
 * once at a 0.1% index floor — and shade the widening gap as the lifetime drag.
 */

const INDEX_FLOOR_PCT = 0.1; // a clean direct-index expense ratio to benchmark against

/** Terminal value after N years of gross return r% with cost c%, monthly compounded. */
function grow(value: number, grossPct: number, costPct: number, years: number): number {
  const i = (grossPct - costPct) / 100 / 12;
  return value * Math.pow(1 + i, years * 12);
}

export function CostDragProjector(): React.ReactElement {
  const [years, setYears] = useState<number>(25);
  const [grossPct, setGrossPct] = useState<number>(11);
  const tip = useViztip();

  // Asset-weighted blended cost across the portfolio (the number that actually bites).
  const blendedCostPct = useMemo<number>(() => {
    const total = L.portfolioValue || 1;
    return L.holdings.reduce((s, h) => s + h.expenseRatioPct * (h.value / total), 0);
  }, []);

  // Per-holding lifetime drag vs the index floor, sorted worst-first.
  const rows = useMemo(() => {
    return L.holdings
      .map((h) => {
        const kept = grow(h.value, grossPct, INDEX_FLOOR_PCT, years);
        const actual = grow(h.value, grossPct, h.expenseRatioPct, years);
        return { ...h, drag: Math.max(0, kept - actual) };
      })
      .sort((a, b) => b.drag - a.drag);
  }, [years, grossPct]);

  const worst = rows[0];
  const totalDrag = rows.reduce((s, r) => s + r.drag, 0);
  const floorTerminal = grow(L.portfolioValue, grossPct, INDEX_FLOOR_PCT, years);
  const dragPctOfWealth = floorTerminal > 0 ? (totalDrag / floorTerminal) * 100 : 0;

  // ── Signature: two diverging curves on the whole portfolio ──────────────
  const W = 520;
  const H = 200;
  const PAD_L = 8;
  const PAD_B = 18;
  const steps = 30;
  const floorSeries = useMemo<number[]>(
    () => Array.from({ length: steps + 1 }, (_, k) => grow(L.portfolioValue, grossPct, INDEX_FLOOR_PCT, (years * k) / steps)),
    [years, grossPct],
  );
  const costSeries = useMemo<number[]>(
    () => Array.from({ length: steps + 1 }, (_, k) => grow(L.portfolioValue, grossPct, blendedCostPct, (years * k) / steps)),
    [years, grossPct, blendedCostPct],
  );
  const yMax = (floorSeries[steps] ?? L.portfolioValue) * 1.05;
  const x = (k: number): number => PAD_L + (k / steps) * (W - PAD_L * 2);
  const y = (v: number): number => H - PAD_B - (v / yMax) * (H - PAD_B - 8);

  const path = (s: number[]): string => s.map((v, k) => `${k === 0 ? "M" : "L"} ${x(k).toFixed(1)} ${y(v ?? 0).toFixed(1)}`).join(" ");
  const gapArea = useMemo<string>(() => {
    const top = floorSeries.map((v, k) => `${k === 0 ? "M" : "L"} ${x(k).toFixed(1)} ${y(v ?? 0).toFixed(1)}`).join(" ");
    const bottom = [...costSeries].reverse().map((v, k) => `L ${x(steps - k).toFixed(1)} ${y(v ?? 0).toFixed(1)}`).join(" ");
    return `${top} ${bottom} Z`;
  }, [floorSeries, costSeries, years, grossPct]);

  const finalFloorY = y(floorSeries[steps] ?? 0);
  const finalCostY = y(costSeries[steps] ?? 0);

  return (
    <LensCard
      icon="invest"
      emoji="🧮"
      title="The Cost Drag"
      subtitle="Net return = market return − costs. Fees are the one lever you control."
      badge={<Pill tone="warning">Bogle · cost matters</Pill>}
    >
      <HeroStat
        eyebrow={`${worst?.name ?? "Highest-cost holding"} — drag over ${years} yrs`}
        value={<span className="tabular-nums">{inr(worst?.drag ?? 0)}</span>}
        sub={
          <>
            quietly skimmed by its {worst?.expenseRatioPct}% expense ratio vs a {INDEX_FLOOR_PCT}% index — the tyranny of compounding costs
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KeyStat label="Blended cost" value={`${blendedCostPct.toFixed(2)}%`} tone="warning" hint="asset-weighted across portfolio" />
        <KeyStat label="vs index floor" value={`${INDEX_FLOOR_PCT}%`} tone="accent" hint="a direct index plan" />
        <KeyStat label="Total drag" value={inrCompact(totalDrag)} tone="negative" hint={`over ${years} years`} />
        <KeyStat label="Wealth lost" value={`${dragPctOfWealth.toFixed(1)}%`} tone="negative" hint="of your fee-free terminal" />
      </div>

      {/* ── Signature diverging curves ── */}
      <div ref={tip.ref} onMouseMove={tip.onMove} className="relative mt-5 rounded-md border border-border bg-surface-raised p-3">
        <div className="mb-2 flex items-center justify-between text-[0.78em]">
          <span className="flex items-center gap-1.5 text-text-muted">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--ml-color-accent)" }} /> index floor (0.1%)
          </span>
          <span className="flex items-center gap-1.5 text-text-muted">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "var(--ml-color-negative)" }} /> your funds ({blendedCostPct.toFixed(2)}%)
          </span>
        </div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
          {/* the drag — shaded gap between the two curves */}
          <path d={gapArea} fill="var(--ml-color-negative)" opacity={0.18} />
          {/* index-floor curve */}
          <path d={path(floorSeries)} fill="none" stroke="var(--ml-color-accent)" strokeWidth={2.5} strokeLinecap="round" />
          {/* your-funds curve */}
          <path d={path(costSeries)} fill="none" stroke="var(--ml-color-negative)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 0" />
          {/* terminal gap connector + labels */}
          <line x1={x(steps)} y1={finalCostY} x2={x(steps)} y2={finalFloorY} stroke="var(--ml-color-text-muted)" strokeWidth={1} strokeDasharray="3 3" />
          <circle cx={x(steps)} cy={finalFloorY} r={3} fill="var(--ml-color-accent)" />
          <circle cx={x(steps)} cy={finalCostY} r={3} fill="var(--ml-color-negative)" />
          {/* invisible hover zones telling the story across thirds of the horizon */}
          {[0, 1, 2].map((band) => {
            const k0 = Math.round((steps / 3) * band);
            const k1 = Math.round((steps / 3) * (band + 1));
            const yr = Math.round((years * (k0 + k1)) / 2 / steps);
            const gap = (floorSeries[k1] ?? 0) - (costSeries[k1] ?? 0);
            return (
              <rect
                key={band}
                x={x(k0)}
                y={0}
                width={x(k1) - x(k0)}
                height={H - PAD_B}
                fill="transparent"
                onMouseEnter={tip.enter(
                  `~Year ${yr}`,
                  `By here the gap is ${inr(gap)}. Same money, same market — the dashed line just pays more in fees, and the difference compounds.`,
                )}
                onMouseLeave={tip.leave}
              />
            );
          })}
          {/* x-axis ticks */}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={x(steps * f)} y={H - 4} fontSize={9} fill="var(--ml-color-text-muted)" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}>
              {Math.round(years * f)}y
            </text>
          ))}
        </svg>
        {tip.node}
      </div>

      {/* ── Controls — default already looks great ── */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SliderRow label="Time horizon" value={years} min={10} max={30} step={1} onChange={setYears} format={(v) => `${v} yrs`} />
        <SliderRow label="Assumed gross return" value={grossPct} min={6} max={14} step={0.5} onChange={setGrossPct} format={(v) => `${v}%`} />
      </div>

      {/* ── Per-holding cost table ── */}
      <div className="mt-5 space-y-1.5">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-1 text-[0.7em] uppercase tracking-wide text-text-muted">
          <span>Holding</span>
          <span className="text-right">Expense</span>
          <span className="text-right">{years}-yr drag</span>
        </div>
        {rows.map((r) => {
          const intensity = totalDrag > 0 ? r.drag / (worst?.drag || 1) : 0;
          return (
            <Card key={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5">
              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  className="h-7 w-1 shrink-0 rounded-full"
                  style={{ background: "var(--ml-color-negative)", opacity: 0.25 + intensity * 0.75 }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[0.9em] font-medium text-text">{r.name}</div>
                  <div className="text-[0.72em] text-text-muted">
                    {r.regularPlan ? "Regular plan · pays a distributor" : "Direct plan · lean"}
                  </div>
                </div>
              </div>
              <div className="text-right">
                {r.regularPlan ? (
                  <Pill tone="negative">{r.expenseRatioPct}%</Pill>
                ) : (
                  <Pill tone="neutral">{r.expenseRatioPct}%</Pill>
                )}
              </div>
              <div className="text-right font-display text-[0.95em] font-bold tabular-nums text-negative">−{inrCompact(r.drag)}</div>
            </Card>
          );
        })}
      </div>

      {/* ── The tell, made human ── */}
      <div className="mt-4 flex items-start gap-2.5 rounded-md bg-surface-raised p-3 text-[0.85em] text-text">
        <span className="mt-0.5 text-accent">
          <Icon name="brain" emoji="💡" size={16} />
        </span>
        <p>
          Switching your {rows.filter((r) => r.regularPlan).length} <span className="font-medium">regular-plan</span> funds to direct/index equivalents would keep about{" "}
          <span className="font-display font-bold text-positive">{inrCompact(rows.filter((r) => r.regularPlan).reduce((s, r) => s + r.drag, 0))}</span>{" "}
          in your pocket over {years} years — a near-certain return, earned by doing nothing more than choosing the cheaper share class.
        </p>
      </div>
    </LensCard>
  );
}

export default CostDragProjector;
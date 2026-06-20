"use client";

import React, { useState } from "react";
import { Card } from "../primitives";
import { Quote } from "../Quote";
import { sipResult, inr, inrCompact } from "../../lib/finance";

const HORIZONS = [10, 20, 30];
const RETURN = 12;

/**
 * "Why time does the heavy lifting" — the Morgan Housel compounding lens. Shows
 * the same monthly SIP over 10/20/30 years and how the GAINS (not the deposits)
 * explode in the final stretch. Opinionated teaching UI, not a bland chart.
 */
export function CompoundingLesson() {
  const [monthly, setMonthly] = useState(10000);
  const rows = HORIZONS.map((y) => ({ y, ...sipResult(monthly, RETURN, y) }));
  const max = Math.max(...rows.map((r) => r.futureValue), 1);

  return (
    <Card className="p-[calc(1.5rem*var(--ml-density))]">
      <h3 className="font-display text-[1.3em] font-bold tracking-tight text-text">Why time does the heavy lifting</h3>
      <p className="text-[0.88em] text-text-muted">The deposits stay flat — but the gains snowball. Most of the wealth shows up in the final stretch.</p>

      <div className="mt-4 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[0.88em]">
          <span className="text-text-muted">Monthly investment (at {RETURN}% p.a.)</span>
          <span className="font-display font-bold text-text">{inr(monthly)}</span>
        </div>
        <input type="range" min={1000} max={50000} step={1000} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--ml-color-accent)" }} />
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {rows.map((r) => {
          const gainsPct = Math.round((r.gains / r.futureValue) * 100);
          const investedW = (r.invested / max) * 100;
          const gainsW = (r.gains / max) * 100;
          return (
            <div key={r.y}>
              <div className="mb-1 flex items-center justify-between text-[0.85em]">
                <span className="font-medium text-text">{r.y} years</span>
                <span className="tabular-nums text-text-muted">
                  {inrCompact(r.futureValue)} · <span style={{ color: "var(--ml-color-positive)" }}>{gainsPct}% is gains</span>
                </span>
              </div>
              <div className="flex h-6 overflow-hidden rounded-md bg-surface-raised">
                <div className="h-full" style={{ width: `${investedW}%`, background: "var(--ml-color-text-muted)", opacity: 0.5, transition: "width var(--ml-motion-base) var(--ml-motion-ease)" }} title={`Invested ${inr(r.invested)}`} />
                <div className="h-full" style={{ width: `${gainsW}%`, background: "var(--ml-color-accent)", transition: "width var(--ml-motion-base) var(--ml-motion-ease)" }} title={`Gains ${inr(r.gains)}`} />
              </div>
            </div>
          );
        })}
        <div className="flex gap-4 text-[0.78em] text-text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm" style={{ background: "var(--ml-color-text-muted)", opacity: 0.5 }} /> what you put in</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-accent" /> what time added</span>
        </div>
      </div>

      <div className="mt-5">
        <Quote cite="Morgan Housel · The Psychology of Money">
          Warren Buffett built about $81.5 billion of his $84.5 billion net worth after his 65th birthday. The skill is investing — the secret is time.
        </Quote>
      </div>
    </Card>
  );
}

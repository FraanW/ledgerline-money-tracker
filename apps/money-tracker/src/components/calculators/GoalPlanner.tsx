"use client";

import React, { useState } from "react";
import { Card } from "../primitives";
import { ProjectionChart } from "./ProjectionChart";
import { requiredMonthlyForGoal, sipResult, inr } from "../../lib/finance";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[0.88em]">
        <span className="text-text-muted">{label}</span>
        <span className="font-display font-bold text-text">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--ml-color-accent)" }} />
    </div>
  );
}

export function GoalPlanner() {
  const [target, setTarget] = useState(5000000);
  const [years, setYears] = useState(12);
  const [ret, setRet] = useState(12);

  const required = requiredMonthlyForGoal(target, ret, years);
  const series = sipResult(required, ret, years).series;

  return (
    <Card className="p-5 md:p-6">
      <h3 className="font-display text-[1.3em] font-bold text-text">Goal Planner</h3>
      <p className="text-[0.88em] text-text-muted">Pick a target and a timeline — we&apos;ll tell you the monthly SIP to get there.</p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Slider label="I want to reach" value={target} min={100000} max={50000000} step={100000} onChange={setTarget} format={inr} />
          <Slider label="In" value={years} min={1} max={35} step={1} onChange={setYears} format={(v) => `${v} yr`} />
          <Slider label="Expected return (p.a.)" value={ret} min={4} max={20} step={0.5} onChange={setRet} format={(v) => `${v}%`} />

          <div className="rounded-md p-4 text-accent-contrast" style={{ background: "var(--ml-gradient-hero)", boxShadow: "var(--ml-glow)" }}>
            <div className="text-[0.8em] opacity-90">Invest every month</div>
            <div className="font-display text-[1.9em] font-bold">{inr(required)}</div>
            <div className="text-[0.82em] opacity-90">to reach {inr(target)} in {years} years</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[0.85em] text-text-muted">Here&apos;s how it grows:</div>
          <ProjectionChart series={series} />
        </div>
      </div>
    </Card>
  );
}

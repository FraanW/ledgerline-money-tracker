"use client";

import React, { useState } from "react";
import { Card } from "../primitives";
import { ProjectionChart } from "./ProjectionChart";
import { sipResult, lumpsumResult, inr } from "../../lib/finance";

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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--ml-color-accent)" }}
      />
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 text-[0.85em] text-text"
      style={{ cursor: "pointer" }}
    >
      <span
        className="grid h-5 w-9 items-center rounded-full px-0.5 transition-colors"
        style={{ background: on ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)", transitionDuration: "var(--ml-motion-fast)" }}
      >
        <span className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "translateX(0)", transitionDuration: "var(--ml-motion-fast)" }} />
      </span>
      {label}
    </button>
  );
}

export function SipCalculator() {
  const [mode, setMode] = useState<"sip" | "lumpsum">("sip");
  const [monthly, setMonthly] = useState(10000);
  const [lump, setLump] = useState(500000);
  const [ret, setRet] = useState(12);
  const [years, setYears] = useState(15);
  const [stepUp, setStepUp] = useState(false);
  const [stepUpPct, setStepUpPct] = useState(10);

  const result =
    mode === "sip"
      ? sipResult(monthly, ret, years, stepUp ? stepUpPct : 0)
      : lumpsumResult(lump, ret, years);

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-[1.3em] font-bold text-text">Investment Calculator</h3>
        <div className="flex rounded-md border border-border p-0.5 text-[0.82em]">
          {(["sip", "lumpsum"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="rounded-sm px-3 py-1 capitalize"
              style={{ background: mode === m ? "var(--ml-color-accent)" : "transparent", color: mode === m ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)", cursor: "pointer" }}
            >
              {m === "sip" ? "Monthly SIP" : "Lump sum"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="flex flex-col gap-4">
          {mode === "sip" ? (
            <Slider label="Monthly investment" value={monthly} min={500} max={100000} step={500} onChange={setMonthly} format={inr} />
          ) : (
            <Slider label="One-time investment" value={lump} min={10000} max={5000000} step={10000} onChange={setLump} format={inr} />
          )}
          <Slider label="Expected return (p.a.)" value={ret} min={4} max={20} step={0.5} onChange={setRet} format={(v) => `${v}%`} />
          <Slider label="Time period" value={years} min={1} max={35} step={1} onChange={setYears} format={(v) => `${v} yr`} />
          {mode === "sip" && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-3">
              <Toggle label="Step up my SIP every year" on={stepUp} onChange={setStepUp} />
              {stepUp && <Slider label="Annual step-up" value={stepUpPct} min={5} max={25} step={1} onChange={setStepUpPct} format={(v) => `${v}%`} />}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-surface-raised p-3">
              <div className="text-[0.72em] uppercase tracking-wide text-text-muted">Invested</div>
              <div className="font-display text-[1.05em] font-bold text-text">{inr(result.invested)}</div>
            </div>
            <div className="rounded-md bg-surface-raised p-3">
              <div className="text-[0.72em] uppercase tracking-wide text-text-muted">Gains</div>
              <div className="font-display text-[1.05em] font-bold" style={{ color: "var(--ml-color-positive)" }}>{inr(result.gains)}</div>
            </div>
            <div className="rounded-md p-3 text-accent-contrast" style={{ background: "var(--ml-gradient-accent)" }}>
              <div className="text-[0.72em] uppercase tracking-wide opacity-90">Future value</div>
              <div className="font-display text-[1.05em] font-bold">{inr(result.futureValue)}</div>
            </div>
          </div>
          <ProjectionChart series={result.series} />
        </div>
      </div>
    </Card>
  );
}

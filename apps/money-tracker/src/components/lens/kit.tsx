"use client";

import React from "react";
import { Card } from "../primitives";
import { Icon } from "../Icon";

/**
 * Shared lens kit — token-driven building blocks every philosophy lens composes
 * from, so the whole gallery feels like one designed system. Hand-rolled SVG/CSS
 * (no chart libs). Everything reads --ml-* tokens, so it restyles per persona.
 */

export const LENS_PALETTE = [
  "var(--ml-color-accent)",
  "var(--ml-color-accent-2)",
  "var(--ml-color-positive)",
  "var(--ml-color-warning)",
  "var(--ml-color-negative)",
  "var(--ml-color-text-muted)",
];

/* ── Chrome ─────────────────────────────────────────────────────────────── */

export function LensCard({
  icon,
  emoji,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: string;
  emoji?: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
            <Icon name={icon} emoji={emoji} size={20} />
          </span>
          <div>
            <h3 className="font-display text-[1.3em] font-bold leading-tight text-text">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[0.88em] text-text-muted">{subtitle}</p>}
          </div>
        </div>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** The big gradient headline number most lenses lead with. */
export function HeroStat({
  eyebrow,
  value,
  sub,
  flat = false,
}: {
  eyebrow?: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Flat (no gradient) — for calmer/Senior-leaning lenses. */
  flat?: boolean;
}) {
  return (
    <div
      className={flat ? "rounded-md border border-border bg-surface-raised p-4" : "rounded-md p-4 text-accent-contrast"}
      style={flat ? undefined : { background: "var(--ml-gradient-hero)", boxShadow: "var(--ml-glow)" }}
    >
      {eyebrow && <div className={`text-[0.8em] ${flat ? "text-text-muted" : "opacity-90"}`}>{eyebrow}</div>}
      <div className={`font-display text-[2em] font-bold leading-tight ${flat ? "text-text" : ""}`}>{value}</div>
      {sub && <div className={`text-[0.84em] ${flat ? "text-text-muted" : "opacity-95"}`}>{sub}</div>}
    </div>
  );
}

export function KeyStat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "warning" | "accent";
  hint?: string;
}) {
  const color =
    tone === "positive" ? "var(--ml-color-positive)"
    : tone === "negative" ? "var(--ml-color-negative)"
    : tone === "warning" ? "var(--ml-color-warning)"
    : tone === "accent" ? "var(--ml-color-accent)"
    : "var(--ml-color-text)";
  return (
    <div className="rounded-md bg-surface-raised p-3">
      <div className="text-[0.72em] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="font-display text-[1.15em] font-bold" style={{ color }}>{value}</div>
      {hint && <div className="mt-0.5 text-[0.72em] text-text-muted">{hint}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "positive" | "negative" | "warning" }) {
  const map: Record<string, string> = {
    neutral: "bg-surface-raised text-text-muted border-border",
    accent: "border-accent text-accent",
    positive: "border-positive text-positive",
    negative: "border-negative text-negative",
    warning: "border-warning text-warning",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72em] font-medium ${map[tone]}`}>{children}</span>;
}

/* ── Controls ───────────────────────────────────────────────────────────── */

export function SliderRow({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
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

export function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2 text-[0.85em] text-text" style={{ cursor: "pointer" }}>
      <span className="grid h-5 w-9 items-center rounded-full px-0.5 transition-colors" style={{ background: on ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)", transitionDuration: "var(--ml-motion-fast)" }}>
        <span className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(16px)" : "translateX(0)", transitionDuration: "var(--ml-motion-fast)" }} />
      </span>
      {label}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5 text-[0.82em]">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="rounded-sm px-3 py-1" style={{ background: value === o.value ? "var(--ml-color-accent)" : "transparent", color: value === o.value ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)", cursor: "pointer" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Bars ───────────────────────────────────────────────────────────────── */

export function Bar({ pct, tone = "accent", height = 10 }: { pct: number; tone?: "accent" | "positive" | "negative" | "warning"; height?: number }) {
  const color = tone === "positive" ? "var(--ml-color-positive)" : tone === "negative" ? "var(--ml-color-negative)" : tone === "warning" ? "var(--ml-color-warning)" : "var(--ml-color-accent)";
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-raised" style={{ height }}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, transitionDuration: "var(--ml-motion-base)" }} />
    </div>
  );
}

export interface StackSeg {
  label: string;
  value: number;
  color: string;
}

/** Horizontal stacked bar (segments sum to `total`), with optional target ticks. */
export function StackedBar({
  segments, total, height = 22, targets = [],
}: {
  segments: StackSeg[];
  total: number;
  height?: number;
  /** Vertical gridlines at these cumulative percentages, e.g. [50, 80] for 50/30/20. */
  targets?: { pct: number; label?: string }[];
}) {
  const denom = total || 1;
  return (
    <div className="relative w-full overflow-hidden rounded-md bg-surface-raised" style={{ height }}>
      <div className="flex h-full w-full">
        {segments.map((s, i) => (
          <div key={i} className="h-full transition-[width]" style={{ width: `${(s.value / denom) * 100}%`, background: s.color, transitionDuration: "var(--ml-motion-base)" }} title={`${s.label}: ${Math.round((s.value / denom) * 100)}%`} />
        ))}
      </div>
      {targets.map((tk, i) => (
        <span key={i} className="absolute top-0 h-full w-0.5" style={{ left: `${tk.pct}%`, background: "var(--ml-color-text)", opacity: 0.55 }} title={tk.label} />
      ))}
    </div>
  );
}

/* ── Radial ─────────────────────────────────────────────────────────────── */

/** Circular progress ring (0–100%). */
export function ProgressRing({
  pct, size = 120, stroke = 12, label, tone = "accent",
}: {
  pct: number; size?: number; stroke?: number; label?: React.ReactNode; tone?: "accent" | "positive" | "warning" | "negative";
}) {
  const r = size / 2 - stroke / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const color = tone === "positive" ? "var(--ml-color-positive)" : tone === "warning" ? "var(--ml-color-warning)" : tone === "negative" ? "var(--ml-color-negative)" : "var(--ml-color-accent)";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ml-color-surface-raised)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(clamped / 100) * circ} ${circ}`} style={{ transition: "stroke-dasharray var(--ml-motion-base)" }} />
        </g>
      </svg>
      {label != null && <div className="absolute grid place-items-center text-center">{label}</div>}
    </div>
  );
}

/** 270° radial gauge for a value against a max (e.g. a score). */
export function Gauge({
  value, max, size = 160, stroke = 14, label, sublabel, tone = "accent",
}: {
  value: number; max: number; size?: number; stroke?: number;
  label?: React.ReactNode; sublabel?: React.ReactNode; tone?: "accent" | "positive" | "warning" | "negative";
}) {
  const r = size / 2 - stroke / 2;
  const circ = 2 * Math.PI * r;
  const sweep = 0.75; // 270°
  const frac = Math.max(0, Math.min(1, max ? value / max : 0));
  const color = tone === "positive" ? "var(--ml-color-positive)" : tone === "warning" ? "var(--ml-color-warning)" : tone === "negative" ? "var(--ml-color-negative)" : "var(--ml-color-accent)";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* start at 135° so the 270° arc opens downward */}
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ml-color-surface-raised)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${sweep * circ} ${circ}`} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${frac * sweep * circ} ${circ}`} style={{ transition: "stroke-dasharray var(--ml-motion-base)" }} />
        </g>
      </svg>
      <div className="absolute grid place-items-center text-center">
        {label != null && <div className="font-display text-[1.4em] font-bold text-text leading-none">{label}</div>}
        {sublabel != null && <div className="mt-1 text-[0.72em] text-text-muted">{sublabel}</div>}
      </div>
    </div>
  );
}

/* ── Sparkline ──────────────────────────────────────────────────────────── */

export function Sparkline({
  points, width = 160, height = 44, tone = "accent", fill = true,
}: {
  points: number[]; width?: number; height?: number; tone?: "accent" | "positive" | "negative"; fill?: boolean;
}) {
  if (points.length < 2) return null;
  const color = tone === "positive" ? "var(--ml-color-positive)" : tone === "negative" ? "var(--ml-color-negative)" : "var(--ml-color-accent)";
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && <path d={area} fill={color} opacity={0.14} />}
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

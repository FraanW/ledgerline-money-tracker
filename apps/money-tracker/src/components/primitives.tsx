"use client";

import React from "react";
import { formatMoney, type Money } from "@ledgerline/types";
import { useThemeId } from "../theme/ThemeProvider";

/** All primitives style themselves only through token-backed utilities. */

export function Card({
  children,
  className = "",
  raised = false,
  interactive = false,
  hero = false,
}: {
  children: React.ReactNode;
  className?: string;
  raised?: boolean;
  /** Adds a subtle hover lift — use on clickable cards (tiles, nav, CTAs). */
  interactive?: boolean;
  /** Largest radius — reserve for marketing hero / CTA surfaces, not dense content cards. */
  hero?: boolean;
}) {
  const radius = hero ? "rounded-lg" : "rounded-md";
  const hover = interactive
    ? "transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-md hover:border-accent cursor-pointer"
    : "";
  return (
    <div
      className={`${radius} border border-border ${raised ? "bg-surface-raised shadow-md" : "bg-surface shadow-sm"} ${hover} ${className}`}
      style={interactive ? { transitionDuration: "var(--ml-motion-base)", transitionTimingFunction: "var(--ml-motion-ease)" } : undefined}
    >
      {children}
    </div>
  );
}

export function MoneyText({
  value,
  tone = "default",
  className = "",
}: {
  value: Money;
  tone?: "default" | "positive" | "negative" | "muted" | "warning";
  className?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "warning"
          ? "text-warning"
          : tone === "muted"
            ? "text-text-muted"
            : "text-text";
  return <span className={`tabular-nums ${toneClass} ${className}`}>{formatMoney(value)}</span>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "positive" | "negative" | "warning";
}) {
  const map: Record<string, string> = {
    neutral: "bg-surface-raised text-text-muted border-border",
    accent: "bg-accent text-accent-contrast border-accent",
    positive: "bg-surface text-positive border-positive",
    negative: "bg-surface text-negative border-negative",
    warning: "bg-surface text-warning border-warning",
  };
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[0.78em] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "solid"
  | "gradient"
  | "soft"
  | "outline"
  | "ghost"
  | "elevated"
  | "glossy"
  | "pill"
  | "link";

export function Button({
  children,
  variant = "primary",
  disabled = false,
  onClick,
  leftIcon,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  leftIcon?: React.ReactNode;
}) {
  const theme = useThemeId();
  // Semantic intents resolve to the per-persona picks:
  // primary  -> Millennial: glossy · Gen Z/Senior: solid
  // secondary-> Millennial: ghost  · Gen Z/Senior: outline
  const v: ButtonVariant =
    variant === "primary"
      ? theme === "millennial"
        ? "glossy"
        : "solid"
      : variant === "secondary"
        ? theme === "millennial"
          ? "ghost"
          : "outline"
        : variant;

  const base =
    "inline-flex cursor-pointer items-center justify-center gap-2 font-medium transition-[transform,opacity,border-color,background-color,box-shadow] active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0";
  const radius = v === "pill" ? "rounded-full" : "rounded-md";
  const pad = v === "link" ? "" : "px-4 py-2";
  const style: React.CSSProperties = { transitionDuration: "var(--ml-motion-fast)" };
  let cls = "";
  switch (v) {
    case "solid":
    case "pill":
      cls = "bg-accent text-accent-contrast hover:opacity-90";
      break;
    case "gradient":
      cls = "text-accent-contrast hover:shadow-md";
      style.background = "var(--ml-gradient-accent)";
      break;
    case "soft":
      cls = "text-accent hover:brightness-110";
      style.background = "color-mix(in srgb, var(--ml-color-accent) 14%, transparent)";
      break;
    case "outline":
      cls = "border-2 border-accent text-accent bg-transparent hover:bg-accent hover:text-accent-contrast";
      break;
    case "ghost":
      cls = "bg-surface-raised text-text border border-border hover:border-accent";
      break;
    case "elevated":
      cls = "bg-surface text-text border border-border shadow-md hover:-translate-y-0.5";
      break;
    case "glossy":
      cls = "text-accent-contrast border border-white/10";
      style.background = "var(--ml-gradient-accent)";
      style.boxShadow = "var(--ml-glow), inset 0 1px 0 rgba(255,255,255,0.35)";
      break;
    case "link":
      cls = "text-accent underline underline-offset-4 hover:opacity-80";
      break;
  }
  return (
    <button className={`${base} ${radius} ${pad} text-[0.9em] ${cls}`} disabled={disabled} onClick={onClick} style={style}>
      {leftIcon}
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: Money;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const theme = useThemeId();
  // Persona-correct eyebrow: Senior never gets uppercase-tracked labels (a
  // legibility cost); Gen Z runs lowercase; Millennial keeps the tracked caps.
  const eyebrow =
    theme === "senior"
      ? "text-[0.85em] font-medium text-text-muted"
      : theme === "genz"
        ? "text-[0.78em] lowercase tracking-tight text-text-muted"
        : "text-[0.78em] uppercase tracking-wide text-text-muted";
  return (
    <div className="flex flex-col gap-1">
      <span className={eyebrow}>{label}</span>
      <MoneyText value={value} tone={tone} className="text-[1.6em] font-bold" />
    </div>
  );
}

export function ScreenShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">
      <header className="mb-[calc(1.25rem*var(--ml-density))] flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7em] font-bold tracking-tight text-text">{title}</h1>
          {subtitle && <p className="mt-1 max-w-prose text-[0.95em] text-text-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="flex flex-col gap-[calc(1rem*var(--ml-density))]">{children}</div>
    </div>
  );
}

/** Persona-aware empty state — icon-in-tinted-circle + headline + body + optional CTA. */
export function EmptyState({
  icon,
  headline,
  body,
  action,
}: {
  icon: React.ReactNode;
  headline: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-[calc(2.5rem*var(--ml-density))] text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-raised text-accent">{icon}</span>
      <div>
        <p className="font-display text-[1.05em] font-bold text-text">{headline}</p>
        <p className="mx-auto mt-1 max-w-xs text-[0.9em] text-text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

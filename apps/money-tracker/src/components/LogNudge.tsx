"use client";

import React, { useState } from "react";
import { useThemeId } from "../theme/ThemeProvider";

const COPY: Record<string, string> = {
  genz: "spent anything today? 👀 log it before you forget fr",
  millennial: "Got 30 seconds? Log today's spends so nothing slips through.",
  senior: "A quick reminder: please log today's expenses.",
};

/**
 * The every-12-hours nudge to log + categorize — the habit loop that makes the
 * monthly report actually accurate. Persona-voiced, dismissible.
 */
export function LogNudge({ onLog }: { onLog?: () => void }) {
  const theme = useThemeId();
  const [show, setShow] = useState(true);
  if (!show) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3" style={{ borderLeft: "4px solid var(--ml-color-accent)", boxShadow: "var(--ml-glow)" }}>
      <span className="text-[0.95em] text-text">{COPY[theme] ?? COPY.millennial}</span>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={onLog} className="rounded-md px-3 py-1.5 text-[0.85em] font-medium text-accent-contrast" style={{ background: "var(--ml-gradient-accent)", cursor: "pointer" }}>
          Log now
        </button>
        <button onClick={() => setShow(false)} className="px-1 text-text-muted" aria-label="Dismiss" style={{ cursor: "pointer" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

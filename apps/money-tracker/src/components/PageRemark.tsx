"use client";

import React from "react";
import { useThemeId } from "../theme/ThemeProvider";
import { screenRemarks, type ScreenKey } from "../mocks/remarks";

/**
 * The persona-voiced page-top hook. Reads the active design direction and shows
 * the matching remark (Gen-Z quip / Millennial warm / Senior plain).
 */
export function PageRemark({ screen }: { screen: ScreenKey }) {
  const theme = useThemeId();
  const text = screenRemarks[screen][theme] ?? screenRemarks[screen].millennial;
  return (
    <div
      className="rounded-md border border-border bg-surface-raised px-4 py-2.5 text-[0.98em] text-text"
      style={{ borderLeft: "4px solid var(--ml-color-accent)", boxShadow: "var(--ml-glow)" }}
    >
      {text}
    </div>
  );
}

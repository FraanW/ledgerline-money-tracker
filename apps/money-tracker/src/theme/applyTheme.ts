import type { CSSProperties } from "react";
import type { ThemeTokens } from "./tokens";

/** Flatten a ThemeTokens object into the --ml-* CSS custom properties the UI reads. */
export function tokensToCssVars(t: ThemeTokens): CSSProperties {
  return {
    "--ml-color-bg": t.color.bg,
    "--ml-color-surface": t.color.surface,
    "--ml-color-surface-raised": t.color.surfaceRaised,
    "--ml-color-border": t.color.border,
    "--ml-color-text": t.color.text,
    "--ml-color-text-muted": t.color.textMuted,
    "--ml-color-accent": t.color.accent,
    "--ml-color-accent-contrast": t.color.accentContrast,
    "--ml-color-accent-2": t.color.accent2,
    "--ml-color-positive": t.color.positive,
    "--ml-color-negative": t.color.negative,
    "--ml-color-warning": t.color.warning,
    "--ml-gradient-hero": t.gradient.hero,
    "--ml-gradient-accent": t.gradient.accent,
    "--ml-glow": t.glow,
    "--ml-radius-sm": t.radius.sm,
    "--ml-radius-md": t.radius.md,
    "--ml-radius-lg": t.radius.lg,
    "--ml-density": t.density,
    "--ml-font-sans": t.font.sans,
    "--ml-font-display": t.font.display,
    "--ml-font-quote": t.font.quote,
    "--ml-font-size-base": t.font.sizeBase,
    "--ml-scale-ratio": t.font.scaleRatio,
    "--ml-line-height": t.font.lineHeight,
    "--ml-font-weight-normal": t.font.weightNormal,
    "--ml-font-weight-medium": t.font.weightMedium,
    "--ml-font-weight-bold": t.font.weightBold,
    "--ml-shadow-sm": t.shadow.sm,
    "--ml-shadow-md": t.shadow.md,
    "--ml-motion-fast": t.motion.fast,
    "--ml-motion-base": t.motion.base,
    "--ml-motion-ease": t.motion.ease,
  } as CSSProperties;
}

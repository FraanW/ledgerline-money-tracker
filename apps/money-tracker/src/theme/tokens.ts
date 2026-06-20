/**
 * The theme-token contract. Every design direction (persona / age band) is a
 * full ThemeTokens object. Components style themselves only via the CSS custom
 * properties these map to (see applyTheme.ts + tailwind.config.ts), so a new
 * direction restyles without restructuring.
 *
 * `millennial` and `genz` are now fully-art-directed creative directions;
 * `senior` stays accessibility-first (creativity here = clarity, not flash).
 */
export interface ThemeTokens {
  color: {
    bg: string;
    surface: string;
    surfaceRaised: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    accentContrast: string;
    /** Secondary accent — used by viz (rings, flow bands, treemap) for variety. */
    accent2: string;
    positive: string;
    negative: string;
    warning: string;
  };
  /** CSS gradient strings for hero surfaces + accent fills. */
  gradient: {
    hero: string;
    accent: string;
  };
  /** Decorative glow/elevation for feature surfaces (Gen-Z strong, Senior none). */
  glow: string;
  radius: { sm: string; md: string; lg: string };
  /** Density scalar: components multiply base spacing by this. */
  density: string;
  font: {
    sans: string;
    /** Optional display font for big expressive numbers/headings. */
    display: string;
    /** Elegant serif for quotes/pull-quotes — classic editorial italic. */
    quote: string;
    sizeBase: string;
    scaleRatio: string;
    lineHeight: string;
    weightNormal: string;
    weightMedium: string;
    weightBold: string;
  };
  shadow: { sm: string; md: string };
  motion: { fast: string; base: string; ease: string };
}

export const THEME_IDS = ["genz", "millennial", "senior"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** MILLENNIAL — elevated: clean + calm, but premium. Single evergreen hue
 *  (accent2 is a muted tint of it, not a second color), gentle depth. */
const millennial: ThemeTokens = {
  color: {
    bg: "#f6f4ee",
    surface: "#ffffff",
    surfaceRaised: "#fbfaf5",
    border: "#e7e1d4",
    text: "#15241d",
    textMuted: "#5c6a61",
    accent: "#157a5f",
    accentContrast: "#ffffff",
    // accent2 is a muted tint of the one green hue (was a separate gold) so viz
    // stays two-band without introducing a second color.
    accent2: "#6aa48f",
    positive: "#1f9d6b",
    negative: "#cf4d43",
    warning: "#bd7d1f",
  },
  gradient: {
    hero: "linear-gradient(135deg, #157a5f 0%, #1f9d6b 52%, #36b9a0 130%)",
    accent: "linear-gradient(135deg, #157a5f 0%, #1f9d6b 100%)",
  },
  glow: "0 10px 40px rgba(21,122,95,0.20)",
  radius: { sm: "8px", md: "14px", lg: "22px" },
  density: "1",
  font: {
    sans: "'Spectral', Georgia, 'Times New Roman', serif",
    display: "'Spectral', Georgia, serif",
    quote: "'Playfair Display', Georgia, 'Times New Roman', serif",
    sizeBase: "16px",
    scaleRatio: "1.3",
    lineHeight: "1.55",
    weightNormal: "300",
    weightMedium: "400",
    weightBold: "600",
  },
  shadow: {
    sm: "0 1px 2px rgba(15,18,34,0.06)",
    md: "0 1px 2px rgba(15,18,34,0.08), 0 12px 32px -8px rgba(15,18,34,0.14)",
  },
  motion: { fast: "120ms", base: "240ms", ease: "cubic-bezier(0.22,1,0.36,1)" },
};

/** GEN Z — loud but disciplined: near-black canvas, ONE electric lime accent
 *  (accent2 is neutral grey), chunky radii, lime glow, springy motion. */
const genz: ThemeTokens = {
  color: {
    bg: "#0a0b0d",
    surface: "#15171b",
    surfaceRaised: "#1d2026",
    border: "#2a2e36",
    text: "#f2f4f5",
    textMuted: "#9aa3ad",
    accent: "#c6ff3a",
    accentContrast: "#0a0b0d",
    accent2: "#e6eaed",
    positive: "#7fd99a",
    negative: "#ff7a85",
    warning: "#e8c95a",
  },
  gradient: {
    hero: "linear-gradient(135deg, #c6ff3a 0%, #8fd64a 100%)",
    accent: "linear-gradient(120deg, #c6ff3a 0%, #b6f53a 100%)",
  },
  glow: "0 0 0 1px rgba(198,255,58,0.22), 0 14px 50px rgba(198,255,58,0.16)",
  radius: { sm: "12px", md: "20px", lg: "30px" },
  density: "0.95",
  font: {
    sans: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
    display: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
    quote: "'Playfair Display', Georgia, 'Times New Roman', serif",
    sizeBase: "15px",
    scaleRatio: "1.4",
    lineHeight: "1.35",
    weightNormal: "400",
    weightMedium: "600",
    weightBold: "700",
  },
  shadow: {
    sm: "0 2px 6px rgba(0,0,0,0.5)",
    md: "0 2px 4px rgba(0,0,0,0.6), 0 18px 60px -12px rgba(177,77,255,0.30)",
  },
  motion: { fast: "100ms", base: "300ms", ease: "cubic-bezier(0.34,1.56,0.64,1)" },
};

/** SENIOR / accessibility-first: large type, high contrast, calm, roomy.
 *  Gradients are near-flat and glow is off — clarity over flash. */
const senior: ThemeTokens = {
  color: {
    bg: "#ffffff",
    surface: "#ffffff",
    surfaceRaised: "#f2f5fa",
    border: "#8b94a6",
    text: "#0a0d12",
    textMuted: "#384150",
    accent: "#13456b",
    accentContrast: "#ffffff",
    // accent2 is a tint of the one navy hue (was a separate green); green now
    // appears only as the +/- positive semantic, not as decoration.
    accent2: "#5e7d99",
    positive: "#0a7d3c",
    negative: "#b3261e",
    warning: "#7a4f00",
  },
  gradient: {
    hero: "linear-gradient(135deg, #13456b 0%, #0e3552 100%)",
    accent: "linear-gradient(0deg, #13456b 0%, #13456b 100%)",
  },
  glow: "none",
  radius: { sm: "8px", md: "12px", lg: "18px" },
  density: "1.25",
  font: {
    sans: "'Josefin Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "'Josefin Sans', ui-sans-serif, system-ui, sans-serif",
    quote: "'Playfair Display', Georgia, 'Times New Roman', serif",
    sizeBase: "20px",
    scaleRatio: "1.2",
    lineHeight: "1.7",
    weightNormal: "500",
    weightMedium: "600",
    weightBold: "700",
  },
  shadow: {
    sm: "0 1px 2px rgba(10,13,18,0.1)",
    md: "0 4px 12px rgba(10,13,18,0.14)",
  },
  motion: { fast: "160ms", base: "300ms", ease: "ease-out" },
};

export const THEMES: Record<ThemeId, ThemeTokens> = { genz, millennial, senior };

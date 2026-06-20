import type { Config } from "tailwindcss";

/**
 * Every visual value is a token-backed CSS custom property (--ml-*), set per
 * theme by the ThemeProvider. Components reference these utilities only — never
 * hardcoded colors — so a new design direction (Gen-Z / Senior) restyles by
 * swapping token values, not by editing components. See THEMING.md.
 */
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./.storybook/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--ml-color-bg)",
        surface: "var(--ml-color-surface)",
        "surface-raised": "var(--ml-color-surface-raised)",
        border: "var(--ml-color-border)",
        text: {
          DEFAULT: "var(--ml-color-text)",
          muted: "var(--ml-color-text-muted)",
        },
        accent: {
          DEFAULT: "var(--ml-color-accent)",
          contrast: "var(--ml-color-accent-contrast)",
          2: "var(--ml-color-accent-2)",
        },
        positive: "var(--ml-color-positive)",
        negative: "var(--ml-color-negative)",
        warning: "var(--ml-color-warning)",
      },
      borderRadius: {
        sm: "var(--ml-radius-sm)",
        md: "var(--ml-radius-md)",
        lg: "var(--ml-radius-lg)",
      },
      fontFamily: {
        sans: "var(--ml-font-sans)",
        display: "var(--ml-font-display)",
        quote: "var(--ml-font-quote)",
      },
      fontWeight: {
        normal: "var(--ml-font-weight-normal)" as unknown as string,
        medium: "var(--ml-font-weight-medium)" as unknown as string,
        bold: "var(--ml-font-weight-bold)" as unknown as string,
      },
      boxShadow: {
        sm: "var(--ml-shadow-sm)",
        md: "var(--ml-shadow-md)",
      },
      transitionDuration: {
        fast: "var(--ml-motion-fast)",
        base: "var(--ml-motion-base)",
      },
    },
  },
  plugins: [],
};

export default config;

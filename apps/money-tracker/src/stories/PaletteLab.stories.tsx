import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

/**
 * Palette Lab — pick the colors. Each option shows its swatches + a tiny live
 * preview (balance, button, +/− figures) so you can judge it in context.
 * Tell me the winner per persona and I'll bake it into the tokens.
 */
const meta: Meta = {
  title: "Primitives Lab/Palettes",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

interface Pal {
  name: string;
  blurb: string;
  current?: boolean;
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  accent2: string;
  positive: string;
  negative: string;
}

// Gen-Z is disciplined now: near-black base + ONE bold accent + neutrals.
// Semantic colours stay muted so the accent is the only loud thing.
const gzNeutral = { surface: "#15171b", border: "#2a2e36", text: "#f2f4f5", textMuted: "#9aa3ad", accentContrast: "#0a0b0d", accent2: "#e6eaed", positive: "#7fd99a", negative: "#ff7a85" };
const gz = (name: string, blurb: string, accent: string, opts: Partial<Pal> = {}): Pal => ({ name, blurb, bg: "#0a0b0d", accent, ...gzNeutral, ...opts });

const GENZ: Pal[] = [
  gz("Lime Mono", "current · one bold lime, that's it", "#c6ff3a", { current: true }),
  gz("Volt", "single electric blue", "#4d8bff"),
  gz("Magenta", "single hot magenta", "#ff2e7e"),
  gz("Tangerine", "single warm orange", "#ff7a1a"),
  gz("Violet", "single electric violet", "#9b5cff"),
  gz("Mint", "single mint green", "#29e0a0", { positive: "#8be0b0" }),
  gz("Cyan", "single ice cyan", "#22d3ee"),
  gz("Hi-Vis", "yellow on black, loud", "#ffe600", { bg: "#0a0a0a", surface: "#161616", border: "#2a2a2a" }),
];

// Single-hue discipline: one brand accent per palette. accent2 is a MUTED TINT
// of that same hue (viz needs two bands) — never a second color. +/- stay only
// as gain/loss meaning, sitting quiet.
const MILLENNIAL: Pal[] = [
  { name: "Evergreen", blurb: "current · one deep green + neutrals", current: true, bg: "#f6f4ee", surface: "#ffffff", border: "#e7e1d4", text: "#15241d", textMuted: "#5c6a61", accent: "#157a5f", accentContrast: "#ffffff", accent2: "#6aa48f", positive: "#1f9d6b", negative: "#cf4d43" },
  { name: "Ink Teal", blurb: "one calm teal + neutrals", bg: "#f4f6f6", surface: "#ffffff", border: "#e3e8e7", text: "#11201f", textMuted: "#566763", accent: "#0f766e", accentContrast: "#ffffff", accent2: "#6bb0a8", positive: "#15a06b", negative: "#d4493f" },
  { name: "Slate", blurb: "one muted indigo-slate + neutrals", bg: "#f7f7f9", surface: "#ffffff", border: "#e6e7ec", text: "#1a1d29", textMuted: "#5f6573", accent: "#3b4a6b", accentContrast: "#ffffff", accent2: "#8893ad", positive: "#1f9d6b", negative: "#e5544b" },
  { name: "Plum", blurb: "one rich plum + neutrals", bg: "#faf6f4", surface: "#ffffff", border: "#ece2e6", text: "#241620", textMuted: "#6b5963", accent: "#8b3a62", accentContrast: "#ffffff", accent2: "#c08aa3", positive: "#1f9d6b", negative: "#cf4d43" },
  { name: "Soft Lilac", blurb: "Harshini's pick · one pastel lilac + neutrals", bg: "#fdf6fb", surface: "#ffffff", border: "#f0e6ee", text: "#3a2f4f", textMuted: "#8b8398", accent: "#9b7ad9", accentContrast: "#ffffff", accent2: "#c9b8ec", positive: "#5cc79a", negative: "#ef9aa2" },
  { name: "Terra Night", blurb: "Harshini's pick · one warm terracotta, dark base", bg: "#1a1612", surface: "#241e18", border: "#3a3128", text: "#f0e9df", textMuted: "#b3a896", accent: "#d98f5a", accentContrast: "#1a1612", accent2: "#b8946f", positive: "#8ab17d", negative: "#c75b4a" },
  { name: "Sage", blurb: "one soft sage + neutrals", bg: "#f4f5f1", surface: "#ffffff", border: "#e4e6df", text: "#232a23", textMuted: "#5f6a5c", accent: "#5b7553", accentContrast: "#ffffff", accent2: "#97aa8f", positive: "#1f9d6b", negative: "#cf4d43" },
  { name: "Navy", blurb: "one deep navy + neutrals", bg: "#f5f4f0", surface: "#ffffff", border: "#e6e3da", text: "#14202e", textMuted: "#56606e", accent: "#1e3a5f", accentContrast: "#ffffff", accent2: "#6f87a3", positive: "#1f9d6b", negative: "#cf4d43" },
  { name: "Mocha", blurb: "one warm mocha + neutrals", bg: "#f6f1ea", surface: "#fffdf9", border: "#e9ded0", text: "#2a211a", textMuted: "#6b5d4f", accent: "#7b5235", accentContrast: "#ffffff", accent2: "#b59576", positive: "#1f9d6b", negative: "#cf4d43" },
  { name: "Graphite (dark)", blurb: "one mint accent, dark base", bg: "#16181c", surface: "#1f2228", border: "#2e333b", text: "#eef1f4", textMuted: "#9aa4af", accent: "#34d399", accentContrast: "#0c1410", accent2: "#7fcdb0", positive: "#34d399", negative: "#f87171" },
];

// Senior stays single-hue too — accent2 is a lighter tint of the one accent.
const SENIOR: Pal[] = [
  { name: "Navy", blurb: "current · one bank navy + neutrals", current: true, bg: "#ffffff", surface: "#ffffff", border: "#8a97a8", text: "#0a0d12", textMuted: "#34465a", accent: "#13456b", accentContrast: "#ffffff", accent2: "#5e7d99", positive: "#0a7d3c", negative: "#b3261e" },
  { name: "Forest", blurb: "one deep green + neutrals", bg: "#ffffff", surface: "#ffffff", border: "#8f9aa6", text: "#0a120a", textMuted: "#3a4a3f", accent: "#1b5e20", accentContrast: "#ffffff", accent2: "#6f9a73", positive: "#1b7a32", negative: "#b3261e" },
  { name: "Royal", blurb: "one royal indigo + neutrals", bg: "#ffffff", surface: "#ffffff", border: "#909bb0", text: "#0c1230", textMuted: "#3b4258", accent: "#283593", accentContrast: "#ffffff", accent2: "#7079b3", positive: "#1b7a32", negative: "#b3261e" },
  { name: "Burgundy", blurb: "one warm burgundy + neutrals", bg: "#ffffff", surface: "#ffffff", border: "#9a8f93", text: "#1c1216", textMuted: "#4a3b40", accent: "#7a1f2b", accentContrast: "#ffffff", accent2: "#b07480", positive: "#1b7a32", negative: "#b3261e" },
  { name: "Teal", blurb: "one deep teal + neutrals", bg: "#ffffff", surface: "#ffffff", border: "#8a97a0", text: "#0c1a1d", textMuted: "#38484c", accent: "#0e5b66", accentContrast: "#ffffff", accent2: "#5f9098", positive: "#0a7d3c", negative: "#b3261e" },
  { name: "Charcoal (dark)", blurb: "one amber accent, dark base", bg: "#14171a", surface: "#1e2226", border: "#44505a", text: "#f3f6f8", textMuted: "#b7c0c8", accent: "#f0a830", accentContrast: "#14171a", accent2: "#c79a52", positive: "#5cd07a", negative: "#ff7a7a" },
];

function Swatch({ c }: { c: string }) {
  return <span className="inline-block h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: c }} />;
}

function PaletteCard({ p }: { p: Pal }) {
  return (
    <div className="rounded-lg border border-[#e3e3e8] bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-bold text-[#15161c]">{p.name}</span>
        {p.current && <span className="rounded-sm bg-[#eef0f3] px-1.5 py-0.5 text-[0.65em] font-medium text-[#5b6472]">CURRENT</span>}
      </div>
      <p className="mb-3 text-[0.78em] text-[#5b6472]">{p.blurb}</p>
      <div className="mb-3 flex gap-1.5">
        <Swatch c={p.bg} /><Swatch c={p.surface} /><Swatch c={p.accent} /><Swatch c={p.accent2} /><Swatch c={p.positive} /><Swatch c={p.negative} />
      </div>
      {/* live preview using the palette */}
      <div className="rounded-md p-3" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
        <div style={{ background: p.surface, border: `1px solid ${p.border}` }} className="rounded-md p-3">
          <div className="text-[0.62em] uppercase tracking-wide" style={{ color: p.textMuted }}>balance left</div>
          <div className="text-[1.5em] font-bold" style={{ color: p.text, fontVariantNumeric: "tabular-nums" }}>₹1,49,500</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md px-2.5 py-1 text-[0.72em] font-medium" style={{ background: p.accent, color: p.accentContrast }}>Allocate</span>
            <span className="rounded-full px-2 py-0.5 text-[0.7em] font-medium" style={{ background: p.accent2, color: p.accentContrast }}>Goal</span>
            <span className="text-[0.75em] font-medium" style={{ color: p.positive }}>+12%</span>
            <span className="text-[0.75em] font-medium" style={{ color: p.negative }}>−₹980</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, palettes }: { title: string; palettes: Pal[] }) {
  return (
    <div className="mb-8">
      <h2 className="mb-4 text-[1.4em] font-bold text-[#15161c]">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {palettes.map((p) => <PaletteCard key={p.name} p={p} />)}
      </div>
    </div>
  );
}

export const GenZ: Story = {
  name: "Gen Z — palette options",
  render: () => <div className="mx-auto max-w-5xl bg-[#fafafa] p-6 md:p-10"><Section title="Gen Z palettes" palettes={GENZ} /></div>,
};

export const Millennial: Story = {
  name: "Millennial — palette options",
  render: () => <div className="mx-auto max-w-5xl bg-[#fafafa] p-6 md:p-10"><Section title="Millennial palettes" palettes={MILLENNIAL} /></div>,
};

export const Senior: Story = {
  name: "Senior — palette options",
  render: () => <div className="mx-auto max-w-5xl bg-[#fafafa] p-6 md:p-10"><Section title="Senior palettes" palettes={SENIOR} /></div>,
};

import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Card, Badge } from "../components/primitives";

/**
 * Font Lab — pick the typefaces. The Playfair quote serif stays (you love it).
 * These are candidate body/display faces for Millennial and Senior — each
 * sample shows a heading, body copy, and a money figure in the real font.
 */
const meta: Meta = {
  title: "Primitives Lab/Fonts",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

const MILLENNIAL = [
  { name: "Inter", stack: "'Inter', sans-serif", note: "current · neutral fintech workhorse" },
  { name: "Plus Jakarta Sans", stack: "'Plus Jakarta Sans', sans-serif", note: "friendly, rounded, modern startup feel" },
  { name: "Manrope", stack: "'Manrope', sans-serif", note: "geometric, crisp, a touch premium" },
  { name: "Figtree", stack: "'Figtree', sans-serif", note: "warm, approachable, great at small sizes" },
  { name: "Hanken Grotesk", stack: "'Hanken Grotesk', sans-serif", note: "characterful grotesk, distinctive" },
  { name: "DM Sans", stack: "'DM Sans', sans-serif", note: "low-contrast, calm, very clean" },
];

const GENZ = [
  { name: "Space Grotesk", stack: "'Space Grotesk', sans-serif", note: "current · techy, geometric, intentional" },
  { name: "Unbounded", stack: "'Unbounded', sans-serif", note: "loud, rounded, very online — maximum personality" },
  { name: "Bricolage Grotesque", stack: "'Bricolage Grotesque', sans-serif", note: "quirky contemporary grotesk, editorial-cool" },
  { name: "Syne", stack: "'Syne', sans-serif", note: "art-gallery weird, distinctive headlines" },
  { name: "Outfit", stack: "'Outfit', sans-serif", note: "clean geometric, the 'safe but modern' pick" },
];

const SENIOR = [
  { name: "Atkinson Hyperlegible", stack: "'Atkinson Hyperlegible', sans-serif", note: "current · built to disambiguate glyphs" },
  { name: "Lexend", stack: "'Lexend', sans-serif", note: "engineered for reading proficiency — strong senior pick" },
  { name: "Libre Franklin", stack: "'Libre Franklin', sans-serif", note: "sturdy, highly legible, classic" },
  { name: "IBM Plex Sans", stack: "'IBM Plex Sans', sans-serif", note: "clear, even, institutional trust" },
];

function Sample({ name, stack, note }: { name: string; stack: string; note: string }) {
  return (
    <Card className="p-5" interactive>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-text" style={{ fontFamily: stack }}>{name}</span>
        <Badge tone="neutral">aA</Badge>
      </div>
      <div style={{ fontFamily: stack }}>
        <div className="text-[1.6em] font-bold tracking-tight text-text">Where did my money go?</div>
        <p className="mt-1 text-[0.95em] text-text-muted">
          Your money lives in envelopes — you can only spend what&apos;s inside, so the budget actually holds.
        </p>
        <div className="mt-2 text-[1.4em] font-bold tabular-nums text-text">₹1,49,500 · ₹14,250 left</div>
      </div>
      <p className="mt-3 text-[0.78em] text-text-muted">{note}</p>
    </Card>
  );
}

const THIN = [
  { name: "Raleway", stack: "'Raleway', sans-serif", note: "thin geometric — elegant, airy headlines" },
  { name: "Jost", stack: "'Jost', sans-serif", note: "Futura-like, light & clean" },
  { name: "Josefin Sans", stack: "'Josefin Sans', sans-serif", note: "tall, fashion-y, very light" },
  { name: "Poppins (Light)", stack: "'Poppins', sans-serif", note: "geometric, light weight reads soft" },
  { name: "Fraunces (Light)", stack: "'Fraunces', serif", note: "soft elegant serif — pairs with Playfair quotes" },
  { name: "Spectral (Light)", stack: "'Spectral', serif", note: "refined editorial serif, reads light" },
  { name: "Newsreader (Light)", stack: "'Newsreader', serif", note: "magazine serif, graceful at light weights" },
];

/** Light-weight sample so thin faces actually look thin (no bold override). */
function LightSample({ name, stack, note }: { name: string; stack: string; note: string }) {
  return (
    <Card className="p-5" interactive>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-text" style={{ fontFamily: stack, fontWeight: 500 }}>{name}</span>
        <Badge tone="neutral">aA</Badge>
      </div>
      <div style={{ fontFamily: stack }}>
        <div className="text-[1.7em] text-text" style={{ fontWeight: 300, letterSpacing: "-0.01em" }}>Where did my money go?</div>
        <p className="mt-1 text-[0.98em] text-text-muted" style={{ fontWeight: 300 }}>
          Your money lives in envelopes — you can only spend what&apos;s inside, so the budget actually holds.
        </p>
        <div className="mt-2 text-[1.5em] tabular-nums text-text" style={{ fontWeight: 400 }}>₹1,49,500 · ₹14,250 left</div>
      </div>
      <p className="mt-3 text-[0.78em] text-text-muted">{note}</p>
    </Card>
  );
}

export const Thin: Story = {
  name: "Thin & refined (any persona)",
  render: () => (
    <div className="mx-auto max-w-4xl bg-bg p-6 text-text md:p-10">
      <h2 className="text-[1.6em] text-text" style={{ fontWeight: 300, letterSpacing: "-0.01em" }}>Thin &amp; refined</h2>
      <p className="mb-6 text-[0.95em] text-text-muted">Lighter, airier faces — rendered at light weights so you can see it. The serifs pair beautifully with the Playfair quote type.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {THIN.map((f) => <LightSample key={f.name} {...f} />)}
      </div>
    </div>
  ),
};

export const GenZ: Story = {
  name: "Gen Z — font options",
  render: () => (
    <div className="mx-auto max-w-4xl bg-bg p-6 text-text md:p-10">
      <h2 className="font-display text-[1.6em] font-bold tracking-tight">Gen Z — expressive display options</h2>
      <p className="mb-6 text-[0.95em] text-text-muted">Bold and characterful — pick one. (Best viewed under the Gen Z theme.)</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {GENZ.map((f) => <Sample key={f.name} {...f} />)}
      </div>
    </div>
  ),
};

export const Millennial: Story = {
  name: "Millennial — font options",
  render: () => (
    <div className="mx-auto max-w-4xl bg-bg p-6 text-text md:p-10">
      <h2 className="font-display text-[1.6em] font-bold tracking-tight">Millennial — body / display options</h2>
      <p className="mb-6 text-[0.95em] text-text-muted">Pick one. (Quote serif = Playfair Display, unchanged.)</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MILLENNIAL.map((f) => <Sample key={f.name} {...f} />)}
      </div>
    </div>
  ),
};

export const Senior: Story = {
  name: "Senior — font options",
  render: () => (
    <div className="mx-auto max-w-4xl bg-bg p-6 text-text md:p-10">
      <h2 className="font-display text-[1.6em] font-bold tracking-tight">Senior — legibility-first options</h2>
      <p className="mb-6 text-[0.95em] text-text-muted">All chosen for high legibility. Pick one.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SENIOR.map((f) => <Sample key={f.name} {...f} />)}
      </div>
    </div>
  ),
};

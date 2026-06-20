import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Button, Card, type ButtonVariant } from "../components/primitives";
import { Icon } from "../components/Icon";

/**
 * Button Lab — pick a default button style. Flip the Theme toolbar to see each
 * variant across Gen Z / Millennial / Senior, then tell me which one wins.
 */
const meta: Meta = {
  title: "Primitives Lab/Buttons",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

const VARIANTS: { v: ButtonVariant; label: string; blurb: string }[] = [
  { v: "primary", label: "Primary (solid)", blurb: "Current default — flat accent fill." },
  { v: "gradient", label: "Gradient", blurb: "Accent gradient fill, lifts on hover." },
  { v: "glossy", label: "Glossy", blurb: "Gradient + inner highlight + glow. The fancy one." },
  { v: "soft", label: "Soft", blurb: "Tinted accent bg, accent text — calm, modern." },
  { v: "outline", label: "Outline", blurb: "Bordered, fills on hover." },
  { v: "elevated", label: "Elevated", blurb: "Surface + shadow, lifts on hover." },
  { v: "ghost", label: "Ghost", blurb: "Quiet secondary." },
  { v: "pill", label: "Pill", blurb: "Solid, fully rounded." },
  { v: "link", label: "Link", blurb: "Inline text action." },
];

export const AllVariants: Story = {
  render: () => (
    <div className="mx-auto max-w-4xl bg-bg p-6 text-text md:p-10">
      <h2 className="font-display text-[1.6em] font-bold tracking-tight">Button variants</h2>
      <p className="mb-6 text-[0.95em] text-text-muted">Same label, nine treatments. Flip the Theme toolbar to compare across personas. Each card shows: default · with icon · disabled.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VARIANTS.map(({ v, label, blurb }) => (
          <Card key={v} className="p-5">
            <div className="mb-1 font-bold text-text">{label}</div>
            <p className="mb-4 text-[0.8em] text-text-muted">{blurb}</p>
            <div className="flex flex-col items-start gap-3">
              <Button variant={v}>Allocate income</Button>
              <Button variant={v} leftIcon={<Icon name="budget" emoji="💸" size={16} />}>
                Budget
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  ),
};

export const SideBySide: Story = {
  name: "All in a row",
  render: () => (
    <div className="mx-auto max-w-4xl bg-bg p-6 text-text md:p-10">
      <h2 className="mb-5 font-display text-[1.4em] font-bold tracking-tight">Quick compare</h2>
      <div className="flex flex-wrap items-center gap-3">
        {VARIANTS.map(({ v, label }) => (
          <Button key={v} variant={v}>
            {label.split(" ")[0]}
          </Button>
        ))}
      </div>
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Card, Badge } from "../components/primitives";
import { glossary } from "../mocks/glossary";

/**
 * The Gen-Z money dictionary — every slang term wired to the real concept it
 * means. This is the decode path: anywhere slang appears in the UI, it links
 * back here. Flip the Theme toolbar to see it in each design direction.
 */
const meta: Meta = {
  title: "Foundations/Gen-Z Glossary",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

export const Glossary: Story = {
  render: () => (
    <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">
      <h2 className="font-display text-[1.5em] font-bold text-text">Money, but make it make sense</h2>
      <p className="mb-5 text-[0.95em] text-text-muted">
        The slang you&apos;ll see around the app, decoded to what it actually means. Every term maps to a real
        Money Tracker concept — so it&apos;s fun, never confusing.
      </p>
      <div className="flex flex-col gap-[calc(0.6rem*var(--ml-density))]">
        {glossary.map((g) => (
          <Card key={g.term} className="p-[calc(0.9rem*var(--ml-density))]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className="font-display text-[1.05em] font-bold text-text"
                style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "4px" }}
              >
                {g.term}
              </span>
              <Badge tone="accent">{g.mapsTo}</Badge>
            </div>
            <p className="mt-1.5 text-[0.9em] text-text-muted">{g.meaning}</p>
          </Card>
        ))}
      </div>
    </div>
  ),
};

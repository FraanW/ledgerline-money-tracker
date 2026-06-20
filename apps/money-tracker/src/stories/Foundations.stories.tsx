import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Card, Badge, Button, MoneyText, Stat } from "../components/primitives";
import { Quote } from "../components/Quote";
import { fromRupees } from "@ledgerline/types";

/**
 * Foundations — the token-driven primitives. Flip the Theme toolbar (top bar)
 * between Gen Z / Millennial / Senior to see the same components restyle.
 */
const meta: Meta = {
  title: "Foundations/Tokens & Primitives",
};
export default meta;

type Story = StoryObj;

export const Primitives: Story = {
  render: () => (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-[1.1em] font-bold text-text">Money</h3>
        <div className="flex gap-4">
          <MoneyText value={fromRupees(82000)} tone="positive" className="text-[1.4em] font-bold" />
          <MoneyText value={fromRupees(2480)} className="text-[1.4em] font-bold" />
          <MoneyText value={fromRupees(14250)} tone="warning" className="text-[1.4em] font-bold" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[1.1em] font-bold text-text">Badges</h3>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Groceries</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="positive">funded</Badge>
          <Badge tone="negative">empty</Badge>
          <Badge tone="warning">Unallocated</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[1.1em] font-bold text-text">Buttons</h3>
        <div className="flex gap-3">
          <Button>Allocate income</Button>
          <Button variant="ghost">Move money</Button>
          <Button disabled>Blocked</Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[1.1em] font-bold text-text">Quote typography</h3>
        <Card className="p-6">
          <Quote cite="your month, in one line">Rent took the biggest bite this month — 49% of everything you spent.</Quote>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[1.1em] font-bold text-text">Stats &amp; Card</h3>
        <Card className="p-6">
          <div className="flex justify-between">
            <Stat label="Budgeted" value={fromRupees(40450)} />
            <Stat label="Unallocated" value={fromRupees(14250)} tone="warning" />
          </div>
        </Card>
      </section>
    </div>
  ),
};

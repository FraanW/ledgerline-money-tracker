import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { MakeRoom } from "../components/makeroom/MakeRoom";

const meta: Meta = {
  title: "Make Room/Cover an Expense",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">{children}</div>;
}

export const Absorbable: Story = {
  name: "Absorbable (from spare room)",
  render: () => (
    <Frame>
      <MakeRoom initialWhat="Riya's birthday gift" initialAmount={2500} />
    </Frame>
  ),
};

export const Stretched: Story = {
  name: "Stretched (bites the plan + recovery)",
  render: () => (
    <Frame>
      <MakeRoom initialWhat="Surprise weekend trip" initialAmount={12000} />
    </Frame>
  ),
};

export const Recurring: Story = {
  name: "Recurring (sinking-fund nudge)",
  render: () => (
    <Frame>
      <MakeRoom initialWhat="Friends' birthdays" initialAmount={2500} initialRecurring initialPeriodMonths={12} />
    </Frame>
  ),
};

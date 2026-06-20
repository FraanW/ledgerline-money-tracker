import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { FiftyThirtyTwentyBands } from "../components/lens/methods/FiftyThirtyTwentyBands";
import { ToBeAssigned } from "../components/lens/methods/ToBeAssigned";
import { YearsToFi } from "../components/lens/methods/YearsToFi";
import { CashStackEnvelopes } from "../components/lens/methods/CashStackEnvelopes";
import { KakeiboReflection } from "../components/lens/methods/KakeiboReflection";
import { ThirtyDayList } from "../components/lens/methods/ThirtyDayList";

const meta: Meta = {
  title: "Lenses/Operational Methods",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">{children}</div>;
}

export const FiftyThirtyTwentyBands_: Story = {
  name: "50/30/20 Bands — Warren",
  render: () => (
    <Frame>
      <FiftyThirtyTwentyBands />
    </Frame>
  ),
};

export const ToBeAssigned_: Story = {
  name: "To Be Assigned — YNAB Zero-Based",
  render: () => (
    <Frame>
      <ToBeAssigned />
    </Frame>
  ),
};

export const YearsToFi_: Story = {
  name: "Years-to-FI — FIRE / 4% Rule",
  render: () => (
    <Frame>
      <YearsToFi />
    </Frame>
  ),
};

export const CashStackEnvelopes_: Story = {
  name: "Cash-Stack Envelopes — Envelope Method",
  render: () => (
    <Frame>
      <CashStackEnvelopes />
    </Frame>
  ),
};

export const KakeiboReflection_: Story = {
  name: "Kakeibo Reflection — Hani Motoko",
  render: () => (
    <Frame>
      <KakeiboReflection />
    </Frame>
  ),
};

export const ThirtyDayList_: Story = {
  name: "30-Day Cooling-Off List",
  render: () => (
    <Frame>
      <ThirtyDayList />
    </Frame>
  ),
};

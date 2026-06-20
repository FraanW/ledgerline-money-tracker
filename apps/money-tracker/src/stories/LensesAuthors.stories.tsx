import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { SnowballCoach } from "../components/lens/authors/SnowballCoach";
import { ConsciousSpendingPlan } from "../components/lens/authors/ConsciousSpendingPlan";
import { CostDragProjector } from "../components/lens/authors/CostDragProjector";
import { AccumulatorScore } from "../components/lens/authors/AccumulatorScore";
import { HoursOfLife } from "../components/lens/authors/HoursOfLife";
import { PayYourselfFirst } from "../components/lens/authors/PayYourselfFirst";
import { LatteFactorFinder } from "../components/lens/authors/LatteFactorFinder";
import { TimeBuckets } from "../components/lens/authors/TimeBuckets";

const meta: Meta = {
  title: "Lenses/Canon Authors",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">{children}</div>;
}

export const SnowballCoach_: Story = {
  name: "Snowball Coach — Ramsey",
  render: () => (
    <Frame>
      <SnowballCoach />
    </Frame>
  ),
};

export const ConsciousSpendingPlan_: Story = {
  name: "Conscious Spending Plan — Sethi",
  render: () => (
    <Frame>
      <ConsciousSpendingPlan />
    </Frame>
  ),
};

export const CostDragProjector_: Story = {
  name: "Cost Drag Projector — Bogle",
  render: () => (
    <Frame>
      <CostDragProjector />
    </Frame>
  ),
};

export const AccumulatorScore_: Story = {
  name: "Accumulator Score — Millionaire Next Door",
  render: () => (
    <Frame>
      <AccumulatorScore />
    </Frame>
  ),
};

export const HoursOfLife_: Story = {
  name: "Hours of Life — Your Money or Your Life",
  render: () => (
    <Frame>
      <HoursOfLife />
    </Frame>
  ),
};

export const PayYourselfFirst_: Story = {
  name: "Pay-Yourself-First — Clason & Bach",
  render: () => (
    <Frame>
      <PayYourselfFirst />
    </Frame>
  ),
};

export const LatteFactorFinder_: Story = {
  name: "Latte Factor Finder — Bach",
  render: () => (
    <Frame>
      <LatteFactorFinder />
    </Frame>
  ),
};

export const TimeBuckets_: Story = {
  name: "Time Buckets — Die With Zero",
  render: () => (
    <Frame>
      <TimeBuckets />
    </Frame>
  ),
};

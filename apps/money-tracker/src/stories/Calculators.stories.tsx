import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { SipCalculator } from "../components/calculators/SipCalculator";
import { GoalPlanner } from "../components/calculators/GoalPlanner";
import { PurchaseGoalPlanner } from "../components/calculators/PurchaseGoalPlanner";
import { CompoundingLesson } from "../components/calculators/CompoundingLesson";
import { RunwayCalculator } from "../components/calculators/RunwayCalculator";

const meta: Meta = {
  title: "Calculators/Interactive",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">{children}</div>;
}

export const SIP: Story = {
  name: "SIP / Lumpsum Calculator",
  render: () => (
    <Frame>
      <SipCalculator />
    </Frame>
  ),
};

export const Goal: Story = {
  name: "Goal Planner",
  render: () => (
    <Frame>
      <GoalPlanner />
    </Frame>
  ),
};

export const PurchaseGoal: Story = {
  name: "Purchase Goal (save for a thing)",
  render: () => (
    <Frame>
      <PurchaseGoalPlanner />
    </Frame>
  ),
};

export const Runway: Story = {
  name: "Runway / Emergency Fund",
  render: () => (
    <Frame>
      <RunwayCalculator />
    </Frame>
  ),
};

export const Compounding: Story = {
  name: "Compounding (Housel lens)",
  render: () => (
    <Frame>
      <CompoundingLesson />
    </Frame>
  ),
};

import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { FungibilitySweep } from "../components/lens/behavioral/FungibilitySweep";
import { ReferenceFramedBudget } from "../components/lens/behavioral/ReferenceFramedBudget";
import { FutureSelfLock } from "../components/lens/behavioral/FutureSelfLock";
import { SubscriptionLeakDetector } from "../components/lens/behavioral/SubscriptionLeakDetector";
import { RaiseCatcher } from "../components/lens/behavioral/RaiseCatcher";
import { PainRestorer } from "../components/lens/behavioral/PainRestorer";
import { FreeTrapTracker } from "../components/lens/behavioral/FreeTrapTracker";
import { AnchorReset } from "../components/lens/behavioral/AnchorReset";

const meta: Meta = {
  title: "Lenses/Behavioral Science",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">{children}</div>;
}

export const FungibilitySweep_: Story = {
  name: "Fungibility Sweep — Mental Accounting",
  render: () => (
    <Frame>
      <FungibilitySweep />
    </Frame>
  ),
};

export const ReferenceFramedBudget_: Story = {
  name: "Reference-Framed Budget — Loss Aversion",
  render: () => (
    <Frame>
      <ReferenceFramedBudget />
    </Frame>
  ),
};

export const FutureSelfLock_: Story = {
  name: "Future-Self Commitment Lock — Present Bias",
  render: () => (
    <Frame>
      <FutureSelfLock />
    </Frame>
  ),
};

export const SubscriptionLeakDetector_: Story = {
  name: "Subscription Leak Detector — Endowment Effect",
  render: () => (
    <Frame>
      <SubscriptionLeakDetector />
    </Frame>
  ),
};

export const RaiseCatcher_: Story = {
  name: "Raise Catcher — Save More Tomorrow",
  render: () => (
    <Frame>
      <RaiseCatcher />
    </Frame>
  ),
};

export const PainRestorer_: Story = {
  name: "Pain Restorer — Pain of Paying",
  render: () => (
    <Frame>
      <PainRestorer />
    </Frame>
  ),
};

export const FreeTrapTracker_: Story = {
  name: "Free-Trap Tracker — Zero-Price Effect",
  render: () => (
    <Frame>
      <FreeTrapTracker />
    </Frame>
  ),
};

export const AnchorReset_: Story = {
  name: "Anchor Reset — Anchoring",
  render: () => (
    <Frame>
      <AnchorReset />
    </Frame>
  ),
};

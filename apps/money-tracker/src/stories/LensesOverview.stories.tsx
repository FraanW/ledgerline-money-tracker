import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Icon } from "../components/Icon";

const meta: Meta = {
  title: "Lenses/Overview",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

type Lens = { group: string; name: string; author: string };
const LENSES: Lens[] = [
  {
    "group": "Canon Authors",
    "name": "Snowball Coach",
    "author": "Ramsey"
  },
  {
    "group": "Canon Authors",
    "name": "Conscious Spending Plan",
    "author": "Sethi"
  },
  {
    "group": "Canon Authors",
    "name": "Cost Drag Projector",
    "author": "Bogle"
  },
  {
    "group": "Canon Authors",
    "name": "Accumulator Score",
    "author": "Millionaire Next Door"
  },
  {
    "group": "Canon Authors",
    "name": "Hours of Life",
    "author": "Your Money or Your Life"
  },
  {
    "group": "Canon Authors",
    "name": "Pay-Yourself-First",
    "author": "Clason & Bach"
  },
  {
    "group": "Canon Authors",
    "name": "Latte Factor Finder",
    "author": "Bach"
  },
  {
    "group": "Canon Authors",
    "name": "Time Buckets",
    "author": "Die With Zero"
  },
  {
    "group": "Behavioral Science",
    "name": "Fungibility Sweep",
    "author": "Mental Accounting"
  },
  {
    "group": "Behavioral Science",
    "name": "Reference-Framed Budget",
    "author": "Loss Aversion"
  },
  {
    "group": "Behavioral Science",
    "name": "Future-Self Commitment Lock",
    "author": "Present Bias"
  },
  {
    "group": "Behavioral Science",
    "name": "Subscription Leak Detector",
    "author": "Endowment Effect"
  },
  {
    "group": "Behavioral Science",
    "name": "Raise Catcher",
    "author": "Save More Tomorrow"
  },
  {
    "group": "Behavioral Science",
    "name": "Pain Restorer",
    "author": "Pain of Paying"
  },
  {
    "group": "Behavioral Science",
    "name": "Free-Trap Tracker",
    "author": "Zero-Price Effect"
  },
  {
    "group": "Behavioral Science",
    "name": "Anchor Reset",
    "author": "Anchoring"
  },
  {
    "group": "Operational Methods",
    "name": "50/30/20 Bands",
    "author": "Warren"
  },
  {
    "group": "Operational Methods",
    "name": "To Be Assigned",
    "author": "YNAB Zero-Based"
  },
  {
    "group": "Operational Methods",
    "name": "Years-to-FI",
    "author": "FIRE / 4% Rule"
  },
  {
    "group": "Operational Methods",
    "name": "Cash-Stack Envelopes",
    "author": "Envelope Method"
  },
  {
    "group": "Operational Methods",
    "name": "Kakeibo Reflection",
    "author": "Hani Motoko"
  },
  {
    "group": "Operational Methods",
    "name": "30-Day Cooling-Off List",
    "author": ""
  }
];
const SHIPPED = ["Kiyosaki balance sheet", "Housel compounding", "Runway / Emergency Fund", "Make Room (+ sinking fund)"];

export const Gallery: Story = {
  name: "✨ The Lens Gallery",
  render: () => {
    const groups = Array.from(new Set(LENSES.map((l) => l.group)));
    return (
      <div className="min-h-screen bg-bg px-6 py-10 md:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="font-display text-[0.85em] uppercase tracking-[0.2em] text-accent">One ledger · many lenses</p>
          <h1 className="mt-1 font-display text-[2.4em] font-bold leading-tight text-text">The Lens Gallery</h1>
          <p className="mt-2 max-w-2xl text-[1em] text-text-muted">
            {LENSES.length} ways to read the same money, each drawn from a famous spending philosophy — turned into a
            living view, rule, or nudge over the envelope ledger.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SHIPPED.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border border-accent px-2.5 py-0.5 text-[0.72em] font-medium text-accent">
                <Icon name="check" emoji="✅" size={12} /> {s}
              </span>
            ))}
          </div>
          {groups.map((grp) => (
            <section key={grp} className="mt-8">
              <h2 className="mb-3 font-display text-[1.3em] font-bold text-text">{grp}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {LENSES.filter((l) => l.group === grp).map((l) => (
                  <div key={l.name} className="rounded-md border border-border bg-surface p-4 shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md" style={{ transitionDuration: "var(--ml-motion-base)" }}>
                    <div className="font-display text-[1.05em] font-bold text-text">{l.name}</div>
                    <div className="mt-0.5 text-[0.82em] text-text-muted">{l.author}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  },
};

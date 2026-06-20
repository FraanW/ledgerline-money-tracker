import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { BudgetRings } from "../components/viz/BudgetRings";
import { MoneyFlow } from "../components/viz/MoneyFlow";
import { CategoryTreemap } from "../components/viz/CategoryTreemap";
import { SpendingHeatmap } from "../components/viz/SpendingHeatmap";
import { MoneyJars } from "../components/viz/MoneyJars";
import { VibeScore } from "../components/viz/VibeScore";
import { BalanceTrend } from "../components/viz/BalanceTrend";
import { Donut } from "../components/viz/Donut";
import { Waterfall } from "../components/viz/Waterfall";
import { LiquidGauge } from "../components/viz/LiquidGauge";
import { RadialBars } from "../components/viz/RadialBars";
import { BubblePack } from "../components/viz/BubblePack";
import { StackedStream } from "../components/viz/StackedStream";
import { Receipt } from "../components/viz/Receipt";
import { Card } from "../components/primitives";
import { ringData, spendSlices, dailySpend, firstWeekdayMonday0, balanceSeries, waterfall, streamSeries, streamDays } from "../mocks/vizData";

const INCOME = waterfall[0]?.deltaMinor ?? 0;
const SPENT = spendSlices.reduce((s, n) => s + n.amountMinor, 0);

const meta: Meta = {
  title: "Data Viz/Creative Views",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

function Frame({ title, howToRead, children }: { title: string; howToRead: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl p-[calc(1.5rem*var(--ml-density))]">
      <h2 className="font-display text-[1.4em] font-bold text-text">{title}</h2>
      <p className="mb-1 text-[0.9em] text-text-muted">
        <span className="font-medium text-text">How to read this: </span>
        {howToRead}
      </p>
      <p className="mb-4 text-[0.8em] text-text-muted">Hover any element for a plain-English explanation.</p>
      <Card className="p-[calc(1.5rem*var(--ml-density))]">{children}</Card>
    </div>
  );
}

export const MoneyFlowView: Story = {
  name: "Money Flow (Sankey)",
  render: () => (
    <Frame title="Money Flow" howToRead="Income on the left fans out into your envelopes and Unallocated on the right. Ribbon width = how much of your income went each way.">
      <MoneyFlow />
    </Frame>
  ),
};

export const BudgetRingsView: Story = {
  name: "Budget Rings",
  render: () => (
    <Frame title="Budget Rings" howToRead="One ring per envelope. The arc fills as you spend — a full ring means that envelope is used up.">
      <BudgetRings data={ringData} />
    </Frame>
  ),
};

export const MoneyJarsView: Story = {
  name: "Money Jars",
  render: () => (
    <Frame title="Money Jars" howToRead="Each jar is an envelope. The fill is money still available — the jar drains as you spend, and empties when the envelope's done.">
      <MoneyJars data={ringData} />
    </Frame>
  ),
};

export const VibeScoreView: Story = {
  name: "Vibe-Check Score",
  render: () => (
    <Frame title="Vibe-Check Score" howToRead="A 0–100 budget-health score. Every point is built from the factors on the right — hover each to see exactly how it's earned. No black box.">
      <VibeScore />
    </Frame>
  ),
};

export const DonutView: Story = {
  name: "Donut",
  render: () => (
    <Frame title="Spend Donut" howToRead="Each slice is a category; the longer the arc, the bigger its share of total spend. The centre shows the month's total.">
      <Donut slices={spendSlices} />
    </Frame>
  ),
};

export const TreemapView: Story = {
  name: "Category Treemap",
  render: () => (
    <Frame title="Category Treemap" howToRead="Every tile is a category, sized by spend. Bigger tile = more of your month. Hover a tile for its share and rank.">
      <CategoryTreemap slices={spendSlices} />
    </Frame>
  ),
};

export const HeatmapView: Story = {
  name: "Spending Heatmap",
  render: () => (
    <Frame title="Spending Heatmap" howToRead="A calendar of the month. Darker cells are bigger spend days — spot payday splurges and weekend blowouts at a glance.">
      <SpendingHeatmap days={dailySpend} firstWeekdayMonday0={firstWeekdayMonday0} />
    </Frame>
  ),
};

export const BalanceTrendView: Story = {
  name: "Balance Trend",
  render: () => (
    <Frame title="Balance Trend" howToRead="Your account balance over time. Sharp jumps up are paydays; the slope down between them is everyday spending.">
      <BalanceTrend series={balanceSeries} />
    </Frame>
  ),
};

export const WaterfallView: Story = {
  name: "Cashflow Waterfall",
  render: () => (
    <Frame title="Cashflow Waterfall" howToRead="Start at Income, then step down through each category's spend, and land on what's left. You watch the money get whittled away.">
      <Waterfall steps={waterfall} />
    </Frame>
  ),
};

export const LiquidGaugeView: Story = {
  name: "Liquid Gauge",
  render: () => (
    <Frame title="Liquid Gauge" howToRead="One circle, filling like water with the share of your income you've spent. Near the top = living close to the edge.">
      <LiquidGauge spentMinor={SPENT} incomeMinor={INCOME} />
    </Frame>
  ),
};

export const RadialBarsView: Story = {
  name: "Radial Bars (Rose)",
  render: () => (
    <Frame title="Radial Bars" howToRead="Each category is a wedge; the further it reaches out from the centre, the more you spent there. The longest wedge is your biggest category.">
      <RadialBars slices={spendSlices} />
    </Frame>
  ),
};

export const BubblePackView: Story = {
  name: "Bubble Pack",
  render: () => (
    <Frame title="Bubble Pack" howToRead="Each bubble is a category, sized by spend — the bigger the bubble, the more money. Areas are proportional, so they're fair to compare.">
      <BubblePack slices={spendSlices} />
    </Frame>
  ),
};

export const StreamView: Story = {
  name: "Stacked Stream",
  render: () => (
    <Frame title="Stacked Stream" howToRead="How spending piled up across the month, band by band. Each band is a category; the total height at the right edge is the whole month's spend.">
      <StackedStream series={streamSeries} days={streamDays} />
    </Frame>
  ),
};

export const ReceiptView: Story = {
  name: "The Receipt",
  render: () => (
    <Frame title="The Receipt" howToRead="Your whole month as a single receipt — income at the top, every category as a line item, and what's left at the bottom.">
      <div className="flex justify-center">
        <Receipt slices={spendSlices} incomeMinor={INCOME} period="2026-06" />
      </div>
    </Frame>
  ),
};

export const Dashboard: Story = {
  name: "Dashboard (composed)",
  render: () => (
    <div className="mx-auto max-w-5xl p-[calc(1.5rem*var(--ml-density))]">
      <h2 className="font-display text-[1.6em] font-bold text-text">Money Tracker — Insights</h2>
      <p className="mb-5 text-[0.95em] text-text-muted">June 2026 · across all accounts · hover anything to learn how to read it</p>
      <div className="grid grid-cols-1 gap-[calc(1rem*var(--ml-density))] lg:grid-cols-2">
        <Card className="p-[calc(1.25rem*var(--ml-density))]">
          <VibeScore size={170} />
        </Card>
        <Card className="p-[calc(1.25rem*var(--ml-density))]">
          <h3 className="mb-3 text-[1.05em] font-bold text-text">Budget health</h3>
          <BudgetRings data={ringData} size={190} />
        </Card>
        <Card className="p-[calc(1.25rem*var(--ml-density))] lg:col-span-2">
          <h3 className="mb-3 text-[1.05em] font-bold text-text">Money flow</h3>
          <MoneyFlow width={760} height={300} />
        </Card>
        <Card className="p-[calc(1.25rem*var(--ml-density))]">
          <h3 className="mb-3 text-[1.05em] font-bold text-text">Jars</h3>
          <MoneyJars data={ringData} jarW={70} jarH={130} />
        </Card>
        <Card className="p-[calc(1.25rem*var(--ml-density))]">
          <h3 className="mb-3 text-[1.05em] font-bold text-text">Balance trend</h3>
          <BalanceTrend series={balanceSeries} width={360} height={190} />
        </Card>
        <Card className="p-[calc(1.25rem*var(--ml-density))] lg:col-span-2">
          <h3 className="mb-3 text-[1.05em] font-bold text-text">Cashflow waterfall</h3>
          <Waterfall steps={waterfall} width={760} height={260} />
        </Card>
      </div>
    </div>
  ),
};

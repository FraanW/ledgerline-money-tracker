import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { LandingPage } from "../components/pages/LandingPage";
import { DashboardPage } from "../components/pages/DashboardPage";
import { TagWorkshop } from "../components/pages/TagWorkshop";
import { SettingsPage } from "../components/pages/SettingsPage";
import { InvestmentsPage } from "../components/pages/InvestmentsPage";
import { LogPage } from "../components/pages/LogPage";
import { NetWorthPage } from "../components/pages/NetWorthPage";
import { AppShell } from "../components/AppShell";
import { TransactionsScreen } from "../components/TransactionsScreen";
import { EnvelopesScreen } from "../components/EnvelopesScreen";
import { Card } from "../components/primitives";
import { MoneyFlow } from "../components/viz/MoneyFlow";
import { CategoryTreemap } from "../components/viz/CategoryTreemap";
import { SpendingHeatmap } from "../components/viz/SpendingHeatmap";
import { BalanceTrend } from "../components/viz/BalanceTrend";
import { transactions, categories, userEnvelopes, unallocated, CURRENT_PERIOD } from "../mocks/fixtures";
import { spendSlices, dailySpend, firstWeekdayMonday0, balanceSeries } from "../mocks/vizData";

const meta: Meta = {
  title: "Pages/Responsive",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

export const Landing: Story = { render: () => <LandingPage /> };
export const Dashboard: Story = { render: () => <DashboardPage /> };
export const TagWorkshopPage: Story = { name: "Tag Workshop", render: () => <TagWorkshop /> };
export const Settings: Story = { render: () => <SettingsPage /> };
export const Investments: Story = { render: () => <InvestmentsPage /> };
export const Log: Story = { render: () => <LogPage /> };
export const NetWorth: Story = { render: () => <NetWorthPage /> };

export const Transactions: Story = {
  render: () => (
    <AppShell active="transactions">
      <TransactionsScreen transactions={transactions} categories={categories} period={CURRENT_PERIOD} />
    </AppShell>
  ),
};

export const Budget: Story = {
  render: () => (
    <AppShell active="budget">
      <EnvelopesScreen envelopes={userEnvelopes} unallocated={unallocated} period={CURRENT_PERIOD} />
    </AppShell>
  ),
};

export const Insights: Story = {
  render: () => (
    <AppShell active="insights">
      <div className="mx-auto max-w-5xl p-5 md:p-8">
        <h1 className="font-display text-[1.8em] font-bold">Insights</h1>
        <p className="mb-5 text-[0.95em] text-text-muted">June 2026 · hover anything to see how to read it.</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5 lg:col-span-2">
            <h3 className="mb-3 font-bold">Money flow</h3>
            <MoneyFlow width={820} height={300} />
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-bold">Where it went</h3>
            <CategoryTreemap slices={spendSlices} width={420} height={260} />
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-bold">Spending heatmap</h3>
            <SpendingHeatmap days={dailySpend} firstWeekdayMonday0={firstWeekdayMonday0} cell={30} />
          </Card>
          <Card className="p-5 lg:col-span-2">
            <h3 className="mb-3 font-bold">Balance trend</h3>
            <BalanceTrend series={balanceSeries} width={820} height={220} />
          </Card>
        </div>
      </div>
    </AppShell>
  ),
};

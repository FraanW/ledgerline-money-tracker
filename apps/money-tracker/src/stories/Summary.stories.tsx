import type { Meta, StoryObj } from "@storybook/react";
import { SummaryScreen } from "../components/SummaryScreen";
import { currentPeriodSpendByCategory, unallocated, CURRENT_PERIOD } from "../mocks/fixtures";

const meta: Meta<typeof SummaryScreen> = {
  title: "Screens/Summary",
  component: SummaryScreen,
};
export default meta;

type Story = StoryObj<typeof SummaryScreen>;

export const WhereDidMyMoneyGo: Story = {
  args: { spendByCategory: currentPeriodSpendByCategory, unallocated, period: CURRENT_PERIOD },
};

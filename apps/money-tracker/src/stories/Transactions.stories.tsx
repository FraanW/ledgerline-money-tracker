import type { Meta, StoryObj } from "@storybook/react";
import { TransactionsScreen } from "../components/TransactionsScreen";
import { transactions, categories, CURRENT_PERIOD } from "../mocks/fixtures";

const meta: Meta<typeof TransactionsScreen> = {
  title: "Screens/Transactions",
  component: TransactionsScreen,
};
export default meta;

type Story = StoryObj<typeof TransactionsScreen>;

export const CurrentMonth: Story = {
  args: { transactions, categories, period: CURRENT_PERIOD },
};
export const LastMonth: Story = {
  args: { transactions, categories, period: "2026-05" },
};

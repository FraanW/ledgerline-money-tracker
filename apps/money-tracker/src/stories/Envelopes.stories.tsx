import type { Meta, StoryObj } from "@storybook/react";
import { EnvelopesScreen } from "../components/EnvelopesScreen";
import { userEnvelopes, unallocated, CURRENT_PERIOD } from "../mocks/fixtures";

const meta: Meta<typeof EnvelopesScreen> = {
  title: "Screens/Envelopes",
  component: EnvelopesScreen,
};
export default meta;

type Story = StoryObj<typeof EnvelopesScreen>;

export const Default: Story = {
  args: { envelopes: userEnvelopes, unallocated, period: CURRENT_PERIOD },
};

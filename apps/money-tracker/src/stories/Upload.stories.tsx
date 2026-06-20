import type { Meta, StoryObj } from "@storybook/react";
import { UploadScreen } from "../components/UploadScreen";
import { uploadResultFresh, uploadResultReupload } from "../mocks/fixtures";

const meta: Meta<typeof UploadScreen> = {
  title: "Screens/Upload",
  component: UploadScreen,
};
export default meta;

type Story = StoryObj<typeof UploadScreen>;

export const Empty: Story = { args: {} };
export const AfterUpload: Story = { args: { result: uploadResultFresh } };
export const ReUploadAllDuplicates: Story = { args: { result: uploadResultReupload } };

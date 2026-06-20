import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  docs: {},
  // Allow the dev server to be reached through a tunnel (ngrok) for remote review.
  async viteFinal(config) {
    config.server = config.server ?? {};
    config.server.allowedHosts = true;
    config.server.cors = true;
    return config;
  },
};

export default config;

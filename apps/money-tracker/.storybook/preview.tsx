import type { Preview } from "@storybook/react";
import React from "react";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { THEMES, THEME_IDS, type ThemeId } from "../src/theme/tokens";
import "../src/app/globals.css";

/**
 * A Storybook toolbar global lets a reviewer flip design directions live:
 * Gen-Z / Millennial (reference) / Senior. The global is named `persona` to
 * avoid colliding with addon-provided `theme` globals.
 */
const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["Pages", "Lenses", ["Overview", "Canon Authors", "Behavioral Science", "Operational Methods"], "Make Room", "Primitives Lab", "Calculators", "Foundations", "Screens", ["Upload", "Transactions", "Envelopes", "Summary"], "Data Viz"],
      },
    },
  },
  initialGlobals: { persona: "millennial" },
  globalTypes: {
    persona: {
      description: "Design direction (persona / age band)",
      defaultValue: "millennial",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: THEME_IDS.map((id) => ({
          value: id,
          title: id === "millennial" ? "Millennial (reference)" : id === "genz" ? "Gen Z" : "Senior",
        })),
      },
    },
  },
  decorators: [
    (Story, context) => {
      const raw = context.globals.persona as string | undefined;
      const themeId: ThemeId = raw && THEMES[raw as ThemeId] ? (raw as ThemeId) : "millennial";
      return (
        <ThemeProvider themeId={themeId}>
          <div className="min-h-screen bg-bg text-text font-sans">
            <Story />
          </div>
        </ThemeProvider>
      );
    },
  ],
};

export default preview;

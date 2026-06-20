import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { PersonaScrollLanding } from "../components/pages/PersonaScrollLanding";

/**
 * The scroll-telling landing page: hero (the problem) → Gen Z → Millennial →
 * Senior → the payoff. Self-themed (shows all three personas), bright + slick,
 * with SVG silhouettes + ART SLOTS for the Claude-Design illustrations.
 */
const meta: Meta = {
  title: "Pages/Persona Scroll Landing",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

export const ScrollStory: Story = {
  name: "The Scroll Story (hero → Gen Z → Millennial → Senior → CTA)",
  render: () => <PersonaScrollLanding />,
};

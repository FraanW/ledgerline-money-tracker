"use client";

import React from "react";
import {
  LayoutDashboard,
  PenLine,
  Receipt,
  Wallet,
  TrendingUp,
  BarChart3,
  Tags,
  Settings,
  UtensilsCrossed,
  Bus,
  ShoppingBag,
  ShoppingCart,
  FileText,
  PartyPopper,
  Sparkles,
  Landmark,
  Bell,
  Upload,
  Target,
  Link2,
  Mail,
  Brain,
  Home,
  Film,
  Lock,
  ShieldCheck,
  Globe,
  Check,
  Scale,
  Hourglass,
  Headphones,
  Keyboard,
  Footprints,
  Watch,
  Camera,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useThemeId } from "../theme/ThemeProvider";

/**
 * Persona-aware icon. Millennial + Senior get clean Lucide line icons; Gen Z
 * keeps emoji (the brain-rot is on purpose). One `<Icon name=... emoji=... />`
 * call everywhere, so the whole app's iconography swaps with the theme.
 */
const MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  log: PenLine,
  transactions: Receipt,
  budget: Wallet,
  invest: TrendingUp,
  insights: BarChart3,
  tags: Tags,
  settings: Settings,
  food: UtensilsCrossed,
  travel: Bus,
  shopping: ShoppingBag,
  groceries: ShoppingCart,
  bills: FileText,
  fun: Film,
  party: PartyPopper,
  other: Sparkles,
  bank: Landmark,
  bell: Bell,
  upload: Upload,
  goal: Target,
  link: Link2,
  mail: Mail,
  brain: Brain,
  rent: Home,
  lock: Lock,
  shield: ShieldCheck,
  globe: Globe,
  check: Check,
  networth: Scale,
  cart: ShoppingCart,
  hourglass: Hourglass,
  headphones: Headphones,
  keyboard: Keyboard,
  footprints: Footprints,
  watch: Watch,
  camera: Camera,
  plus: Plus,
};

export function Icon({
  name,
  emoji,
  size = 18,
  className,
}: {
  name: string;
  emoji?: string;
  size?: number;
  className?: string;
}) {
  const theme = useThemeId();
  if (theme === "genz" && emoji) {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
        {emoji}
      </span>
    );
  }
  const C = MAP[name];
  if (!C) {
    return emoji ? (
      <span className={className} aria-hidden>
        {emoji}
      </span>
    ) : null;
  }
  return <C size={size} className={className} aria-hidden strokeWidth={1.75} />;
}

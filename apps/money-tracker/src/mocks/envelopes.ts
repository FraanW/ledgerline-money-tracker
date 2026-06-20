import type { Envelope } from "../lib/makeRoom";

/**
 * A mid-month snapshot of a fully-allocated envelope budget — some envelopes
 * have slack (breathing room), the committed ones don't, and the protected /
 * goal envelopes are off-limits to "painless" pulls. Total slack ≈ ₹7,900, so a
 * ₹2,500 birthday gift is absorbable; crank the expense past ₹8k to see setbacks.
 */
export const MOCK_ENVELOPES: Envelope[] = [
  { id: "rent", name: "Rent", icon: "rent", emoji: "🏠", balance: 18000, expectedRemaining: 18000, isProtected: true },
  { id: "emi", name: "Loan EMI", icon: "bank", emoji: "🏦", balance: 6000, expectedRemaining: 6000, isProtected: true },
  { id: "emergency", name: "Emergency Fund", icon: "shield", emoji: "🛟", balance: 50000, expectedRemaining: 0, isProtected: true },
  { id: "groceries", name: "Groceries", icon: "groceries", emoji: "🛒", balance: 6000, expectedRemaining: 5000 },
  { id: "dining", name: "Eating Out", icon: "food", emoji: "🍕", balance: 4000, expectedRemaining: 1500 },
  { id: "shopping", name: "Shopping", icon: "shopping", emoji: "🛍️", balance: 3000, expectedRemaining: 800 },
  { id: "transport", name: "Transport", icon: "travel", emoji: "🚌", balance: 2500, expectedRemaining: 1800 },
  { id: "fun", name: "Fun", icon: "fun", emoji: "🎬", balance: 2000, expectedRemaining: 500 },
  { id: "goa", name: "Goa Trip", icon: "goal", emoji: "🏖️", balance: 8000, expectedRemaining: 0, goalName: "Goa Trip" },
];

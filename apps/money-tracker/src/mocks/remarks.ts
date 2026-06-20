import type { ThemeId } from "../theme/tokens";

/**
 * Page-top "remarks" — the persona-voiced hook that sits above each screen so
 * the user grasps it fast. Three voices per screen (Riker's content deck):
 * genz = quirky/meme-y but informative, millennial = warm/clean, senior =
 * plain/calm/no-slang. All Gen-Z slang is decodable via the Glossary.
 */
export type ScreenKey = "upload" | "transactions" | "envelopes" | "summary";

export const screenRemarks: Record<ScreenKey, Record<ThemeId, string>> = {
  upload: {
    genz: "drop the receipts 🧾 — we'll sort every txn into envelopes, and re-uploads won't double dip.",
    millennial: "Drop your bank CSV and we'll sort every transaction into envelopes — re-uploading is always safe.",
    senior: "Upload your bank statement. We will sort each transaction, and duplicates are ignored.",
  },
  transactions: {
    genz: "every txn this month, sorted 👀 — anything still 'giving Unallocated' needs a home.",
    millennial: "Here's everything this month, auto-sorted — just tidy up the few that landed in Unallocated.",
    senior: "All your transactions for this month. Items marked Unallocated still need a category.",
  },
  envelopes: {
    genz: "money lives in envelopes 💸 — you can only spend what's inside, no cap, no overdraw.",
    millennial: "Your money lives in envelopes — you can only spend what's inside, so the budget actually holds.",
    senior: "Your budget for this month. Money is held in envelopes, and you can only spend what is inside.",
  },
  summary: {
    genz: "the financial damage report 💀 — here's where it all went, and what escaped the plan.",
    millennial: "Here's where your money actually went this month — one honest view across every account.",
    senior: "Where your money went this month, across every account, in one clear view.",
  },
};

/** Gen-Z budget-health quips, gated by real state so the rotation never lies. */
export type VibeBucket = "onTrack" | "savingWell" | "unallocatedGrowing" | "overspent";

export const genzVibeLines: Record<VibeBucket, string[]> = {
  onTrack: [
    "budget's holding, math is mathing — you love to see it ✨",
    "every envelope still has gas in the tank. clean month.",
  ],
  savingWell: [
    "savings glow-up szn — that goal envelope is eating 📈",
    "you under-spent and the leftovers rolled over. future-you said thanks.",
  ],
  unallocatedGrowing: [
    "heads up: it's giving Unallocated 👀 — some spend escaped the plan, go re-budget.",
    "reality kinda outran the plan this month — Unallocated's stacking up.",
  ],
  overspent: [
    "the budget said no a few times 💀 — those got caught and sent to Unallocated.",
    "a couple envelopes got cooked, but nothing went negative. constraint held.",
  ],
};

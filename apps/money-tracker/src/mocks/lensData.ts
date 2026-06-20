/**
 * Unified mock ledger for the philosophy LENSES — one coherent "Anaya" dataset
 * every lens reads from, so numbers are consistent across the whole gallery.
 *
 * Plain rupees (not paise) to match lib/finance.ts + lib/makeRoom.ts. Strictly
 * a design fixture — no backend. Rich enough to drive all 20+ lenses: buckets,
 * payment methods, recurring series, a salary step-up, holdings with expense
 * ratios, goals, and a trial→paid pattern.
 */

export type Bucket = "need" | "want" | "savings";
export type PayMethod = "upi" | "card" | "autopay" | "cash";

export interface LensProfile {
  name: string;
  age: number;
  monthlyTakeHome: number;
  annualPretaxIncome: number;
}

export const profile: LensProfile = {
  name: "Anaya",
  age: 29,
  monthlyTakeHome: 82000,
  annualPretaxIncome: 1280000,
};

/* ── Envelopes (current period budget) ─────────────────────────────────── */

export interface LedgerEnvelope {
  id: string;
  name: string;
  icon: string; // Icon name (Lucide)
  emoji: string; // Gen Z fallback
  bucket: Bucket;
  allocated: number; // budgeted this period
  spent: number; // spent so far this period
  /** Expected spend still to come — drives "breathing room". */
  expectedRemaining: number;
  isProtected?: boolean; // rent / EMI / savings — never raided for free
  goalName?: string; // goal-linked envelope
}

export const envelopes: LedgerEnvelope[] = [
  { id: "rent", name: "Rent", icon: "rent", emoji: "🏠", bucket: "need", allocated: 20000, spent: 20000, expectedRemaining: 0, isProtected: true },
  { id: "emi", name: "Loan EMI", icon: "bank", emoji: "🏦", bucket: "need", allocated: 4200, spent: 4200, expectedRemaining: 0, isProtected: true },
  { id: "groceries", name: "Groceries", icon: "groceries", emoji: "🛒", bucket: "need", allocated: 8000, spent: 5200, expectedRemaining: 2800 },
  { id: "utilities", name: "Bills & Utilities", icon: "bills", emoji: "💡", bucket: "need", allocated: 3000, spent: 1800, expectedRemaining: 1200 },
  { id: "transport", name: "Transport", icon: "travel", emoji: "🚌", bucket: "need", allocated: 4000, spent: 2200, expectedRemaining: 1800 },
  { id: "dining", name: "Eating Out", icon: "food", emoji: "🍕", bucket: "want", allocated: 5000, spent: 3500, expectedRemaining: 1500 },
  { id: "shopping", name: "Shopping", icon: "shopping", emoji: "🛍️", bucket: "want", allocated: 4000, spent: 1800, expectedRemaining: 800 },
  { id: "fun", name: "Fun", icon: "fun", emoji: "🎬", bucket: "want", allocated: 3000, spent: 2500, expectedRemaining: 500 },
  { id: "subs", name: "Subscriptions", icon: "bell", emoji: "📺", bucket: "want", allocated: 1500, spent: 1467, expectedRemaining: 0 },
  { id: "sip", name: "Investments (SIP)", icon: "invest", emoji: "📈", bucket: "savings", allocated: 12000, spent: 12000, expectedRemaining: 0, isProtected: true },
  { id: "emergency", name: "Emergency Fund", icon: "shield", emoji: "🛟", bucket: "savings", allocated: 5000, spent: 5000, expectedRemaining: 0, isProtected: true, goalName: "Emergency Fund" },
  { id: "goa", name: "Goa Trip", icon: "goal", emoji: "🏖️", bucket: "savings", allocated: 4000, spent: 4000, expectedRemaining: 0, goalName: "Goa Trip" },
];

/** Cash that has landed but isn't yet assigned to any envelope (YNAB "To Be Assigned"). */
export const availableCash = 8300;
export const totalAllocated = envelopes.reduce((s, e) => s + e.allocated, 0);

/* ── Transactions (≈3 months: Apr–Jun 2026) ───────────────────────────── */

export interface LedgerTxn {
  id: string;
  date: string; // YYYY-MM-DD
  merchant: string;
  category: string; // maps loosely to an envelope/bucket
  bucket: Bucket;
  amount: number;
  method: PayMethod;
  /** Part of a recurring series (subscription / SIP / rent). */
  recurring?: boolean;
  /** A near-zero "free trial" charge that later converts to a paid one. */
  trial?: boolean;
}

const t = (
  id: string,
  date: string,
  merchant: string,
  category: string,
  bucket: Bucket,
  amount: number,
  method: PayMethod,
  opts: { recurring?: boolean; trial?: boolean } = {},
): LedgerTxn => ({ id, date, merchant, category, bucket, amount, method, ...opts });

export const transactions: LedgerTxn[] = [
  // ── June (current) ──
  t("j_rent", "2026-06-02", "Landlord", "Rent", "need", 20000, "autopay", { recurring: true }),
  t("j_sip", "2026-06-02", "Groww SIP", "Investments", "savings", 12000, "autopay", { recurring: true }),
  t("j_netflix", "2026-06-03", "Netflix", "Subscriptions", "want", 649, "autopay", { recurring: true }),
  t("j_spotify", "2026-06-03", "Spotify", "Subscriptions", "want", 119, "autopay", { recurring: true }),
  t("j_cult", "2026-06-04", "Cult.fit", "Subscriptions", "want", 1500, "autopay", { recurring: true }),
  t("j_coffee1", "2026-06-02", "Blue Tokai", "Eating Out", "want", 280, "upi"),
  t("j_swiggy1", "2026-06-02", "Swiggy", "Eating Out", "want", 540, "upi"),
  t("j_amazon1", "2026-06-03", "Amazon", "Shopping", "want", 1899, "card"),
  t("j_bigb", "2026-06-04", "Big Bazaar", "Groceries", "need", 2480, "upi"),
  t("j_uber1", "2026-06-05", "Uber", "Transport", "need", 230, "upi"),
  t("j_coffee2", "2026-06-05", "Starbucks", "Eating Out", "want", 410, "upi"),
  t("j_zomato1", "2026-06-06", "Zomato", "Eating Out", "want", 720, "upi"),
  t("j_audible", "2026-06-08", "Audible", "Subscriptions", "want", 199, "card", { recurring: true }), // trial converted (see May)
  t("j_dmart", "2026-06-09", "DMart", "Groceries", "need", 1310, "upi"),
  t("j_fuel", "2026-06-10", "HPCL", "Transport", "need", 1600, "card"),
  t("j_movie", "2026-06-12", "BookMyShow", "Fun", "want", 980, "card"),
  t("j_swiggy2", "2026-06-14", "Swiggy", "Eating Out", "want", 610, "upi"),
  t("j_coffee3", "2026-06-15", "Blue Tokai", "Eating Out", "want", 280, "upi"),

  // ── May ──
  t("m_rent", "2026-05-02", "Landlord", "Rent", "need", 20000, "autopay", { recurring: true }),
  t("m_sip", "2026-05-02", "Groww SIP", "Investments", "savings", 12000, "autopay", { recurring: true }),
  t("m_netflix", "2026-05-03", "Netflix", "Subscriptions", "want", 649, "autopay", { recurring: true }),
  t("m_spotify", "2026-05-03", "Spotify", "Subscriptions", "want", 119, "autopay", { recurring: true }),
  t("m_cult", "2026-05-04", "Cult.fit", "Subscriptions", "want", 1500, "autopay", { recurring: true }),
  t("m_audible_trial", "2026-05-09", "Audible", "Subscriptions", "want", 0, "card", { trial: true }), // free trial
  t("m_amazon", "2026-05-12", "Amazon", "Shopping", "want", 2200, "card"),
  t("m_swiggy", "2026-05-07", "Swiggy", "Eating Out", "want", 560, "upi"),

  // ── April ──
  t("a_rent", "2026-04-02", "Landlord", "Rent", "need", 20000, "autopay", { recurring: true }),
  t("a_sip", "2026-04-02", "Groww SIP", "Investments", "savings", 12000, "autopay", { recurring: true }),
  t("a_netflix", "2026-04-03", "Netflix", "Subscriptions", "want", 649, "autopay", { recurring: true }),
  t("a_spotify", "2026-04-03", "Spotify", "Subscriptions", "want", 119, "autopay", { recurring: true }),
  t("a_cult", "2026-04-04", "Cult.fit", "Subscriptions", "want", 1500, "autopay", { recurring: true }),
];

/* ── Income events (a salary step-up in May → Raise Catcher) ───────────── */

export interface IncomeEvent {
  id: string;
  date: string;
  amount: number;
  source: string;
}

export const incomeEvents: IncomeEvent[] = [
  { id: "inc_mar", date: "2026-03-01", amount: 78000, source: "Acme Pvt Ltd" },
  { id: "inc_apr", date: "2026-04-01", amount: 78000, source: "Acme Pvt Ltd" },
  { id: "inc_may", date: "2026-05-01", amount: 82000, source: "Acme Pvt Ltd" }, // raise
  { id: "inc_jun", date: "2026-06-01", amount: 82000, source: "Acme Pvt Ltd" },
];

/* ── Holdings (with expense ratios → Cost Drag / Bogle) ────────────────── */

export interface LensHolding {
  id: string;
  name: string;
  kind: "Index" | "Equity" | "Debt" | "Gold" | "ULIP";
  invested: number;
  value: number;
  /** Annual expense ratio, percent. */
  expenseRatioPct: number;
  /** Regular-plan / commission-bearing (vs direct). */
  regularPlan?: boolean;
}

export const holdings: LensHolding[] = [
  { id: "h_nifty", name: "Nifty 50 Index (Direct)", kind: "Index", invested: 250000, value: 322000, expenseRatioPct: 0.2 },
  { id: "h_flexi", name: "Flexi-cap Fund (Regular)", kind: "Equity", invested: 150000, value: 188500, expenseRatioPct: 1.8, regularPlan: true },
  { id: "h_gold", name: "Gold ETF", kind: "Gold", invested: 85000, value: 96400, expenseRatioPct: 0.5 },
  { id: "h_debt", name: "Liquid / Debt Fund", kind: "Debt", invested: 120000, value: 126800, expenseRatioPct: 0.25 },
  { id: "h_ulip", name: "ULIP (insurance + market)", kind: "ULIP", invested: 60000, value: 63500, expenseRatioPct: 2.2, regularPlan: true },
];

export const portfolioInvested = holdings.reduce((s, h) => s + h.invested, 0);
export const portfolioValue = holdings.reduce((s, h) => s + h.value, 0);

/* ── Goals ─────────────────────────────────────────────────────────────── */

export interface LensGoal {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  target: number;
  current: number;
}

export const goals: LensGoal[] = [
  { id: "g_emergency", name: "Emergency Fund", icon: "shield", emoji: "🛟", target: 300000, current: 150000 },
  { id: "g_goa", name: "Goa Trip", icon: "goal", emoji: "🏖️", target: 60000, current: 24000 },
  { id: "g_laptop", name: "New Laptop", icon: "shopping", emoji: "💻", target: 90000, current: 30000 },
];

/* ── Net worth (reused from the balance-sheet fixture) + age ───────────── */

export { assets, liabilities, assetsTotal, liabilitiesTotal, netWorth, incomeGeneratingTotal } from "./networth";

/* ── Small shared aggregates ───────────────────────────────────────────── */

/** Spend by bucket this period (current month) from envelopes' spent. */
export function spendByBucket(): Record<Bucket, number> {
  return envelopes.reduce(
    (acc, e) => {
      acc[e.bucket] += e.spent;
      return acc;
    },
    { need: 0, want: 0, savings: 0 } as Record<Bucket, number>,
  );
}

/** Current-month transactions only. */
export const currentMonth = "2026-06";
export const currentMonthTxns = transactions.filter((x) => x.date.startsWith(currentMonth));

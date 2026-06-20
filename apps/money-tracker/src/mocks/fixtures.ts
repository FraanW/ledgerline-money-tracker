import type {
  Account,
  Category,
  Envelope,
  Money,
  Transaction,
} from "@ledgerline/types";
import { fromRupees } from "@ledgerline/types";

/**
 * Mock dataset for the design simulator — typed strictly against
 * @ledgerline/types, no backend. A believable Anaya: 3 accounts, ~2 months of
 * transactions (so the recurring-loop / dedup story is visible), envelopes with
 * a non-trivially-funded Unallocated (so the "reality outran the budget" Summary
 * signal shows). Money is integer paise throughout (fromRupees does the x100).
 */

const TENANT = "tnt_anaya";

export const accounts: Account[] = [
  { id: "acc_hdfc", tenantId: TENANT, institution: "HDFC Bank", accountType: "savings", maskedNumber: "XXXX4821", currency: "INR", createdAt: "2026-04-01T00:00:00Z" },
  { id: "acc_icici", tenantId: TENANT, institution: "ICICI Bank", accountType: "savings", maskedNumber: "XXXX1190", currency: "INR", createdAt: "2026-04-01T00:00:00Z" },
  { id: "acc_axis_cc", tenantId: TENANT, institution: "Axis Bank", accountType: "credit_card", maskedNumber: "XXXX7755", currency: "INR", createdAt: "2026-04-01T00:00:00Z" },
];

export const categories: Category[] = [
  { id: "cat_income", tenantId: TENANT, name: "Salary", kind: "income" },
  { id: "cat_groceries", tenantId: TENANT, name: "Groceries", kind: "expense" },
  { id: "cat_rent", tenantId: TENANT, name: "Rent", kind: "expense" },
  { id: "cat_dining", tenantId: TENANT, name: "Dining", kind: "expense" },
  { id: "cat_transport", tenantId: TENANT, name: "Transport", kind: "expense" },
  { id: "cat_fun", tenantId: TENANT, name: "Fun", kind: "expense" },
];

/** Current period under review. */
export const CURRENT_PERIOD = "2026-06";

export const envelopes: Envelope[] = [
  { id: "env_rent", tenantId: TENANT, name: "Rent", balance: fromRupees(20000), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
  { id: "env_groceries", tenantId: TENANT, name: "Groceries", balance: fromRupees(3200), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
  { id: "env_dining", tenantId: TENANT, name: "Dining", balance: fromRupees(450), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
  { id: "env_transport", tenantId: TENANT, name: "Transport", balance: fromRupees(1800), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
  { id: "env_fun", tenantId: TENANT, name: "Fun", balance: fromRupees(0), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
  { id: "env_savings", tenantId: TENANT, name: "Savings goal", balance: fromRupees(15000), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
  // Pseudo-envelope: holds spend that escaped the budget (ADR-0006). Non-trivially funded on purpose.
  { id: "env_unallocated", tenantId: TENANT, name: "Unallocated", balance: fromRupees(14250), period: CURRENT_PERIOD, createdAt: "2026-06-01T00:00:00Z" },
];

export const unallocated = envelopes.find((e) => e.id === "env_unallocated")!;
export const userEnvelopes = envelopes.filter((e) => e.id !== "env_unallocated");

function txn(
  id: string,
  accountId: string,
  postedAt: string,
  rupees: number,
  direction: Transaction["direction"],
  rawDescription: string,
  categoryId: string | null,
  merchant: string | null = null,
): Transaction {
  return {
    id,
    tenantId: TENANT,
    accountId,
    postedAt,
    amount: fromRupees(rupees),
    direction,
    rawDescription,
    merchant,
    categoryId,
    source: "statement_upload",
    dedupHash: `h_${id}`,
    ingestedAt: `${postedAt}T12:00:00Z`,
  };
}

/** ~2 months. June is the current period; May is last month (for the recurring-loop story). */
export const transactions: Transaction[] = [
  // --- June 2026 (current) ---
  txn("t_jun_salary", "acc_hdfc", "2026-06-01", 82000, "credit", "NEFT SALARY CR ACME PVT LTD", "cat_income", "Acme Pvt Ltd"),
  txn("t_jun_rent", "acc_hdfc", "2026-06-02", 20000, "debit", "IMPS RENT TRANSFER LANDLORD", "cat_rent", "Landlord"),
  txn("t_jun_bigbazaar", "acc_hdfc", "2026-06-04", 2480, "debit", "UPI/BIGBAZAAR/groceries", "cat_groceries", "Big Bazaar"),
  txn("t_jun_swiggy1", "acc_axis_cc", "2026-06-05", 540, "debit", "SWIGGY ORDER 88213", "cat_dining", "Swiggy"),
  txn("t_jun_uber1", "acc_axis_cc", "2026-06-06", 230, "debit", "UBER TRIP BLR", "cat_transport", "Uber"),
  txn("t_jun_amazon", "acc_axis_cc", "2026-06-08", 1899, "debit", "AMZ*MKTP IN 4QX", null, null), // uncategorised -> Unallocated
  txn("t_jun_dmart", "acc_hdfc", "2026-06-09", 1310, "debit", "UPI/DMART/groceries", "cat_groceries", "DMart"),
  txn("t_jun_netflix", "acc_axis_cc", "2026-06-10", 649, "debit", "NETFLIX*IN MONTHLY", "cat_fun", "Netflix"),
  txn("t_jun_swiggy2", "acc_axis_cc", "2026-06-12", 720, "debit", "SWIGGY ORDER 90551", "cat_dining", "Swiggy"),
  txn("t_jun_fuel", "acc_icici", "2026-06-13", 1600, "debit", "HPCL FUEL STN", "cat_transport", "HPCL"),
  txn("t_jun_pharmeasy", "acc_hdfc", "2026-06-14", 860, "debit", "PHARMEASY ORDER", null, null), // uncategorised -> Unallocated
  txn("t_jun_movie", "acc_axis_cc", "2026-06-15", 980, "debit", "BOOKMYSHOW BLR", "cat_fun", "BookMyShow"), // Fun is empty -> overdraw -> Unallocated
  txn("t_jun_grocery3", "acc_hdfc", "2026-06-16", 540, "debit", "UPI/RELIANCEFRESH", "cat_groceries", "Reliance Fresh"),
  txn("t_jun_zomato", "acc_axis_cc", "2026-06-17", 410, "debit", "ZOMATO ORDER 33218", "cat_dining", "Zomato"),
  txn("t_jun_unknown", "acc_icici", "2026-06-18", 3100, "debit", "POS 5994 MERCHANT", null, null), // uncategorised -> Unallocated

  // --- May 2026 (last period — shows the recurring loop; t_may_rent overlaps a re-upload) ---
  txn("t_may_salary", "acc_hdfc", "2026-05-01", 82000, "credit", "NEFT SALARY CR ACME PVT LTD", "cat_income", "Acme Pvt Ltd"),
  txn("t_may_rent", "acc_hdfc", "2026-05-02", 20000, "debit", "IMPS RENT TRANSFER LANDLORD", "cat_rent", "Landlord"),
  txn("t_may_bigbazaar", "acc_hdfc", "2026-05-05", 2980, "debit", "UPI/BIGBAZAAR/groceries", "cat_groceries", "Big Bazaar"),
  txn("t_may_swiggy", "acc_axis_cc", "2026-05-07", 610, "debit", "SWIGGY ORDER 71140", "cat_dining", "Swiggy"),
  txn("t_may_netflix", "acc_axis_cc", "2026-05-10", 649, "debit", "NETFLIX*IN MONTHLY", "cat_fun", "Netflix"),
  txn("t_may_fuel", "acc_icici", "2026-05-12", 1500, "debit", "HPCL FUEL STN", "cat_transport", "HPCL"),
  txn("t_may_amazon", "acc_axis_cc", "2026-05-19", 2200, "debit", "AMZ*MKTP IN 7BZ", null, null),
];

/** Spend-by-category for the current period, for the Summary view. */
export interface CategorySpend {
  categoryId: string | null;
  name: string;
  spent: Money;
}

export const currentPeriodSpendByCategory: CategorySpend[] = (() => {
  const byCat = new Map<string | null, number>();
  for (const t of transactions) {
    if (!t.postedAt.startsWith(CURRENT_PERIOD)) continue;
    if (t.direction !== "debit") continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount.minor);
  }
  const named = (id: string | null) =>
    id === null ? "Unallocated (escaped budget)" : categories.find((c) => c.id === id)?.name ?? id;
  return [...byCat.entries()]
    .map(([categoryId, minor]) => ({ categoryId, name: named(categoryId), spent: { minor, currency: "INR" as const } }))
    .sort((a, b) => b.spent.minor - a.spent.minor);
})();

/** Result shape the Upload screen renders (mirrors the M1 ingestion response). */
export interface StatementUploadResult {
  statementId: string;
  fileName: string;
  accepted: number;
  duplicates: number;
  errors: { line: number; message: string }[];
}

export const uploadResultFresh: StatementUploadResult = {
  statementId: "stm_001",
  fileName: "HDFC-Jun-2026.csv",
  accepted: 15,
  duplicates: 0,
  errors: [{ line: 23, message: "Row has both Debit and Credit populated — skipped" }],
};

export const uploadResultReupload: StatementUploadResult = {
  statementId: "stm_002",
  fileName: "HDFC-Jun-2026 (re-upload).csv",
  accepted: 0,
  duplicates: 15,
  errors: [],
};

import type { CurrencyCode, Money } from "./money";

/**
 * Entity IDs are plain strings (UUIDs at the DB layer). They're aliased for
 * readability; if mixing them ever causes a bug, these become branded types.
 */
export type TenantId = string;
export type AccountId = string;
export type TransactionId = string;
export type CategoryId = string;
export type EnvelopeId = string;
export type LedgerEntryId = string;
export type LedgerTransferId = string;

/** debit = money leaving the account; credit = money arriving. */
export type TransactionDirection = "debit" | "credit";

/**
 * How a transaction entered the system. This is the swap point between v0 and v1:
 * v0 only ever writes "statement_upload"; v1 adds "account_aggregator". Everything
 * downstream (categorizer, envelope ledger) is identical regardless of source.
 */
export type IngestionSource = "statement_upload" | "account_aggregator";

export type CategoryKind = "income" | "expense" | "transfer";

export type AccountType = "savings" | "current" | "credit_card" | "other";

/** The tenant is the isolation boundary — one individual's financial world. */
export interface Tenant {
  id: TenantId;
  displayName: string;
  createdAt: string; // ISO 8601
}

export interface Account {
  id: AccountId;
  tenantId: TenantId;
  institution: string; // e.g. "HDFC Bank"
  accountType: AccountType;
  /** Masked tail only — full account numbers are never stored. */
  maskedNumber: string; // e.g. "XXXX1234"
  currency: CurrencyCode;
  createdAt: string;
}

export interface Transaction {
  id: TransactionId;
  tenantId: TenantId;
  accountId: AccountId;
  /** Date the bank posted the transaction (ISO date). */
  postedAt: string;
  /** Positive magnitude; `direction` carries the sign meaning. */
  amount: Money;
  direction: TransactionDirection;
  /** Verbatim text from the statement, before canonicalisation. */
  rawDescription: string;
  /** Canonicalised merchant name; null until M3/M11 resolves it. */
  merchant: string | null;
  /** Assigned by the M11 categorizer; null until categorized. */
  categoryId: CategoryId | null;
  source: IngestionSource;
  /**
   * Idempotency key: a stable hash of
   * (accountId | postedAt | amount.minor | direction | rawDescription).
   * Re-uploading the same statement produces identical hashes, so the
   * ingestion pipeline drops duplicates instead of double-counting.
   */
  dedupHash: string;
  ingestedAt: string;
}

export interface Category {
  id: CategoryId;
  tenantId: TenantId;
  name: string; // e.g. "Groceries"
  kind: CategoryKind;
}

export interface Envelope {
  id: EnvelopeId;
  tenantId: TenantId;
  name: string; // e.g. "Groceries"
  /**
   * Current balance, derived from the sum of this envelope's ledger entries.
   * The M12 invariant: this is NEVER negative.
   */
  balance: Money;
  /** Budget period this envelope covers, e.g. "2026-05". */
  period: string;
  createdAt: string;
}

/**
 * The envelope ledger (M12) is double-entry. Every movement of money is a
 * *transfer* composed of two or more entries whose signed `delta`s sum to zero
 * (the double-entry invariant). Allocating a spend pulls from a source envelope
 * (e.g. "Unallocated") into a spending envelope; moving budget between envelopes
 * is the same primitive. M12 enforces atomically that (a) a transfer's entries
 * net to zero and (b) no envelope balance is driven below zero.
 */
export interface LedgerEntry {
  id: LedgerEntryId;
  tenantId: TenantId;
  /** Groups the balanced entries of a single movement. */
  transferId: LedgerTransferId;
  envelopeId: EnvelopeId;
  /** Signed delta applied to the envelope (credit positive, debit negative). */
  delta: Money;
  /** The bank transaction this entry derives from, if any. */
  transactionId: TransactionId | null;
  createdAt: string;
}

// ============================================================================
// V10–V13 product entities (mirrors of migrations investments_goals_networth,
// recurring_series, statements — and backend/contracts records of the same).
// ============================================================================

export type HoldingId = string;
export type GoalId = string;
export type BalanceSheetItemId = string;
export type RecurringSeriesId = string;
export type StatementId = string;

export type HoldingKind = "index" | "equity" | "debt" | "gold" | "ulip";
export type BalanceItemType = "asset" | "liability";
export type RecurringCadence = "weekly" | "monthly" | "quarterly" | "yearly" | "irregular";
export type RecurringStatus = "active" | "trial" | "paused" | "lapsed";
export type StatementStatus = "processing" | "completed" | "failed";

/** An investment position (V10). Money is paise; the UI converts to rupees. */
export interface Holding {
  id: HoldingId;
  tenantId: TenantId;
  name: string; // e.g. "Nifty 50 Index Fund"
  kind: HoldingKind;
  invested: Money; // cost basis
  value: Money; // current market value
  /** Annual fee in BASIS POINTS (0.20% = 20 bps); null when unknown. */
  expenseRatioBps: number | null;
  /** Commission-bearing regular plan (vs direct). */
  regularPlan: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A savings target / sinking fund (V10), optionally funded by an envelope. */
export interface Goal {
  id: GoalId;
  tenantId: TenantId;
  name: string;
  icon: string | null;
  target: Money;
  current: Money;
  envelopeId: EnvelopeId | null;
  createdAt: string;
  updatedAt: string;
}

/** One net-worth line (V10). incomeGenerating applies to assets only. */
export interface BalanceSheetItem {
  id: BalanceSheetItemId;
  tenantId: TenantId;
  itemType: BalanceItemType;
  name: string;
  amount: Money;
  incomeGenerating: boolean | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A detected recurring-charge series (V11, M7). */
export interface RecurringSeries {
  id: RecurringSeriesId;
  tenantId: TenantId;
  merchant: string;
  categoryId: CategoryId | null;
  cadence: RecurringCadence;
  expectedAmount: Money;
  lastSeenAt: string | null; // ISO date
  nextDueAt: string | null; // ISO date
  status: RecurringStatus;
  detectedAt: string;
  updatedAt: string;
}

/** One ingestion batch (V12) — an M1 upload or, later, an AA sync. */
export interface Statement {
  id: StatementId;
  tenantId: TenantId;
  accountId: AccountId | null;
  fileName: string;
  source: IngestionSource;
  acceptedCount: number;
  duplicateCount: number;
  errorCount: number;
  status: StatementStatus;
  uploadedAt: string;
}

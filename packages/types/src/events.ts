import type { CategoryId, TenantId, Transaction, TransactionId } from "./domain";

/**
 * Every event published to Redpanda (via the M4 transactional outbox) is wrapped
 * in this envelope.
 *
 * - `eventId` is the idempotency key consumers dedupe on (exactly-once effect).
 * - `version` lets payloads evolve without breaking existing consumers.
 * - `tenantId` is promoted to the envelope so consumers can set RLS context
 *   before touching the payload.
 */
export interface EventEnvelope<TType extends string, TPayload> {
  eventId: string;
  eventType: TType;
  version: number;
  tenantId: TenantId;
  occurredAt: string; // ISO 8601
  payload: TPayload;
}

/** Kafka topic names. Suffix `.vN` so a breaking change is a new topic, not a silent break. */
export const Topics = {
  TransactionsIngested: "money-tracker.transactions.ingested.v1",
  TransactionsCategorized: "money-tracker.transactions.categorized.v1",
} as const;

export type TopicName = (typeof Topics)[keyof typeof Topics];

// --- Payloads ---

export interface TransactionIngestedPayload {
  transaction: Transaction;
}

export interface TransactionCategorizedPayload {
  transactionId: TransactionId;
  categoryId: CategoryId;
  /** 1.0 for a deterministic rule match; < 1.0 for the LLM fallback (M11 v1). */
  confidence: number;
  categorizedBy: "rule" | "llm";
}

// --- Concrete events ---

export type TransactionIngestedEvent = EventEnvelope<
  "transaction.ingested",
  TransactionIngestedPayload
>;

export type TransactionCategorizedEvent = EventEnvelope<
  "transaction.categorized",
  TransactionCategorizedPayload
>;

/** Discriminated union of every domain event — switch on `eventType`. */
export type DomainEvent = TransactionIngestedEvent | TransactionCategorizedEvent;

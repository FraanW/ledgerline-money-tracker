package com.ledgerline.contracts.events;

/**
 * Sealed base for every event payload. Permitting only the known payloads gives
 * the Java equivalent of the TS discriminated union {@code DomainEvent} —
 * consumers can {@code switch} over an {@code EventEnvelope}'s payload with
 * exhaustiveness checking.
 */
public sealed interface DomainEventPayload
    permits TransactionIngestedPayload, TransactionCategorizedPayload {

    /** The eventType discriminator string for an envelope carrying this payload. */
    String eventType();
}

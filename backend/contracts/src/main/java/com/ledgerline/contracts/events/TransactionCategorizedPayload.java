package com.ledgerline.contracts.events;

import java.util.UUID;

/**
 * Payload of a {@code transaction.categorized} event. Mirror of the TS
 * {@code TransactionCategorizedPayload}. Published to
 * {@link Topics#TRANSACTIONS_CATEGORIZED}.
 *
 * <p>{@code confidence} is 1.0 for a deterministic rule match and {@code < 1.0}
 * for the LLM fallback (M11 v1); {@code categorizedBy} is the source of the
 * decision.
 */
public record TransactionCategorizedPayload(
    UUID transactionId,
    UUID categoryId,
    double confidence,
    CategorizedBy categorizedBy
) implements DomainEventPayload {

    public static final String EVENT_TYPE = "transaction.categorized";

    /** Mirror of the TS {@code "rule" | "llm"} union. */
    public enum CategorizedBy {
        rule,
        llm
    }

    @Override
    public String eventType() {
        return EVENT_TYPE;
    }
}

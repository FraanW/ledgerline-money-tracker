package com.ledgerline.contracts.events;

import com.ledgerline.contracts.Transaction;

/**
 * Payload of a {@code transaction.ingested} event. Mirror of the TS
 * {@code TransactionIngestedPayload} = {@code { transaction: Transaction }}.
 * Published to {@link Topics#TRANSACTIONS_INGESTED}.
 */
public record TransactionIngestedPayload(Transaction transaction)
    implements DomainEventPayload {

    public static final String EVENT_TYPE = "transaction.ingested";

    @Override
    public String eventType() {
        return EVENT_TYPE;
    }
}

package com.ledgerline.contracts.events;

/**
 * Kafka/Redpanda topic names. Mirror of the TS {@code Topics} const object.
 * Suffixed {@code .vN} so a breaking change is a NEW topic, not a silent break.
 */
public final class Topics {

    private Topics() {}

    public static final String TRANSACTIONS_INGESTED =
        "money-tracker.transactions.ingested.v1";

    public static final String TRANSACTIONS_CATEGORIZED =
        "money-tracker.transactions.categorized.v1";
}

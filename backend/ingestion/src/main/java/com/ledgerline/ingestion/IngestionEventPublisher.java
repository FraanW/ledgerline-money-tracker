package com.ledgerline.ingestion;

import com.ledgerline.contracts.Transaction;

/**
 * The M4 transactional-outbox seam, expressed as an interface so M1 can be
 * shipped TODAY without M4 — and so that when M4 lands it is a single concrete
 * implementation drop, not a rewrite of {@link IngestionService}.
 *
 * <h2>What M4 will do here (later)</h2>
 * M4 (the transactional outbox) solves the dual-write problem: you cannot
 * atomically write to a database AND a message bus. So the eventual M4
 * implementation will, in the SAME database transaction that inserts the
 * {@code transactions} row, write a row to an {@code outbox} table containing
 * the {@link com.ledgerline.contracts.events.TransactionIngestedPayload}.
 * A separate relay process tails that table and publishes to the Redpanda
 * topic {@code money-tracker.transactions.ingested.v1}.
 *
 * <h2>What v0 does</h2>
 * {@link NoOpIngestionEventPublisher} is wired by default. The publisher
 * method is called with the freshly-inserted {@link Transaction} but does
 * nothing — categorisation (M11) and ledger posting (M12) do not yet run
 * downstream of upload in v0. When M4 + M11 + M12 are wired end to end, the
 * only change is the bean type registered for this interface.
 *
 * <h2>Why the publisher takes the inserted Transaction (not the raw row)</h2>
 * The eventual event payload mirrors {@link Transaction} verbatim
 * ({@code TransactionIngestedPayload}). Calling the publisher with the
 * already-shaped domain record means the M4 implementation has nothing extra
 * to map — it just writes the same record into the outbox.
 *
 * <h2>Contract for implementors (when M4 arrives)</h2>
 * <ul>
 *   <li>{@link #publishIngested(Transaction)} MUST be called from INSIDE the
 *       same database transaction that inserted the transactions row. The
 *       {@link IngestionService} already does this — the publisher hook runs
 *       inside the {@code TenantContext.withTenant(...)} block.</li>
 *   <li>Implementations MUST NOT do any I/O that could fail independently of
 *       the DB transaction (no HTTP, no Kafka producer.send()); the entire
 *       point of the outbox is that the only side effect inside the txn is
 *       another DB write.</li>
 *   <li>Duplicates of the same transaction (DB returned no inserted row) MUST
 *       NOT be published — the orchestrator already calls the publisher only
 *       for genuinely-inserted rows.</li>
 * </ul>
 */
public interface IngestionEventPublisher {

    /**
     * Publish a {@code transaction.ingested} event for a freshly-inserted
     * transaction. v0's {@link NoOpIngestionEventPublisher} is a no-op; M4
     * will write an outbox row in the same DB transaction.
     */
    void publishIngested(Transaction transaction);
}

package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code statements} table (migration V12) — one ingestion
 * batch (an M1 upload or, later, an AA sync). Imported transactions point
 * back via {@code transactions.statement_id}, so the Log / Transactions
 * surfaces can show ingestion status and history.
 */
public record Statement(
    UUID id,
    UUID tenantId,
    UUID accountId,
    String fileName,
    IngestionSource source,
    int acceptedCount,
    int duplicateCount,
    int errorCount,
    StatementStatus status,
    Instant uploadedAt
) {}

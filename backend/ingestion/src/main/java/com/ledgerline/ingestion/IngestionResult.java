package com.ledgerline.ingestion;

import java.util.List;
import java.util.UUID;

/**
 * The summary the controller returns to the user — and the same shape the
 * service's {@code ingest(...)} method produces, so the controller is a thin
 * adapter and the service is unit-testable without HTTP.
 *
 * <h2>Idempotency at the HTTP layer</h2>
 * Re-uploading the same file is safe by design: each row dedups in the DB,
 * and the response is HONEST about what happened — {@code accepted} drops to
 * 0 and {@code duplicates} climbs to the file's row count.
 *
 * @param statementId  the persisted {@code statements} batch row (V12) — every
 *                     accepted transaction points back at it via
 *                     {@code transactions.statement_id}, and the row carries
 *                     the final counts + per-row errors for the ingestion-
 *                     history UI
 * @param totalRows    total parsed rows (accepted + duplicates + errors.size())
 * @param accepted     rows newly written to the transactions table
 * @param duplicates   rows that hashed to an existing (tenant, dedup_hash) and
 *                     were silently dropped by the ON CONFLICT
 * @param errors       per-row failures (parser errors AND any DB-level row
 *                     errors); a malformed row appears here, not in accepted
 */
public record IngestionResult(
    UUID statementId,
    int totalRows,
    int accepted,
    int duplicates,
    List<RowError> errors
) {

    /**
     * A per-row failure. {@code lineNumber} is the 1-based source line from
     * the user's file so they can find the offending row in their statement.
     */
    public record RowError(int lineNumber, String message) {}
}

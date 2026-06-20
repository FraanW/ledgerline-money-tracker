package com.ledgerline.contracts;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Mirror of the TS {@code Transaction} and the {@code transactions} table
 * (migration V2).
 *
 * <p>{@code amount} is a POSITIVE magnitude; {@code direction} carries the sign
 * meaning (debit = leaving, credit = arriving). In the DB this is stored as
 * {@code amount_minor BIGINT (>= 0)} + a {@code currency} column — the {@link Money}
 * value is split across those two columns by the persistence layer.
 *
 * <p>{@code merchant} and {@code categoryId} are nullable — filled in after
 * ingestion (M3 canonicalisation, M11 categoriser). {@code postedAt} is a DATE
 * ({@link LocalDate}); {@code ingestedAt} is TIMESTAMPTZ ({@link Instant}).
 *
 * <p>{@code dedupHash} is the ingestion idempotency key: a stable hash of
 * (accountId | postedAt | amount.minor | direction | rawDescription).
 */
public record Transaction(
    UUID id,
    UUID tenantId,
    UUID accountId,
    LocalDate postedAt,
    Money amount,
    TransactionDirection direction,
    String rawDescription,
    String merchant,        // nullable until M3
    UUID categoryId,        // nullable until M11
    IngestionSource source,
    String dedupHash,
    Instant ingestedAt
) {}

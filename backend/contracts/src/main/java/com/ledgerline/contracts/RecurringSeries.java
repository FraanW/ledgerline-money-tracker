package com.ledgerline.contracts;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Mirror of the {@code recurring_series} table (migration V11) — a merchant
 * that bills on a cadence (M7 detector output, ADR-0010). Member transactions
 * point back via {@code transactions.recurring_series_id}.
 */
public record RecurringSeries(
    UUID id,
    UUID tenantId,
    String merchant,
    UUID categoryId,
    RecurringCadence cadence,
    long expectedAmountMinor,
    CurrencyCode currency,
    LocalDate lastSeenAt,
    LocalDate nextDueAt,
    RecurringStatus status,
    Instant detectedAt,
    Instant updatedAt
) {}

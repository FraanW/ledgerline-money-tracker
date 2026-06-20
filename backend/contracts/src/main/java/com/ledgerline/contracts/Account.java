package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the TS {@code Account} and the {@code accounts} table (migration V2).
 * {@code maskedNumber} stores the tail only — full account numbers are never
 * persisted.
 */
public record Account(
    UUID id,
    UUID tenantId,
    String institution,
    AccountType accountType,
    String maskedNumber,
    CurrencyCode currency,
    Instant createdAt
) {}

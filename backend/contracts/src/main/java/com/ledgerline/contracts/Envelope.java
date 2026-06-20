package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the TS {@code Envelope} and the {@code envelopes} table (migration V2).
 *
 * <p>{@code balance} is DERIVED — it equals the sum of this envelope's
 * {@code LedgerEntry.delta}s, materialised on the row. The M12 invariant
 * guarantees it is NEVER negative; enforcement is M12's job, not the schema's.
 * {@code period} is a budget period label, e.g. "2026-05".
 */
public record Envelope(
    UUID id,
    UUID tenantId,
    String name,
    Money balance,
    String period,
    Instant createdAt
) {}

package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code holdings} table (migration V10) — an investment
 * position. Amounts are integer paise; {@code expenseRatioBps} is the annual
 * fee in BASIS POINTS (0.20% = 20 bps, integer-exact), nullable when unknown.
 * {@code regularPlan} flags commission-bearing plans (vs direct).
 */
public record Holding(
    UUID id,
    UUID tenantId,
    String name,
    HoldingKind kind,
    long investedMinor,
    long valueMinor,
    Integer expenseRatioBps,
    boolean regularPlan,
    Instant createdAt,
    Instant updatedAt
) {}

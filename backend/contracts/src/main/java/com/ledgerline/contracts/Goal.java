package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code goals} table (migration V10) — a savings target /
 * sinking fund. {@code envelopeId} optionally links the goal to the savings
 * envelope that funds it (ON DELETE SET NULL).
 */
public record Goal(
    UUID id,
    UUID tenantId,
    String name,
    String icon,
    long targetMinor,
    long currentMinor,
    UUID envelopeId,
    Instant createdAt,
    Instant updatedAt
) {}

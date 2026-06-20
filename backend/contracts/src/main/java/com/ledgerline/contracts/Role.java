package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code roles} table (migration V7). System roles
 * ({@code tenantId == null}, {@code isSystem == true}) are shared by every
 * tenant: {@code owner | admin | member | viewer}. Tenants may also define
 * custom roles ({@code tenantId} set).
 */
public record Role(
    UUID id,
    UUID tenantId,
    String key,
    String label,
    String description,
    boolean isSystem,
    Instant createdAt
) {}

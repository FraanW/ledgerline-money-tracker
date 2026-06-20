package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * The tenant is the isolation boundary — one individual's financial world.
 * Java mirror of the TS {@code Tenant} (packages/types/src/domain.ts) and the
 * {@code tenants} table (migration V2).
 *
 * <p>ID/timestamp typing note: where TS uses {@code string} for ids and ISO-8601
 * strings for timestamps, the Java mirror uses the precise JDBC-friendly types
 * — {@link UUID} (the DB column is UUID) and {@link Instant} (TIMESTAMPTZ). This
 * is a deliberate, type-tightening difference from the TS contract.
 */
public record Tenant(
    UUID id,
    String displayName,
    Instant createdAt
) {}

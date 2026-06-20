package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code tenant_settings} table (migration V9) — budget
 * behaviours owned by the WHOLE workspace, not one user (the monthly-rollover
 * toggle of ADR-0005, the default currency). One row per tenant.
 */
public record TenantSettings(
    UUID tenantId,
    boolean monthlyRolloverEnabled,
    CurrencyCode defaultCurrency,
    Instant updatedAt
) {}

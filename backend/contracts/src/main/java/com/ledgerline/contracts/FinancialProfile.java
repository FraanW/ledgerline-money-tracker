package com.ledgerline.contracts;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Mirror of the {@code financial_profiles} table (migration V8) — each
 * member's own income figures WITHIN a tenant (powers the per-person runway /
 * savings-rate lenses). PK is {@code (tenantId, userId)}; standard tenant RLS.
 * Money fields are integer paise and nullable (not collected yet).
 */
public record FinancialProfile(
    UUID tenantId,
    UUID userId,
    LocalDate dateOfBirth,
    Long monthlyTakeHomeMinor,
    Long annualPretaxIncomeMinor,
    CurrencyCode currency,
    Instant updatedAt
) {}

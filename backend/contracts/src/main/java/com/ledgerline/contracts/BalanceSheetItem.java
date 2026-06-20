package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code balance_sheet_items} table (migration V10) — one
 * net-worth line (asset or liability). {@code incomeGenerating} applies to
 * assets only (the Rich-Dad lens distinction); NULL on liabilities, enforced
 * by a CHECK in the schema.
 */
public record BalanceSheetItem(
    UUID id,
    UUID tenantId,
    BalanceItemType itemType,
    String name,
    long amountMinor,
    Boolean incomeGenerating,
    String note,
    Instant createdAt,
    Instant updatedAt
) {}
